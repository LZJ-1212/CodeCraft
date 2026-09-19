const axios = require('axios');
const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs-extra');
const FileService = require('./fileService');

/**
 * 語言指令工廠 (Language Instruction Factory)
 */
function getLangInstruction(lang) {
    if (lang === 'zh') {
        return 'CRITICAL: The user requested Chinese. Please use fluent Traditional Chinese for all UI text, comments, and console outputs.';
    }
    return 'CRITICAL: You MUST use strictly professional English for ALL user interfaces, code comments, variable names, database schemas, and console outputs. NO CHINESE is allowed.';
}

class AIService {
    /**
     * 调用大模型失败时按 1s、2s、4s 自动再试。
     * 用户层面：网络抖动或接口限流时，不必重新点「生成」，这次任务会自己接着跑。
     */
    static async _callApiWithRetry(apiFunc, maxRetries = 3, logger = null) {
        const delay = (ms) => new Promise(res => setTimeout(res, ms));

        for (let i = 0; i < maxRetries; i++) {
            try {
                return await apiFunc();
            } catch (error) {
                const isLastAttempt = i === maxRetries - 1;
                const status = error.response ? error.response.status : 'Network/Unknown';
                const msg = `\x1b[33m⚠️ API Interruption (${status}): ${error.message}. Retrying in ${Math.pow(2, i)}s... (Attempt ${i + 1}/${maxRetries})\x1b[0m`;

                if (logger) logger(msg + '\n');
                else console.log(msg);

                if (isLastAttempt) {
                    throw new Error(`API persistently failed after ${maxRetries} attempts: ${error.message}`);
                }
                await delay(Math.pow(2, i) * 1000); // 指數退避: 1s, 2s, 4s
            }
        }
    }

    /**
     * 解析並獲取 API 密鑰
     */
    static async resolveApiKey(cliKey) {
        if (cliKey) return cliKey;
        if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;

        const { apiKey } = await inquirer.prompt([{
            name: 'apiKey',
            type: 'password',
            mask: '*',
            message: '🔑 Enter your DeepSeek API Key (In-memory only):',
            validate: input => input ? true : 'API Key cannot be empty'
        }]);
        return apiKey;
    }

    /**
     * 從自然語言描述生成安全的專案名稱
     */
    static generateProjectName(description) {
        const words = description.toLowerCase().match(/[a-z0-9]+/g) || [];
        let name = words.slice(0, 3).join('-');
        return name.length >= 3 ? name.slice(0, 50) : `ai-project-${Date.now()}`;
    }

    /**
     * 階段 1：呼叫架構師代理 (The Architect Agent)
     * @param {function} logger - 依賴注入的日誌回調函數
     */
    static async callArchitect(description, apiKey, lang, logger = null) {
        const logMsg = `\x1b[35m👑 [Architect Agent] Analyzing requirements and designing blueprint...\x1b[0m`;
        if (logger) logger(logMsg + '\n'); else console.log(logMsg);

        /**
         * 要求蓝图里必须包含 package.json 和依赖列表。
         * 用户层面：生成后执行安装时不容易出现「找不到模块」而整站起不来。
         */
        const architectPrompt = `You are an elite Enterprise Software Architect. Design a PRODUCTION-READY, Deployment-Grade Full-Stack architecture based on the user's description.
CRITICAL Requirements to maximize token usage and quality:
1. REAL IMAGES CAPABILITY: You MUST include a backend route \`backend/routes/images.js\` and link it to \`server.js\` as \`/api/get-image\`. 
   - This route MUST handle keyword-based image redirection using LoremFlickr (https://loremflickr.com/800/600/{q}).
2. MULTI-PAGE REQUIREMENT: DO NOT build a single-page application (SPA). You MUST design a multi-page structure (e.g., index.html) using Vanilla HTML/JS/CSS. Place frontend files directly in 'public/'.
3. PURE JS DATABASE (NO C++): You MUST design a persistent data layer using Node.js + Express. DO NOT use 'sqlite3', 'mysql', or any database that requires compilation. You MUST use a pure JSON file approach (e.g., using Node's native 'fs.promises' to read/write a 'data.json' file).
4. PACKAGE.JSON MANDATORY: You MUST include 'package.json' in the root directory. List ALL dependencies. (e.g., express, cors).
5. MODERN UI MANDATORY: Plan a modern UI utilizing Tailwind CSS.
6. ONLY output a pure JSON object where keys are file paths and values are comprehensive duty descriptions.
7. NO BINARY FILES: Do NOT generate .jpg, .png, or .ico files. Images must be loaded via URL.
8. NO Markdown tags. NO empty directories.
9. ${getLangInstruction(lang)}`;

        // 將原始的 Axios 呼叫封裝進自動重試機制
        const apiRequest = () => axios.post('https://api.deepseek.com/v1/chat/completions', {
            model: 'deepseek-chat',
            messages: [{ role: 'system', content: architectPrompt }, { role: 'user', content: description }],
            response_format: { type: 'json_object' },
            temperature: 0.2
        }, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 60000 });

        const response = await this._callApiWithRetry(apiRequest, 3, logger);
        const content = response.data.choices[0].message.content;
        return JSON.parse(content.substring(content.indexOf('{'), content.lastIndexOf('}') + 1));
    }

    /**
     * 階段 2 & 3：執行多代理生成與 QA 測試管線
     * @param {function} logger - 依賴注入的日誌回調函數
     */
    static async executeGenerationPipeline(targetDir, blueprint, description, apiKey, lang, logger = null) {
        // 把管线日志交给网页或命令行。
        // 用户层面：生成过程中能看到「正在写哪个文件」，而不是干等。
        const log = (msg, exactOutput = false) => {
            const formattedMsg = exactOutput ? msg : msg + '\n';
            if (logger) logger(formattedMsg);
            else exactOutput ? process.stdout.write(msg) : console.log(msg);
        };

        const fileNames = Object.keys(blueprint);
        log(`\n\x1b[36m👷 [Coder Agent] Blueprint received. Writing ${fileNames.length} files...\x1b[0m\n`);

        await fs.ensureDir(targetDir);

        let existingContext = "";
        if (await fs.pathExists(targetDir)) {
            log(`🧠 [System] Project folder detected. Scanning existing codebase for Context...`);
            try {
                const filesMap = await FileService.readProjectFiles(targetDir);
                existingContext = JSON.stringify(filesMap);
                log(`✅ Existing context captured (Size: ${existingContext.length} chars)`);
            } catch (err) {
                log(`⚠️ Context scan failed or skipped: ${err.message}`);
            }
        }

        let count = 1;
        let dynamicMemory = {};

        for (const [filePath, fileRole] of Object.entries(blueprint)) {
            log(`⏳ (${count}/${fileNames.length}) Crafting ${filePath} ... `, true);
            try {
                let combinedContext = existingContext || "";
                if (Object.keys(dynamicMemory).length > 0) {
                    combinedContext += `\n\n[CRITICAL MEMORY: FILES JUST GENERATED IN THIS SESSION]\n${JSON.stringify(dynamicMemory, null, 2)}`;
                }

                const code = await this._callCoder(filePath, fileRole, blueprint, description, apiKey, lang, combinedContext, logger);
                await fs.outputFile(path.join(targetDir, filePath), code, 'utf8');

                dynamicMemory[filePath] = this._extractCodeSkeleton(code);
                log(`\x1b[32m✅ Done\x1b[0m`);
            } catch (err) {
                log(`\x1b[31m❌ Failed: ${err.message}\x1b[0m`);
            }
            count++;
        }

        log(`\n📦 [System] Installing dependencies (npm install)...`);
        try {
            await FileService.runCommand('npm', ['install'], targetDir);
        } catch (installErr) {
            log(`\x1b[31m❌ [System] npm install failed: Dependency compilation error.\x1b[0m`);
            const isZh = lang === 'zh';
            const modalData = {
                message: isZh ? "依賴套件安裝失敗！請問要如何處理？" : "Dependency installation failed! How to proceed?",
                options: isZh ? ["請 AI 改用不需要編譯的輕量級資料庫", "強行略過安裝並嘗試啟動", "請 AI 分析報錯"] : ["Rewrite without C++ dependencies", "Force skip install", "Analyze the error"]
            };
            log(`\n___REVIEWER_ACTION___:${JSON.stringify(modalData)}\n`);
            return false;
        }

        const pkgPath = path.join(targetDir, 'package.json');
        let needsBuild = false;
        let startCommand = 'node server.js';

        if (await fs.pathExists(pkgPath)) {
            const pkg = await fs.readJson(pkgPath);
            if (pkg.scripts && pkg.scripts.build) needsBuild = true;
            if (pkg.scripts && pkg.scripts.start) startCommand = 'npm start';
        }

        let testPassed = true;

        if (needsBuild) {
            log(`\n🧪 [System] Build script detected. Running compilation tests...`);
            testPassed = false;
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    await FileService.runCommand('npm', ['run', 'build'], targetDir);
                    log(`\x1b[32m✅ [QA] Test passed on attempt ${attempt}!\x1b[0m`);
                    testPassed = true;
                    break;
                } catch (error) {
                    log(`\x1b[31m❌ [QA] Build failed! Initiating debugging sequence...\x1b[0m`);
                    if (attempt === 2) {
                        log(`⚠️ Max auto-repair attempts reached.`);
                        const isZh = lang === 'zh';
                        const modalData = {
                            message: isZh ? "自動化測試失敗。想怎麼處理？" : "Build failed. How to proceed?",
                            options: isZh ? ["忽略錯誤", "請 AI 修復", "請 AI 解釋"] : ["Ignore", "Ask AI to fix", "Ask AI to explain"]
                        };
                        log(`\n___REVIEWER_ACTION___:${JSON.stringify(modalData)}\n`);
                        break;
                    }
                    log(`🧠 [QA Agent] Analyzing logs and writing patches...`);
                }
            }
        } else {
            log(`\n⏩ [System] Native project detected (No build script). Skipping build phase.`);
        }

        if (testPassed) {
            log(`\n🎁 [System] Generating Beginner-Friendly Start Script...`);

            let finalStartCmd = startCommand;
            if (startCommand === 'node server.js') {
                if (await fs.pathExists(path.join(targetDir, 'backend/server.js'))) {
                    finalStartCmd = 'node backend/server.js';
                } else if (await fs.pathExists(path.join(targetDir, 'server/index.js'))) {
                    finalStartCmd = 'node server/index.js';
                } else if (await fs.pathExists(path.join(targetDir, 'server.js'))) {
                    finalStartCmd = 'node server.js';
                }
            }

            const batPath = path.join(targetDir, 'Start_Project.bat');
            const rawBatContent = `@echo off\ntitle Running: ${path.basename(targetDir)}\ncolor 0A\necho ===================================================\necho   Welcome to your AI-Generated Project!\necho ===================================================\necho.\necho [System] Starting local server on PORT 3000...\necho [System] If the app crashes, the error will stay on this screen!\necho.\nset PORT=3000\nstart http://localhost:3000\ncall ${finalStartCmd}\necho.\necho [WARNING] The server process has stopped or crashed.\necho [TIP] Check the error messages above, copy them, and use AI Magic Edit!\npause`;

            await fs.outputFile(batPath, rawBatContent.replace(/\r?\n/g, '\r\n'), 'utf8');

            log(`\x1b[32m✅ Start_Project.bat created successfully!\x1b[0m`);
            log(`\n===========================================`);
            log(`🎉 Project Successfully Crafted!`);
            log(`👉 To view the app, click the green \x1b[32m[▶️ Run]\x1b[0m button in the UI above.`);
            log(`💡 Or manually double-click 'Start_Project.bat' inside the project folder.`);
            log(`===========================================\n`);
        }

        return testPassed;
    }

    /**
     * 高解析度代碼骨架提取器 (純業務邏輯，無需 logger)
     */
    static _extractCodeSkeleton(code) {
        if (!code) return "";
        const lines = code.split('\n');
        const skeletonLines = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed.startsWith('export ') ||
                trimmed.startsWith('function ') ||
                trimmed.startsWith('class ') ||
                trimmed.startsWith('module.exports') ||
                trimmed.startsWith('exports.') ||
                trimmed.startsWith('const router =') ||
                trimmed.includes('require(') ||
                (trimmed.startsWith('const ') && trimmed.includes('=>')) ||
                (trimmed.startsWith('let ') && trimmed.includes('=>'));
        });
        return skeletonLines.join('\n');
    }

    /**
     * 按蓝图为单个文件写出完整代码。
     * 用户层面：用户描述里的页面、接口会变成可以打开的源文件，而不是空目录。
     */
    static async _callCoder(filePath, fileRole, blueprint, description, apiKey, lang, rawMemory = "", logger = null) {
        let formattedMemoryPrompt = "";
        if (rawMemory && rawMemory.length > 5) {
            formattedMemoryPrompt = `\n[CRITICAL MEMORY: PROJECT AST SKELETON]\nHere is the structural skeleton of the files generated so far:\n${rawMemory}\nRULE: You MUST integrate your new code seamlessly with this existing architecture. Use EXACT function names, API routes, and DOM IDs.`;
        }

        // 強制寫入思維鏈與嚴格的高保真度護欄
        const coderPrompt = `You are an Elite Enterprise Full-Stack Engineer.
Project Context: ${description}
Blueprint: ${JSON.stringify(blueprint)}
Current Task: Write the EXACT, PRODUCTION-READY code for \`${filePath}\` (Duty: ${fileRole}).

CRITICAL QUALITY RULES (HIGH TOKEN CONSUMPTION AUTHORIZED):
1. COMPLEXITY WITH RELIABILITY: You are authorized and encouraged to build sophisticated, high-fidelity UI/UX (e.g., modern layouts, animations, real-time feedback) IF requested.
2. THE "NO-ORPHAN" WIRING RULE: Every single button, form, and interactive element MUST be perfectly wired to the backend. Frontend fetch() calls MUST match backend routes exactly.
3. DEFENSIVE FRONTEND: Wrap fetch() calls in try/catch. If an API fails, gracefully show an error in the UI. DO NOT freeze.
4. REAL ASSETS: Use '/api/get-image?q=keyword' for all images. NO placeholders.
5. NO MOCK DATA: Read and write data from the SQLite database dynamically.
6. MANDATORY CHAIN-OF-THOUGHT (CoT):
   Before writing ANY code, you MUST think step-by-step in a <thought_process> block. You must plan:
   - What exact DOM IDs are needed?
   - What exact API endpoint (method & route) is being consumed or exposed?
   - What is the JSON data structure?
7. EXACT OUTPUT FORMAT:
<thought_process>
(Your architectural reasoning and state mapping here)
</thought_process>
\`\`\`[language]
(Your 100% complete, working code here. No omissions.)
\`\`\`
8. ${getLangInstruction(lang)}
${formattedMemoryPrompt}`;

        const apiRequest = () => axios.post('https://api.deepseek.com/v1/chat/completions', {
            model: 'deepseek-chat',
            messages: [{ role: 'system', content: coderPrompt }, { role: 'user', content: `Execute CoT protocol and output code for ${filePath}` }],
            temperature: 0.2, // 微調溫度以平衡創意與邏輯
            max_tokens: 8192
        }, { headers: { Authorization: `Bearer ${apiKey}` } });

        const response = await this._callApiWithRetry(apiRequest, 3, logger);
        const content = response.data.choices[0].message.content;

        // 提取並打印 AI 的思維鏈，讓你在終端機看到它的思考過程
        const thoughtMatch = content.match(/<thought_process>([\s\S]*?)<\/thought_process>/i);
        if (thoughtMatch && logger) {
            logger(`\x1b[90m[Coder Thought Process]: ${thoughtMatch[1].trim().split('\n')[0]}...\x1b[0m\n`);
        } else if (thoughtMatch) {
            console.log(`\x1b[90m[Coder Thought Process]: ${thoughtMatch[1].trim().split('\n')[0]}...\x1b[0m`);
        }

        // 精準提取代碼區塊，避免將 thought_process 寫入源代碼文件中導致語法錯誤
        const codeMatch = content.match(/```[\w-]*\n([\s\S]*?)```/);
        if (codeMatch) {
            return codeMatch[1].trim();
        }

        // 容錯機制：如果 AI 忘記打 markdown 代碼塊，嘗試手動剔除 thought_process
        return content.replace(/<thought_process>[\s\S]*?<\/thought_process>/i, '').trim();
    }

    /**
     * 階段 4：QA 審查與修復 (Chain-of-Thought 思維鏈除錯)
     * @param {function} logger - 依賴注入的日誌回調函數
     */
    static async applyQAPatch(projectDir, message, apiKey, logger = null) {
        const log = (msg) => { if (logger) logger(msg + '\n'); else console.log(msg); };

        log(`🧠 [QA Agent] Analyzing AST and formulating Chain-of-Thought reasoning...`);

        const backupDir = `${projectDir}_backup_${Date.now()}`;
        try {
            await fs.copy(projectDir, backupDir);
            log(`🛡️ [System] Created safety snapshot at: ${path.basename(backupDir)}`);
        } catch (e) {
            log(`⚠️ [System] Backup failed, proceeding carefully...`);
        }

        const filesMap = await FileService.readProjectFiles(projectDir);
        const existingContext = JSON.stringify(filesMap);

        const qaPrompt = `You are an Elite QA Automation Engineer.
Project Context: The user reported an issue or requested a change: "${message}"
Current Codebase Skeleton: ${existingContext}

CRITICAL DEBUGGING RULES:
<thought_process>
1. Analyze exactly what failed.
2. Identify the root cause.
3. List exact files and fixes.
</thought_process>

<patch>
Provide ONLY a valid JSON object. Keys are file paths, values are the FULL FIXED CODE.
NO markdown code blocks inside the <patch> tag.
</patch>`;

        const apiRequest = () => axios.post('https://api.deepseek.com/v1/chat/completions', {
            model: 'deepseek-chat',
            messages: [{ role: 'system', content: qaPrompt }, { role: 'user', content: "Execute QA Protocol and provide the patch." }],
            temperature: 0.2,
            max_tokens: 8192
        }, { headers: { Authorization: `Bearer ${apiKey}` } });

        const response = await this._callApiWithRetry(apiRequest, 3, logger);
        const content = response.data.choices[0].message.content;

        const thoughtMatch = content.match(/<thought_process>([\s\S]*?)<\/thought_process>/i);
        if (thoughtMatch) {
            log(`\n\x1b[36m💡 [QA AI Thinking Process]:\n${thoughtMatch[1].trim()}\x1b[0m\n`);
        }

        const patchMatch = content.match(/<patch>([\s\S]*?)<\/patch>/i);
        if (!patchMatch) {
            throw new Error("AI completely failed to generate the <patch> tag. (You can safely restore from the backup folder).");
        }

        let jsonStr = patchMatch[1].trim();
        jsonStr = jsonStr.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim();

        try {
            const patchData = JSON.parse(jsonStr);
            log(`📝 [File Service] Applying AST Grafting for ${Object.keys(patchData).length} files...`);
            await FileService.applyPatch(projectDir, patchData);
            return true;
        } catch (parseErr) {
            const firstBrace = jsonStr.indexOf('{');
            const lastBrace = jsonStr.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                try {
                    const extractedJson = jsonStr.substring(firstBrace, lastBrace + 1);
                    const patchData = JSON.parse(extractedJson);
                    log(`📝 [File Service] Applying AST Grafting for ${Object.keys(patchData).length} files...`);
                    await FileService.applyPatch(projectDir, patchData);
                    return true;
                } catch (fallbackErr) {
                    throw new Error("JSON syntax is fundamentally broken by AI.");
                }
            }
            throw new Error("Failed to parse AI JSON format. AI outputted invalid syntax.");
        }
    }
}

module.exports = AIService;
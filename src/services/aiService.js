const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs-extra');
const FileService = require('./fileService');
const { chatCompletion } = require('../llm/deepseekClient');
const { extractJsonObject, extractGeneratedFile, parseBlueprint } = require('../llm/extract');

// 告诉模型用哪种界面语言写生成出来的项目。
// 用户层面：选中文就得到中文按钮和提示，选英文则整站是英文。
function getLangInstruction(lang) {
    if (lang === 'zh') {
        return 'CRITICAL: The user requested Chinese. Please use fluent Traditional Chinese for all UI text, comments, and console outputs.';
    }
    return 'CRITICAL: You MUST use strictly professional English for ALL user interfaces, code comments, variable names, database schemas, and console outputs. NO CHINESE is allowed.';
}

class AIService {
    // 解析并获取 API 密钥。
    // 用户层面：命令行没贴密钥时会再问一次，网页则用输入框里的值。
    static async resolveApiKey(cliKey) {
        if (cliKey) return cliKey;
        if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;

        const { apiKey } = await inquirer.prompt([{
            name: 'apiKey',
            type: 'password',
            mask: '*',
            message: '🔑 Enter your DeepSeek API Key (In-memory only):',
            validate: (input) => (input ? true : 'API Key cannot be empty')
        }]);
        return apiKey;
    }

    // 从自然语言描述生成安全的项目文件夹名。
    // 用户层面：不填文件夹时也会自动起名，生成结束后能对上「修改页」里的那个项目。
    static generateProjectName(description) {
        const words = String(description || '').toLowerCase().match(/[a-z0-9]+/g) || [];
        const name = words.slice(0, 3).join('-');
        return name.length >= 3 ? name.slice(0, 50) : `ai-project-${Date.now()}`;
    }

    // 阶段 1：根据需求列出要生成的文件和职责。
    // 用户层面：先看到项目会长成什么样，再逐个写出能打开的源文件。
    static async callArchitect(description, apiKey, lang, logger = null) {
        const logMsg = `\x1b[35m👑 [Architect Agent] Analyzing requirements and designing blueprint...\x1b[0m`;
        if (logger) logger(`${logMsg}\n`);
        else console.log(logMsg);

        const architectPrompt = `You are an elite Software Architect. Design a PRODUCTION-READY Full-Stack architecture based on the user's description.
CRITICAL Requirements:
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

        const content = await chatCompletion({
            apiKey,
            json: true,
            logger,
            messages: [
                { role: 'system', content: architectPrompt },
                { role: 'user', content: description }
            ]
        });
        return parseBlueprint(content);
    }

    // 阶段 2 & 3：按蓝图写文件，并按勾选决定是否安装和编译。
    // 用户层面：终端能看到正在写哪个文件；不勾选安装就不会在生成后再等一轮 npm。
    static async executeGenerationPipeline(targetDir, blueprint, description, apiKey, lang, logger = null, options = {}) {
        const install = options.install !== false;
        const test = options.test !== false;

        const log = (msg, exactOutput = false) => {
            const formattedMsg = exactOutput ? msg : `${msg}\n`;
            if (logger) logger(formattedMsg);
            else if (exactOutput) process.stdout.write(msg);
            else console.log(msg);
        };

        const fileNames = Object.keys(blueprint);
        log(`\n\x1b[36m👷 [Coder Agent] Blueprint received. Writing ${fileNames.length} files...\x1b[0m\n`);

        await fs.ensureDir(targetDir);

        let existingContext = '';
        try {
            const filesMap = await FileService.readProjectFiles(targetDir);
            if (Object.keys(filesMap).length > 0) {
                existingContext = JSON.stringify(filesMap);
                log(`🧠 [System] Project folder detected. Scanning existing codebase for Context...`);
                log(`✅ Existing context captured (Size: ${existingContext.length} chars)`);
            }
        } catch (err) {
            log(`⚠️ Context scan failed or skipped: ${err.message}`);
        }

        let count = 1;
        const dynamicMemory = {};

        for (const [filePath, fileRole] of Object.entries(blueprint)) {
            log(`⏳ (${count}/${fileNames.length}) Crafting ${filePath} ... `, true);
            try {
                let combinedContext = existingContext || '';
                if (Object.keys(dynamicMemory).length > 0) {
                    combinedContext += `\n\n[CRITICAL MEMORY: FILES JUST GENERATED IN THIS SESSION]\n${JSON.stringify(dynamicMemory, null, 2)}`;
                }

                const code = await this._callCoder(filePath, fileRole, blueprint, description, apiKey, lang, combinedContext, logger);
                await FileService.writeGeneratedFiles(targetDir, { [filePath]: code });
                dynamicMemory[filePath] = this._extractCodeSkeleton(code);
                log('\x1b[32m✅ Done\x1b[0m');
            } catch (err) {
                log(`\x1b[31m❌ Failed: ${err.message}\x1b[0m`);
            }
            count += 1;
        }

        if (install) {
            log('\n📦 [System] Installing dependencies (npm install)...');
            try {
                await FileService.runCommand('npm', ['install'], targetDir);
            } catch (installErr) {
                log('\x1b[31m❌ [System] npm install failed: Dependency compilation error.\x1b[0m');
                const isZh = lang === 'zh';
                const modalData = {
                    message: isZh ? '依赖安装失败。请问要如何处理？' : 'Dependency installation failed! How to proceed?',
                    options: isZh
                        ? ['请 AI 改用不需要编译的轻量级数据库', '强行略过安装并尝试启动', '请 AI 分析报错']
                        : ['Rewrite without C++ dependencies', 'Force skip install', 'Analyze the error']
                };
                log(`\n___REVIEWER_ACTION___:${JSON.stringify(modalData)}\n`);
                return false;
            }
        } else {
            log('\n⏩ [System] Skipped npm install (unchecked in the form).');
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

        if (test && needsBuild) {
            log('\n🧪 [System] Build script detected. Running compilation tests...');
            testPassed = false;
            for (let attempt = 1; attempt <= 2; attempt += 1) {
                try {
                    await FileService.runCommand('npm', ['run', 'build'], targetDir);
                    log(`\x1b[32m✅ [QA] Test passed on attempt ${attempt}!\x1b[0m`);
                    testPassed = true;
                    break;
                } catch (error) {
                    log('\x1b[31m❌ [QA] Build failed! Initiating debugging sequence...\x1b[0m');
                    if (attempt === 2) {
                        log('⚠️ Max auto-repair attempts reached.');
                        const isZh = lang === 'zh';
                        const modalData = {
                            message: isZh ? '自动化测试失败。想怎么处理？' : 'Build failed. How to proceed?',
                            options: isZh ? ['忽略错误', '请 AI 修复', '请 AI 解释'] : ['Ignore', 'Ask AI to fix', 'Ask AI to explain']
                        };
                        log(`\n___REVIEWER_ACTION___:${JSON.stringify(modalData)}\n`);
                        break;
                    }
                    log('🧠 [QA Agent] Analyzing logs and writing patches...');
                }
            }
        } else if (!test) {
            log('\n⏩ [System] Skipped build/test (unchecked in the form).');
        } else {
            log('\n⏩ [System] Native project detected (No build script). Skipping build phase.');
        }

        if (testPassed) {
            log('\n🎁 [System] Generating Beginner-Friendly Start Script...');

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

            log('\x1b[32m✅ Start_Project.bat created successfully!\x1b[0m');
            log('\n===========================================');
            log('🎉 Project Successfully Crafted!');
            log('👉 Open the workspace tab that just appeared to keep editing this project.');
            log("💡 Or double-click 'Start_Project.bat' inside the project folder.");
            log('===========================================\n');
        }

        return testPassed;
    }

    // 把大文件压成函数签名骨架。
    // 用户层面：项目变大以后，后续修改仍能跑完，而不会把上下文撑爆。
    static _extractCodeSkeleton(code) {
        if (!code) return '';
        const lines = code.split('\n');
        const skeletonLines = lines.filter((line) => {
            const trimmed = line.trim();
            return trimmed.startsWith('export ')
                || trimmed.startsWith('function ')
                || trimmed.startsWith('class ')
                || trimmed.startsWith('module.exports')
                || trimmed.startsWith('exports.')
                || trimmed.startsWith('const router =')
                || trimmed.includes('require(')
                || (trimmed.startsWith('const ') && trimmed.includes('=>'))
                || (trimmed.startsWith('let ') && trimmed.includes('=>'));
        });
        return skeletonLines.join('\n');
    }

    // 按蓝图为单个文件写出完整代码。
    // 用户层面：描述里的页面、接口会变成可以打开的源文件，而不是空目录。
    static async _callCoder(filePath, fileRole, blueprint, description, apiKey, lang, rawMemory = '', logger = null) {
        let formattedMemoryPrompt = '';
        if (rawMemory && rawMemory.length > 5) {
            formattedMemoryPrompt = `\n[CRITICAL MEMORY: PROJECT AST SKELETON]\nHere is the structural skeleton of the files generated so far:\n${rawMemory}\nRULE: You MUST integrate your new code seamlessly with this existing architecture. Use EXACT function names, API routes, and DOM IDs.`;
        }

        const coderPrompt = `You are an Elite Full-Stack Engineer.
Project Context: ${description}
Blueprint: ${JSON.stringify(blueprint)}
Current Task: Write the EXACT, PRODUCTION-READY code for \`${filePath}\` (Duty: ${fileRole}).

CRITICAL QUALITY RULES:
1. COMPLEXITY WITH RELIABILITY: You are authorized to build sophisticated UI/UX IF requested.
2. THE "NO-ORPHAN" WIRING RULE: Every button, form, and interactive element MUST be wired to the backend. Frontend fetch() calls MUST match backend routes exactly.
3. DEFENSIVE FRONTEND: Wrap fetch() calls in try/catch. If an API fails, show an error in the UI. DO NOT freeze.
4. REAL ASSETS: Use '/api/get-image?q=keyword' for all images. NO placeholders.
5. NO MOCK-ONLY DATA LAYER: Persist data with a JSON file via fs.promises (data.json). DO NOT use sqlite3 or any native database addon.
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

        const content = await chatCompletion({
            apiKey,
            logger,
            messages: [
                { role: 'system', content: coderPrompt },
                { role: 'user', content: `Execute CoT protocol and output code for ${filePath}` }
            ]
        });

        const thoughtMatch = content.match(/<thought_process>([\s\S]*?)<\/thought_process>/i);
        if (thoughtMatch && logger) {
            logger(`\x1b[90m[Coder Thought Process]: ${thoughtMatch[1].trim().split('\n')[0]}...\x1b[0m\n`);
        } else if (thoughtMatch) {
            console.log(`\x1b[90m[Coder Thought Process]: ${thoughtMatch[1].trim().split('\n')[0]}...\x1b[0m`);
        }

        return extractGeneratedFile(content);
    }

    // 按用户的一句话补丁改已有项目。
    // 用户层面：在修改页里说「加一个购物车」，对应文件会被改掉，不必从头再生成。
    static async applyQAPatch(projectDir, message, apiKey, logger = null) {
        const log = (msg) => {
            if (logger) logger(`${msg}\n`);
            else console.log(msg);
        };

        log('🧠 [QA Agent] Analyzing AST and formulating Chain-of-Thought reasoning...');

        const backupDir = `${projectDir}_backup_${Date.now()}`;
        try {
            await fs.copy(projectDir, backupDir);
            log(`🛡️ [System] Created safety snapshot at: ${path.basename(backupDir)}`);
        } catch (e) {
            log('⚠️ [System] Backup failed, proceeding carefully...');
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

        const content = await chatCompletion({
            apiKey,
            logger,
            messages: [
                { role: 'system', content: qaPrompt },
                { role: 'user', content: 'Execute QA Protocol and provide the patch.' }
            ]
        });

        const thoughtMatch = content.match(/<thought_process>([\s\S]*?)<\/thought_process>/i);
        if (thoughtMatch) {
            log(`\n\x1b[36m💡 [QA AI Thinking Process]:\n${thoughtMatch[1].trim()}\x1b[0m\n`);
        }

        const patchMatch = content.match(/<patch>([\s\S]*?)<\/patch>/i);
        const jsonSource = patchMatch ? patchMatch[1].trim() : content;
        const patchData = extractJsonObject(jsonSource);

        log(`📝 [File Service] Applying AST Grafting for ${Object.keys(patchData).length} files...`);
        await FileService.applyPatch(projectDir, patchData);
        return true;
    }
}

module.exports = AIService;

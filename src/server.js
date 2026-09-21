const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const AIService = require('./services/aiService');
const EnvService = require('./services/envService');
const { createWorkspace } = require('./workspace/workspace');
const { encodeProjectReady, encodeStage, encodeHandoff } = require('./protocol/streamEvents');
const { askLiaison, writeBrief, designUx, reviewImplementation, formatBlueprint, findRole } = require('./pipeline/crew');
const { CREW_ROLES } = require('./pipeline/roles');
const { researchGithub } = require('./pipeline/githubSearch');
const { wrapUntrustedResearch } = require('./pipeline/research');
const FileService = require('./services/fileService');
const { loadProjectEnv, resolveApiKey, hasServerApiKey } = require('./services/secrets');
const { createAbortGate, bindRequestAbort, isAbortError } = require('./jobs/abortGate');
const { isLoopbackAddress } = require('./jobs/netGuard');

// CodeCraft 网页服务：生成项目、列出旧项目、继续修改。
// 用户层面：打开 http://127.0.0.1:8080 就能从一句话需求走到可继续改的项目。

loadProjectEnv();

const app = express();
const workspace = createWorkspace();

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 接口只接受本机请求。
// 用户层面：同一网络里的别人打不开你的工作室，也用不了你放在 .env 里的密钥。
app.use('/api', (req, res, next) => {
    const addr = req.socket && req.socket.remoteAddress;
    if (!isLoopbackAddress(addr)) {
        return res.status(403).json({ error: '只允许本机访问 CodeCraft' });
    }
    next();
});

// 优先用服务端密钥，没有时才用页面上填的。
// 用户层面：配过 .env 就不必把 Key 发到请求里。
function requestApiKey(req) {
    return resolveApiKey(req.body && req.body.apiKey);
}

// 错误信息里只回安全的项目名。
// 用户层面：失败提示不会把奇怪字符写进页面，也不会泄露你输入的整段路径。
function safeProjectLabel(raw) {
    try {
        return workspace.sanitizeProjectName(raw);
    } catch {
        return '该项目';
    }
}

function handoffBody(handoffs, id) {
    const item = (handoffs || []).find((row) => row && row.id === id);
    return item && typeof item.body === 'string' ? item.body : '';
}

// 把生成过程接到日志流，并在用户关掉页面或点停止时打断。
// 用户层面：不想等了可以停；刷新也不会让后台偷偷写完。
function attachStream(req, res) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    const gate = createAbortGate();
    bindRequestAbort(gate, req, res);
    const streamLogger = (message) => {
        process.stdout.write(message);
        if (!res.writableEnded) res.write(message);
    };
    return { gate, streamLogger };
}

// 每一棒交出的稿子立刻写进项目文件夹。
// 用户层面：做到一半关掉页面，已经问完的调研和交互稿还在。
async function persist(projectName, handoffs, status, stage) {
    await workspace.saveProgress(projectName, {
        handoffs,
        job: { status, stage, updatedAt: new Date().toISOString() }
    });
}

// 按关键词把图片请求转到免费图库。
// 用户层面：生成出来的页面能显示真实图片，而不是裂图或占位块。
app.get('/api/get-image', (req, res) => {
    const { q } = req.query;
    if (!q) return res.redirect('https://picsum.photos/800/600');
    const targetUrl = `https://loremflickr.com/800/600/${encodeURIComponent(q)}`;
    console.log(`\n🖼️ [Asset Discovery] Redirecting request for [${q}] to real asset...`);
    res.redirect(targetUrl);
});

// 告诉网页服务端有没有配好密钥。
// 用户层面：配过 .env 就不必每次在输入框里贴 Key。
app.get('/api/status', (req, res) => {
    res.json({ hasServerApiKey: hasServerApiKey() });
});

// 列出已经生成过的项目。
// 用户层面：打开网页就能拿回以前做过的项目继续改，不必记住文件夹名。
app.get('/api/projects', async (req, res) => {
    try {
        const projects = await workspace.listProjects();
        res.json({
            projects: projects.map((item) => ({ name: item.name, mtimeMs: item.mtimeMs }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 打开一个已有项目，确认它还在并列出文件。
// 用户层面：点列表里的项目会进入修改页，并看到里面有哪些文件。
app.get('/api/projects/:name', async (req, res) => {
    try {
        const details = await workspace.listProjectFiles(req.params.name);
        res.json({
            name: details.name,
            files: details.files,
            handoffs: details.handoffs || [],
            job: details.job || null
        });
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
});

// 顾问和甲方谈细节。
// 用户层面：你提出想法后，有人追问页面、用户和数据，而不是立刻开始写代码。
app.post('/api/talk', async (req, res) => {
    const { lang, initialNeed, messages } = req.body || {};
    try {
        const apiKey = requestApiKey(req);
        const turn = await askLiaison({ apiKey, lang, initialNeed, messages });
        res.json(turn);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 把谈话整理成需求总结，供甲方确认。
// 用户层面：开工前你能看见要做什么、不做什么，点头后才进入设计。
app.post('/api/brief', async (req, res) => {
    const { lang, initialNeed, messages } = req.body || {};
    try {
        const apiKey = requestApiKey(req);
        const result = await writeBrief({ apiKey, lang, initialNeed, messages });
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 返回工作室角色顺序和每人交出什么。
// 用户层面：页面顶上的顾问到测试，和实际干活的人一致。
app.get('/api/crew', (req, res) => {
    res.json({ roles: CREW_ROLES });
});

// 启动多代理协作生成项目，并把真实项目名写回日志流。
// 用户层面：确认总结后，设计、施工、测试会依次干活，结束后进入修改页。
app.post('/api/generate', async (req, res) => {
    const { description, outputDir, lang, install, test, force } = req.body || {};
    const { gate, streamLogger } = attachStream(req, res);

    let projectName = '';
    const handoffs = [];
    try {
        const apiKey = requestApiKey(req);
        if (!description || !String(description).trim()) {
            throw new Error('请先填写你想做的应用');
        }

        projectName = String(outputDir || '').trim() || AIService.generateProjectName(description);
        const targetPath = await workspace.ensureWritable(projectName, { force: Boolean(force) });
        projectName = path.basename(targetPath);

        streamLogger('\n===========================================\n');
        streamLogger('需求已确认，工作室按角色交接\n');
        streamLogger(`项目：${projectName}\n`);
        streamLogger(`界面语言：${lang === 'zh' ? '中文' : 'English'}\n`);
        streamLogger('===========================================\n\n');

        const emitStage = (id) => streamLogger(encodeStage({ id }));
        const emitHandoff = async (item) => {
            handoffs.push(item);
            streamLogger(encodeHandoff(item));
            await persist(projectName, handoffs, 'running', item.id);
        };

        emitStage('research');
        gate.throwIfAborted();
        let researchText = '';
        try {
            const research = await researchGithub({ description, signal: gate.signal });
            researchText = research.text;
            await emitHandoff({ id: 'research', title: findRole('research').delivers, body: researchText });
        } catch (researchErr) {
            if (isAbortError(researchErr)) throw researchErr;
            researchText = 'GitHub 调研未完成，后面按需求总结自行设计。不要编造仓库链接。';
            streamLogger(`\x1b[33m调研未完成：${researchErr.message}\x1b[0m\n`);
            await emitHandoff({ id: 'research', title: findRole('research').delivers, body: researchText });
        }

        emitStage('ux');
        gate.throwIfAborted();
        const researchForModel = wrapUntrustedResearch(researchText);
        let uxText = '';
        try {
            const uxResult = await designUx({
                apiKey,
                lang,
                signal: gate.signal,
                description: [description, researchForModel].filter(Boolean).join('\n\n')
            });
            uxText = uxResult.text;
            await emitHandoff({ id: 'ux', title: findRole('ux').delivers, body: uxText });
        } catch (uxErr) {
            if (isAbortError(uxErr)) throw uxErr;
            streamLogger(`\x1b[33m交互稿未完成：${uxErr.message}。技术将只按需求总结拆文件。\x1b[0m\n`);
        }

        emitStage('tech');
        gate.throwIfAborted();
        const spec = [
            description,
            researchForModel,
            uxText ? `交互稿：\n${uxText}` : ''
        ].filter(Boolean).join('\n\n');
        const blueprint = await AIService.callArchitect(spec, apiKey, lang, streamLogger, gate.signal);
        await emitHandoff({ id: 'tech', title: findRole('tech').delivers, body: formatBlueprint(blueprint) });

        emitStage('build');
        gate.throwIfAborted();
        const ok = await AIService.executeGenerationPipeline(
            targetPath,
            blueprint,
            spec,
            apiKey,
            lang,
            streamLogger,
            {
                install: install !== false,
                test: test !== false,
                signal: gate.signal,
                throwIfAborted: () => gate.throwIfAborted()
            }
        );

        emitStage('review');
        gate.throwIfAborted();
        try {
            const filesMap = await FileService.readProjectFiles(targetPath);
            const reviewed = await reviewImplementation({
                apiKey,
                lang,
                description,
                uxText,
                filesMap,
                signal: gate.signal
            });
            await emitHandoff({ id: 'review', title: findRole('review').delivers, body: reviewed.text });
            if (!reviewed.review.ok && reviewed.patchMessage) {
                streamLogger('\n审查发现问题，施工按意见补一轮。\n');
                await AIService.applyQAPatch(targetPath, reviewed.patchMessage, apiKey, streamLogger, gate.signal);
            }
        } catch (reviewErr) {
            if (isAbortError(reviewErr)) throw reviewErr;
            streamLogger(`\x1b[33m审查跳过：${reviewErr.message}\x1b[0m\n`);
        }

        await emitHandoff({
            id: 'test',
            title: findRole('test').delivers,
            body: ok
                ? '安装或编译通过，或这个项目不需要编译。'
                : '安装或编译未通过，请看日志后再用修改页补。'
        });

        await persist(projectName, handoffs, 'done', 'test');
        streamLogger(encodeProjectReady({ name: projectName, ok: ok !== false }));
    } catch (err) {
        if (isAbortError(err)) {
            streamLogger('\n\x1b[33m已停止这一轮。已经写下的稿子还在，可以从项目列表打开继续。\x1b[0m\n');
            if (projectName) {
                await persist(projectName, handoffs, 'cancelled', 'cancelled');
                streamLogger(encodeProjectReady({ name: projectName, ok: false }));
            }
        } else {
            streamLogger(`\n\x1b[31m❌ Fatal Error: ${err.message}\x1b[0m\n`);
            if (projectName) {
                await persist(projectName, handoffs, 'failed', 'failed');
                streamLogger(encodeProjectReady({ name: projectName, ok: false }));
            }
        }
    } finally {
        res.end();
    }
});

// 修改已有项目：先再调研，再施工，再审查。
// 用户层面：在修改页说要改什么，会按工作室流程补一圈，而不是偷偷改完。
app.post('/api/modify', async (req, res) => {
    const { projectDir, message, lang } = req.body || {};
    const { gate, streamLogger } = attachStream(req, res);
    let projectName = '';
    let handoffs;

    try {
        const apiKey = requestApiKey(req);
        const change = String(message || '').trim();
        if (!change) throw new Error('请写出你想改的地方。');

        const targetPath = workspace.resolveProjectDir(projectDir);
        if (!fs.existsSync(targetPath)) {
            throw new Error(`找不到项目「${safeProjectLabel(projectDir)}」。请先生成或从列表打开。`);
        }
        projectName = path.basename(targetPath);
        const details = await workspace.listProjectFiles(projectName);
        handoffs = Array.isArray(details.handoffs) ? details.handoffs.slice() : [];
        const briefText = handoffBody(handoffs, 'brief') || handoffBody(handoffs, 'liaison') || change;
        const uxText = handoffBody(handoffs, 'ux');

        const emitStage = (id) => streamLogger(encodeStage({ id }));
        const emitHandoff = async (item) => {
            const existing = handoffs.findIndex((row) => row.id === item.id);
            if (existing >= 0) handoffs[existing] = item;
            else handoffs.push(item);
            streamLogger(encodeHandoff(item));
            await persist(projectName, handoffs, 'running', item.id);
        };

        emitStage('research');
        gate.throwIfAborted();
        let researchText = '';
        try {
            const research = await researchGithub({
                description: `${briefText}\n改动：${change}`,
                signal: gate.signal
            });
            researchText = research.text;
            await emitHandoff({ id: 'research', title: findRole('research').delivers, body: researchText });
        } catch (researchErr) {
            if (isAbortError(researchErr)) throw researchErr;
            researchText = 'GitHub 调研未完成，按你的修改说明施工。不要编造仓库链接。';
            streamLogger(`\x1b[33m调研未完成：${researchErr.message}\x1b[0m\n`);
            await emitHandoff({ id: 'research', title: findRole('research').delivers, body: researchText });
        }

        emitStage('build');
        gate.throwIfAborted();
        const patchPrompt = [
            `用户要求：${change}`,
            briefText ? `原需求：\n${briefText}` : '',
            wrapUntrustedResearch(researchText)
        ].filter(Boolean).join('\n\n');
        await AIService.applyQAPatch(targetPath, patchPrompt, apiKey, streamLogger, gate.signal);

        emitStage('review');
        gate.throwIfAborted();
        try {
            const filesMap = await FileService.readProjectFiles(targetPath);
            const reviewed = await reviewImplementation({
                apiKey,
                lang,
                description: `${briefText}\n\n本轮修改：${change}`,
                uxText,
                filesMap,
                signal: gate.signal
            });
            await emitHandoff({ id: 'review', title: findRole('review').delivers, body: reviewed.text });
            if (!reviewed.review.ok && reviewed.patchMessage) {
                streamLogger('\n审查发现问题，施工再补一轮。\n');
                await AIService.applyQAPatch(targetPath, reviewed.patchMessage, apiKey, streamLogger, gate.signal);
            }
        } catch (reviewErr) {
            if (isAbortError(reviewErr)) throw reviewErr;
            streamLogger(`\x1b[33m审查跳过：${reviewErr.message}\x1b[0m\n`);
        }

        await persist(projectName, handoffs, 'done', 'review');
        streamLogger('\n\x1b[32m✅ 修改已按调研、施工、审查走完。\x1b[0m\n');
        streamLogger(encodeProjectReady({ name: projectName, ok: true }));
    } catch (err) {
        if (isAbortError(err)) {
            streamLogger('\n\x1b[33m已停止这一轮修改。\x1b[0m\n');
            if (projectName) await persist(projectName, handoffs, 'cancelled', 'cancelled');
        } else {
            streamLogger(`\n\x1b[31m❌ Patch Failed: ${err.message}\x1b[0m\n`);
            streamLogger('💡 [Tip] 请再试一次修改，或检查项目是否还在。\n');
        }
        if (projectName) streamLogger(encodeProjectReady({ name: projectName, ok: false }));
    } finally {
        res.end();
    }
});

// 在用户本机打开生成项目的启动脚本。
// 用户层面：点「在本机运行」会弹出项目自己的窗口，不会在 CodeCraft 里直接执行生成代码。
app.post('/api/start', async (req, res) => {
    const { projectDir } = req.body || {};

    try {
        const targetPath = workspace.resolveProjectDir(projectDir);
        const batPath = path.join(targetPath, 'Start_Project.bat');

        if (fs.existsSync(batPath)) {
            exec(`start "" "${batPath}"`, { cwd: targetPath });
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Start_Project.bat not found. Please regenerate.' });
        }
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 用 LocalTunnel 把本机 3000 端口映射到公网。
// 用户层面：生成并在本机跑起来之后，可以把链接发给别人看。
app.post('/api/publish', async (req, res) => {
    const { projectDir } = req.body || {};
    const localtunnel = require('localtunnel');

    try {
        workspace.resolveProjectDir(projectDir);
        const tunnel = await localtunnel({ port: 3000 });
        console.log(`\n\x1b[36m🌐 Public Access Granted: ${tunnel.url}\x1b[0m`);
        res.json({ url: tunnel.url });

        tunnel.on('close', () => {
            console.log('🌐 Public tunnel closed.');
        });
    } catch (err) {
        res.status(500).json({ error: `Failed to create tunnel: ${err.message}` });
    }
});

const PORT = 8080;
const HOST = process.env.CODECRAFT_HOST || '127.0.0.1';
app.listen(PORT, HOST, async () => {
    console.log('\n===================================================');
    console.log('      🚀 Welcome to CodeCraft Agentic IDE 🚀');
    console.log('===================================================');

    await EnvService.runHealthCheck();

    console.log('\n[System] Booting up CodeCraft Agentic Workflow Engine...');
    console.log('✅ Core Services initialized successfully.');
    console.log(`🚀 Web Interface running at: http://${HOST}:${PORT}\n`);
    if (hasServerApiKey()) {
        console.log('[System] DEEPSEEK_API_KEY 已从环境变量加载，网页不必再填密钥。\n');
    }
});

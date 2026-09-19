const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const AIService = require('./services/aiService');
const EnvService = require('./services/envService');
const { createWorkspace } = require('./workspace/workspace');
const { encodeProjectReady } = require('./protocol/streamEvents');

// CodeCraft 网页服务：生成项目、列出旧项目、继续修改。
// 用户层面：打开 localhost:8080 就能从一句话需求走到可继续改的项目。

const app = express();
const workspace = createWorkspace();

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 按关键词把图片请求转到免费图库。
// 用户层面：生成出来的页面能显示真实图片，而不是裂图或占位块。
app.get('/api/get-image', (req, res) => {
    const { q } = req.query;
    if (!q) return res.redirect('https://picsum.photos/800/600');
    const targetUrl = `https://loremflickr.com/800/600/${encodeURIComponent(q)}`;
    console.log(`\n🖼️ [Asset Discovery] Redirecting request for [${q}] to real asset...`);
    res.redirect(targetUrl);
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
        res.json({ name: details.name, files: details.files });
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
});

// 启动多代理协作生成项目，并把真实项目名写回日志流。
// 用户层面：生成结束后自动进入这个项目的修改页。
app.post('/api/generate', async (req, res) => {
    const { description, outputDir, apiKey, lang, install, test, force } = req.body || {};

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    const streamLogger = (message) => {
        process.stdout.write(message);
        res.write(message);
    };

    let projectName = '';
    try {
        if (!description || !String(description).trim()) {
            throw new Error('请先填写你想做的应用');
        }

        projectName = String(outputDir || '').trim() || AIService.generateProjectName(description);
        const targetPath = await workspace.ensureWritable(projectName, { force: Boolean(force) });
        projectName = path.basename(targetPath);

        streamLogger('\n===========================================\n');
        streamLogger('🌎 Initializing CodeCraft Agentic Pipeline\n');
        streamLogger(`📁 Project: ${projectName}\n`);
        streamLogger(`🎯 Language Mode: ${lang === 'zh' ? '繁體中文' : 'English-First'}\n`);
        streamLogger('===========================================\n\n');

        const blueprint = await AIService.callArchitect(description, apiKey, lang, streamLogger);
        const ok = await AIService.executeGenerationPipeline(
            targetPath,
            blueprint,
            description,
            apiKey,
            lang,
            streamLogger,
            { install: install !== false, test: test !== false }
        );
        streamLogger(encodeProjectReady({ name: projectName, ok: ok !== false }));
    } catch (err) {
        streamLogger(`\n\x1b[31m❌ Fatal Error: ${err.message}\x1b[0m\n`);
        if (projectName) {
            streamLogger(encodeProjectReady({ name: projectName, ok: false }));
        }
    } finally {
        res.end();
    }
});

// AI 修改已有项目。
// 用户层面：在修改页说要改什么，对应文件会被补丁掉。
app.post('/api/modify', async (req, res) => {
    const { projectDir, message, apiKey } = req.body || {};

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    const streamLogger = (msg) => {
        process.stdout.write(msg);
        res.write(msg);
    };

    try {
        const targetPath = workspace.resolveProjectDir(projectDir);
        if (!fs.existsSync(targetPath)) {
            throw new Error(`找不到项目「${projectDir}」。请先生成或从列表打开。`);
        }
        await AIService.applyQAPatch(targetPath, message, apiKey, streamLogger);
        streamLogger('\n\x1b[32m✅ Patch applied successfully using AST Smart Grafting.\x1b[0m\n');
    } catch (err) {
        streamLogger(`\n\x1b[31m❌ Patch Failed: ${err.message}\x1b[0m\n`);
        streamLogger('💡 [Tip] 请再试一次修改，或检查项目是否还在。\n');
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
app.listen(PORT, async () => {
    console.log('\n===================================================');
    console.log('      🚀 Welcome to CodeCraft Agentic IDE 🚀');
    console.log('===================================================');

    await EnvService.runHealthCheck();

    console.log('\n[System] Booting up CodeCraft Agentic Workflow Engine...');
    console.log('✅ Core Services initialized successfully.');
    console.log(`🚀 Web Interface running at: http://localhost:${PORT}\n`);
});

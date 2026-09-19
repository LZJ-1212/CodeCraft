const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const AIService = require('./services/aiService');
const FileService = require('./services/fileService');
const EnvService = require('./services/envService');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 按关键词把图片请求转到免费图库。
// 用户层面：生成出来的页面能显示真实图片，而不是裂图或占位块。
app.get('/api/get-image', (req, res) => {
  const { q } = req.query;
  // 如果 AI 沒給關鍵字，就給一張隨機風景圖
  if (!q) return res.redirect('https://picsum.photos/800/600');

  // 關鍵：將 AI 生成的關鍵字轉發給 LoremFlickr (目前最穩定的免費圖庫)
  const targetUrl = `https://loremflickr.com/800/600/${encodeURIComponent(q)}`;

  console.log(`\n🖼️ [Asset Discovery] Redirecting request for [${q}] to real asset...`);
  res.redirect(targetUrl);
});

// 🌐 API 1: 啟動多代理協作生成專案 
app.post('/api/generate', async (req, res) => {
  const { description, outputDir, apiKey, lang } = req.body;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  // 把这次生成的日志只写回当前这次请求。
  // 用户层面：网页终端里看到的是自己这次任务的进度，不会和别人的输出混在一起。
  const streamLogger = (message) => {
    process.stdout.write(message);
    res.write(message);
  };

  try {
    const projectName = outputDir || AIService.generateProjectName(description);
    const targetPath = path.resolve(process.cwd(), projectName);

    streamLogger(`\n===========================================\n`);
    streamLogger(`🌎 Initializing CodeCraft Agentic Pipeline\n`);
    streamLogger(`🎯 Language Mode: ${lang === 'zh' ? '繁體中文' : 'English-First'}\n`);
    streamLogger(`===========================================\n\n`);

    // 將 streamLogger 作為最後一個參數進行依賴注入
    const blueprint = await AIService.callArchitect(description, apiKey, lang, streamLogger);
    await AIService.executeGenerationPipeline(targetPath, blueprint, description, apiKey, lang, streamLogger);

  } catch (err) {
    streamLogger(`\n\x1b[31m❌ Fatal Error: ${err.message}\x1b[0m\n`);
  } finally {
    res.end(); // 確保連線正常關閉
  }
});

// 🌐 API 2: AI 魔法修復 (QA Agent)
app.post('/api/modify', async (req, res) => {
  const { projectDir, message, apiKey } = req.body;
  const targetPath = path.resolve(process.cwd(), projectDir || "");

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  // 獨立的實例化 Logger，確保修復過程的日誌與生成過程完全隔離
  const streamLogger = (msg) => {
    process.stdout.write(msg);
    res.write(msg);
  };

  try {
    // 同樣將 streamLogger 注入給 applyQAPatch
    await AIService.applyQAPatch(targetPath, message, apiKey, streamLogger);
    streamLogger(`\n\x1b[32m✅ Patch applied successfully using AST Smart Grafting.\x1b[0m\n`);
  } catch (err) {
    streamLogger(`\n\x1b[31m❌ Patch Failed: ${err.message}\x1b[0m\n`);
    streamLogger(`\x1b[33m💡 [Tip] 請嘗試再次點擊修復按鈕，讓 AI 重新嘗試。\x1b[0m\n`);
  } finally {
    res.end();
  }
});

// 🌐 API 3: 啟動生成好的專案 (實體視窗隔離模式)
app.post('/api/start', async (req, res) => {
  const { projectDir } = req.body;
  const targetPath = path.resolve(process.cwd(), projectDir || "");

  try {
    const batPath = path.join(targetPath, 'Start_Project.bat');

    if (fs.existsSync(batPath)) {
      exec(`start "" "${batPath}"`, { cwd: targetPath });
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Start_Project.bat not found. Please regenerate." });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🌐 API 4: 公網發布 (LocalTunnel)
app.post('/api/publish', async (req, res) => {
  const { projectDir } = req.body;
  const localtunnel = require('localtunnel');

  try {
    const tunnel = await localtunnel({ port: 3000 });
    console.log(`\n\x1b[36m🌐 Public Access Granted: ${tunnel.url}\x1b[0m`);
    res.json({ url: tunnel.url });

    tunnel.on('close', () => {
      console.log('🌐 Public tunnel closed.');
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to create tunnel: " + err.message });
  }
});

const PORT = 8080;
app.listen(PORT, async () => {
  console.log(`\n===================================================`);
  console.log(`      🚀 Welcome to CodeCraft Agentic IDE 🚀`);
  console.log(`===================================================`);

  // 啟動環境檢查
  await EnvService.runHealthCheck();

  console.log(`\n[System] Booting up CodeCraft Agentic Workflow Engine...`);
  console.log(`✅ Core Services initialized successfully.`);
  console.log(`🚀 Web Interface running at: http://localhost:${PORT}\n`);
});
#!/usr/bin/env node

const { program } = require('commander');
const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs-extra');
const AIService = require('../src/services/aiService'); // 新建 Service
const FileService = require('../src/services/fileService'); // 新建 Service

program
  .command('ai-create-pro <description>')
  .description('Use Agentic Workflow to generate a sophisticated project (English First)')
  .option('-o, --output <dir>', 'Specify output directory')
  .option('-k, --api-key <key>', 'DeepSeek API Key')
  .option('-l, --lang <language>', 'UI/Output Language (en/zh)', 'en') // 預設為英文
  .action(async (description, options) => {
    try {
      // 1. 環境初始化與 API Key 獲取
      const apiKey = await AIService.resolveApiKey(options.apiKey);
      const projectName = options.output || AIService.generateProjectName(description);
      const targetDir = path.resolve(process.cwd(), projectName);

      console.log(`\n🚀 Initializing CodeCraft Agentic Workflow...`);
      console.log(`🌎 Standard: English-First Delivery [Mode: ${options.lang}]\n`);

      // 2. 呼叫架構師代理 (委派至 Service)
      const blueprint = await AIService.callArchitect(description, apiKey, options.lang);

      // 3. 多代理協作生成與 QA 循環 (委派至 Service)
      // 這部分的複雜邏輯現在被封裝在 Service 中，保持 CLI 入口簡潔
      await AIService.executeGenerationPipeline(targetDir, blueprint, description, apiKey, options.lang);

      console.log(`\nProject ${projectName} is ready.`);
      process.exit(0);
    } catch (error) {
      console.error(`\n❌ Fatal Error: ${error.message}`);
      process.exit(1);
    }
  });

// [核心修復] 必須呼叫 parse，Commander 才會開始解析終端機輸入的參數並執行 action！
program.parse(process.argv);
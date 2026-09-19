#!/usr/bin/env node

const { program } = require('commander');
const AIService = require('../src/services/aiService');
const { createWorkspace } = require('../src/workspace/workspace');

// 命令行入口：用一句话生成项目。
// 用户层面：不打开网页也能在终端里生成，结果同样落在 generated 目录，之后仍可在网页里继续改。
program
    .command('ai-create-pro <description>')
    .description('Use Agentic Workflow to generate a sophisticated project (English First)')
    .option('-o, --output <dir>', 'Specify output directory')
    .option('-k, --api-key <key>', 'DeepSeek API Key')
    .option('-l, --lang <language>', 'UI/Output Language (en/zh)', 'en')
    .action(async (description, options) => {
        try {
            const apiKey = await AIService.resolveApiKey(options.apiKey);
            const workspace = createWorkspace();
            const projectName = options.output || AIService.generateProjectName(description);
            const targetDir = await workspace.ensureWritable(projectName, { force: true });

            console.log('\n🚀 Initializing CodeCraft Agentic Workflow...');
            console.log(`🌎 Standard: English-First Delivery [Mode: ${options.lang}]`);
            console.log(`📁 Writing into: ${targetDir}\n`);

            const blueprint = await AIService.callArchitect(description, apiKey, options.lang);
            await AIService.executeGenerationPipeline(targetDir, blueprint, description, apiKey, options.lang);

            console.log(`\nProject ${projectName} is ready.`);
            process.exit(0);
        } catch (error) {
            console.error(`\n❌ Fatal Error: ${error.message}`);
            process.exit(1);
        }
    });

program.parse(process.argv);

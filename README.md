# CodeCraft

用自然语言描述你想做的应用，CodeCraft 会生成一套可运行的小型 Web 项目（Node.js + 静态前端），并在网页里继续改需求。

当前适合在本机使用：需要 Node.js 和 DeepSeek API Key。服务默认只监听 `127.0.0.1`，局域网和公网访问不到。生成与修改默认使用 DeepSeek **V4 Pro**（`deepseek-v4-pro`）。安装依赖时使用 `npm install --ignore-scripts`，不会执行第三方安装钩子。

## 它做什么

工作室按角色分工，而不是一口气写完：

1. **顾问**：追问细节，留下谈话纪要
2. **总结**：写成需求稿，你确认后才继续
3. **调研**：去 GitHub 找相关 Agent Skill 和可参考的开源实现（只借鉴，不整仓复制）
4. **交互**：定页面和操作路径，交出交互稿
5. **技术**：按交互稿拆文件，交出蓝图
6. **施工**：按蓝图写代码
7. **审查**：对照需求找漏接，能改的先改一轮
8. **测试**：安装依赖并尝试编译，留下测试报告

生成结束后进入修改页，也可以打开以前的项目继续改。新项目默认落在 `generated/`。

## 环境要求

- Node.js LTS
- DeepSeek API Key：写在项目根目录 `.env` 的 `DEEPSEEK_API_KEY`（不要提交进 Git）。没配时仍可在网页里临时填写
- 可选：`GITHUB_TOKEN`（提高 GitHub 搜索限额；不填也能搜，但容易触发限流）

## 启动

**Windows**

双击 `OpenCodeCraft.bat`，或：

```bash
npm install
npm start
```

浏览器打开 [http://127.0.0.1:8080](http://127.0.0.1:8080)。

**macOS / Linux**

```bash
chmod +x OpenCodeCraft.sh
./OpenCodeCraft.sh
```

也可以用命令行：

```bash
node bin/cli.js ai-create-pro "A todo list with dark mode" -k YOUR_API_KEY
```

## 使用方式

1. 若未配置 `.env`，填入 API Key；写下一句话需求，点「找顾问谈谈」
2. 回答顾问的问题；谈得差不多后会写出需求总结，你确认后会先去 GitHub 找相关 skill 和源码，再开始设计、施工、测试
3. 生成过程中可点「停止这一轮」；已经写下的稿子会留在项目里
4. 做完后进入该项目的修改页，改需求也会再调研、施工、审查；也可返回工作台打开以前的项目
5. 如果需求已经写得很清楚，也可以点「需求很清楚，直接生成」跳过谈话
6. 生成目录在 `generated/`；Windows 可用项目里的 `Start_Project.bat` 在本机启动

## 仓库结构

```
bin/cli.js                 命令行入口
src/server.js              Web 服务
src/workspace/             生成沙箱与历史项目列表
src/llm/                   DeepSeek V4 Pro 调用与输出解析
src/pipeline/             顾问谈话、需求总结
src/protocol/              角色阶段与生成结束事件
src/services/              管线、文件与环境
src/core/ast.js            大文件骨架压缩与语法检查
src/public/                工作台与修改页
docs/CODING_STANDARDS.md   代码规范
```

编码约定见 [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md)。

## 许可

MIT。详见 [LICENSE](LICENSE)。

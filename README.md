# CodeCraft

用自然语言描述你想做的应用，CodeCraft 会生成一套可运行的小型 Web 项目（Node.js + 静态前端），并在网页里继续改需求。

当前适合在本机使用：需要 Node.js 和 DeepSeek API Key。不要把服务直接暴露到公网。生成与修改默认使用 DeepSeek **V4 Pro**（`deepseek-v4-pro`）。

## 它做什么

1. **Architect**：根据你的描述列出要生成的文件和各自职责
2. **Coder**：按文件写出代码
3. **QA**：按你勾选的选项安装依赖；若有 `build` 脚本会尝试编译。生成结束后进入修改页，也可以打开以前的项目继续改。

生成过程会把进度写到网页右侧的日志里。新项目默认落在 `generated/` 目录，下次打开网页可以从「以前的项目」列表拿回来。

## 环境要求

- Node.js LTS
- DeepSeek API Key（只应放在本机，不要提交进 Git）

## 启动

**Windows**

双击 `OpenCodeCraft.bat`，或：

```bash
npm install
npm start
```

浏览器打开 [http://localhost:8080](http://localhost:8080)。

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

1. 填入 API Key 和需求描述，点「开始生成」
2. 生成成功后会自动进入该项目的修改页
3. 在修改页用一句话继续改项目；也可点「返回工作台」从列表打开以前的项目
4. 生成目录在当前工作目录下的 `generated/`；Windows 可用项目里的 `Start_Project.bat` 在本机启动

## 仓库结构

```
bin/cli.js                 命令行入口
src/server.js              Web 服务
src/workspace/             生成沙箱与历史项目列表
src/llm/                   DeepSeek V4 Pro 调用与输出解析
src/protocol/              生成结束事件（跳转修改页）
src/services/              管线、文件与环境
src/core/ast.js            大文件骨架压缩与语法检查
src/public/                工作台与修改页
docs/CODING_STANDARDS.md   代码规范
```

编码约定见 [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md)。

## 许可

MIT。详见 [LICENSE](LICENSE)。

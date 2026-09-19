# CodeCraft

用自然语言描述你想做的应用，CodeCraft 会生成一套可运行的小型 Web 项目（Node.js + 静态前端），并在网页里继续改需求。

当前适合在本机使用：需要 Node.js 和 DeepSeek API Key。不要把服务直接暴露到公网。

## 它做什么

1. **Architect**：根据你的描述列出要生成的文件和各自职责  
2. **Coder**：按文件写出代码  
3. **QA**：安装依赖；若有 `build` 脚本会尝试编译，也可以在网页里用自然语言打补丁  

生成过程会把进度流式打到网页终端。

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

1. 填入 API Key 和需求描述  
2. 点 Generate，等待生成结束  
3. 用 AI Magic Edit 继续改项目  
4. 生成目录在当前工作目录下；Windows 可用项目里的 `Start_Project.bat` 在本机启动  

## 仓库结构

```
bin/cli.js              命令行入口
src/server.js           Web 服务
src/services/           模型调用、文件与环境
src/core/ast.js         大文件骨架压缩与语法检查
src/public/index.html   网页界面
docs/CODING_STANDARDS.md  代码规范
```

编码约定见 [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md)。

## 许可

MIT。详见 [LICENSE](LICENSE)。

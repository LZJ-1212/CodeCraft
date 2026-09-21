const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const ASTProcessor = require('../core/ast');
const { sanitizePackageJsonText } = require('../pipeline/packageGuard');

class FileService {
    // 在项目目录里跑本机命令，不用系统 shell 拼接。
    // 用户层面：安装依赖时只会执行我们列出的 npm 参数，不会把整段命令丢给 cmd。
    static async runCommand(cmd, args, cwd) {
        const bin = cmd === 'npm' && process.platform === 'win32' ? 'npm.cmd' : cmd;
        return new Promise((resolve, reject) => {
            const proc = spawn(bin, args, { cwd, stdio: 'pipe', shell: false, windowsHide: true });
            let errorOutput = '';

            proc.stderr.on('data', (data) => { errorOutput += data.toString(); });
            proc.on('error', (error) => reject(error));
            proc.on('close', (code) => {
                if (code === 0) resolve(true);
                else reject(new Error(`Execution failed (Code ${code})\n${errorOutput}`));
            });
        });
    }

    /**
     * 處理專案佔位符替換 (Placeholder Replacement)
     */
    static async processPlaceholders(dir, replacements) {
        const files = await fs.readdir(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = await fs.stat(filePath);

            if (stat.isDirectory()) {
                await this.processPlaceholders(filePath, replacements);
            } else {
                let content = await fs.readFile(filePath, 'utf8');
                for (const [key, value] of Object.entries(replacements)) {
                    content = content.replace(new RegExp(`{% ${key} %}`, 'g'), value);
                }
                await fs.writeFile(filePath, content, 'utf8');
            }
        }
    }

    /**
     * 寫入 AI 生成的檔案並強制執行安全過濾 (Path Traversal Defence)
     */
    static async writeGeneratedFiles(targetDir, filesMap) {
        for (const [filePath, content] of Object.entries(filesMap)) {
            if (filePath.includes('..') || path.isAbsolute(filePath)) {
                console.warn(`\x1b[33m⚠️ Security Warning: Blocked unsafe file path [${filePath}]\x1b[0m`);
                continue;
            }
            const fullPath = path.join(targetDir, filePath);
            // 生成出来的 package.json 会先去掉安装钩子。
            // 用户层面：即使模型被诱导写了 postinstall，勾选安装时也不会在你电脑上执行它。
            const safeContent = path.basename(filePath) === 'package.json'
                ? sanitizePackageJsonText(content)
                : content;
            await fs.outputFile(fullPath, safeContent, 'utf8');
        }
    }

    /**
     * 讀取專案代碼並自動進行 AST 骨架壓縮 (Context Preparation)
     */
    static async readProjectFiles(targetDir) {
        const filesMap = {};
        const ignoreDirs = ['node_modules', '.git', 'dist', 'build', 'public', 'assets', '.codecraft'];
        const ignoreFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
        const allowedExts = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.html', '.css', '.json', '.md'];

        const scan = async (currentPath, relativePath = '') => {
            const entries = await fs.readdir(currentPath, { withFileTypes: true });
            for (const entry of entries) {
                if (ignoreDirs.includes(entry.name) || ignoreFiles.includes(entry.name)) continue;

                const fullPath = path.join(currentPath, entry.name);
                const relPath = path.join(relativePath, entry.name);

                if (entry.isDirectory()) {
                    await scan(fullPath, relPath);
                } else {
                    const ext = path.extname(entry.name);
                    if (allowedExts.includes(ext) || entry.name === 'Dockerfile' || entry.name.startsWith('.env')) {
                        const stat = await fs.stat(fullPath);

                        if (stat.size < 500 * 1024) {
                            let content = await fs.readFile(fullPath, 'utf8');

                            // [串接修復] 使用全新的 ASTProcessor 呼叫方式
                            if (stat.size > 15 * 1024 && ['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
                                console.log(`\n  🌲 [AST Optimization] Extracting skeleton for large file: ${relPath}`);
                                content = ASTProcessor.extractCodeSkeleton(content);
                            }
                            filesMap[relPath.replace(/\\/g, '/')] = content;
                        } else {
                            console.warn(`\n⚠️ Warning: Skipped ${relPath} (Exceeds 500KB limit).`);
                        }
                    }
                }
            }
        };

        await scan(targetDir);
        return filesMap;
    }

    /**
     * 應用 AI 代碼補丁與 AST 語法防護 (Syntax Guard Patching)
     */
    static async applyPatch(targetDir, updatedFilesMap) {
        for (const [filePath, fileContent] of Object.entries(updatedFilesMap)) {
            if (filePath.includes('..') || path.isAbsolute(filePath)) continue;

            const absPath = path.join(targetDir, filePath);

            if (fileContent === null) {
                await fs.remove(absPath);
                console.log(`  🗑️  Deleted: ${filePath}`);
            } else {
                let finalContent = fileContent;
                const ext = path.extname(filePath);

                // [架構升級] 只有 JavaScript/TypeScript 檔案才進入 AST 海關檢查
                if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
                    // 呼叫 ast.js 裡的語法守門員，確認這段代碼沒有少括號或致命錯誤
                    const validatedCode = ASTProcessor.applyASTPatch("", finalContent);

                    if (validatedCode === null) {
                        // 語法有毒！拒絕寫入，保護原本健康的專案檔案！
                        console.warn(`  🚫 [Syntax Guard] Blocked unsafe patch for ${filePath} due to syntax errors.`);
                        continue;
                    }
                    finalContent = validatedCode; // 使用排版後且保證安全的代碼
                }

                await fs.outputFile(absPath, path.basename(filePath) === 'package.json'
                    ? sanitizePackageJsonText(finalContent)
                    : finalContent, 'utf8');
                console.log(`  📝 Updated: ${filePath}`);
            }
        }
    }
}

module.exports = FileService;
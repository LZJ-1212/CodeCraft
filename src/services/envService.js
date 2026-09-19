const { spawn } = require('child_process');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const inquirer = require('inquirer');

/**
 * Environment Service (EnvService)
 * [Why] Encapsulates platform-specific runtime detection and installation.
 * [How] Uses Node.js child_process to interact with OS package managers (WinGet, Brew, APT).
 */
class EnvService {
    /**
     * 檢查系統命令是否存在並回傳版本號
     */
    static async checkCommand(cmd) {
        try {
            const { stdout } = await exec(`${cmd} --version`);
            return stdout.trim();
        } catch {
            return null;
        }
    }

    /**
     * 執行跨平台軟體自動安裝
     */
    static async installSoftware(software, softwareName) {
        const commands = {
            win32: { node: 'winget install OpenJS.NodeJS', git: 'winget install Git.Git' },
            darwin: { node: 'brew install node', git: 'brew install git' },
            linux: {
                node: 'sudo apt update && sudo apt install -y nodejs npm',
                git: 'sudo apt update && sudo apt install -y git'
            }
        };

        const cmd = commands[process.platform]?.[software];
        if (!cmd) {
            console.error(`\x1b[31m❌ OS not supported for automated installation of ${softwareName}. Please install manually.\x1b[0m`);
            return false;
        }

        console.log(`\n📦 Attempting to install ${softwareName} via system package manager...`);
        try {
            // [核心修復] 既然使用了 shell: true，就絕對不要去切割指令。
            // 直接將完整指令作為字串傳入，讓作業系統原生的 Shell 去解析 '&&' 等控制符號！
            const installProcess = spawn(cmd, [], { stdio: 'inherit', shell: true });

            await new Promise((resolve, reject) => {
                installProcess.on('close', code => code === 0 ? resolve() : reject());
            });

            console.log(`\x1b[32m✅ ${softwareName} installation successful!\x1b[0m`);
            return true;
        } catch {
            console.warn(`\x1b[33m⚠️ ${softwareName} installation failed. Manual installation required.\x1b[0m`);
            return false;
        }
    }

    /**
     * 執行完整的環境健康檢查與互動式修復
     */
    static async runHealthCheck() {
        console.log('🔍 Scanning system development environment...\n');
        const [nodeVer, gitVer] = await Promise.all([
            this.checkCommand('node'),
            this.checkCommand('git')
        ]);

        console.log(nodeVer ? `✅ Node.js: ${nodeVer}` : '❌ Node.js: Not Installed');
        console.log(gitVer ? `✅ Git: ${gitVer}` : '❌ Git: Not Installed');

        if (nodeVer && gitVer) {
            return console.log('\n🎉 Environment is fully configured and deployment-ready!');
        }

        if (!process.stdin.isTTY) {
            // 没有交互终端时不要卡住启动。
            // 用户层面：双击启动或后台运行时，网页仍能打开，不会停在「是否安装 Git」。
            console.warn('\n⚠️ Missing Node.js or Git. Skipping interactive install because this is not a terminal.');
            return;
        }

        const choices = [];
        if (!nodeVer) choices.push({ name: 'Node.js (LTS)', value: 'node', checked: true });
        if (!gitVer) choices.push({ name: 'Git Version Control', value: 'git', checked: true });

        const { selected } = await inquirer.prompt([{
            name: 'selected',
            type: 'checkbox',
            message: 'Select runtimes to install automatically:',
            choices
        }]);

        if (selected.includes('node')) await this.installSoftware('node', 'Node.js');
        if (selected.includes('git')) await this.installSoftware('git', 'Git');

        console.log('\n🎉 Setup complete. Please restart your terminal if new runtimes were installed.');
    }
}

module.exports = EnvService;
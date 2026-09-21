// 清洗生成项目的 package.json：去掉会在安装时执行的脚本。
// 用户层面：勾选安装依赖时，只会把包装上，不会在你电脑上跑来路不明的命令。

const LIFECYCLE_SCRIPTS = new Set([
    'preinstall', 'install', 'postinstall',
    'preuninstall', 'uninstall', 'postuninstall',
    'prepublish', 'prepublishOnly', 'publish', 'postpublish',
    'prepack', 'postpack', 'prepare',
    'prestart', 'poststart',
    'prestop', 'poststop',
    'prerestart', 'postrestart',
    'pretest', 'posttest',
    'prebuild', 'postbuild'
]);

const SAFE_SCRIPT = /^(node|npx|vite|tsc)\s+[\w./@-]+(?:\s+[\w./@-]+)?$/i;
const UNSAFE_TOKEN = /[;&|`$<>()\n]|\\|&&|\|\||\b(curl|wget|powershell|pwsh|cmd|bash|sh|mshta|regsvr32|invoke-webrequest|child_process|eval)\b/i;

function isSafeNpmScript(value) {
    const text = String(value || '').trim();
    if (!text || text.length > 120) return false;
    if (UNSAFE_TOKEN.test(text)) return false;
    return SAFE_SCRIPT.test(text);
}

function isLifecycleScript(name) {
    const key = String(name || '');
    return LIFECYCLE_SCRIPTS.has(key) || /^(pre|post)[a-z0-9]+$/i.test(key);
}

// 生成项目的 package.json 里不能留下会在安装时执行的脚本。
// 用户层面：勾选安装依赖时，只会装包，不会在你这台电脑上跑来路不明的安装钩子。
function sanitizePackageJsonText(text) {
    const source = String(text || '');
    let pkg;
    try {
        pkg = JSON.parse(source);
    } catch {
        return source;
    }
    if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) return source;

    const scripts = pkg.scripts && typeof pkg.scripts === 'object' && !Array.isArray(pkg.scripts)
        ? pkg.scripts
        : {};
    const nextScripts = {};
    Object.entries(scripts).forEach(([name, command]) => {
        if (isLifecycleScript(name)) return;
        if (!isSafeNpmScript(command)) return;
        nextScripts[name] = String(command).trim();
    });
    pkg.scripts = nextScripts;
    return `${JSON.stringify(pkg, null, 2)}\n`;
}

module.exports = {
    sanitizePackageJsonText,
    isSafeNpmScript,
    isLifecycleScript
};

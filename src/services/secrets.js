const fs = require('fs');
const path = require('path');

// 从项目根目录的 .env 读密钥，已有的环境变量不覆盖。
// 用户层面：Key 放在本机文件里，不必每次在网页里粘贴；也不会写进生成的项目。
function parseEnvText(text) {
    const out = {};
    String(text || '').split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eq = trimmed.indexOf('=');
        if (eq < 1) return;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        out[key] = value;
    });
    return out;
}

function applyEnv(parsed, env = process.env) {
    Object.entries(parsed || {}).forEach(([key, value]) => {
        if (env[key] === undefined || env[key] === '') env[key] = value;
    });
    return env;
}

function loadProjectEnv({ cwd = process.cwd(), env = process.env, readFile } = {}) {
    const envPath = path.join(cwd, '.env');
    try {
        const reader = readFile || ((file) => fs.readFileSync(file, 'utf8'));
        applyEnv(parseEnvText(reader(envPath)), env);
    } catch {
        // 没有 .env 就继续用系统环境变量
    }
    return env;
}

function hasServerApiKey(env = process.env) {
    return Boolean(String(env.DEEPSEEK_API_KEY || '').trim());
}

// 优先用服务端密钥，没有时才用页面上填的。
// 用户层面：配过 .env 就不用把 Key 发到请求体里。
function resolveApiKey(fromClient, env = process.env) {
    const server = String(env.DEEPSEEK_API_KEY || '').trim();
    if (server) return server;
    const client = String(fromClient || '').trim();
    if (client) return client;
    throw new Error('请在项目根目录的 .env 里配置 DEEPSEEK_API_KEY，或在本页填写 API Key');
}

module.exports = {
    parseEnvText,
    applyEnv,
    loadProjectEnv,
    hasServerApiKey,
    resolveApiKey
};

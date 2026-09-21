const path = require('path');
const fs = require('fs-extra');

// 生成结果的沙箱：新项目写到 generated/，也能认出以前直接生成在仓库旁的文件夹。
// 用户层面：生成完能进修改页；下次打开网页还能从列表拿回那个项目继续改。

const SKIP_CWD_DIRS = new Set([
    'src', 'bin', 'docs', 'node_modules', 'generated', 'coverage',
    '.git', '.agents', '.cursor', '.idea', '.vscode'
]);

const PREVIEW_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8'
};

const PREVIEW_BLOCKED_DIRS = new Set(['node_modules', '.git', '.codecraft', 'backend', 'server']);
const PREVIEW_BLOCKED_FILES = new Set([
    '.env', 'package.json', 'package-lock.json', 'server.js',
    'start_project.bat', 'start_project.sh'
]);

function previewError(message) {
    const error = new Error(message);
    error.code = 'PREVIEW';
    return error;
}

// 给预览页补上根路径，让相对引用的样式和脚本能加载。
// 用户层面：修改页里的预览看起来像真的网站，而不是缺样式的白页。
function injectPreviewBase(html, projectName) {
    const name = encodeURIComponent(String(projectName || '').trim());
    const base = `<base href="/preview/${name}/">`;
    const source = String(html || '');
    if (/<base\s/i.test(source)) return source;
    if (/<head[^>]*>/i.test(source)) {
        return source.replace(/<head[^>]*>/i, (open) => `${open}\n${base}`);
    }
    return `${base}\n${source}`;
}

// 把生成结果锁在沙箱里，并记住以前做过的项目。
// 用户层面：生成完能进修改页；下次打开还能从列表拿回那个项目继续改。
function createWorkspace(options = {}) {
    const cwd = path.resolve(options.cwd || process.cwd());
    const rootDir = path.resolve(options.rootDir || cwd);
    const generatedRoot = path.join(rootDir, 'generated');

    function sanitizeProjectName(raw) {
        const name = String(raw || '').trim();
        if (!name || name === '.' || name === '..') {
            throw new Error('请填写合法的项目文件夹名');
        }
        if (name.includes('..') || name !== path.basename(name)) {
            throw new Error('请填写合法的项目文件夹名');
        }
        if (/[<>:"/\\|?*\x00-\x1f]/.test(name)) {
            throw new Error('请填写合法的项目文件夹名');
        }
        return name;
    }

    function isInside(parent, child) {
        const base = path.resolve(parent);
        const target = path.resolve(child);
        return target === base || target.startsWith(base + path.sep);
    }

    function resolveProjectDir(rawName) {
        const name = sanitizeProjectName(rawName);
        const generatedDir = path.join(generatedRoot, name);
        if (!isInside(generatedRoot, generatedDir)) {
            throw new Error('请填写合法的项目文件夹名');
        }

        const legacyDir = path.join(rootDir, name);
        if (!fs.existsSync(generatedDir) && fs.existsSync(legacyDir) && isLegacyProject(legacyDir, name)) {
            return legacyDir;
        }
        return generatedDir;
    }

    function isLegacyProject(dir, name) {
        if (SKIP_CWD_DIRS.has(name)) return false;
        return fs.existsSync(path.join(dir, 'Start_Project.bat'))
            || fs.existsSync(path.join(dir, 'package.json'));
    }

    async function listProjects() {
        const found = new Map();

        await fs.ensureDir(generatedRoot);
        const generatedEntries = await fs.readdir(generatedRoot, { withFileTypes: true });
        for (const entry of generatedEntries) {
            if (!entry.isDirectory()) continue;
            const dir = path.join(generatedRoot, entry.name);
            const stat = await fs.stat(dir);
            found.set(entry.name, { name: entry.name, mtimeMs: stat.mtimeMs, dir });
        }

        const cwdEntries = await fs.readdir(rootDir, { withFileTypes: true });
        for (const entry of cwdEntries) {
            if (!entry.isDirectory() || SKIP_CWD_DIRS.has(entry.name) || found.has(entry.name)) continue;
            const dir = path.join(rootDir, entry.name);
            if (!isLegacyProject(dir, entry.name)) continue;
            const stat = await fs.stat(dir);
            found.set(entry.name, { name: entry.name, mtimeMs: stat.mtimeMs, dir });
        }

        return [...found.values()].sort((a, b) => b.mtimeMs - a.mtimeMs);
    }

    async function ensureWritable(rawName, { force = false } = {}) {
        const dir = resolveProjectDir(rawName);
        const exists = await fs.pathExists(dir);
        if (exists) {
            const entries = await fs.readdir(dir);
            if (entries.length > 0 && !force) {
                throw new Error(`项目「${path.basename(dir)}」已存在。勾选覆盖后才能重新生成。`);
            }
        }
        await fs.ensureDir(dir);
        return dir;
    }

    async function listProjectFiles(rawName) {
        const dir = resolveProjectDir(rawName);
        if (!await fs.pathExists(dir)) {
            throw new Error(`找不到项目「${sanitizeProjectName(rawName)}」。请先生成，或从列表里打开已有项目。`);
        }

        const files = [];
        const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', '.codecraft']);

        async function scan(current, relative = '') {
            const entries = await fs.readdir(current, { withFileTypes: true });
            for (const entry of entries) {
                if (ignoreDirs.has(entry.name)) continue;
                const rel = relative ? `${relative}/${entry.name}` : entry.name;
                if (entry.isDirectory()) {
                    await scan(path.join(current, entry.name), rel);
                } else {
                    files.push(rel.replace(/\\/g, '/'));
                }
            }
        }

        await scan(dir);

        let handoffs = [];
        const handoffPath = path.join(dir, '.codecraft', 'handoffs.json');
        if (await fs.pathExists(handoffPath)) {
            try {
                const parsed = await fs.readJson(handoffPath);
                if (Array.isArray(parsed)) handoffs = parsed;
            } catch {
                handoffs = [];
            }
        }

        let job = null;
        const jobPath = path.join(dir, '.codecraft', 'job.json');
        if (await fs.pathExists(jobPath)) {
            try {
                const parsed = await fs.readJson(jobPath);
                if (parsed && typeof parsed === 'object') job = parsed;
            } catch {
                job = null;
            }
        }

        const name = sanitizeProjectName(rawName);
        const hasPublicIndex = await fs.pathExists(path.join(dir, 'public', 'index.html'));
        const hasRootIndex = await fs.pathExists(path.join(dir, 'index.html'));
        const previewPath = (hasPublicIndex || hasRootIndex) ? `/preview/${encodeURIComponent(name)}/` : '';

        return { name, dir, files: files.sort(), handoffs, job, previewPath };
    }

    // 只发出可在浏览器里打开的页面资源，不启动生成项目的后端。
    // 用户层面：生成完能在修改页里看到页面长什么样，而不必先弹一个运行窗口。
    async function resolvePreviewAsset(rawName, urlPath) {
        const name = sanitizeProjectName(rawName);
        const dir = resolveProjectDir(name);
        if (!await fs.pathExists(dir)) {
            throw previewError(`找不到项目「${name}」的预览`);
        }

        const publicDir = path.join(dir, 'public');
        const webRoot = await fs.pathExists(publicDir) ? publicDir : dir;
        let relative = String(urlPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
        if (!relative || relative.endsWith('/')) {
            relative = `${relative}index.html`.replace(/^\//, '');
        }

        const segments = relative.split('/').filter(Boolean);
        if (segments.some((part) => part === '..' || PREVIEW_BLOCKED_DIRS.has(part) || part.startsWith('.'))) {
            throw previewError('这个文件不能预览');
        }

        const baseName = (segments[segments.length - 1] || '').toLowerCase();
        if (PREVIEW_BLOCKED_FILES.has(baseName)) {
            throw previewError('这个文件不能预览');
        }

        const ext = path.extname(baseName).toLowerCase();
        const contentType = PREVIEW_TYPES[ext];
        if (!contentType) {
            throw previewError('这个文件不能预览');
        }

        const filePath = path.resolve(webRoot, ...segments);
        if (!isInside(webRoot, filePath) || !isInside(dir, filePath)) {
            throw previewError('这个文件不能预览');
        }
        if (!await fs.pathExists(filePath)) {
            throw previewError('找不到预览文件');
        }
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) {
            throw previewError('找不到预览文件');
        }

        return {
            filePath,
            contentType,
            injectBase: ext === '.html'
        };
    }

    // 每交一棒就把稿子写进项目，刷新后还能看见。
    // 用户层面：生成中途关掉页面，已经问完的调研和交互稿不会丢。
    async function saveProgress(rawName, { handoffs, job } = {}) {
        const dir = resolveProjectDir(rawName);
        await fs.ensureDir(path.join(dir, '.codecraft'));
        if (Array.isArray(handoffs)) {
            await fs.outputJson(path.join(dir, '.codecraft', 'handoffs.json'), handoffs, { spaces: 2 });
        }
        if (job && typeof job === 'object') {
            await fs.outputJson(path.join(dir, '.codecraft', 'job.json'), job, { spaces: 2 });
        }
        return dir;
    }

    return {
        generatedRoot,
        sanitizeProjectName,
        resolveProjectDir,
        listProjects,
        ensureWritable,
        listProjectFiles,
        saveProgress,
        resolvePreviewAsset,
        injectPreviewBase
    };
}

module.exports = { createWorkspace };

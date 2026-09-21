const path = require('path');
const fs = require('fs-extra');

// 生成结果的沙箱：新项目写到 generated/，也能认出以前直接生成在仓库旁的文件夹。
// 用户层面：生成完能进修改页；下次打开网页还能从列表拿回那个项目继续改。

const SKIP_CWD_DIRS = new Set([
    'src', 'bin', 'docs', 'node_modules', 'generated', 'coverage',
    '.git', '.agents', '.cursor', '.idea', '.vscode'
]);

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

        return { name: sanitizeProjectName(rawName), dir, files: files.sort(), handoffs, job };
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
        saveProgress
    };
}

module.exports = { createWorkspace };

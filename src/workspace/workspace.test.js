const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const { createWorkspace } = require('./workspace');

describe('workspace', () => {
    let root;
    let workspace;

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'codecraft-ws-'));
        workspace = createWorkspace({ rootDir: root, cwd: root });
    });

    afterEach(async () => {
        await fs.remove(root);
    });

    it('列出已生成的项目，方便用户继续改', async () => {
        await fs.outputFile(path.join(root, 'generated', 'todo-list', 'package.json'), '{}');
        await fs.outputFile(path.join(root, 'generated', 'shop', 'index.html'), '<html></html>');

        const projects = await workspace.listProjects();
        expect(projects.map((item) => item.name)).toEqual(['shop', 'todo-list']);
    });

    it('空工作区时返回空列表，而不是报错', async () => {
        await expect(workspace.listProjects()).resolves.toEqual([]);
    });

    it('拒绝会写出沙箱外的文件夹名', () => {
        expect(() => workspace.resolveProjectDir('../secret')).toThrow(/合法/);
        expect(() => workspace.resolveProjectDir('a/b')).toThrow(/合法/);
        expect(() => workspace.resolveProjectDir('')).toThrow(/合法/);
    });

    it('新项目默认落在 generated 目录里', () => {
        const dir = workspace.resolveProjectDir('todo-list');
        expect(dir).toBe(path.join(root, 'generated', 'todo-list'));
    });

    it('仍能打开以前直接生成在工作目录里的项目', async () => {
        await fs.outputFile(path.join(root, 'old-app', 'Start_Project.bat'), 'echo hi');
        const dir = workspace.resolveProjectDir('old-app');
        expect(dir).toBe(path.join(root, 'old-app'));
    });

    it('未勾选覆盖时，拒绝冲掉已有项目', async () => {
        const dir = path.join(root, 'generated', 'todo-list');
        await fs.outputFile(path.join(dir, 'package.json'), '{}');
        await expect(workspace.ensureWritable('todo-list', { force: false })).rejects.toThrow(/已存在/);
    });

    it('勾选覆盖后可以继续写已有项目', async () => {
        const dir = path.join(root, 'generated', 'todo-list');
        await fs.outputFile(path.join(dir, 'package.json'), '{}');
        await expect(workspace.ensureWritable('todo-list', { force: true })).resolves.toBe(dir);
    });

    it('打开不存在的项目时明确告诉用户找不到', async () => {
        await expect(workspace.listProjectFiles('missing-app')).rejects.toThrow(/找不到/);
    });
});

const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const { createWorkspace } = require('./workspace');

describe('preview assets', () => {
    let root;
    let workspace;

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'codecraft-preview-'));
        workspace = createWorkspace({ rootDir: root, cwd: root });
        await fs.outputFile(path.join(root, 'generated', 'shop', 'public', 'index.html'), '<html><head></head><body>店</body></html>');
        await fs.outputFile(path.join(root, 'generated', 'shop', 'public', 'style.css'), 'body{color:red}');
        await fs.outputFile(path.join(root, 'generated', 'shop', '.env'), 'SECRET=1');
        await fs.outputFile(path.join(root, 'generated', 'shop', 'backend', 'server.js'), 'console.log(1)');
    });

    afterEach(async () => {
        await fs.remove(root);
    });

    it('优先预览 public 里的首页', async () => {
        const asset = await workspace.resolvePreviewAsset('shop', '');
        expect(asset.filePath).toBe(path.join(root, 'generated', 'shop', 'public', 'index.html'));
        expect(asset.contentType).toMatch(/html/);
        expect(asset.injectBase).toBe(true);
    });

    it('拒绝跳出项目目录或读取密钥文件', async () => {
        await expect(workspace.resolvePreviewAsset('shop', '../.env')).rejects.toThrow(/预览/);
        await expect(workspace.resolvePreviewAsset('shop', '.env')).rejects.toThrow(/预览/);
        await expect(workspace.resolvePreviewAsset('shop', '../../package.json')).rejects.toThrow(/预览/);
    });

    it('不把后端源码当页面资源发出去', async () => {
        await expect(workspace.resolvePreviewAsset('shop', 'backend/server.js')).rejects.toThrow(/预览/);
    });

    it('给 HTML 补上预览根路径，页面里的 css/js 才能加载', () => {
        const html = workspace.injectPreviewBase('<html><head></head><body>店</body></html>', 'shop');
        expect(html).toContain('href="/preview/shop/"');
    });
});

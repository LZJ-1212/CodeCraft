const { parseEnvText, applyEnv, hasServerApiKey, resolveApiKey, loadProjectEnv } = require('./secrets');

describe('secrets', () => {
    it('读 .env 文本时忽略注释和空行', () => {
        const parsed = parseEnvText('# hi\nDEEPSEEK_API_KEY=sk-test\n\nGITHUB_TOKEN="ghp_x"\n');
        expect(parsed).toEqual({
            DEEPSEEK_API_KEY: 'sk-test',
            GITHUB_TOKEN: 'ghp_x'
        });
    });

    it('已有环境变量不被 .env 覆盖', () => {
        const env = { DEEPSEEK_API_KEY: 'keep-me' };
        applyEnv({ DEEPSEEK_API_KEY: 'from-file', GITHUB_TOKEN: 'token' }, env);
        expect(env.DEEPSEEK_API_KEY).toBe('keep-me');
        expect(env.GITHUB_TOKEN).toBe('token');
    });

    it('服务端有 Key 时不向网页再要一份', () => {
        expect(hasServerApiKey({ DEEPSEEK_API_KEY: 'sk-1' })).toBe(true);
        expect(resolveApiKey('sk-from-page', { DEEPSEEK_API_KEY: 'sk-1' })).toBe('sk-1');
    });

    it('服务端没有 Key 时才用页面上填的', () => {
        expect(hasServerApiKey({})).toBe(false);
        expect(resolveApiKey('sk-from-page', {})).toBe('sk-from-page');
    });

    it('两边都没有 Key 时明确告诉用户去哪配', () => {
        expect(() => resolveApiKey('', {})).toThrow(/DEEPSEEK_API_KEY/);
    });

    it('找不到 .env 时不报错', () => {
        const env = {};
        expect(() => loadProjectEnv({
            cwd: '/not-a-real-dir',
            env,
            readFile: () => { throw new Error('ENOENT'); }
        })).not.toThrow();
    });
});

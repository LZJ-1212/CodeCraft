const { extractJsonObject, extractGeneratedFile, parseBlueprint } = require('./extract');

describe('extractJsonObject', () => {
    it('从模型夹杂的说明里取出 JSON 对象', () => {
        const text = 'Here is the blueprint:\n{"public/index.html":"首页"}\nThanks.';
        expect(extractJsonObject(text)).toEqual({ 'public/index.html': '首页' });
    });

    it('支持 markdown 代码块包起来的 JSON', () => {
        const text = '```json\n{"a":"b"}\n```';
        expect(extractJsonObject(text)).toEqual({ a: 'b' });
    });

    it('没有 JSON 时抛出用户能理解的错误', () => {
        expect(() => extractJsonObject('sorry I cannot help')).toThrow(/JSON/);
    });
});

describe('extractGeneratedFile', () => {
    it('只留下代码块里的源码，不把思考过程写进文件', () => {
        const text = `<thought_process>
plan the page
</thought_process>
\`\`\`html
<!DOCTYPE html>
\`\`\``;
        expect(extractGeneratedFile(text)).toBe('<!DOCTYPE html>');
    });

    it('没有代码块时去掉思考标签后返回剩余文本', () => {
        const text = '<thought_process>skip</thought_process>\nconsole.log(1);';
        expect(extractGeneratedFile(text)).toBe('console.log(1);');
    });
});

describe('parseBlueprint', () => {
    it('丢掉越权路径，只保留可写的文件职责', () => {
        const blueprint = parseBlueprint(JSON.stringify({
            'public/index.html': '首页',
            '../secret.txt': '不该写',
            'server.js': '启动服务'
        }));
        expect(blueprint).toEqual({
            'public/index.html': '首页',
            'server.js': '启动服务'
        });
    });

    it('蓝图里没有任何合法文件时失败', () => {
        expect(() => parseBlueprint('{}')).toThrow(/蓝图/);
    });
});

const { parseBrief, briefToDescription } = require('./brief');

describe('parseBrief', () => {
    it('把谈话收成甲方能核对的需求总结', () => {
        const brief = parseBrief(JSON.stringify({
            title: '深色待办',
            summary: '个人待办，可勾选完成，支持深色模式。',
            users: '只有我自己',
            pages: ['列表页', '编辑页'],
            data: '待办标题与是否完成',
            rules: '刷新后数据还在',
            outOfScope: '不做账号登录',
            folderHint: 'dark-todo'
        }));
        expect(brief.title).toBe('深色待办');
        expect(brief.pages).toEqual(['列表页', '编辑页']);
        expect(brief.folderHint).toBe('dark-todo');
    });

    it('没有标题或摘要时不能拿去开工', () => {
        expect(() => parseBrief('{"title":"只有标题"}')).toThrow(/总结/);
    });
});

describe('briefToDescription', () => {
    it('把确认过的总结写成设计能直接用的说明', () => {
        const text = briefToDescription({
            title: '深色待办',
            summary: '个人待办',
            users: '我自己',
            pages: ['列表页'],
            data: '标题',
            rules: '本地保存',
            outOfScope: '登录'
        });
        expect(text).toContain('深色待办');
        expect(text).toContain('列表页');
        expect(text).toContain('登录');
    });
});

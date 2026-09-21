const { parseUxSpec, uxToText } = require('./ux');

describe('parseUxSpec', () => {
    it('从总结里抽出页面和必须接线的操作', () => {
        const ux = parseUxSpec(JSON.stringify({
            pages: [
                { name: '列表页', purpose: '看待办', actions: ['勾选完成', '新增'] }
            ],
            flows: [{ name: '添加待办', steps: ['点新增', '填写', '保存'] }],
            mustWire: '新增 POST /api/todos'
        }));
        expect(ux.pages[0].name).toBe('列表页');
        expect(ux.mustWire).toBe('新增 POST /api/todos');
    });

    it('没有页面时不能交给技术设计', () => {
        expect(() => parseUxSpec('{"pages":[]}')).toThrow(/页面/);
    });
});

describe('uxToText', () => {
    it('写成技术能读的交接说明', () => {
        const text = uxToText({
            pages: [{ name: '列表页', purpose: '看待办', actions: ['勾选'] }],
            flows: [{ name: '完成一项', steps: ['勾选', '刷新仍在'] }],
            mustWire: '勾选 PATCH /api/todos/:id'
        });
        expect(text).toContain('列表页');
        expect(text).toContain('PATCH /api/todos/:id');
    });
});

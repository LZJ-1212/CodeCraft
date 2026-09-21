const {
    encodeProjectReady,
    decodeProjectReady,
    PROJECT_READY_MARKER,
    encodeStage,
    decodeStage,
    STAGE_MARKER,
    encodeHandoff,
    decodeHandoff,
    HANDOFF_MARKER
} = require('./streamEvents');

describe('streamEvents', () => {
    it('生成结束时发出带真实文件夹名的就绪事件', () => {
        const line = encodeProjectReady({ name: 'todo-list', ok: true });
        expect(line).toContain(PROJECT_READY_MARKER);
        expect(decodeProjectReady(line)).toEqual({ name: 'todo-list', ok: true });
    });

    it('日志里没有就绪事件时返回 null，避免误跳转修改页', () => {
        expect(decodeProjectReady('🎉 Project Successfully Crafted!')).toBeNull();
    });

    it('拒绝没有项目名的就绪事件', () => {
        expect(decodeProjectReady(`${PROJECT_READY_MARKER}{"ok":true}`)).toBeNull();
    });

    it('生成过程中标出当前角色和正在做的事', () => {
        const line = encodeStage({ id: 'tech', label: '技术', step: '按交互稿拆文件' });
        expect(line).toContain(STAGE_MARKER);
        expect(decodeStage(line)).toEqual({
            id: 'tech',
            label: '技术',
            step: '按交互稿拆文件'
        });
    });

    it('把交接稿发给网页，方便点开看', () => {
        const line = encodeHandoff({ id: 'ux', title: '交互稿', body: '列表页：勾选完成' });
        expect(line).toContain(HANDOFF_MARKER);
        expect(decodeHandoff(line)).toEqual({
            id: 'ux',
            title: '交互稿',
            body: '列表页：勾选完成'
        });
    });

    it('空交接稿不能打开', () => {
        expect(decodeHandoff(`${HANDOFF_MARKER}{"id":"ux","title":"交互稿","body":""}`)).toBeNull();
    });
});

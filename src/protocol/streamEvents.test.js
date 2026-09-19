const { encodeProjectReady, decodeProjectReady, PROJECT_READY_MARKER } = require('./streamEvents');

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
});

const { createAbortGate, isAbortError, bindRequestAbort } = require('./abortGate');

describe('abortGate', () => {
    it('未停止时可以继续', () => {
        const gate = createAbortGate();
        expect(gate.aborted).toBe(false);
        expect(() => gate.throwIfAborted()).not.toThrow();
    });

    it('停止后下一棒不再继续', () => {
        const gate = createAbortGate();
        gate.abort();
        expect(gate.aborted).toBe(true);
        expect(() => gate.throwIfAborted()).toThrow(/取消/);
    });

    it('识别取消错误，避免当成普通失败', () => {
        const error = new Error('已取消这一轮生成');
        error.code = 'ABORTED';
        expect(isAbortError(error)).toBe(true);
        expect(isAbortError(new Error('磁盘满了'))).toBe(false);
    });

    it('请求被客户端关掉时标记取消', () => {
        const gate = createAbortGate();
        const listeners = {};
        const req = { on: (event, fn) => { listeners[event] = fn; } };
        const res = { writableEnded: false };
        bindRequestAbort(gate, req, res);
        listeners.close();
        expect(gate.aborted).toBe(true);
    });

    it('正常写完时不要当成取消', () => {
        const gate = createAbortGate();
        const listeners = {};
        const req = { on: (event, fn) => { listeners[event] = fn; } };
        const res = { writableEnded: true };
        bindRequestAbort(gate, req, res);
        listeners.close();
        expect(gate.aborted).toBe(false);
    });
});

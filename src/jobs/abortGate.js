// 记住这一轮生成有没有被用户停掉。
// 用户层面：点「停止」后不会继续烧接口、写文件；已经交出的稿子还留着。

function createAbortGate() {
    let aborted = false;
    const controller = new AbortController();

    function abort() {
        aborted = true;
        if (!controller.signal.aborted) controller.abort();
    }

    function throwIfAborted() {
        if (!aborted && !controller.signal.aborted) return;
        aborted = true;
        const error = new Error('已取消这一轮生成');
        error.code = 'ABORTED';
        throw error;
    }

    return {
        abort,
        throwIfAborted,
        get aborted() {
            return aborted || controller.signal.aborted;
        },
        get signal() {
            return controller.signal;
        }
    };
}

function isAbortError(error) {
    if (!error) return false;
    return error.code === 'ABORTED'
        || error.code === 'ERR_CANCELED'
        || error.name === 'CanceledError'
        || error.name === 'AbortError';
}

// 浏览器关掉或点停止时，通知这一轮不要继续。
// 用户层面：刷新页面或点停止，后台不会偷偷把项目写完。
function bindRequestAbort(gate, req, res) {
    if (!gate || !req) return;
    req.on('close', () => {
        if (res && !res.writableEnded) gate.abort();
    });
}

function asAbortError(message) {
    const error = new Error(message || '已取消这一轮生成');
    error.code = 'ABORTED';
    return error;
}

module.exports = { createAbortGate, bindRequestAbort, isAbortError, asAbortError };

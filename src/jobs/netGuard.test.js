const { isLoopbackAddress } = require('./netGuard');

describe('netGuard', () => {
    it('只把本机回环地址当成可访问', () => {
        expect(isLoopbackAddress('127.0.0.1')).toBe(true);
        expect(isLoopbackAddress('::1')).toBe(true);
        expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
        expect(isLoopbackAddress('192.168.1.8')).toBe(false);
        expect(isLoopbackAddress('10.0.0.2')).toBe(false);
    });
});

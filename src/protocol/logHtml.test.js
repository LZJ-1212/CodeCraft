const { formatLogHtml } = require('./logHtml');

describe('formatLogHtml', () => {
    it('模型或错误信息里的 HTML 不能当脚本执行', () => {
        const html = formatLogHtml('失败：<img src=x onerror=alert(1)>');
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('终端颜色码变成样式，而不是把后面的标签放出来', () => {
        const html = formatLogHtml('\x1b[31m错误\x1b[0m');
        expect(html).toContain('<span');
        expect(html).toContain('错误');
        expect(html).toContain('</span>');
    });
});

const { renderHandoffHtml, linkifyGithubUrls, escapeHtml } = require('./handoffHtml');

describe('handoffHtml', () => {
    it('交接稿里的 GitHub 仓库能点开，其它 HTML 不会执行', () => {
        const html = renderHandoffHtml(
            '参考清单',
            '看这个 https://github.com/org/todo\n<script>x</script>'
        );
        expect(html).toContain('href="https://github.com/org/todo"');
        expect(html).toContain('target="_blank"');
        expect(html).not.toContain('<script>x</script>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('非 GitHub 链接保持纯文本', () => {
        expect(linkifyGithubUrls(escapeHtml('https://evil.example/x'))).toBe('https://evil.example/x');
    });
});

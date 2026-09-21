const { parseReview, reviewToText, reviewToPatchMessage } = require('./review');

describe('parseReview', () => {
    it('没有问题时标记可以通过', () => {
        const review = parseReview('{"ok":true,"summary":"按钮都接到了接口","issues":[]}');
        expect(review.ok).toBe(true);
        expect(review.issues).toEqual([]);
    });

    it('列出文件问题时不能算通过', () => {
        const review = parseReview(JSON.stringify({
            ok: true,
            summary: '新增按钮没有接后端',
            issues: [{ file: 'public/index.html', problem: '新增按钮没有 fetch' }]
        }));
        expect(review.ok).toBe(false);
        expect(review.issues[0].file).toBe('public/index.html');
    });

    it('没有结论时失败', () => {
        expect(() => parseReview('{"ok":true}')).toThrow(/结论/);
    });
});

describe('reviewToPatchMessage', () => {
    it('把问题写成施工能改的说明', () => {
        const message = reviewToPatchMessage({
            summary: '漏接',
            issues: [{ file: 'public/index.html', problem: '没有 fetch' }]
        });
        expect(message).toContain('public/index.html');
        expect(message).toContain('没有 fetch');
    });
});

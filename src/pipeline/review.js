const { extractJsonObject } = require('../llm/extract');

// 解析审查意见：过不过、哪几个文件有问题。
// 用户层面：写完代码后有人对照需求看一眼，漏接的按钮会在开工报告里出现。
function parseReview(textOrObject) {
    const raw = typeof textOrObject === 'string' ? extractJsonObject(textOrObject) : textOrObject;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('审查意见格式无效');
    }
    const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
    if (!summary) {
        throw new Error('审查意见缺少结论');
    }
    const issues = Array.isArray(raw.issues)
        ? raw.issues.map((item) => ({
            file: item && typeof item.file === 'string' ? item.file.trim() : '',
            problem: item && typeof item.problem === 'string' ? item.problem.trim() : ''
        })).filter((item) => item.file && item.problem)
        : [];
    return {
        ok: Boolean(raw.ok) && issues.length === 0,
        summary,
        issues
    };
}

function reviewToText(review) {
    const issueLines = (review.issues || []).map((item) => `- ${item.file}：${item.problem}`);
    return [
        review.ok ? '结论：可以通过' : '结论：需要修改',
        review.summary,
        issueLines.length ? `问题：\n${issueLines.join('\n')}` : '未列出具体文件问题。'
    ].join('\n');
}

function reviewToPatchMessage(review) {
    const issueLines = (review.issues || []).map((item) => `- ${item.file}：${item.problem}`);
    return `请按审查意见修改，不要扩大范围：\n${review.summary}\n${issueLines.join('\n')}`;
}

function buildReviewPrompt(lang) {
    const speak = lang === 'en' ? 'Write summary in English.' : '结论用简体中文写。';
    return `你是 CodeCraft 的审查员。对照需求总结和交互稿，检查生成代码有没有漏接的按钮或接口。
规则：
1. ${speak}
2. 只报真实问题。没有问题则 ok 为 true、issues 为空数组。
3. 不要重写整个项目，不要发明新功能。
4. 只输出 JSON：
{"ok":true,"summary":"","issues":[{"file":"","problem":""}]}
5. 不要 markdown。`;
}

module.exports = { parseReview, reviewToText, reviewToPatchMessage, buildReviewPrompt };

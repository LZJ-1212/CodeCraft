const { extractJsonObject } = require('../llm/extract');

function asText(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
}

// 把谈话收成一份可确认的需求总结。
// 用户层面：开工前你能看见「要做什么、不做什么」，点确认后才进入设计和写代码。
function parseBrief(textOrObject) {
    const raw = typeof textOrObject === 'string' ? extractJsonObject(textOrObject) : textOrObject;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('需求总结格式无效，请再整理一次');
    }

    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
    if (!title || !summary) {
        throw new Error('需求总结缺少标题或摘要，请再谈几句或重新整理');
    }

    const folderRaw = typeof raw.folderHint === 'string' ? raw.folderHint.trim() : '';
    const folderHint = /^[a-zA-Z0-9._-]{3,40}$/.test(folderRaw) ? folderRaw : '';

    return {
        title,
        summary,
        users: typeof raw.users === 'string' ? raw.users.trim() : '',
        pages: asText(raw.pages),
        data: typeof raw.data === 'string' ? raw.data.trim() : '',
        rules: typeof raw.rules === 'string' ? raw.rules.trim() : '',
        outOfScope: typeof raw.outOfScope === 'string' ? raw.outOfScope.trim() : '',
        folderHint
    };
}

// 把确认过的总结写成设计可以直接用的说明。
// 用户层面：设计师按你点头的那份总结拆文件，而不是按最初那句含糊需求。
function briefToDescription(brief) {
    const pages = (brief.pages || []).join('、') || '未指定';
    return [
        `项目名称：${brief.title}`,
        `一句话：${brief.summary}`,
        `给谁用：${brief.users || '未指定'}`,
        `页面：${pages}`,
        `要保存的数据：${brief.data || '未指定'}`,
        `必须遵守：${brief.rules || '无'}`,
        `明确不做：${brief.outOfScope || '无'}`
    ].join('\n');
}

// 总结人只整理谈话，不发明新需求。
// 用户层面：总结里出现的功能，都应该是你刚才答应过的。
function buildBriefPrompt(lang) {
    const speak = lang === 'en'
        ? 'Write the summary fields in English.'
        : '总结字段用简体中文写。';

    return `你是 CodeCraft 的需求总结人。根据顾问和甲方的对话，整理成一份开工用的需求总结。
规则：
1. ${speak}
2. 只写谈话里出现过或甲方默认同意的内容，不要添油加醋。
3. folderHint 必须是英文小写、数字和连字符，3-40 个字符，例如 dark-todo。
4. pages 用字符串数组。
5. 只输出 JSON：
{"title":"","summary":"","users":"","pages":[],"data":"","rules":"","outOfScope":"","folderHint":""}
6. 不要 markdown。`;
}

module.exports = { parseBrief, briefToDescription, buildBriefPrompt };

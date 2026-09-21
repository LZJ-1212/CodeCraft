const { extractJsonObject } = require('../llm/extract');

function asList(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
}

// 解析交互稿：页面、路径、必须接上的操作。
// 用户层面：开工前能看见「有哪些页、每页能点什么」，技术设计按这份拆文件。
function parseUxSpec(textOrObject) {
    const raw = typeof textOrObject === 'string' ? extractJsonObject(textOrObject) : textOrObject;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('交互稿格式无效');
    }

    const pages = Array.isArray(raw.pages)
        ? raw.pages.map((page) => ({
            name: page && typeof page.name === 'string' ? page.name.trim() : '',
            purpose: page && typeof page.purpose === 'string' ? page.purpose.trim() : '',
            actions: asList(page && page.actions)
        })).filter((page) => page.name)
        : [];

    if (pages.length === 0) {
        throw new Error('交互稿里没有页面，无法交给技术设计');
    }

    const flows = Array.isArray(raw.flows)
        ? raw.flows.map((flow) => ({
            name: flow && typeof flow.name === 'string' ? flow.name.trim() : '',
            steps: asList(flow && flow.steps)
        })).filter((flow) => flow.name)
        : [];

    return {
        pages,
        flows,
        mustWire: typeof raw.mustWire === 'string' ? raw.mustWire.trim() : ''
    };
}

// 把交互稿写成技术能读的说明。
// 用户层面：施工时按钮和接口按这里接线，而不是凭空猜。
function uxToText(ux) {
    const pageLines = (ux.pages || []).map((page) => {
        const actions = (page.actions || []).join('、') || '无';
        return `- ${page.name}：${page.purpose || '未说明'}。可做：${actions}`;
    });
    const flowLines = (ux.flows || []).map((flow) => `- ${flow.name}：${(flow.steps || []).join(' → ')}`);
    return [
        '页面：',
        pageLines.join('\n') || '- 无',
        '主路径：',
        flowLines.join('\n') || '- 无',
        `必须接线：${ux.mustWire || '无'}`
    ].join('\n');
}

function buildUxPrompt(lang) {
    const speak = lang === 'en' ? 'Write fields in English.' : '字段用简体中文写。';
    return `你是 CodeCraft 的交互设计师。根据已确认的需求总结，只设计页面和操作，不写代码、不列仓库文件。
规则：
1. ${speak}
2. 不要发明需求总结里明确不做的功能。若消息里带有 GitHub 参考清单，只借鉴页面结构和操作路径，禁止抄源码。
3. 每个页面写清能点什么；主路径用步骤数组。
4. mustWire 写清前后端必须对上的操作（例如「添加待办 POST /api/todos」）。
5. 只输出 JSON：
{"pages":[{"name":"","purpose":"","actions":[]}],"flows":[{"name":"","steps":[]}],"mustWire":""}
6. 不要 markdown。`;
}

module.exports = { parseUxSpec, uxToText, buildUxPrompt };

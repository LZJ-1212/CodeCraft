const { chatCompletion } = require('../llm/deepseekClient');
const { parseLiaisonTurn, buildLiaisonPrompt } = require('./liaison');
const { parseBrief, briefToDescription, buildBriefPrompt } = require('./brief');
const { parseUxSpec, uxToText, buildUxPrompt } = require('./ux');
const { parseReview, reviewToText, reviewToPatchMessage, buildReviewPrompt } = require('./review');
const { normalizeTalkHistory } = require('./talkHistory');
const { findRole } = require('./roles');

// 顾问谈话、需求总结、交互稿与审查的入口。
// 用户层面：每一步都有人接手上一份稿子，你能看见交出去的是什么。

function requireNeed(initialNeed) {
    const need = String(initialNeed || '').trim();
    if (!need) {
        throw new Error('请先说你想做什么，顾问才知道从哪问起');
    }
    return need;
}

// 顾问根据目前谈话问下一句。
// 用户层面：你每回一句，顾问只追问一个细节，把需求谈清楚。
async function askLiaison({ apiKey, lang, initialNeed, messages, signal }) {
    const need = requireNeed(initialNeed);
    const history = normalizeTalkHistory(messages);
    const content = await chatCompletion({
        apiKey,
        json: true,
        signal,
        messages: [
            { role: 'system', content: buildLiaisonPrompt(lang) },
            { role: 'user', content: `甲方最初的需求：${need}` },
            ...history
        ]
    });
    return parseLiaisonTurn(content);
}

// 总结人根据整场谈话写出需求总结。
// 用户层面：你能先核对「要做什么、不做什么」，确认后才交给设计和施工。
async function writeBrief({ apiKey, lang, initialNeed, messages, signal }) {
    const need = requireNeed(initialNeed);
    const history = normalizeTalkHistory(messages);
    if (history.length < 2) {
        throw new Error('再和顾问谈几句，才能写出需求总结');
    }
    const content = await chatCompletion({
        apiKey,
        json: true,
        signal,
        messages: [
            { role: 'system', content: buildBriefPrompt(lang) },
            {
                role: 'user',
                content: `甲方最初的需求：${need}\n\n对话记录：\n${history.map((item) => `${item.role === 'user' ? '甲方' : '顾问'}：${item.content}`).join('\n')}`
            }
        ]
    });
    const brief = parseBrief(content);
    return { brief, description: briefToDescription(brief) };
}

function formatBlueprint(blueprint) {
    return Object.entries(blueprint || {}).map(([filePath, duty]) => `${filePath}\n职责：${duty}`).join('\n\n');
}

// 交互按确认过的总结画出页面和路径。
// 用户层面：技术拆文件前，你能看见有哪些页、每页能点什么。
async function designUx({ apiKey, lang, description, signal }) {
    const spec = String(description || '').trim();
    if (!spec) throw new Error('还没有确认过的需求总结，交互无法开工');
    const content = await chatCompletion({
        apiKey,
        json: true,
        signal,
        messages: [
            { role: 'system', content: buildUxPrompt(lang) },
            { role: 'user', content: spec }
        ]
    });
    const ux = parseUxSpec(content);
    return { ux, text: uxToText(ux) };
}

// 审查对照需求和交互看生成结果。
// 用户层面：写完后会指出漏接的按钮或接口，能改的会先改一轮。
async function reviewImplementation({ apiKey, lang, description, uxText, filesMap, signal }) {
    const content = await chatCompletion({
        apiKey,
        json: true,
        signal,
        messages: [
            { role: 'system', content: buildReviewPrompt(lang) },
            {
                role: 'user',
                content: `需求：\n${description}\n\n交互：\n${uxText || '无'}\n\n代码骨架：\n${JSON.stringify(filesMap || {}).slice(0, 24000)}`
            }
        ]
    });
    const review = parseReview(content);
    return {
        review,
        text: reviewToText(review),
        patchMessage: review.ok ? '' : reviewToPatchMessage(review)
    };
}

module.exports = {
    askLiaison,
    writeBrief,
    designUx,
    reviewImplementation,
    formatBlueprint,
    findRole,
    uxToText,
    briefToDescription
};

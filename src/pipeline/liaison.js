const { extractJsonObject } = require('../llm/extract');

// 解析顾问这一轮要对甲方说的话。
// 用户层面：网页上出现的是一句人话，而不是模型的原始 JSON。
function parseLiaisonTurn(text) {
    const raw = extractJsonObject(text);
    const say = raw && typeof raw.say === 'string' ? raw.say.trim() : '';
    if (!say) {
        throw new Error('顾问这一轮没有说话，请再试一次');
    }
    return {
        say,
        readyForBrief: Boolean(raw.readyForBrief)
    };
}

// 顾问只负责把需求问清楚，一次只问一件事。
// 用户层面：你当甲方回答细节，不必一次写完整规格书。
function buildLiaisonPrompt(lang) {
    const speak = lang === 'en'
        ? 'Speak concise English. Ask exactly one question per turn.'
        : '用简洁的简体中文说话。每一轮只问一个问题。';

    return `你是 CodeCraft 的客户顾问。对面是甲方。你的工作是把「想做什么」问清楚，不要写代码，不要列文件。
规则：
1. ${speak}
2. 先确认使用者是谁、必须有哪些页面、要保存什么数据、明确不做哪些功能。
3. 甲方说「随便」时，帮他选一个最简单可做的默认，并说出来让他改。
4. 问清后把 readyForBrief 设为 true，并用一句话告诉甲方可以出总结了。
5. 只输出 JSON：{"say":"...","readyForBrief":true或false}
6. 不要 markdown。`;
}

module.exports = { parseLiaisonTurn, buildLiaisonPrompt };

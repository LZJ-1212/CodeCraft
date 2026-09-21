const MAX_TURNS = 20;
const MAX_CHARS = 4000;

// 只把顾问和甲方的对白送给模型。
// 用户层面：谈话可以来回多轮，但不会把无关内容塞进上下文导致越问越乱。
function normalizeTalkHistory(messages) {
    if (!Array.isArray(messages)) return [];
    return messages
        .filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
        .map((item) => ({
            role: item.role,
            content: item.content.trim().slice(0, MAX_CHARS)
        }))
        .filter((item) => item.content)
        .slice(-MAX_TURNS);
}

module.exports = { normalizeTalkHistory };

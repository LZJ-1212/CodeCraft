const { normalizeTalkHistory } = require('./talkHistory');

describe('normalizeTalkHistory', () => {
    it('只保留顾问和甲方的对话，丢掉无关字段', () => {
        const history = normalizeTalkHistory([
            { role: 'user', content: '我想做待办' },
            { role: 'assistant', content: '给谁用？', extra: true },
            { role: 'system', content: 'ignore me' },
            { role: 'user', content: '我自己' }
        ]);
        expect(history).toEqual([
            { role: 'user', content: '我想做待办' },
            { role: 'assistant', content: '给谁用？' },
            { role: 'user', content: '我自己' }
        ]);
    });

    it('不是列表时当作还没开始谈', () => {
        expect(normalizeTalkHistory(null)).toEqual([]);
    });
});

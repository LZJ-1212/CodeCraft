const { parseLiaisonTurn } = require('./liaison');

describe('parseLiaisonTurn', () => {
    it('取出顾问要对甲方说的下一句话', () => {
        const turn = parseLiaisonTurn('{"say":"这个待办主要给谁用？","readyForBrief":false}');
        expect(turn).toEqual({ say: '这个待办主要给谁用？', readyForBrief: false });
    });

    it('问清细节后可以进入总结', () => {
        const turn = parseLiaisonTurn('{"say":"我可以整理成一份需求总结了。","readyForBrief":true}');
        expect(turn.readyForBrief).toBe(true);
    });

    it('顾问没说话时失败，避免空白气泡', () => {
        expect(() => parseLiaisonTurn('{"readyForBrief":true}')).toThrow(/说话/);
    });
});

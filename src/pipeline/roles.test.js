const { CREW_ROLES, crewIds, findRole } = require('./roles');

describe('roles', () => {
    it('按顾问到测试的顺序交接，中途有交互、技术和审查', () => {
        expect(crewIds()).toEqual(['liaison', 'brief', 'research', 'ux', 'tech', 'build', 'review', 'test']);
        expect(findRole('research').delivers).toBe('参考清单');
        expect(findRole('ux').delivers).toBe('交互稿');
        expect(findRole('tech').delivers).toBe('文件蓝图');
        expect(findRole('review').delivers).toBe('审查意见');
    });

    it('每个角色都写清正在做什么、交出什么', () => {
        CREW_ROLES.forEach((role) => {
            expect(role.step.length).toBeGreaterThan(2);
            expect(role.delivers.length).toBeGreaterThan(1);
        });
    });
});

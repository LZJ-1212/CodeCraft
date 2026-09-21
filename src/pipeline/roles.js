// 工作室角色顺序和交接物名称。
// 用户层面：顶上的人名、每人在干什么、交出什么稿子，都和这里一致。
const CREW_ROLES = [
    { id: 'liaison', label: '顾问', step: '把甲方需求问清楚', delivers: '谈话纪要' },
    { id: 'brief', label: '总结', step: '写成你能确认的需求稿', delivers: '需求总结' },
    { id: 'research', label: '调研', step: '去 GitHub 找相关 skill 和可参考源码', delivers: '参考清单' },
    { id: 'ux', label: '交互', step: '定页面和操作路径', delivers: '交互稿' },
    { id: 'tech', label: '技术', step: '按交互稿拆文件', delivers: '文件蓝图' },
    { id: 'build', label: '施工', step: '按蓝图写代码', delivers: '源文件' },
    { id: 'review', label: '审查', step: '对照需求找漏接', delivers: '审查意见' },
    { id: 'test', label: '测试', step: '安装依赖并尝试编译', delivers: '测试报告' }
];

function crewIds() {
    return CREW_ROLES.map((role) => role.id);
}

function findRole(id) {
    return CREW_ROLES.find((role) => role.id === id) || null;
}

module.exports = { CREW_ROLES, crewIds, findRole };

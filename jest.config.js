// 只测本仓库产品代码。用户层面：生成模板里的示例测试不会被当成产品测试跑失败。
module.exports = {
    testEnvironment: 'node',
    testPathIgnorePatterns: [
        '/node_modules/',
        '<rootDir>/src/templates/',
        '<rootDir>/generated/',
        '<rootDir>/.agents/'
    ]
};

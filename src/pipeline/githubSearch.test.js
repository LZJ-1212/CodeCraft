const { researchGithub } = require('./githubSearch');

function repoSearch(items) {
    return {
        status: 200,
        data: { items }
    };
}

describe('researchGithub', () => {
    it('按需求搜索 skill 和源码，写成参考清单', async () => {
        const queries = [];
        const http = {
            get: async (url, config) => {
                if (url.includes('/readme')) {
                    return { status: 200, data: 'Agent skill for todo lists.' };
                }
                if (url.includes('/search/code')) {
                    queries.push(config.params.q);
                    return {
                        status: 200,
                        data: {
                            items: [{
                                path: 'SKILL.md',
                                repository: {
                                    full_name: 'demo/todo-skill',
                                    html_url: 'https://github.com/demo/todo-skill',
                                    stargazers_count: 9,
                                    description: 'SKILL.md for todos'
                                }
                            }]
                        }
                    };
                }
                queries.push(config.params.q);
                return repoSearch([{
                    full_name: 'demo/todo-app',
                    html_url: 'https://github.com/demo/todo-app',
                    stargazers_count: 4,
                    description: 'vanilla todo'
                }]);
            }
        };

        const result = await researchGithub({ description: '深色待办清单', http });
        expect(queries.some((item) => item.includes('SKILL.md'))).toBe(true);
        expect(result.text).toContain('https://github.com/demo/todo-skill');
        expect(result.text).toContain('不要整仓复制');
        expect(result.text).toContain('Agent skill for todo lists');
    });

    it('README 摘要去掉 HTML 标签', async () => {
        const http = {
            get: async (url) => {
                if (url.includes('/readme')) {
                    return { status: 200, data: '<a href="x"><img alt="banner"/></a> ## Todo skill' };
                }
                if (url.includes('/search/code')) {
                    return { status: 200, data: { items: [] } };
                }
                return repoSearch([{
                    full_name: 'demo/todo-skill',
                    html_url: 'https://github.com/demo/todo-skill',
                    stargazers_count: 1,
                    description: ''
                }]);
            }
        };

        const result = await researchGithub({ description: 'todo', http });
        expect(result.text).not.toContain('<a href');
        expect(result.text).toContain('Todo skill');
    });

    it('同类实现优先于 awesome 合集', async () => {
        const http = {
            get: async (url) => {
                if (url.includes('/readme')) return { status: 200, data: 'todo with dark mode' };
                if (url.includes('/search/code')) return { status: 200, data: { items: [] } };
                return repoSearch([
                    {
                        full_name: 'org/awesome-todos',
                        html_url: 'https://github.com/org/awesome-todos',
                        stargazers_count: 99999,
                        description: 'A collection of todo apps'
                    },
                    {
                        full_name: 'org/dark-todo',
                        html_url: 'https://github.com/org/dark-todo',
                        stargazers_count: 8,
                        description: 'todo with dark mode'
                    }
                ]);
            }
        };

        const result = await researchGithub({ description: '深色待办清单', http });
        expect(result.text).toContain('org/dark-todo');
        expect(result.text).not.toContain('org/awesome-todos');
    });
});

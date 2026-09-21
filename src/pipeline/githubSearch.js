const axios = require('axios');
const {
    keywordsFromBrief,
    parseGithubRepoItems,
    parseGithubCodeItems,
    formatResearchHandoff,
    clipSummary,
    pickRelevantRepos
} = require('./research');

const GITHUB_API = 'https://api.github.com';

function githubHeaders(token) {
    const headers = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'CodeCraft-research',
        'X-GitHub-Api-Version': '2022-11-28'
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

function assertGithubOk(response, kind) {
    if (response.status === 403 || response.status === 429) {
        throw new Error('GitHub 搜索次数用完了，稍后再试或在服务端配置 GITHUB_TOKEN');
    }
    if (response.status >= 400) {
        throw new Error(`GitHub ${kind}失败（${response.status}）`);
    }
}

// 调用 GitHub 仓库搜索。
// 用户层面：对话结束后自动去公开仓库里找可借鉴的东西，不必自己打开 GitHub 搜。
async function searchRepositories(query, { token, http, signal } = {}) {
    const client = http || axios;
    const response = await client.get(`${GITHUB_API}/search/repositories`, {
        params: { q: query, per_page: 10 },
        headers: githubHeaders(token),
        timeout: 15000,
        signal,
        validateStatus: (status) => status >= 200 && status < 500
    });
    assertGithubOk(response, '搜索');
    return parseGithubRepoItems(response.data, 10);
}

// 按文件名搜 SKILL.md，比按星标搜仓库更贴近「有没有现成 skill」。
// 用户层面：参考清单里更可能是真正能借鉴的 agent skill，而不是合集页。
async function searchCode(query, { token, http, signal } = {}) {
    const client = http || axios;
    const response = await client.get(`${GITHUB_API}/search/code`, {
        params: { q: query, per_page: 10 },
        headers: githubHeaders(token),
        timeout: 15000,
        signal,
        validateStatus: (status) => status >= 200 && status < 500
    });
    assertGithubOk(response, '代码搜索');
    return parseGithubCodeItems(response.data, 10);
}

// 拉取仓库 README 前几句。
// 用户层面：参考清单里能看见这个项目是干什么的，不必先点进仓库。
async function readmeSummary(fullName, { token, http, signal } = {}) {
    const client = http || axios;
    const response = await client.get(`${GITHUB_API}/repos/${fullName}/readme`, {
        headers: { ...githubHeaders(token), Accept: 'application/vnd.github.raw' },
        timeout: 15000,
        signal,
        transformResponse: [(data) => data],
        validateStatus: (status) => status >= 200 && status < 500
    });
    if (response.status !== 200 || typeof response.data !== 'string') return '';
    const plain = response.data.replace(/<[^>]+>/g, ' ').replace(/[#*`[\]]/g, ' ');
    return clipSummary(plain, 280);
}

async function attachSummaries(repos, options) {
    const out = [];
    for (const repo of repos.slice(0, 3)) {
        let summary = repo.description || '';
        try {
            const fromReadme = await readmeSummary(repo.fullName, options);
            if (fromReadme) summary = fromReadme;
        } catch {
            // 没有 README 就用描述
        }
        out.push({ ...repo, summary });
    }
    return out;
}

async function findSkills(query, options) {
    try {
        const fromCode = pickRelevantRepos(
            await searchCode(`filename:SKILL.md ${query}`, options),
            query,
            3
        );
        if (fromCode.length > 0) return fromCode;
    } catch (error) {
        if (!String(error.message).includes('GitHub')) throw error;
    }
    return pickRelevantRepos(
        await searchRepositories(`SKILL.md ${query} in:readme fork:false`, options),
        query,
        3
    );
}

// 按需求去 GitHub 找相关 skill 和可参考源码。
// 用户层面：确认总结后能看到公开的 SKILL.md 和同类项目链接，交互和技术按这些借鉴，不整仓复制。
async function researchGithub({ description, token = process.env.GITHUB_TOKEN, http, signal } = {}) {
    const query = keywordsFromBrief(description);
    const options = { token, http, signal };

    let skills = [];
    let repos = [];
    try {
        skills = await findSkills(query, options);
    } catch (error) {
        skills = [];
        if (!String(error.message).includes('GitHub')) throw error;
    }
    try {
        repos = pickRelevantRepos(
            await searchRepositories(`${query} javascript html fork:false`, options),
            query,
            3
        );
    } catch (error) {
        repos = [];
        if (skills.length === 0) throw error;
    }

    const skillCards = await attachSummaries(skills, options);
    const repoCards = await attachSummaries(repos, options);
    const text = formatResearchHandoff({ query, skills: skillCards, repos: repoCards });
    return { query, skills: skillCards, repos: repoCards, text };
}

module.exports = { researchGithub, searchRepositories, searchCode, readmeSummary };

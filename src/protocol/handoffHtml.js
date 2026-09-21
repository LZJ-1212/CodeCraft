// 把交接稿里的 GitHub 仓库链接变成可点的地址。
// 用户层面：参考清单里的仓库能直接打开，不必复制粘贴。

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const GITHUB_REPO_URL = /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/g;

function linkifyGithubUrls(escapedText) {
    return String(escapedText).replace(GITHUB_REPO_URL, (url) => (
        `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
    ));
}

function renderHandoffHtml(title, body) {
    const htmlBody = linkifyGithubUrls(escapeHtml(body || '')).replace(/\n/g, '<br>');
    return `<h2>${escapeHtml(title || '')}</h2><div class="handoff-body">${htmlBody}</div>`;
}

module.exports = { escapeHtml, linkifyGithubUrls, renderHandoffHtml };

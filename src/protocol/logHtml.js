const { escapeHtml } = require('./handoffHtml');

const MARK = {
    red: '\uE000',
    green: '\uE001',
    yellow: '\uE002',
    magenta: '\uE003',
    cyan: '\uE004',
    gray: '\uE005',
    end: '\uE006'
};

// 把终端日志变成页面上的安全 HTML。
// 用户层面：生成过程里的报错和模型碎碎念只会当文字显示，不会变成网页脚本。
function formatLogHtml(text) {
    let raw = String(text ?? '');
    raw = raw
        .replace(/\x1b\[31m/g, MARK.red)
        .replace(/\x1b\[32m/g, MARK.green)
        .replace(/\x1b\[33m/g, MARK.yellow)
        .replace(/\x1b\[35m/g, MARK.magenta)
        .replace(/\x1b\[36m/g, MARK.cyan)
        .replace(/\x1b\[90m/g, MARK.gray)
        .replace(/\x1b\[0m/g, MARK.end)
        .replace(/\x1b\[[0-9;]*m/g, '')
        .replace(/\x1b/g, '');

    return escapeHtml(raw)
        .replace(new RegExp(MARK.red, 'g'), '<span style="color:#d4655a;">')
        .replace(new RegExp(MARK.green, 'g'), '<span style="color:#6fbf8a;">')
        .replace(new RegExp(MARK.yellow, 'g'), '<span style="color:#c9922a;">')
        .replace(new RegExp(MARK.magenta, 'g'), '<span style="color:#c9a0dc;">')
        .replace(new RegExp(MARK.cyan, 'g'), '<span style="color:#6ec8dc;">')
        .replace(new RegExp(MARK.gray, 'g'), '<span style="color:#8fb0c4;">')
        .replace(new RegExp(MARK.end, 'g'), '</span>')
        .replace(/\n/g, '<br>');
}

module.exports = { formatLogHtml };

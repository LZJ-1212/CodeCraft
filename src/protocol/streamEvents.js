const PROJECT_READY_MARKER = '___PROJECT_READY___:';

// 网页和服务器共用的「项目已就绪」标记。
// 用户层面：生成结束后会自动打开这个项目的修改页，不必再手填文件夹名。

// 生成结束时把真实项目名写进日志流。
// 用户层面：网页据此从「填写需求」切到「修改这个项目」，不必再手填文件夹名。
function encodeProjectReady({ name, ok }) {
    return `\n${PROJECT_READY_MARKER}${JSON.stringify({ name, ok: Boolean(ok) })}\n`;
}

// 从一段日志里认出「项目已就绪」。
// 用户层面：只有真的生成成功才会打开修改页，失败会留在工作台看原因。
function decodeProjectReady(text) {
    if (!text || typeof text !== 'string') return null;
    const index = text.indexOf(PROJECT_READY_MARKER);
    if (index === -1) return null;

    const payload = text.slice(index + PROJECT_READY_MARKER.length).split('\n')[0].trim();
    try {
        const data = JSON.parse(payload);
        if (!data || typeof data.name !== 'string' || !data.name.trim()) return null;
        return { name: data.name.trim(), ok: Boolean(data.ok) };
    } catch {
        return null;
    }
}

module.exports = { PROJECT_READY_MARKER, encodeProjectReady, decodeProjectReady };

const { CREW_ROLES, crewIds } = require('../pipeline/roles');

const PROJECT_READY_MARKER = '___PROJECT_READY___:';
const STAGE_MARKER = '___STAGE___:';
const HANDOFF_MARKER = '___HANDOFF___:';

const ALLOWED_STAGES = new Set(crewIds());

// 网页和服务器共用的阶段、交接稿和「项目已就绪」标记。
// 用户层面：能看见谁在干活、点开他们交出的稿子，做完后进入修改页。

function encodeProjectReady({ name, ok }) {
    return `\n${PROJECT_READY_MARKER}${JSON.stringify({ name, ok: Boolean(ok) })}\n`;
}

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

function encodeStage({ id, label, step }) {
    const role = CREW_ROLES.find((item) => item.id === id);
    return `\n${STAGE_MARKER}${JSON.stringify({
        id,
        label: label || (role && role.label) || '',
        step: step || (role && role.step) || ''
    })}\n`;
}

function decodeStage(text) {
    if (!text || typeof text !== 'string') return null;
    const index = text.indexOf(STAGE_MARKER);
    if (index === -1) return null;
    const payload = text.slice(index + STAGE_MARKER.length).split('\n')[0].trim();
    try {
        const data = JSON.parse(payload);
        if (!data || !ALLOWED_STAGES.has(data.id)) return null;
        return {
            id: data.id,
            label: typeof data.label === 'string' ? data.label : '',
            step: typeof data.step === 'string' ? data.step : ''
        };
    } catch {
        return null;
    }
}

// 把某一角色交出的稿子写进日志流。
// 用户层面：可以点开交互稿、蓝图、审查意见，而不只是看滚动日志。
function encodeHandoff({ id, title, body }) {
    return `\n${HANDOFF_MARKER}${JSON.stringify({
        id,
        title: title || '',
        body: body || ''
    })}\n`;
}

function decodeHandoff(text) {
    if (!text || typeof text !== 'string') return null;
    const index = text.indexOf(HANDOFF_MARKER);
    if (index === -1) return null;
    const payload = text.slice(index + HANDOFF_MARKER.length).split('\n')[0].trim();
    try {
        const data = JSON.parse(payload);
        if (!data || typeof data.id !== 'string' || !data.id.trim()) return null;
        if (typeof data.body !== 'string' || !data.body.trim()) return null;
        return {
            id: data.id.trim(),
            title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : data.id,
            body: data.body
        };
    } catch {
        return null;
    }
}

module.exports = {
    PROJECT_READY_MARKER,
    STAGE_MARKER,
    HANDOFF_MARKER,
    encodeProjectReady,
    decodeProjectReady,
    encodeStage,
    decodeStage,
    encodeHandoff,
    decodeHandoff
};

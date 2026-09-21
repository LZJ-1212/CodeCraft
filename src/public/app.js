const PROJECT_READY_MARKER = '___PROJECT_READY___:';
const REVIEWER_MARKER = '___REVIEWER_ACTION___:';
const STAGE_MARKER = '___STAGE___:';
const HANDOFF_MARKER = '___HANDOFF___:';

// 工作台、谈话台和修改页。
// 用户层面：顾问谈清、你确认总结后，交互/技术/施工/审查/测试按稿子交接。

const studio = document.getElementById('studio');
const talk = document.getElementById('talk');
const workspace = document.getElementById('workspace');
const studioLog = document.getElementById('studioLog');
const talkLog = document.getElementById('talkLog');
const workspaceLog = document.getElementById('workspaceLog');
const generateBtn = document.getElementById('generateBtn');
const startTalkBtn = document.getElementById('startTalkBtn');
const projectList = document.getElementById('projectList');
const projectEmpty = document.getElementById('projectEmpty');
const workspaceTitle = document.getElementById('workspaceTitle');
const workspaceFiles = document.getElementById('workspaceFiles');
const patchMsg = document.getElementById('patchMsg');
const patchBtn = document.getElementById('patchBtn');
const transcript = document.getElementById('transcript');
const briefSheet = document.getElementById('briefSheet');
const requestBriefBtn = document.getElementById('requestBriefBtn');
const confirmBriefBtn = document.getElementById('confirmBriefBtn');
const talkSendBtn = document.getElementById('talkSendBtn');
const handoffTabs = document.getElementById('handoffTabs');
const workspaceHandoffTabs = document.getElementById('workspaceHandoffTabs');

let currentProjectName = '';
let activeLog = studioLog;
let animationInterval = null;
let lastLoggedChunk = '';
let crewRoles = [];
let artifacts = [];
let activeArtifactId = '';
let activeAbort = null;
let hasServerApiKey = false;
let talkState = {
    initialNeed: '',
    messages: [],
    brief: null,
    description: ''
};

// 把生成日志写到页面上，先转义再上色。
// 用户层面：失败原因和模型输出都只是文字，不会变成能点的恶意网页。
function appendLog(text) {
    if (text === lastLoggedChunk && text.trim().length > 5) return;
    lastLoggedChunk = text;

    let html = formatLogHtml(text);

    if (html.includes('⏳') && html.includes('...')) {
        html = html.replace('...', '<span id="loading-dots" style="font-weight:bold; letter-spacing:1px; color:#c9922a;">.</span>');
        startDotsAnimation();
    }

    if (html.includes('✅ Done') || html.includes('❌ Failed')) {
        stopDotsAnimation();
        const dotsSpan = document.getElementById('loading-dots');
        if (dotsSpan) dotsSpan.outerHTML = '...';
    }

    activeLog.innerHTML += html;
    activeLog.scrollTop = activeLog.scrollHeight;
}

function startDotsAnimation() {
    stopDotsAnimation();
    let count = 1;
    animationInterval = setInterval(() => {
        const el = document.getElementById('loading-dots');
        if (!el) {
            stopDotsAnimation();
            return;
        }
        count = (count % 3) + 1;
        el.innerText = '.'.repeat(count);
    }, 300);
}

function stopDotsAnimation() {
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
}

function decodeMarker(text, marker, validate) {
    const index = text.indexOf(marker);
    if (index === -1) return null;
    const payload = text.slice(index + marker.length).split('\n')[0].trim();
    try {
        const data = JSON.parse(payload);
        return validate(data) ? data : null;
    } catch {
        return null;
    }
}

function decodeProjectReady(text) {
    const data = decodeMarker(text, PROJECT_READY_MARKER, (item) => item && typeof item.name === 'string' && item.name.trim());
    return data ? { name: data.name.trim(), ok: Boolean(data.ok) } : null;
}

function decodeStage(text) {
    return decodeMarker(text, STAGE_MARKER, (item) => item && crewRoles.some((role) => role.id === item.id));
}

function decodeHandoff(text) {
    return decodeMarker(text, HANDOFF_MARKER, (item) => item && typeof item.id === 'string' && typeof item.body === 'string' && item.body.trim());
}

// 画出顾问到测试的人名，并标出谁在干活、正在做什么。
// 用户层面：能对上「现在是交互还是审查」，以及这一棒交出什么稿子。
function paintCrew(roles) {
    crewRoles = roles;
    document.querySelectorAll('.crew').forEach((list) => {
        list.innerHTML = roles.map((role) => `<li data-stage="${role.id}" title="${escapeHtml(role.delivers)}">${escapeHtml(role.label)}</li>`).join('');
    });
}

function setCrewStage(stageId, step) {
    const order = crewRoles.map((role) => role.id);
    const currentIndex = order.indexOf(stageId);
    const role = crewRoles.find((item) => item.id === stageId);
    document.querySelectorAll('.crew li').forEach((item) => {
        const id = item.getAttribute('data-stage');
        const index = order.indexOf(id);
        item.classList.toggle('is-current', id === stageId);
        item.classList.toggle('is-done', currentIndex > index && index !== -1);
    });
    const caption = role
        ? `${role.label} · ${step || role.step}（交出${role.delivers}）`
        : '先选一件要做的事。';
    document.querySelectorAll('[data-crew-step]').forEach((el) => {
        el.textContent = caption;
    });
}

function renderArtifactTabs(tabRoot, bodyEl) {
    if (!tabRoot) return;
    tabRoot.innerHTML = '';
    artifacts.forEach((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = item.title;
        button.classList.toggle('is-current', item.id === activeArtifactId);
        button.addEventListener('click', () => {
            activeArtifactId = item.id;
            if (bodyEl) bodyEl.innerHTML = renderHandoffMarkup(item.title, item.body);
            renderArtifactTabs(tabRoot, bodyEl);
        });
        tabRoot.appendChild(button);
    });
}

function upsertHandoff({ id, title, body }, { select = true } = {}) {
    const existing = artifacts.find((item) => item.id === id);
    const next = { id, title: title || id, body };
    if (existing) Object.assign(existing, next);
    else artifacts.push(next);
    if (select) activeArtifactId = id;
    const selected = artifacts.find((item) => item.id === activeArtifactId) || next;
    briefSheet.innerHTML = renderHandoffMarkup(selected.title, selected.body);
    renderArtifactTabs(handoffTabs, briefSheet);
}

function notesFromTalk() {
    return talkState.messages.map((item) => `${item.role === 'user' ? '甲方' : '顾问'}：${item.content}`).join('\n');
}

async function readStream(response, { onProjectReady, onStage, onHandoff } = {}) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let actionBuffer = '';

    const consumeLine = (text, marker) => {
        const after = text.slice(text.indexOf(marker) + marker.length);
        const lineEnd = after.indexOf('\n');
        return lineEnd === -1 ? '' : after.slice(lineEnd + 1);
    };

    const takeMarker = async (marker, decode, handler) => {
        const markerAt = actionBuffer.indexOf(marker);
        const visible = actionBuffer.slice(0, markerAt);
        if (visible) appendLog(visible);
        const rest = actionBuffer.slice(markerAt);
        const parsed = decode(rest);
        if (parsed) {
            if (handler) await handler(parsed);
            actionBuffer = consumeLine(rest, marker);
            return true;
        }
        actionBuffer = rest;
        return false;
    };

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            stopDotsAnimation();
            const ready = decodeProjectReady(actionBuffer);
            const stage = decodeStage(actionBuffer);
            const handoff = decodeHandoff(actionBuffer);
            if (stage && onStage) await onStage(stage);
            if (handoff && onHandoff) await onHandoff(handoff);
            if (ready && onProjectReady) await onProjectReady(ready);
            else if (actionBuffer && !ready && !stage && !handoff) appendLog(actionBuffer);
            break;
        }

        const chunk = decoder.decode(value, { stream: true });
        actionBuffer += chunk;

        if (actionBuffer.includes(HANDOFF_MARKER)) {
            await takeMarker(HANDOFF_MARKER, decodeHandoff, onHandoff);
            continue;
        }

        if (actionBuffer.includes(STAGE_MARKER)) {
            await takeMarker(STAGE_MARKER, decodeStage, onStage);
            continue;
        }

        if (actionBuffer.includes(PROJECT_READY_MARKER)) {
            await takeMarker(PROJECT_READY_MARKER, decodeProjectReady, onProjectReady);
            continue;
        }

        if (actionBuffer.includes(REVIEWER_MARKER)) {
            const parts = actionBuffer.split(REVIEWER_MARKER);
            if (parts[0]) appendLog(parts[0]);
            try {
                const jsonStr = parts[1].split('\n')[0].trim();
                showReviewerModal(JSON.parse(jsonStr));
                actionBuffer = '';
            } catch {
                continue;
            }
        } else {
            appendLog(chunk);
            actionBuffer = '';
        }
    }
}

function readApiKey() {
    if (hasServerApiKey) return '';
    const field = document.getElementById('apiKey');
    const value = field ? field.value.trim() : '';
    if (value) sessionStorage.setItem('codecraft.apiKey', value);
    return value || sessionStorage.getItem('codecraft.apiKey') || '';
}

// 没配服务端密钥时才要求在页面填写。
// 用户层面：配过 .env 就能直接谈需求；没配时会提醒去哪填。
function ensureApiKey() {
    if (hasServerApiKey || readApiKey()) return true;
    alert('请填写 DeepSeek API Key，或在项目根目录的 .env 里配置 DEEPSEEK_API_KEY。');
    return false;
}

// 服务端已有密钥时不要把 Key 再发到请求里。
// 用户层面：配过 .env 就不必把密钥贴在网页上。
function apiKeyPayload() {
    return hasServerApiKey ? undefined : readApiKey();
}

// 开始一轮生成或修改，并允许中途停止。
// 用户层面：不想等了可以点「停止」，已经交出的稿子还在。
function beginWork() {
    if (activeAbort) activeAbort.abort();
    activeAbort = new AbortController();
    document.querySelectorAll('[data-cancel-work]').forEach((btn) => {
        btn.hidden = false;
    });
    return activeAbort;
}

function endWork() {
    activeAbort = null;
    document.querySelectorAll('[data-cancel-work]').forEach((btn) => {
        btn.hidden = true;
    });
}

// 停下这一轮生成或修改。
// 用户层面：点「停止」后不再继续写文件，已经交出的稿子可以稍后打开。
function cancelWork() {
    if (!activeAbort) return;
    activeAbort.abort();
    appendLog('\n正在停止这一轮...\n');
}

// 交接稿里的 GitHub 仓库变成可点的链接。
// 用户层面：参考清单能直接打开仓库，不必复制地址。
function renderHandoffMarkup(title, body) {
    const htmlBody = escapeHtml(body || '').replace(
        /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/g,
        (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
    ).replace(/\n/g, '<br>');
    return `<h2>${escapeHtml(title || '')}</h2><div class="handoff-body">${htmlBody}</div>`;
}

function showStudio() {
    talk.hidden = true;
    workspace.hidden = true;
    studio.hidden = false;
    activeLog = studioLog;
    currentProjectName = '';
    setCrewStage('');
    refreshProjects();
}

function addBubble(role, text) {
    const div = document.createElement('div');
    div.className = `bubble ${role === 'assistant' ? 'liaison' : 'client'}`;
    div.innerHTML = `<strong>${role === 'assistant' ? '顾问' : '你'}</strong>${escapeHtml(text)}`;
    transcript.appendChild(div);
    transcript.scrollTop = transcript.scrollHeight;
    upsertHandoff({ id: 'liaison', title: '谈话纪要', body: notesFromTalk() }, { select: artifacts.length <= 1 });
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// 日志先转义再上色，和服务器 protocol/logHtml.js 同一套规则。
// 用户层面：生成失败或模型碎碎念里如果夹了网页代码，只会当文字显示。
function formatLogHtml(text) {
    const mark = {
        red: '\uE000',
        green: '\uE001',
        yellow: '\uE002',
        magenta: '\uE003',
        cyan: '\uE004',
        gray: '\uE005',
        end: '\uE006'
    };
    let raw = String(text ?? '');
    raw = raw
        .replace(/\x1b\[31m/g, mark.red)
        .replace(/\x1b\[32m/g, mark.green)
        .replace(/\x1b\[33m/g, mark.yellow)
        .replace(/\x1b\[35m/g, mark.magenta)
        .replace(/\x1b\[36m/g, mark.cyan)
        .replace(/\x1b\[90m/g, mark.gray)
        .replace(/\x1b\[0m/g, mark.end)
        .replace(/\x1b\[[0-9;]*m/g, '')
        .replace(/\x1b/g, '');
    return escapeHtml(raw)
        .replace(new RegExp(mark.red, 'g'), '<span style="color:#d4655a;">')
        .replace(new RegExp(mark.green, 'g'), '<span style="color:#6fbf8a;">')
        .replace(new RegExp(mark.yellow, 'g'), '<span style="color:#c9922a;">')
        .replace(new RegExp(mark.magenta, 'g'), '<span style="color:#c9a0dc;">')
        .replace(new RegExp(mark.cyan, 'g'), '<span style="color:#6ec8dc;">')
        .replace(new RegExp(mark.gray, 'g'), '<span style="color:#8fb0c4;">')
        .replace(new RegExp(mark.end, 'g'), '</span>')
        .replace(/\n/g, '<br>');
}

function renderBrief(brief) {
    const pages = (brief.pages || []).join('、') || '未指定';
    const body = [
        brief.summary,
        `给谁用：${brief.users || '未指定'}`,
        `页面：${pages}`,
        `要保存的数据：${brief.data || '未指定'}`,
        `必须遵守：${brief.rules || '无'}`,
        `明确不做：${brief.outOfScope || '无'}`
    ].join('\n');
    upsertHandoff({ id: 'brief', title: '需求总结', body });
    briefSheet.innerHTML = `
        <h2>${escapeHtml(brief.title)}</h2>
        <p>${escapeHtml(brief.summary)}</p>
        <p><strong>给谁用</strong><br>${escapeHtml(brief.users || '未指定')}</p>
        <p><strong>页面</strong><br>${escapeHtml(pages)}</p>
        <p><strong>要保存的数据</strong><br>${escapeHtml(brief.data || '未指定')}</p>
        <p><strong>必须遵守</strong><br>${escapeHtml(brief.rules || '无')}</p>
        <p><strong>明确不做</strong><br>${escapeHtml(brief.outOfScope || '无')}</p>
    `;
    confirmBriefBtn.hidden = false;
}

// 进入谈话台，把你的一句话交给顾问追问。
// 用户层面：你当甲方回答细节，谈清之前不会开始写代码。
async function startTalk(event) {
    event.preventDefault();
    const initialNeed = document.getElementById('description').value.trim();
    if (!initialNeed) return alert('请先写你想做的应用。');
    if (!ensureApiKey()) return;

    talkState = { initialNeed, messages: [{ role: 'user', content: initialNeed }], brief: null, description: '' };
    artifacts = [];
    activeArtifactId = '';
    if (handoffTabs) handoffTabs.innerHTML = '';
    transcript.innerHTML = '';
    briefSheet.textContent = '顾问正在读你的需求，接着会问第一句。';
    confirmBriefBtn.hidden = true;
    requestBriefBtn.disabled = true;
    talkLog.hidden = true;
    talkLog.innerHTML = '';
    studio.hidden = true;
    workspace.hidden = true;
    talk.hidden = false;
    setCrewStage('liaison');
    addBubble('user', initialNeed);
    await askLiaison();
}

async function askLiaison() {
    talkSendBtn.disabled = true;
    requestBriefBtn.disabled = true;
    try {
        const response = await fetch('/api/talk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey: apiKeyPayload(),
                lang: document.getElementById('lang').value,
                initialNeed: talkState.initialNeed,
                messages: talkState.messages
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '顾问暂时无法回答');
        talkState.messages.push({ role: 'assistant', content: data.say });
        addBubble('assistant', data.say);
        requestBriefBtn.disabled = talkState.messages.length < 2;
        if (data.readyForBrief) {
            requestBriefBtn.disabled = false;
            await requestBrief();
        }
    } catch (error) {
        addBubble('assistant', `这一轮没问成：${error.message}`);
        requestBriefBtn.disabled = talkState.messages.length < 2;
    } finally {
        talkSendBtn.disabled = false;
    }
}

async function sendTalk(event) {
    event.preventDefault();
    const input = document.getElementById('talkMsg');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    talkState.messages.push({ role: 'user', content: text });
    addBubble('user', text);
    setCrewStage('liaison');
    await askLiaison();
}

// 请总结人把对话写成需求稿。
// 用户层面：你能先核对要做什么、不做什么，再决定是否开工。
async function requestBrief() {
    requestBriefBtn.disabled = true;
    setCrewStage('brief');
    briefSheet.textContent = '正在把刚才的谈话整理成需求总结...';
    try {
        const response = await fetch('/api/brief', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey: apiKeyPayload(),
                lang: document.getElementById('lang').value,
                initialNeed: talkState.initialNeed,
                messages: talkState.messages
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '总结失败');
        talkState.brief = data.brief;
        talkState.description = data.description;
        renderBrief(data.brief);
        if (data.brief.folderHint && !document.getElementById('outputDir').value.trim()) {
            document.getElementById('outputDir').value = data.brief.folderHint;
        }
    } catch (error) {
        briefSheet.textContent = error.message;
        confirmBriefBtn.hidden = true;
    } finally {
        requestBriefBtn.disabled = talkState.messages.length < 2;
    }
}

async function showWorkspace(projectName, { resetLog } = {}) {
    currentProjectName = projectName;
    workspaceTitle.textContent = `修改项目：${projectName}`;
    document.getElementById('outputDir').value = projectName;
    studio.hidden = true;
    talk.hidden = true;
    workspace.hidden = false;
    activeLog = workspaceLog;
    if (resetLog) workspaceLog.innerHTML = '';

    try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectName)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '无法打开项目');
        const preview = (data.files || []).slice(0, 8).join(' · ');
        const extra = data.files && data.files.length > 8 ? ` 等 ${data.files.length} 个文件` : '';
        workspaceFiles.textContent = preview ? `已加载：${preview}${extra}` : '这个文件夹是空的。';
        artifacts = Array.isArray(data.handoffs) ? data.handoffs : [];
        activeArtifactId = artifacts[0] ? artifacts[0].id : '';
        const bodyEl = document.getElementById('workspaceHandoffBody');
        if (artifacts.length && bodyEl) {
            const selected = artifacts[0];
            bodyEl.innerHTML = renderHandoffMarkup(selected.title, selected.body);
        } else if (bodyEl) {
            bodyEl.textContent = '';
        }
        renderArtifactTabs(workspaceHandoffTabs, bodyEl);
        if (resetLog) {
            appendLog(`已打开项目 [${projectName}]。在下方说出你想改的地方。修改也会先调研，再施工、审查。\n`);
            if (data.job && data.job.status && data.job.status !== 'done') {
                appendLog('上次没有完整做完。已经写下的稿子还在，可以继续改。\n');
            }
        }
    } catch (error) {
        workspaceFiles.textContent = error.message;
    }
}

async function refreshProjects() {
    try {
        const response = await fetch('/api/projects');
        const data = await response.json();
        const projects = data.projects || [];
        projectList.innerHTML = '';
        projectEmpty.hidden = projects.length > 0;
        projects.forEach((item) => {
            const li = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = item.name;
            button.addEventListener('click', () => showWorkspace(item.name, { resetLog: true }));
            li.appendChild(button);
            projectList.appendChild(li);
        });
    } catch {
        projectEmpty.hidden = false;
        projectEmpty.textContent = '暂时读不到以前的项目，请确认服务仍在运行。';
    }
}

async function runGeneration({ description, outputDir, logEl }) {
    if (!description) return alert('还没有可以开工的需求说明。');
    if (!ensureApiKey()) return;

    generateBtn.disabled = true;
    confirmBriefBtn.disabled = true;
    startTalkBtn.disabled = true;
    activeLog = logEl;
    logEl.innerHTML = '';
    appendLog('调研开始在 GitHub 上找相关 skill 和可参考源码...\n');
    setCrewStage('research');
    const work = beginWork();

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: work.signal,
            body: JSON.stringify({
                description,
                outputDir,
                apiKey: apiKeyPayload(),
                lang: document.getElementById('lang').value,
                install: document.getElementById('install').checked,
                test: document.getElementById('test').checked,
                force: document.getElementById('force').checked
            })
        });

        await readStream(response, {
            onStage: (stage) => setCrewStage(stage.id, stage.step),
            onHandoff: (item) => upsertHandoff(item),
            onProjectReady: async (ready) => {
                if (ready.ok) {
                    workspaceLog.innerHTML = logEl.innerHTML;
                    await showWorkspace(ready.name, { resetLog: false });
                    appendLog('\n已经进入修改页。直接在下方说要改什么即可。\n');
                } else {
                    appendLog('\n这一轮没有做完。可以改总结后再确认，或返回工作台打开已写下的稿子。\n');
                    if (ready.name) await refreshProjects();
                }
            }
        });
    } catch (error) {
        if (error.name === 'AbortError') appendLog('\n已停止这一轮。\n');
        else appendLog(`\n\x1b[31m连接失败：${error.message}\x1b[0m`);
    } finally {
        endWork();
        generateBtn.disabled = false;
        confirmBriefBtn.disabled = false;
        startTalkBtn.disabled = false;
    }
}

async function generateProject() {
    const description = document.getElementById('description').value.trim();
    const outputDir = document.getElementById('outputDir').value.trim();
    studioLog.innerHTML = '';
    await runGeneration({ description, outputDir, logEl: studioLog });
}

async function confirmBriefAndBuild() {
    if (!talkState.description) return alert('还没有需求总结。');
    talkLog.hidden = false;
    await runGeneration({
        description: talkState.description,
        outputDir: document.getElementById('outputDir').value.trim() || (talkState.brief && talkState.brief.folderHint) || '',
        logEl: talkLog
    });
}

async function sendPatch() {
    const message = patchMsg.value.trim();
    if (!message) return alert('请写出你想改的地方。');
    if (!currentProjectName) return alert('还没有打开项目。');
    if (!ensureApiKey()) return;

    patchBtn.disabled = true;
    patchMsg.value = '';
    appendLog(`\n\n正在按工作室流程修改 [${currentProjectName}]：${message}\n`);
    const work = beginWork();

    try {
        const response = await fetch('/api/modify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: work.signal,
            body: JSON.stringify({
                projectDir: currentProjectName,
                message,
                apiKey: apiKeyPayload(),
                lang: document.getElementById('lang').value
            })
        });
        await readStream(response, {
            onStage: (stage) => setCrewStage(stage.id, stage.step),
            onHandoff: (item) => {
                upsertHandoff(item);
                const bodyEl = document.getElementById('workspaceHandoffBody');
                const selected = artifacts.find((row) => row.id === activeArtifactId) || item;
                if (bodyEl) bodyEl.innerHTML = renderHandoffMarkup(selected.title, selected.body);
                renderArtifactTabs(workspaceHandoffTabs, bodyEl);
            }
        });
        await showWorkspace(currentProjectName, { resetLog: false });
    } catch (error) {
        if (error.name === 'AbortError') appendLog('\n已停止这一轮修改。\n');
        else appendLog(`\n\x1b[31m修改失败：${error.message}\x1b[0m`);
    } finally {
        endWork();
        patchBtn.disabled = false;
    }
}

async function runLoadedProject() {
    if (!currentProjectName) return;
    appendLog(`\n正在本机启动 [${currentProjectName}]...\n`);
    try {
        const response = await fetch('/api/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectDir: currentProjectName })
        });
        const data = await response.json();
        if (data.success) appendLog('\x1b[32m已尝试打开本机启动脚本。若没出现窗口，请到 generated 目录里双击 Start_Project.bat。\x1b[0m\n');
        else appendLog(`\x1b[31m无法启动：${data.error}\x1b[0m\n`);
    } catch (error) {
        appendLog(`\x1b[31m连接失败：${error.message}\x1b[0m\n`);
    }
}

function showReviewerModal(data) {
    document.getElementById('reviewerMsg').innerText = data.message || '生成过程中需要你做个选择。';
    const optionsDiv = document.getElementById('reviewerOptions');
    optionsDiv.innerHTML = '';
    (data.options || []).forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.type = 'button';
        btn.innerText = `${String.fromCharCode(65 + idx)}. ${opt}`;
        btn.onclick = () => {
            appendLog(`\n你选择了：${opt}\n`);
            patchMsg.value = `I encountered an error. Please apply this solution: ${opt}`;
            closeModal();
            showWorkspace(currentProjectName || document.getElementById('outputDir').value, { resetLog: false });
            sendPatch();
        };
        optionsDiv.appendChild(btn);
    });
    document.getElementById('reviewerModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('reviewerModal').style.display = 'none';
}

document.getElementById('generateForm').addEventListener('submit', startTalk);
generateBtn.addEventListener('click', generateProject);
document.getElementById('talkForm').addEventListener('submit', sendTalk);
document.getElementById('talkBackBtn').addEventListener('click', showStudio);
requestBriefBtn.addEventListener('click', requestBrief);
confirmBriefBtn.addEventListener('click', confirmBriefAndBuild);
document.getElementById('backBtn').addEventListener('click', showStudio);
document.getElementById('runBtn').addEventListener('click', runLoadedProject);
document.getElementById('patchBtn').addEventListener('click', sendPatch);
document.getElementById('ignoreReviewer').addEventListener('click', closeModal);
document.getElementById('patchMsg').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') sendPatch();
});

const savedKey = sessionStorage.getItem('codecraft.apiKey');
const apiKeyInput = document.getElementById('apiKey');
if (savedKey && apiKeyInput) apiKeyInput.value = savedKey;

document.querySelectorAll('[data-cancel-work]').forEach((btn) => {
    btn.addEventListener('click', cancelWork);
});

async function boot() {
    try {
        const status = await fetch('/api/status').then((response) => response.json());
        hasServerApiKey = Boolean(status.hasServerApiKey);
        const field = document.getElementById('apiKeyField');
        if (hasServerApiKey && field) field.hidden = true;
    } catch {
        hasServerApiKey = false;
    }
    try {
        const data = await fetch('/api/crew').then((response) => response.json());
        paintCrew(data.roles || []);
    } catch {
        paintCrew([
            { id: 'liaison', label: '顾问', step: '把甲方需求问清楚', delivers: '谈话纪要' },
            { id: 'brief', label: '总结', step: '写成你能确认的需求稿', delivers: '需求总结' },
            { id: 'research', label: '调研', step: '去 GitHub 找相关 skill 和可参考源码', delivers: '参考清单' },
            { id: 'ux', label: '交互', step: '定页面和操作路径', delivers: '交互稿' },
            { id: 'tech', label: '技术', step: '按交互稿拆文件', delivers: '文件蓝图' },
            { id: 'build', label: '施工', step: '按蓝图写代码', delivers: '源文件' },
            { id: 'review', label: '审查', step: '对照需求找漏接', delivers: '审查意见' },
            { id: 'test', label: '测试', step: '安装依赖并尝试编译', delivers: '测试报告' }
        ]);
    }
    refreshProjects();
}

boot();

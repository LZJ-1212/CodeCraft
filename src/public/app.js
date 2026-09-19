const PROJECT_READY_MARKER = '___PROJECT_READY___:';
const REVIEWER_MARKER = '___REVIEWER_ACTION___:';

// 工作台和修改页的页面逻辑。
// 用户层面：生成成功会跳进修改页；点「以前的项目」能拿回做过的文件夹继续改。

const studio = document.getElementById('studio');
const workspace = document.getElementById('workspace');
const studioLog = document.getElementById('studioLog');
const workspaceLog = document.getElementById('workspaceLog');
const generateBtn = document.getElementById('generateBtn');
const projectList = document.getElementById('projectList');
const projectEmpty = document.getElementById('projectEmpty');
const workspaceTitle = document.getElementById('workspaceTitle');
const workspaceFiles = document.getElementById('workspaceFiles');
const patchMsg = document.getElementById('patchMsg');
const patchBtn = document.getElementById('patchBtn');

let currentProjectName = '';
let activeLog = studioLog;
let animationInterval = null;
let lastLoggedChunk = '';

// 把后端日志画到当前屏幕的图纸上。
// 用户层面：生成或修改时能看见进度，而不是干等。
function appendLog(text) {
    if (text === lastLoggedChunk && text.trim().length > 5) return;
    lastLoggedChunk = text;

    let html = text
        .replace(/\x1b\[31m/g, '<span style="color:#d4655a;">')
        .replace(/\x1b\[32m/g, '<span style="color:#6fbf8a;">')
        .replace(/\x1b\[33m/g, '<span style="color:#c9922a;">')
        .replace(/\x1b\[35m/g, '<span style="color:#c9a0dc;">')
        .replace(/\x1b\[36m/g, '<span style="color:#6ec8dc;">')
        .replace(/\x1b\[90m/g, '<span style="color:#8fb0c4;">')
        .replace(/\x1b\[0m/g, '</span>')
        .replace(/\x1b\[[0-9;]*m/g, '')
        .replace(/\x1b/g, '');

    if (html.includes('⏳') && html.includes('...')) {
        html = html.replace('...', '<span id="loading-dots" style="font-weight:bold; letter-spacing:1px; color:#c9922a;">.</span>');
        startDotsAnimation();
    }

    if (html.includes('✅ Done') || html.includes('❌ Failed')) {
        stopDotsAnimation();
        const dotsSpan = document.getElementById('loading-dots');
        if (dotsSpan) dotsSpan.outerHTML = '...';
    }

    activeLog.innerHTML += html.replace(/\n/g, '<br>');
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

function decodeProjectReady(text) {
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

// 边收日志边识别「项目已就绪」或需要你做选择的弹窗。
// 用户层面：生成成功会自动跳进修改页；安装失败会弹出选项而不是卡住。
async function readStream(response, { onProjectReady } = {}) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let actionBuffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            stopDotsAnimation();
            const ready = decodeProjectReady(actionBuffer);
            if (ready && onProjectReady) await onProjectReady(ready);
            else if (actionBuffer) appendLog(actionBuffer);
            break;
        }

        const chunk = decoder.decode(value, { stream: true });
        actionBuffer += chunk;

        if (actionBuffer.includes(PROJECT_READY_MARKER)) {
            const markerAt = actionBuffer.indexOf(PROJECT_READY_MARKER);
            const visible = actionBuffer.slice(0, markerAt);
            if (visible) appendLog(visible);
            const rest = actionBuffer.slice(markerAt);
            const ready = decodeProjectReady(rest);
            if (ready) {
                if (onProjectReady) await onProjectReady(ready);
                actionBuffer = '';
            } else {
                actionBuffer = rest;
            }
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
    const value = document.getElementById('apiKey').value.trim();
    if (value) sessionStorage.setItem('codecraft.apiKey', value);
    return value || sessionStorage.getItem('codecraft.apiKey') || '';
}

function showStudio() {
    workspace.hidden = true;
    studio.hidden = false;
    activeLog = studioLog;
    currentProjectName = '';
    refreshProjects();
}

// 进入指定项目的修改页。
// 用户层面：生成刚结束，或从「以前的项目」点进来，都可以继续改这个文件夹。
async function showWorkspace(projectName, { resetLog } = {}) {
    currentProjectName = projectName;
    workspaceTitle.textContent = `修改项目：${projectName}`;
    document.getElementById('outputDir').value = projectName;
    studio.hidden = true;
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
        if (resetLog) {
            appendLog(`已打开项目 [${projectName}]。在下方说出你想改的地方。\n`);
        }
    } catch (error) {
        workspaceFiles.textContent = error.message;
    }
}

// 拉取已经生成过的项目列表。
// 用户层面：下次打开网页还能看见以前的项目，点一下就能继续改。
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

async function generateProject(event) {
    event.preventDefault();
    const description = document.getElementById('description').value.trim();
    const apiKey = readApiKey();
    const outputDir = document.getElementById('outputDir').value.trim();

    if (!description) return alert('请先写你想做的应用。');
    if (!apiKey) return alert('请填写 DeepSeek API Key。');

    generateBtn.disabled = true;
    generateBtn.classList.add('pulse');
    studioLog.innerHTML = '';
    activeLog = studioLog;
    appendLog('正在请架构师拆文件清单...\n');

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                description,
                outputDir,
                apiKey,
                lang: document.getElementById('lang').value,
                install: document.getElementById('install').checked,
                test: document.getElementById('test').checked,
                force: document.getElementById('force').checked
            })
        });

        await readStream(response, {
            onProjectReady: async (ready) => {
                if (ready.ok) {
                    workspaceLog.innerHTML = studioLog.innerHTML;
                    await showWorkspace(ready.name, { resetLog: false });
                    appendLog('\n已经进入修改页。直接在下方说要改什么即可。\n');
                } else {
                    appendLog('\n生成没有完成，仍留在工作台。可改描述后再试，或打开已有项目。\n');
                }
            }
        });
    } catch (error) {
        appendLog(`\n<span style="color:#d4655a;">连接失败：${error.message}</span>`);
    } finally {
        generateBtn.disabled = false;
        generateBtn.classList.remove('pulse');
    }
}

async function sendPatch() {
    const message = patchMsg.value.trim();
    const apiKey = readApiKey();
    if (!message) return alert('请写出你想改的地方。');
    if (!currentProjectName) return alert('还没有打开项目。');
    if (!apiKey) return alert('修改需要 DeepSeek API Key。');

    patchBtn.disabled = true;
    patchMsg.value = '';
    appendLog(`\n\n正在按你的要求修改 [${currentProjectName}]：${message}\n`);

    try {
        const response = await fetch('/api/modify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectDir: currentProjectName, message, apiKey })
        });
        await readStream(response);
        await showWorkspace(currentProjectName, { resetLog: false });
    } catch (error) {
        appendLog(`\n<span style="color:#d4655a;">修改失败：${error.message}</span>`);
    } finally {
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
        if (data.success) appendLog('<span style="color:#6fbf8a;">已尝试打开本机启动脚本。若没出现窗口，请到 generated 目录里双击 Start_Project.bat。</span>\n');
        else appendLog(`<span style="color:#d4655a;">无法启动：${data.error}</span>\n`);
    } catch (error) {
        appendLog(`<span style="color:#d4655a;">连接失败：${error.message}</span>\n`);
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

document.getElementById('generateForm').addEventListener('submit', generateProject);
document.getElementById('backBtn').addEventListener('click', showStudio);
document.getElementById('runBtn').addEventListener('click', runLoadedProject);
document.getElementById('patchBtn').addEventListener('click', sendPatch);
document.getElementById('ignoreReviewer').addEventListener('click', closeModal);
document.getElementById('patchMsg').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') sendPatch();
});

const savedKey = sessionStorage.getItem('codecraft.apiKey');
if (savedKey) document.getElementById('apiKey').value = savedKey;

refreshProjects();

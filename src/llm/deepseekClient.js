const axios = require('axios');

const { isAbortError, asAbortError } = require('../jobs/abortGate');

// 调用 DeepSeek V4 Pro，并在失败时自动重试。
// 用户层面：生成和修改都走当前可用的 Pro 模型，网络抖一下也不必重新点按钮。

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek-v4-pro';

// 调用大模型失败时按 1s、2s、4s 自动再试。
// 用户层面：网络抖动或接口限流时，不必重新点「生成」，这次任务会自己接着跑。
async function callWithRetry(apiFunc, maxRetries = 3, logger = null) {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    for (let i = 0; i < maxRetries; i += 1) {
        try {
            return await apiFunc();
        } catch (error) {
            if (isAbortError(error)) throw asAbortError();
            const isLastAttempt = i === maxRetries - 1;
            const status = error.response ? error.response.status : 'Network/Unknown';
            const msg = `\x1b[33m⚠️ API Interruption (${status}): ${error.message}. Retrying in ${Math.pow(2, i)}s... (Attempt ${i + 1}/${maxRetries})\x1b[0m`;

            if (logger) logger(`${msg}\n`);
            else console.log(msg);

            if (isLastAttempt) {
                throw new Error(`API persistently failed after ${maxRetries} attempts: ${error.message}`);
            }
            await delay(Math.pow(2, i) * 1000);
        }
    }
    throw new Error('API persistently failed');
}

// 用 DeepSeek V4 Pro 生成蓝图、源码或补丁。
// 用户层面：生成和修改都走当前可用的 Pro 模型，而不是已停用的旧模型名。
async function chatCompletion({
    apiKey,
    messages,
    json = false,
    maxTokens = 16384,
    logger = null,
    signal = null
}) {
    if (!apiKey) {
        throw new Error('请填写 DeepSeek API Key');
    }
    if (signal && signal.aborted) throw asAbortError();

    const body = {
        model: DEFAULT_MODEL,
        messages,
        temperature: 0.2,
        max_tokens: maxTokens,
        thinking: { type: 'disabled' }
    };
    if (json) {
        body.response_format = { type: 'json_object' };
    }

    const response = await callWithRetry(
        () => axios.post(DEEPSEEK_URL, body, {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 120000,
            signal
        }),
        3,
        logger
    );

    const message = response.data && response.data.choices && response.data.choices[0]
        ? response.data.choices[0].message
        : null;
    const content = message && typeof message.content === 'string' ? message.content : '';
    if (!content.trim()) {
        throw new Error('模型没有返回内容，请稍后重试');
    }
    return content;
}

module.exports = { callWithRetry, chatCompletion, DEFAULT_MODEL };

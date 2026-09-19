const path = require('path');

// 解析大模型返回的蓝图 JSON 和源码正文。
// 用户层面：模型即使多写了说明，生成出来的仍是能打开的文件，而不是一堆废话。

// 从模型夹杂的说明、代码块里取出 JSON。
// 用户层面：生成蓝图失败时会立刻看到原因，而不是把一堆废话当成项目结构。
function extractJsonObject(text) {
    if (!text || typeof text !== 'string') {
        throw new Error('模型没有返回 JSON');
    }

    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : text;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) {
        throw new Error('模型没有返回 JSON');
    }

    try {
        return JSON.parse(candidate.slice(start, end + 1));
    } catch {
        throw new Error('模型返回的 JSON 无法解析，请再试一次生成');
    }
}

// 只把真正的源码写入项目文件。
// 用户层面：打开生成出来的 html/js 时不会看到模型的思考过程。
function extractGeneratedFile(text) {
    if (!text || typeof text !== 'string') return '';
    const withoutThought = text.replace(/<thought_process>[\s\S]*?<\/thought_process>/i, '').trim();
    const codeMatch = withoutThought.match(/```[\w-]*\r?\n([\s\S]*?)```/);
    if (codeMatch) {
        return codeMatch[1].trim();
    }
    return withoutThought;
}

// 校验架构师给出的文件清单，挡住越权路径。
// 用户层面：生成只会写进当前项目文件夹，不会改到别的目录。
function parseBlueprint(textOrObject) {
    const raw = typeof textOrObject === 'string' ? extractJsonObject(textOrObject) : textOrObject;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('蓝图格式无效，请重新生成');
    }

    const files = {};
    for (const [filePath, role] of Object.entries(raw)) {
        if (typeof filePath !== 'string' || typeof role !== 'string') continue;
        if (!filePath.trim() || filePath.includes('..') || path.isAbsolute(filePath)) continue;
        files[filePath.replace(/\\/g, '/')] = role;
    }

    if (Object.keys(files).length === 0) {
        throw new Error('蓝图里没有可生成的文件，请换个描述再试');
    }
    return files;
}

module.exports = { extractJsonObject, extractGeneratedFile, parseBlueprint };

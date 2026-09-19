const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generator = require('@babel/generator').default;

/**
 * 把大文件压成函数签名骨架，再交给模型。
 * 用户层面：项目变大以后，修改和补丁仍然能跑完，而不会因为上下文塞满而中途失败。
 */
class ASTProcessor {
    /**
     * AST 代碼骨架提取器 (AST Skeleton Extractor)
     * 將龐大檔案中的函數實作清空，僅保留函數簽名，大幅節省 AI Token。
     */
    static extractCodeSkeleton(code) {
        try {
            const ast = parser.parse(code, {
                sourceType: "module",
                plugins: ["jsx", "typescript"]
            });

            traverse(ast, {
                // 捕捉一般函數、箭頭函數與類別方法，將其內部 Block 替換為隱藏標籤
                FunctionDeclaration(path) { ASTProcessor._hollowOutBlock(path); },
                ArrowFunctionExpression(path) { ASTProcessor._hollowOutBlock(path); },
                ClassMethod(path) { ASTProcessor._hollowOutBlock(path); }
            });

            return generator(ast, { retainLines: false, compact: false }).code;
        } catch (err) {
            console.warn('\x1b[33m⚠️ AST Parsing failed. Falling back to raw text mode.\x1b[0m', err.message);
            return code;
        }
    }

    /**
     * AST 語法守門員與排版器 (Syntax Guard & Auto-Formatter)
     * [重構] 放棄高風險的局部嫁接，改為「嚴格語法驗證」。
     * 因為 AI 已經提供完整代碼，我們只需確保它沒有語法錯誤 (SyntaxError)。
     */
    static applyASTPatch(originalCode, newCode) {
        try {
            // 1. 嚴格解析 AI 傳回的完整代碼
            const newAst = parser.parse(newCode, {
                sourceType: "module",
                plugins: ["jsx", "typescript"]
            });

            // 2. 如果解析成功，代表語法 100% 正確！沒有漏掉括號或引號。
            // 順便透過 generator 進行標準化排版，確保程式碼風格統一。
            return generator(newAst, { retainLines: false, compact: false }).code;
        } catch (err) {
            // 如果 AI 寫出了 SyntaxError (例如意外斷氣、少一個括號)
            console.warn(`\n\x1b[31m⚠️ [AST Guard] Rejected AI Patch: ${err.message}. Invalid syntax detected.\x1b[0m`);

            // 返回 null，讓上游的 FileService 知道這段代碼有毒，拒絕覆寫！
            return null;
        }
    }

    /**
     * 私有方法：掏空函數區塊
     */
    static _hollowOutBlock(path) {
        if (path.node.body && path.node.body.type === 'BlockStatement') {
            path.node.body.body = [];
            path.addComment('inner', ' ... implementation hidden for context optimization ', false);
        }
    }
}

module.exports = ASTProcessor;
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmbeddings = getEmbeddings;
const openai_1 = require("@langchain/openai");
let embeddings = null;
function getEmbeddings() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not set");
    }
    if (!embeddings) {
        embeddings = new openai_1.OpenAIEmbeddings({
            apiKey,
            model: "text-embedding-3-large",
            dimensions: 1024,
            batchSize: 100,
        });
    }
    return embeddings;
}
//# sourceMappingURL=embeddings.js.map
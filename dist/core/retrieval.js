"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgent = createAgent;
exports.queryAgent = queryAgent;
exports.streamQueryAgent = streamQueryAgent;
exports.clearAgentCache = clearAgentCache;
const openai_1 = require("@langchain/openai");
const output_parsers_1 = require("@langchain/core/output_parsers");
const runnables_1 = require("@langchain/core/runnables");
const prompts_1 = require("@langchain/core/prompts");
const vectorstore_1 = require("./vectorstore");
const db_1 = require("./db");
let llm = null;
const agentCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
function getChatModel() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not set");
    }
    if (!llm) {
        llm = new openai_1.ChatOpenAI({
            apiKey,
            model: "gpt-4o",
            temperature: 0.7,
            streaming: true,
            maxTokens: 1024,
        });
    }
    return llm;
}
const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant trained on specific documents.
Answer questions based on the provided context. If information is not in the context, say so.
Always cite the source document when referencing specific information.
Be concise and accurate.`;
const formatDocs = (docs) => {
    return docs
        .map((d, i) => `[Source ${i + 1}: ${d.metadata?.source || "Unknown"}]\n${d.pageContent}`)
        .join("\n\n---\n\n");
};
async function createAgent(agentId, customSystemPrompt) {
    const cacheKey = `${agentId}:${customSystemPrompt || 'default'}`;
    const cached = agentCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.chain;
    }
    const llm = getChatModel();
    let systemPrompt = customSystemPrompt;
    if (!systemPrompt) {
        const agentData = await (0, db_1.executeQuery)(`SELECT system_prompt FROM knowledge_base.agents WHERE agent_id = $1`, [agentId]);
        systemPrompt = agentData[0]?.system_prompt || DEFAULT_SYSTEM_PROMPT;
    }
    const prompt = prompts_1.ChatPromptTemplate.fromMessages([
        ["system", systemPrompt],
        ["human", "Context:\n{context}\n\nQuestion: {input}\n\nAnswer:"],
    ]);
    const retrieveAndFormat = async (input) => {
        const docs = await (0, vectorstore_1.similaritySearch)(input, agentId, 5, 0.7);
        return formatDocs(docs);
    };
    const chain = runnables_1.RunnableSequence.from([
        {
            context: (input) => retrieveAndFormat(input.input),
            input: (input) => input.input,
        },
        prompt,
        llm,
        new output_parsers_1.StringOutputParser(),
    ]);
    agentCache.set(cacheKey, { chain, timestamp: Date.now() });
    return chain;
}
async function queryAgent(agentId, query, options) {
    const agent = await createAgent(agentId, options?.systemPrompt);
    const result = await agent.invoke({ input: query });
    return result;
}
async function* streamQueryAgent(agentId, query, options) {
    const agent = await createAgent(agentId, options?.systemPrompt);
    const stream = await agent.stream({ input: query });
    for await (const chunk of stream) {
        yield chunk;
    }
}
function clearAgentCache(agentId) {
    if (agentId) {
        for (const [key] of agentCache) {
            if (key.startsWith(agentId)) {
                agentCache.delete(key);
            }
        }
    }
    else {
        agentCache.clear();
    }
}
//# sourceMappingURL=retrieval.js.map
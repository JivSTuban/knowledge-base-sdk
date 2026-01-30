"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgent = createAgent;
exports.queryAgent = queryAgent;
exports.queryAgentWithTools = queryAgentWithTools;
exports.streamQueryAgent = streamQueryAgent;
exports.clearAgentCache = clearAgentCache;
const openai_1 = require("@langchain/openai");
const output_parsers_1 = require("@langchain/core/output_parsers");
const runnables_1 = require("@langchain/core/runnables");
const prompts_1 = require("@langchain/core/prompts");
const vectorstore_1 = require("./vectorstore");
const db_1 = require("./db");
const tools_1 = require("./tools");
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
            maxRetries: 0,
            timeout: 30000,
            callbacks: [],
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
        ["human", "CONTEXT:\n{context}\n\nCONTEXT REPEATED:\n{context}\n\nQuestion: {input}\n\nAnswer (Strictly based on Context):"],
    ]);
    const retrieveAndFormat = async (input) => {
        const docs = await (0, vectorstore_1.similaritySearch)(input, agentId, 5, 0.3);
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
async function queryAgentWithTools(agentId, query, options) {
    const llm = getChatModel();
    const agentData = await (0, db_1.executeQuery)(`SELECT system_prompt FROM knowledge_base.agents WHERE agent_id = $1`, [agentId]);
    let systemPrompt = options?.systemPrompt || agentData[0]?.system_prompt || DEFAULT_SYSTEM_PROMPT;
    const docs = await (0, vectorstore_1.similaritySearch)(query, agentId, 5, 0.3);
    const context = formatDocs(docs);
    let tools = [];
    if (options?.toolContext) {
        tools = [
            (0, tools_1.createSearchTripsTool)(options.toolContext),
            (0, tools_1.createGetFareRatesTool)(options.toolContext),
            (0, tools_1.createGetVehicleRatesTool)(options.toolContext),
        ];
        systemPrompt = `${systemPrompt}

You have access to live data tools for real-time trip and fare information:

**Available Tools:**
1. **search_trips** - Search for available ferry/ship trips between ports
   - Use when users ask about schedules, availability, or trip options
   - Requires: origin_code, destination_code, date (YYYY-MM-DD)
   
2. **get_fare_rates** - Get passenger ticket pricing
   - Use when users ask about ticket prices or fares
   - Requires: origin_code, destination_code
   - Optional: passenger_type (adult, child, senior, pwd, infant)
   
3. **get_vehicle_rates** - Get vehicle/cargo pricing
   - Use when users ask about vehicle rates
   - Requires: origin_code, destination_code
   - Optional: vehicle_type

**Important Port Codes:**
- CEB = Cebu, MNL = Manila, BOG = Bogo, TAG = Tagbilaran, PAL = Palaui
- DUM = Dumaguete, SIQ = Siquijor, ILO = Iloilo

**When to use tools:**
- For live schedules, availability, or pricing → USE TOOLS
- For general info about Ayahay, services, policies → USE TRAINING DATA (context)

Always use tools for real-time data. Your training data is for general information only.`;
    }
    const messages = [
        ['system', systemPrompt],
    ];
    if (options?.history && options.history.length > 0) {
        for (const msg of options.history) {
            messages.push([msg.role === 'user' ? 'human' : 'assistant', msg.content]);
        }
    }
    const humanMessage = options?.toolContext
        ? `CONTEXT (General Information):\n${context}\n\nQuestion: ${query}\n\nAnswer (use tools for live data, context for general info):`
        : `CONTEXT:\n${context}\n\nQuestion: ${query}\n\nAnswer (based on context and our conversation):`;
    messages.push(['human', humanMessage]);
    const prompt = prompts_1.ChatPromptTemplate.fromMessages(messages);
    if (tools.length > 0) {
        const llmWithTools = llm.bindTools(tools);
        const chain = runnables_1.RunnableSequence.from([prompt, llmWithTools]);
        const result = await chain.invoke({});
        if (result.tool_calls && result.tool_calls.length > 0) {
            const toolResults = [];
            for (const toolCall of result.tool_calls) {
                const tool = tools.find(t => t.name === toolCall.name);
                if (tool) {
                    try {
                        const toolResult = await tool.invoke(toolCall.args);
                        let resultText = '';
                        if (typeof toolResult === 'object' && toolResult !== null) {
                            if (toolResult.success) {
                                resultText = `Success: true\nOrigin: ${toolResult.origin || 'N/A'}\nDestination: ${toolResult.destination || 'N/A'}\n`;
                                if (toolResult.rates && Array.isArray(toolResult.rates)) {
                                    resultText += `Rates found: ${toolResult.rates.length}\n`;
                                    if (toolResult.rates.length > 0) {
                                        resultText += 'Rate details:\n';
                                        toolResult.rates.forEach((rate, idx) => {
                                            resultText += `  Rate ${idx + 1}: ${JSON.stringify(rate).replace(/[{}]/g, '')}\n`;
                                        });
                                    }
                                }
                                if (toolResult.shipping_lines) {
                                    resultText += `Shipping lines: ${Array.isArray(toolResult.shipping_lines) ? toolResult.shipping_lines.join(', ') : toolResult.shipping_lines}\n`;
                                }
                            }
                            else {
                                resultText = `Success: false\nError: ${toolResult.error || 'Unknown error'}`;
                            }
                        }
                        else {
                            resultText = String(toolResult);
                        }
                        toolResults.push(`Tool: ${toolCall.name}\n${resultText}`);
                    }
                    catch (error) {
                        toolResults.push(`Tool: ${toolCall.name}\nError: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
            const assistantMsg = typeof result.content === 'string' ? result.content : 'Calling tools...';
            messages.push(['assistant', assistantMsg]);
            messages.push(['human', `Here are the tool results:\n\n${toolResults.join('\n\n')}\n\nPlease provide a helpful answer based on these results.`]);
            const finalPrompt = prompts_1.ChatPromptTemplate.fromMessages(messages);
            const finalChain = runnables_1.RunnableSequence.from([finalPrompt, llm, new output_parsers_1.StringOutputParser()]);
            return await finalChain.invoke({});
        }
        return result.content || 'I apologize, but I was unable to generate a response.';
    }
    else {
        const chain = runnables_1.RunnableSequence.from([prompt, llm, new output_parsers_1.StringOutputParser()]);
        return await chain.invoke({});
    }
}
async function* streamQueryAgent(agentId, query, options) {
    const llm = getChatModel();
    const agentData = await (0, db_1.executeQuery)(`SELECT system_prompt FROM knowledge_base.agents WHERE agent_id = $1`, [agentId]);
    let systemPrompt = options?.systemPrompt || agentData[0]?.system_prompt || DEFAULT_SYSTEM_PROMPT;
    const docs = await (0, vectorstore_1.similaritySearch)(query, agentId, 5, 0.3);
    const context = formatDocs(docs);
    let tools = [];
    if (options?.toolContext) {
        tools = [
            (0, tools_1.createSearchTripsTool)(options.toolContext),
            (0, tools_1.createGetFareRatesTool)(options.toolContext),
            (0, tools_1.createGetVehicleRatesTool)(options.toolContext),
        ];
        systemPrompt = `${systemPrompt}

You have access to live data tools for real-time trip and fare information:

**Available Tools:**
1. **search_trips** - Search for available ferry/ship trips between ports
   - Use when users ask about schedules, availability, or trip options
   - Requires: origin_code, destination_code, date (YYYY-MM-DD)
   
2. **get_fare_rates** - Get passenger ticket pricing
   - Use when users ask about ticket prices or fares
   - Requires: origin_code, destination_code
   - Optional: passenger_type (adult, child, senior, pwd, infant)
   
3. **get_vehicle_rates** - Get vehicle/cargo pricing
   - Use when users ask about vehicle rates
   - Requires: origin_code, destination_code
   - Optional: vehicle_type

**Important Port Codes:**
- CEB = Cebu, MNL = Manila, BOG = Bogo, TAG = Tagbilaran, PAL = Palaui
- DUM = Dumaguete, SIQ = Siquijor, ILO = Iloilo

**When to use tools:**
- For live schedules, availability, or pricing → USE TOOLS
- For general info about Ayahay, services, policies → USE TRAINING DATA (context)

Always use tools for real-time data. Your training data is for general information only.`;
    }
    const messages = [
        ['system', systemPrompt],
    ];
    if (options?.history && options.history.length > 0) {
        for (const msg of options.history) {
            messages.push([msg.role === 'user' ? 'human' : 'assistant', msg.content]);
        }
    }
    const humanMessage = options?.toolContext
        ? `CONTEXT (General Information):\n${context}\n\nQuestion: ${query}\n\nAnswer (use tools for live data, context for general info):`
        : `CONTEXT:\n${context}\n\nQuestion: ${query}\n\nAnswer (based on context and our conversation):`;
    messages.push(['human', humanMessage]);
    const prompt = prompts_1.ChatPromptTemplate.fromMessages(messages);
    const chain = runnables_1.RunnableSequence.from([prompt, llm, new output_parsers_1.StringOutputParser()]);
    const stream = await chain.stream({});
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
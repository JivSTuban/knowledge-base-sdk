import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { similaritySearch } from "./vectorstore";
import { Document, QueryOptions, ChatMessage } from "../types";
import { executeQuery } from "./db";
import { createSearchTripsTool, createGetFareRatesTool, createGetVehicleRatesTool, ToolContext } from "./tools";

let llm: ChatOpenAI | null = null;

// Agent cache for performance optimization
const agentCache = new Map<string, { chain: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getChatModel(): ChatOpenAI {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not set");
    }

    if (!llm) {
        llm = new ChatOpenAI({
            apiKey,
            model: "gpt-4o",
            temperature: 0.7,
            streaming: true,
            maxTokens: 1024,
            maxRetries: 0, // Disable retries completely - no tiktoken!
            timeout: 30000, // 30 second timeout
            // Disable all callbacks that might trigger tiktoken
            callbacks: [],
        });
    }

    return llm;
}

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant trained on specific documents.
Answer questions based on the provided context. If information is not in the context, say so.
Always cite the source document when referencing specific information.
Be concise and accurate.`;

const formatDocs = (docs: Document[]): string => {
    return docs
        .map(
            (d, i) =>
                `[Source ${i + 1}: ${d.metadata?.source || "Unknown"}]\n${d.pageContent}`,
        )
        .join("\n\n---\n\n");
};

export async function createAgent(agentId: string, customSystemPrompt?: string) {
    const cacheKey = `${agentId}:${customSystemPrompt || 'default'}`;
    const cached = agentCache.get(cacheKey);

    // Return cached agent if still valid
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.chain;
    }

    const llm = getChatModel();

    // Fetch agent's system prompt from DB if not provided
    let systemPrompt = customSystemPrompt;
    if (!systemPrompt) {
        const agentData = await executeQuery<{ system_prompt: string }>(
            `SELECT system_prompt FROM knowledge_base.agents WHERE agent_id = $1`,
            [agentId]
        );
        systemPrompt = agentData[0]?.system_prompt || DEFAULT_SYSTEM_PROMPT;
    }

    const prompt = ChatPromptTemplate.fromMessages([
        ["system", systemPrompt],
        ["human", "CONTEXT:\n{context}\n\nCONTEXT REPEATED:\n{context}\n\nQuestion: {input}\n\nAnswer (Strictly based on Context):"],
    ]);

    const retrieveAndFormat = async (input: string): Promise<string> => {
        // Use updated parameters: k=5, minSimilarity=0.3 (Lowered from 0.7 to capture docs)
        const docs = await similaritySearch(input, agentId, 5, 0.3);
        return formatDocs(docs);
    };

    const chain = RunnableSequence.from([
        {
            context: (input: { input: string }) => retrieveAndFormat(input.input),
            input: (input: { input: string }) => input.input,
        },
        prompt,
        llm,
        new StringOutputParser(),
    ]);

    // Cache the agent
    agentCache.set(cacheKey, { chain, timestamp: Date.now() });

    return chain;
}

export async function queryAgent(
    agentId: string,
    query: string,
    options?: QueryOptions
): Promise<string> {
    const agent = await createAgent(agentId, options?.systemPrompt);
    const result = await agent.invoke({ input: query });
    return result;
}

/**
 * Query agent with tool calling support (non-streaming)
 */
export async function queryAgentWithTools(
    agentId: string,
    query: string,
    options?: QueryOptions & { toolContext?: ToolContext }
): Promise<string> {
    const llm = getChatModel();
    
    // Fetch agent's system prompt from DB
    const agentData = await executeQuery<{ system_prompt: string }>(
        `SELECT system_prompt FROM knowledge_base.agents WHERE agent_id = $1`,
        [agentId]
    );
    let systemPrompt = options?.systemPrompt || agentData[0]?.system_prompt || DEFAULT_SYSTEM_PROMPT;
    
    // Retrieve context based on the query
    const docs = await similaritySearch(query, agentId, 5, 0.3);
    const context = formatDocs(docs);
    
    // Initialize tools if context is provided
    let tools: any[] = [];
    
    if (options?.toolContext) {
        tools = [
            createSearchTripsTool(options.toolContext),
            createGetFareRatesTool(options.toolContext),
            createGetVehicleRatesTool(options.toolContext),
        ];
        
        // Enhance system prompt with tool usage instructions
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
    
    // Build messages array with history
    const messages: Array<['system' | 'human' | 'assistant', string]> = [
        ['system', systemPrompt],
    ];
    
    // Add conversation history if provided
    if (options?.history && options.history.length > 0) {
        for (const msg of options.history) {
            messages.push([msg.role === 'user' ? 'human' : 'assistant', msg.content]);
        }
    }
    
    // Add current query with context
    const humanMessage = options?.toolContext 
        ? `CONTEXT (General Information):\n${context}\n\nQuestion: ${query}\n\nAnswer (use tools for live data, context for general info):`
        : `CONTEXT:\n${context}\n\nQuestion: ${query}\n\nAnswer (based on context and our conversation):`;
    
    messages.push(['human', humanMessage]);
    
    const prompt = ChatPromptTemplate.fromMessages(messages);
    
    // Use tools if available
    if (tools.length > 0) {
        const llmWithTools = llm.bindTools(tools);
        const chain = RunnableSequence.from([prompt, llmWithTools]);
        const result = await chain.invoke({});
        
        // Check if LLM wants to call tools
        if (result.tool_calls && result.tool_calls.length > 0) {
            // Execute each tool call
            const toolResults: string[] = [];
            
            for (const toolCall of result.tool_calls) {
                const tool = tools.find(t => t.name === toolCall.name);
                if (tool) {
                    try {
                        const toolResult = await tool.invoke(toolCall.args);
                        // Convert to simple text format to avoid template issues
                        let resultText = '';
                        if (typeof toolResult === 'object' && toolResult !== null) {
                            if (toolResult.success) {
                                resultText = `Success: true\nOrigin: ${toolResult.origin || 'N/A'}\nDestination: ${toolResult.destination || 'N/A'}\n`;
                                if (toolResult.rates && Array.isArray(toolResult.rates)) {
                                    resultText += `Rates found: ${toolResult.rates.length}\n`;
                                    if (toolResult.rates.length > 0) {
                                        resultText += 'Rate details:\n';
                                        toolResult.rates.forEach((rate: any, idx: number) => {
                                            resultText += `  Rate ${idx + 1}: ${JSON.stringify(rate).replace(/[{}]/g, '')}\n`;
                                        });
                                    }
                                }
                                if (toolResult.shipping_lines) {
                                    resultText += `Shipping lines: ${Array.isArray(toolResult.shipping_lines) ? toolResult.shipping_lines.join(', ') : toolResult.shipping_lines}\n`;
                                }
                            } else {
                                resultText = `Success: false\nError: ${toolResult.error || 'Unknown error'}`;
                            }
                        } else {
                            resultText = String(toolResult);
                        }
                        toolResults.push(`Tool: ${toolCall.name}\n${resultText}`);
                    } catch (error) {
                        toolResults.push(`Tool: ${toolCall.name}\nError: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
            
            // Add tool results to messages and get final response
            const assistantMsg = typeof result.content === 'string' ? result.content : 'Calling tools...';
            messages.push(['assistant', assistantMsg]);
            messages.push(['human', `Here are the tool results:\n\n${toolResults.join('\n\n')}\n\nPlease provide a helpful answer based on these results.`]);
            
            const finalPrompt = ChatPromptTemplate.fromMessages(messages);
            const finalChain = RunnableSequence.from([finalPrompt, llm, new StringOutputParser()]);
            return await finalChain.invoke({});
        }
        
        // No tool calls, return content directly
        return result.content as string || 'I apologize, but I was unable to generate a response.';
    } else {
        const chain = RunnableSequence.from([prompt, llm, new StringOutputParser()]);
        return await chain.invoke({});
    }
}

export async function* streamQueryAgent(
    agentId: string,
    query: string,
    options?: QueryOptions & { toolContext?: ToolContext }
): AsyncGenerator<string, void, unknown> {
    const llm = getChatModel();
    
    // Fetch agent's system prompt from DB
    const agentData = await executeQuery<{ system_prompt: string }>(
        `SELECT system_prompt FROM knowledge_base.agents WHERE agent_id = $1`,
        [agentId]
    );
    let systemPrompt = options?.systemPrompt || agentData[0]?.system_prompt || DEFAULT_SYSTEM_PROMPT;
    
    // Retrieve context based on the query
    const docs = await similaritySearch(query, agentId, 5, 0.3);
    const context = formatDocs(docs);
    
    // Initialize tools if context is provided
    let tools: any[] = [];
    
    if (options?.toolContext) {
        tools = [
            createSearchTripsTool(options.toolContext),
            createGetFareRatesTool(options.toolContext),
            createGetVehicleRatesTool(options.toolContext),
        ];
        
        // Enhance system prompt with tool usage instructions
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
    
    // Build messages array with history
    const messages: Array<['system' | 'human' | 'assistant', string]> = [
        ['system', systemPrompt],
    ];
    
    // Add conversation history if provided
    if (options?.history && options.history.length > 0) {
        for (const msg of options.history) {
            messages.push([msg.role === 'user' ? 'human' : 'assistant', msg.content]);
        }
    }
    
    // Add current query with context
    const humanMessage = options?.toolContext 
        ? `CONTEXT (General Information):\n${context}\n\nQuestion: ${query}\n\nAnswer (use tools for live data, context for general info):`
        : `CONTEXT:\n${context}\n\nQuestion: ${query}\n\nAnswer (based on context and our conversation):`;
    
    messages.push(['human', humanMessage]);
    
    const prompt = ChatPromptTemplate.fromMessages(messages);
    
    // For now, use simple streaming without tool calling
    // Tool calling requires agent executor which doesn't stream well
    // TODO: Implement proper agent executor with streaming in Phase 2
    const chain = RunnableSequence.from([prompt, llm, new StringOutputParser()]);
    
    const stream = await chain.stream({});
    for await (const chunk of stream) {
        yield chunk;
    }
}

/**
 * Clear agent cache for specific agent or all agents
 * @param agentId - Optional agent ID to clear cache for specific agent only
 */
export function clearAgentCache(agentId?: string): void {
    if (agentId) {
        for (const [key] of agentCache) {
            if (key.startsWith(agentId)) {
                agentCache.delete(key);
            }
        }
    } else {
        agentCache.clear();
    }
}

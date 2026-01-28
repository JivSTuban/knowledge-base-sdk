import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { similaritySearch } from "./vectorstore";
import { Document, QueryOptions } from "../types";
import { executeQuery } from "./db";

let llm: ChatOpenAI | null = null;

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
        ["human", "Context:\n{context}\n\nQuestion: {input}\n\nAnswer:"],
    ]);

    const retrieveAndFormat = async (input: string): Promise<string> => {
        const docs = await similaritySearch(input, agentId, 3);
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

export async function* streamQueryAgent(
    agentId: string,
    query: string,
    options?: QueryOptions
): AsyncGenerator<string, void, unknown> {
    const agent = await createAgent(agentId, options?.systemPrompt);
    const stream = await agent.stream({ input: query });

    for await (const chunk of stream) {
        yield chunk;
    }
}

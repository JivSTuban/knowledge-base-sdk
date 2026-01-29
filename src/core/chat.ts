/**
 * Vercel AI SDK integration helpers.
 *
 * This module is intentionally framework-agnostic: it returns a `(req) => Response` handler
 * that works in Next.js route handlers and other Fetch-based runtimes.
 */

import { executeQuery } from "./db";
import { similaritySearch } from "./vectorstore";
import { appendChatMessages, getThreadMessages } from "./chatMemory";

// Types are imported from the Vercel AI SDK at runtime by the consumer.
// We keep the SDK dependency light by typing these as `any` here.

export interface CreateChatHandlerOptions {
    /**
     * Resolve tenantId from the incoming request (e.g., from headers/session).
     * Return null/undefined for the default tenant.
     */
    tenantResolver?: (req: Request) => Promise<number | null> | number | null;

    /**
     * How many historical messages to load from Postgres for memory.
     */
    historyLimit?: number;

    /**
     * Default model id (if your consumer wants to pass it through).
     * Not used directly by the SDK.
     */
    defaultModel?: string;

    /**
     * Override system prompt fallback.
     */
    defaultSystemPrompt?: string;

    /**
     * Retrieve RAG docs; defaults to pgvector similarity search.
     */
    retrieveContext?: (args: {
        agentId: string;
        input: string;
        k: number;
        minSimilarity: number;
    }) => Promise<{ pageContent: string; metadata?: any }[]>;

    /**
     * Vercel AI SDK streamText + helpers; passed in from the consuming app.
     * Example (Next.js): `{ streamText, convertToCoreMessages }` from "ai".
     */
    ai: {
        streamText: any;
    };

    /**
     * Model instance (LanguageModelV1) from the consuming app.
     * Example: `openai("gpt-4o")` from "@ai-sdk/openai".
     */
    model: any;
}

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant trained on specific documents.
Answer questions based on the provided context. If information is not in the context, say so.
Always cite the source document when referencing specific information.
Be concise and accurate.`;

async function getAgentSystemPrompt(agentId: string, fallback: string): Promise<string> {
    const rows = await executeQuery<{ system_prompt: string | null }>(
        `SELECT system_prompt FROM knowledge_base.agents WHERE agent_id = $1`,
        [agentId],
    );
    return rows[0]?.system_prompt || fallback;
}

function formatDocs(docs: { pageContent: string; metadata?: any }[]): string {
    return docs
        .map((d, i) => {
            const source = d.metadata?.source || d.metadata?.url || "Unknown";
            return `[Source ${i + 1}: ${source}]\n${d.pageContent}`;
        })
        .join("\n\n---\n\n");
}

export function createChatHandler(options: CreateChatHandlerOptions) {
    const historyLimit = options.historyLimit ?? 30;
    const retrieveContext =
        options.retrieveContext ??
        (async ({ agentId, input, k, minSimilarity }) => {
            return similaritySearch(input, agentId, k, minSimilarity);
        });

    return async function handleChat(req: Request): Promise<Response> {
        if (req.method !== "POST") {
            return new Response("Method Not Allowed", { status: 405 });
        }

        const url = new URL(req.url);
        const agentId = url.searchParams.get("agentId") || url.searchParams.get("agent") || "default";
        const threadId = url.searchParams.get("threadId") || url.searchParams.get("thread") || "default";

        const tenantId = options.tenantResolver
            ? await options.tenantResolver(req)
            : null;

        const body: any = await req.json();
        const messages = body?.messages ?? [];

        // Find last user input (used for RAG)
        const lastUserMessage = [...messages]
            .reverse()
            .find((m: any) => m?.role === "user" && typeof m?.content === "string");
        const lastInput = lastUserMessage?.content ?? "";

        const systemPrompt = await getAgentSystemPrompt(
            agentId,
            options.defaultSystemPrompt ?? DEFAULT_SYSTEM_PROMPT,
        );

        const ragDocs = lastInput
            ? await retrieveContext({ agentId, input: lastInput, k: 5, minSimilarity: 0.7 })
            : [];
        const ragContext = ragDocs.length ? formatDocs(ragDocs) : "";

        // Load memory from DB (windowed history)
        const memoryRows = await getThreadMessages({
            tenantId,
            agentId,
            threadId,
            limit: historyLimit,
        });

        const memoryMessages = memoryRows.map((r) => ({ role: r.role, content: r.content }));

        // Combine: DB memory + incoming client messages
        // Consumer can choose to send only the newest messages.
        const combinedMessages = [...memoryMessages, ...messages];

        // AI SDK v6 accepts "messages" in ModelMessage shape.
        // Our combinedMessages already matches { role, content } for typical chat use.
        const coreMessages = combinedMessages as any;

        const systemWithContext = ragContext
            ? `${systemPrompt}\n\nContext:\n${ragContext}`
            : systemPrompt;

        const result = await options.ai.streamText({
            model: options.model,
            system: systemWithContext,
            messages: coreMessages,
            onFinish: async (evt: any) => {
                // Persist last user message + assistant output into thread memory.
                // We keep it simple: store the most recent user input (if any) and the assistant text.
                const assistantText =
                    evt?.text ??
                    evt?.response?.text ??
                    (Array.isArray(evt?.response?.messages)
                        ? evt.response.messages
                            .filter((m: any) => m?.role === "assistant")
                            .map((m: any) => m?.content)
                            .join("\n")
                        : "");

                const toAppend: any[] = [];
                if (lastInput) {
                    toAppend.push({
                        tenantId,
                        agentId,
                        threadId,
                        role: "user",
                        content: lastInput,
                        metadata: { source: "client" },
                    });
                }
                if (assistantText) {
                    toAppend.push({
                        tenantId,
                        agentId,
                        threadId,
                        role: "assistant",
                        content: assistantText,
                        metadata: { ragSources: ragDocs.map((d) => d.metadata?.source).filter(Boolean) },
                    });
                }

                if (toAppend.length) {
                    await appendChatMessages(toAppend);
                }
            },
        });

        return result.toTextStreamResponse();
    };
}

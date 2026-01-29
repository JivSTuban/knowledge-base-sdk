import { executeQuery } from "./db";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessageRow {
    id: string;
    tenant_id: number | null;
    agent_id: string;
    thread_id: string;
    role: ChatRole;
    content: string;
    metadata: any;
    created_at: string;
}

export interface AppendChatMessageInput {
    tenantId?: number | null;
    agentId: string;
    threadId: string;
    role: ChatRole;
    content: string;
    metadata?: any;
}

export async function appendChatMessage(input: AppendChatMessageInput): Promise<void> {
    await executeQuery(
        `INSERT INTO knowledge_base.chat_messages
         (tenant_id, agent_id, thread_id, role, content, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
            input.tenantId ?? null,
            input.agentId,
            input.threadId,
            input.role,
            input.content,
            input.metadata ?? null,
        ],
    );
}

export async function appendChatMessages(inputs: AppendChatMessageInput[]): Promise<void> {
    for (const input of inputs) {
        // Keep it simple and portable; batching can be added later.
        await appendChatMessage(input);
    }
}

export interface GetThreadMessagesInput {
    tenantId?: number | null;
    agentId: string;
    threadId: string;
    limit?: number;
}

export async function getThreadMessages(
    input: GetThreadMessagesInput,
): Promise<ChatMessageRow[]> {
    const limit = Math.max(1, Math.min(input.limit ?? 50, 500));

    // Pull newest N, then re-sort ascending for chat model consumption.
    const rows = await executeQuery<ChatMessageRow>(
        `SELECT id, tenant_id, agent_id, thread_id, role, content, metadata, created_at
         FROM knowledge_base.chat_messages
         WHERE agent_id = $1
           AND thread_id = $2
           AND (tenant_id IS NOT DISTINCT FROM $3)
         ORDER BY created_at DESC
         LIMIT $4`,
        [input.agentId, input.threadId, input.tenantId ?? null, limit],
    );

    return rows.reverse();
}

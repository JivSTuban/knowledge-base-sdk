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
export declare function appendChatMessage(input: AppendChatMessageInput): Promise<void>;
export declare function appendChatMessages(inputs: AppendChatMessageInput[]): Promise<void>;
export interface GetThreadMessagesInput {
    tenantId?: number | null;
    agentId: string;
    threadId: string;
    limit?: number;
}
export declare function getThreadMessages(input: GetThreadMessagesInput): Promise<ChatMessageRow[]>;
//# sourceMappingURL=chatMemory.d.ts.map
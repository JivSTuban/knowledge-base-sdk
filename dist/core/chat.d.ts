export interface CreateChatHandlerOptions {
    tenantResolver?: (req: Request) => Promise<number | null> | number | null;
    historyLimit?: number;
    defaultModel?: string;
    defaultSystemPrompt?: string;
    retrieveContext?: (args: {
        agentId: string;
        input: string;
        k: number;
        minSimilarity: number;
    }) => Promise<{
        pageContent: string;
        metadata?: any;
    }[]>;
    ai: {
        streamText: any;
    };
    model: any;
}
export declare function createChatHandler(options: CreateChatHandlerOptions): (req: Request) => Promise<Response>;
//# sourceMappingURL=chat.d.ts.map
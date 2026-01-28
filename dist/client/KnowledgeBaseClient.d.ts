import { ClientConfig, ClientTrainRequest, ClientQueryRequest, ClientQueryResponse, Agent, AgentFile } from "../types";
export declare class KnowledgeBaseClient {
    private baseUrl;
    private apiKey?;
    constructor(config: ClientConfig);
    private getHeaders;
    private request;
    train(request: ClientTrainRequest): Promise<{
        success: boolean;
        agentId: string;
        documentsProcessed: number;
        tokensUsed: number;
    }>;
    query(request: ClientQueryRequest): Promise<ClientQueryResponse>;
    streamQuery(request: ClientQueryRequest): AsyncGenerator<string, void, unknown>;
    getAgent(agentId: string): Promise<Agent>;
    listAgents(tenantId?: number): Promise<Agent[]>;
    getAgentFiles(agentId: string): Promise<AgentFile[]>;
    deleteFile(fileId: string): Promise<{
        success: boolean;
    }>;
    updateAgent(agentId: string, data: {
        systemPrompt?: string;
    }): Promise<Agent>;
    deleteAgent(agentId: string): Promise<{
        success: boolean;
    }>;
}
//# sourceMappingURL=KnowledgeBaseClient.d.ts.map
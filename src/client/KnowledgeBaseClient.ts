import {
    ClientConfig,
    ClientTrainRequest,
    ClientQueryRequest,
    ClientQueryResponse,
    Agent,
    AgentFile,
} from "../types";

export class KnowledgeBaseClient {
    private baseUrl: string;
    private apiKey?: string;

    constructor(config: ClientConfig) {
        this.baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash
        this.apiKey = config.apiKey;
    }

    private getHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };

        if (this.apiKey) {
            headers["Authorization"] = `Bearer ${this.apiKey}`;
        }

        return headers;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers: {
                ...this.getHeaders(),
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`API Error: ${response.status} - ${error}`);
        }

        return response.json() as Promise<T>;
    }

    /**
     * Train an agent with files and/or URLs
     */
    async train(request: ClientTrainRequest): Promise<{
        success: boolean;
        agentId: string;
        documentsProcessed: number;
        tokensUsed: number;
    }> {
        const formData = new FormData();
        formData.append("agentId", request.agentId);

        if (request.files) {
            request.files.forEach((file: File) => {
                formData.append("files", file);
            });
        }

        if (request.urls) {
            formData.append("urls", JSON.stringify(request.urls));
        }

        if (request.systemPrompt) {
            formData.append("systemPrompt", request.systemPrompt);
        }

        if (request.tenantId) {
            formData.append("tenantId", request.tenantId.toString());
        }

        const response = await fetch(`${this.baseUrl}/knowledge-base/train`, {
            method: "POST",
            headers: this.apiKey
                ? { Authorization: `Bearer ${this.apiKey}` }
                : {},
            body: formData,
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Training failed: ${response.status} - ${error}`);
        }

        return response.json() as Promise<{
            success: boolean;
            agentId: string;
            documentsProcessed: number;
            tokensUsed: number;
        }>;
    }

    /**
     * Query an agent
     */
    async query(request: ClientQueryRequest): Promise<ClientQueryResponse> {
        return this.request<ClientQueryResponse>("/knowledge-base/query", {
            method: "POST",
            body: JSON.stringify(request),
        });
    }

    /**
     * Stream query an agent
     */
    async *streamQuery(
        request: ClientQueryRequest
    ): AsyncGenerator<string, void, unknown> {
        const response = await fetch(`${this.baseUrl}/knowledge-base/stream`, {
            method: "POST",
            headers: this.getHeaders(),
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Stream query failed: ${response.status} - ${error}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error("No response body");
        }

        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            yield chunk;
        }
    }

    /**
     * Get agent status
     */
    async getAgent(agentId: string): Promise<Agent> {
        return this.request<Agent>(`/knowledge-base/agents/${agentId}`);
    }

    /**
     * List all agents
     */
    async listAgents(tenantId?: number): Promise<Agent[]> {
        const query = tenantId ? `?tenantId=${tenantId}` : "";
        return this.request<Agent[]>(`/knowledge-base/agents${query}`);
    }

    /**
     * Get agent files
     */
    async getAgentFiles(agentId: string): Promise<AgentFile[]> {
        return this.request<AgentFile[]>(
            `/knowledge-base/agents/${agentId}/files`
        );
    }

    /**
     * Delete a file
     */
    async deleteFile(fileId: string): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>(
            `/knowledge-base/files/${fileId}`,
            {
                method: "DELETE",
            }
        );
    }

    /**
     * Update agent
     */
    async updateAgent(
        agentId: string,
        data: { systemPrompt?: string }
    ): Promise<Agent> {
        return this.request<Agent>(`/knowledge-base/agents/${agentId}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    }

    /**
     * Delete an agent
     */
    async deleteAgent(agentId: string): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>(
            `/knowledge-base/agents/${agentId}`,
            {
                method: "DELETE",
            }
        );
    }
}

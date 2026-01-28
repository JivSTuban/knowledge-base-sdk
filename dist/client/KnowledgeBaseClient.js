"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KnowledgeBaseClient = void 0;
class KnowledgeBaseClient {
    baseUrl;
    apiKey;
    constructor(config) {
        this.baseUrl = config.baseUrl.replace(/\/$/, "");
        this.apiKey = config.apiKey;
    }
    getHeaders() {
        const headers = {
            "Content-Type": "application/json",
        };
        if (this.apiKey) {
            headers["Authorization"] = `Bearer ${this.apiKey}`;
        }
        return headers;
    }
    async request(endpoint, options = {}) {
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
        return response.json();
    }
    async train(request) {
        const formData = new FormData();
        formData.append("agentId", request.agentId);
        if (request.files) {
            request.files.forEach((file) => {
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
        return response.json();
    }
    async query(request) {
        return this.request("/knowledge-base/query", {
            method: "POST",
            body: JSON.stringify(request),
        });
    }
    async *streamQuery(request) {
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
            if (done)
                break;
            const chunk = decoder.decode(value, { stream: true });
            yield chunk;
        }
    }
    async getAgent(agentId) {
        return this.request(`/knowledge-base/agents/${agentId}`);
    }
    async listAgents(tenantId) {
        const query = tenantId ? `?tenantId=${tenantId}` : "";
        return this.request(`/knowledge-base/agents${query}`);
    }
    async getAgentFiles(agentId) {
        return this.request(`/knowledge-base/agents/${agentId}/files`);
    }
    async deleteFile(fileId) {
        return this.request(`/knowledge-base/files/${fileId}`, {
            method: "DELETE",
        });
    }
    async updateAgent(agentId, data) {
        return this.request(`/knowledge-base/agents/${agentId}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    }
    async deleteAgent(agentId) {
        return this.request(`/knowledge-base/agents/${agentId}`, {
            method: "DELETE",
        });
    }
}
exports.KnowledgeBaseClient = KnowledgeBaseClient;
//# sourceMappingURL=KnowledgeBaseClient.js.map
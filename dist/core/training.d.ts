import { TrainingResult, Agent, AgentFile } from "../types";
export declare function trainAgent(files: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
}[], agentId: string, urls?: string[], tenantId?: number, systemPrompt?: string): Promise<TrainingResult>;
export declare function getAgentStatus(agentId: string): Promise<Agent | null>;
export declare function listAgents(tenantId?: number): Promise<Agent[]>;
export declare function getAgentFiles(agentId: string): Promise<AgentFile[]>;
export declare function deleteFile(fileId: string): Promise<boolean>;
export declare function updateAgent(agentId: string, data: {
    systemPrompt?: string;
}): Promise<Agent | null>;
export declare function deleteAgent(agentId: string): Promise<boolean>;
//# sourceMappingURL=training.d.ts.map
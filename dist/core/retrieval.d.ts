import { QueryOptions } from "../types";
export declare function createAgent(agentId: string, customSystemPrompt?: string): Promise<any>;
export declare function queryAgent(agentId: string, query: string, options?: QueryOptions): Promise<string>;
export declare function streamQueryAgent(agentId: string, query: string, options?: QueryOptions): AsyncGenerator<string, void, unknown>;
export declare function clearAgentCache(agentId?: string): void;
//# sourceMappingURL=retrieval.d.ts.map
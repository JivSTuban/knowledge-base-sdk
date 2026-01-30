import { QueryOptions } from "../types";
import { ToolContext } from "./tools";
export declare function createAgent(agentId: string, customSystemPrompt?: string): Promise<any>;
export declare function queryAgent(agentId: string, query: string, options?: QueryOptions): Promise<string>;
export declare function queryAgentWithTools(agentId: string, query: string, options?: QueryOptions & {
    toolContext?: ToolContext;
}): Promise<string>;
export declare function streamQueryAgent(agentId: string, query: string, options?: QueryOptions & {
    toolContext?: ToolContext;
}): AsyncGenerator<string, void, unknown>;
export declare function clearAgentCache(agentId?: string): void;
//# sourceMappingURL=retrieval.d.ts.map
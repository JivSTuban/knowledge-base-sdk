import { RunnableSequence } from "@langchain/core/runnables";
import { QueryOptions } from "../types";
export declare function createAgent(agentId: string, customSystemPrompt?: string): Promise<RunnableSequence<{
    input: string;
}, string>>;
export declare function queryAgent(agentId: string, query: string, options?: QueryOptions): Promise<string>;
export declare function streamQueryAgent(agentId: string, query: string, options?: QueryOptions): AsyncGenerator<string, void, unknown>;
//# sourceMappingURL=retrieval.d.ts.map
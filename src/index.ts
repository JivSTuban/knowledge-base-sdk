// Core modules (server-side)
export * from "./core/db";
export * from "./core/embeddings";
export * from "./core/storage";
export * from "./core/vectorstore";
export * from "./core/chatMemory";
export * from "./core/chat";
export {
    trainAgent,
    getAgentStatus,
    listAgents,
    getAgentFiles,
    deleteFile,
    updateAgent,
    deleteAgent,
} from "./core/training";
export {
    queryAgent,
    queryAgentWithTools,
    streamQueryAgent,
} from "./core/retrieval";

// Tools
export {
    createSearchTripsTool,
    createGetFareRatesTool,
    createGetVehicleRatesTool,
    type ToolContext,
} from "./core/tools";

// Types
export type {
    Document,
    TrainingResult,
    Agent,
    AgentFile,
    TrainOptions,
    QueryOptions,
    ClientConfig,
    ClientTrainRequest,
    ClientQueryRequest,
    ClientQueryResponse,
} from "./types";

// Client SDK (browser/frontend)
export { KnowledgeBaseClient } from "./client/KnowledgeBaseClient";

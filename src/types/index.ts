/**
 * Shared types for Knowledge Base SDK
 */

export interface DocumentMetadata {
    source: string;
    type: string;
    agentId: string;
    chunkIndex?: number;
    uploadedAt?: string;
    tenantId?: number;
    [key: string]: any;
}

export interface Document {
    pageContent: string;
    metadata: DocumentMetadata;
}

export interface TrainingResult {
    success: boolean;
    documentsProcessed: number;
    tokensUsed: number;
    agentId: string;
    uploadedFiles?: UploadedFile[];
}

export interface UploadedFile {
    file: string;
    url: string;
    key: string;
}

export interface Agent {
    agent_id: string;
    tenant_id: number | null;
    system_prompt: string | null;
    status: 'active' | 'training' | 'failed';
    created_at: Date;
    updated_at: Date;
    documents_count?: number;
}

export interface AgentFile {
    doc_id: string;
    source: string;
    created_at: Date;
}

export interface TrainOptions {
    files?: { buffer: Buffer; mimetype: string; originalname: string }[];
    agentId: string;
    urls?: string[];
    tenantId?: number;
    systemPrompt?: string;
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface QueryOptions {
    systemPrompt?: string;
    k?: number; // Number of similar documents to retrieve
    history?: ChatMessage[]; // Conversation history for multi-turn context
}

export interface ClientConfig {
    baseUrl: string;
    apiKey?: string;
}

export interface ClientTrainRequest {
    agentId: string;
    files?: File[];
    urls?: string[];
    systemPrompt?: string;
    tenantId?: number;
}

export interface ClientQueryRequest {
    agentId: string;
    query: string;
    conversationId?: string;
}

export interface ClientQueryResponse {
    answer: string;
    timestamp: Date;
    tokensUsed?: number;
}

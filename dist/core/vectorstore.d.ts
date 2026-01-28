import { Document } from "../types";
export declare function addDocuments(documents: Document[]): Promise<void>;
export declare function similaritySearch(query: string, agentId: string, k?: number): Promise<Document[]>;
//# sourceMappingURL=vectorstore.d.ts.map
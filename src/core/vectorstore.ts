import { getEmbeddings } from "./embeddings";
import { executeQuery } from "./db";
import { v4 as uuidv4 } from "uuid";
import { Document, DocumentMetadata } from "../types";

export async function addDocuments(documents: Document[]): Promise<void> {
    if (!documents.length) return;

    // Generate embeddings for all documents
    const contents = documents.map((doc) => doc.pageContent);
    const vectors = await getEmbeddings().embedDocuments(contents);

    // Insert into database
    for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const vector = vectors[i];
        const docId = uuidv4();

        await executeQuery(
            `INSERT INTO knowledge_base.documents 
       (doc_id, content, metadata, embedding, source, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                docId,
                doc.pageContent,
                JSON.stringify(doc.metadata),
                `[${vector.join(",")}]`,
                doc.metadata.source,
                doc.metadata.tenantId || null,
            ],
        );
    }
}

export async function similaritySearch(
    query: string,
    agentId: string,
    k: number = 5,
    minSimilarity: number = 0.7,
): Promise<Document[]> {
    // Generate embedding for query
    const queryVector = await getEmbeddings().embedQuery(query);

    // Search for similar documents with similarity threshold
    const results = await executeQuery<{
        content: string;
        metadata: any;
        source: string;
        similarity: number;
    }>(
        `SELECT content, metadata, source,
            1 - (embedding <=> $1::vector) as similarity
     FROM knowledge_base.documents
     WHERE metadata->>'agentId' = $2
       AND (1 - (embedding <=> $1::vector)) >= $4
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
        [`[${queryVector.join(",")}]`, agentId, k, minSimilarity],
    );

    return results.map((row) => ({
        pageContent: row.content,
        metadata: {
            ...row.metadata,
            source: row.source,
            similarity: row.similarity,
        },
    }));
}

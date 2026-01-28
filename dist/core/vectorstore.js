"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addDocuments = addDocuments;
exports.similaritySearch = similaritySearch;
const embeddings_1 = require("./embeddings");
const db_1 = require("./db");
const uuid_1 = require("uuid");
async function addDocuments(documents) {
    if (!documents.length)
        return;
    const contents = documents.map((doc) => doc.pageContent);
    const vectors = await (0, embeddings_1.getEmbeddings)().embedDocuments(contents);
    for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const vector = vectors[i];
        const docId = (0, uuid_1.v4)();
        await (0, db_1.executeQuery)(`INSERT INTO knowledge_base.documents 
       (doc_id, content, metadata, embedding, source, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`, [
            docId,
            doc.pageContent,
            JSON.stringify(doc.metadata),
            `[${vector.join(",")}]`,
            doc.metadata.source,
            doc.metadata.tenantId || null,
        ]);
    }
}
async function similaritySearch(query, agentId, k = 3) {
    const queryVector = await (0, embeddings_1.getEmbeddings)().embedQuery(query);
    const results = await (0, db_1.executeQuery)(`SELECT content, metadata, source,
            1 - (embedding <=> $1::vector) as similarity
     FROM knowledge_base.documents
     WHERE metadata->>'agentId' = $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`, [`[${queryVector.join(",")}]`, agentId, k]);
    return results.map((row) => ({
        pageContent: row.content,
        metadata: {
            ...row.metadata,
            source: row.source,
        },
    }));
}
//# sourceMappingURL=vectorstore.js.map
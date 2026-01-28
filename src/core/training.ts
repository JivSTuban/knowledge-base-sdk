import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { addDocuments } from "./vectorstore";
import { executeQuery } from "./db";
import {
    uploadFilesToS3,
    uploadFilesToContextFolder,
    deleteFileFromS3
} from "./storage";
import { Document, TrainingResult, Agent, AgentFile } from "../types";
import * as cheerio from "cheerio";

// PDF parsing - using pdf-parse v1.x API
async function parsePDF(buffer: Buffer): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buffer);
    return data.text;
}

export async function trainAgent(
    files: { buffer: Buffer; mimetype: string; originalname: string }[],
    agentId: string,
    urls?: string[],
    tenantId?: number,
    systemPrompt?: string,
): Promise<TrainingResult> {
    const documents: Document[] = [];
    let uploadedFiles: { file: string; url: string; key: string }[] = [];
    const fileIdsToReplace = new Set<string>();

    try {
        // Step 1: Try to upload files to S3 (optional - continues if fails)
        const fileIds = new Map<string, string>(); // Map filename -> DB ID

        if (files.length > 0) {
            try {
                console.log(`Uploading ${files.length} files to S3...`);
                uploadedFiles = await uploadFilesToS3(files, agentId, tenantId);
                console.log(`Uploaded files to S3:`, uploadedFiles.map(f => f.url));
            } catch (s3Error) {
                console.warn(
                    "S3 upload failed, saving to local context folder instead:",
                    s3Error instanceof Error ? s3Error.message : s3Error,
                );
                uploadedFiles = await uploadFilesToContextFolder(files, agentId, tenantId);
                console.log(`Saved files locally:`, uploadedFiles.map(f => f.url));
            }

            // Insert into knowledge_base.files
            for (const uploaded of uploadedFiles) {
                const originalFile = files.find(f => f.originalname === uploaded.file);
                const size = originalFile ? originalFile.buffer.length : 0;
                const mimeType = originalFile ? originalFile.mimetype : "application/octet-stream";

                const dbResult = await executeQuery<{ id: string }>(
                    `INSERT INTO knowledge_base.files 
                    (agent_id, file_name, s3_key, s3_url, file_type, file_size, tenant_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7) 
                    ON CONFLICT DO NOTHING 
                    RETURNING id`,
                    [
                        agentId,
                        uploaded.file,
                        uploaded.key,
                        uploaded.url,
                        mimeType,
                        size,
                        tenantId || null
                    ]
                );

                if (dbResult && dbResult.length > 0) {
                    fileIds.set(uploaded.file, dbResult[0].id);
                } else {
                    // If conflict (already exists), try to fetch it
                    const existing = await executeQuery<{ id: string }>(
                        `SELECT id FROM knowledge_base.files WHERE agent_id = $1 AND file_name = $2`,
                        [agentId, uploaded.file]
                    );
                    if (existing && existing.length > 0) {
                        fileIds.set(uploaded.file, existing[0].id);
                        fileIdsToReplace.add(existing[0].id);
                    }
                }
            }
        }

        // If we're re-using an existing file record (same agent + filename), delete old embeddings first
        // so the new upload effectively replaces the previous knowledge for that file.
        for (const fileId of fileIdsToReplace) {
            await executeQuery(
                `DELETE FROM knowledge_base.documents WHERE metadata->>'fileId' = $1`,
                [fileId]
            );
        }

        // Step 2: Process files for embedding
        for (const file of files) {
            if (file.mimetype === "application/pdf") {
                const text = await parsePDF(file.buffer);
                documents.push({
                    pageContent: text,
                    metadata: {
                        source: file.originalname,
                        type: "pdf",
                        agentId,
                        fileId: fileIds.get(file.originalname),
                    },
                });
            } else if (
                file.mimetype === "text/markdown" ||
                file.mimetype === "text/x-markdown" ||
                file.originalname.endsWith(".md") ||
                file.originalname.endsWith(".markdown")
            ) {
                const text = file.buffer.toString("utf-8");
                documents.push({
                    pageContent: text,
                    metadata: {
                        source: file.originalname,
                        type: "markdown",
                        agentId,
                        fileId: fileIds.get(file.originalname),
                    },
                });
            } else if (
                file.mimetype === "text/plain" ||
                file.originalname.endsWith(".txt")
            ) {
                const text = file.buffer.toString("utf-8");
                documents.push({
                    pageContent: text,
                    metadata: {
                        source: file.originalname,
                        type: "text",
                        agentId,
                        fileId: fileIds.get(file.originalname),
                    },
                });
            } else if (
                file.mimetype ===
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ) {
                // For DOCX, we'll extract raw text (simplified)
                const text = file.buffer.toString("utf-8");
                documents.push({
                    pageContent: text,
                    metadata: {
                        source: file.originalname,
                        type: "docx",
                        agentId,
                        fileId: fileIds.get(file.originalname),
                    },
                });
            }
        }

        // Step 3: Load URLs
        if (urls?.length) {
            for (const url of urls) {
                try {
                    const response = await fetch(url);
                    const html = await response.text();
                    const $ = cheerio.load(html);

                    // Remove script and style elements
                    $("script, style, nav, footer, header").remove();
                    const text = $("body").text().replace(/\s+/g, " ").trim();

                    if (text) {
                        documents.push({
                            pageContent: text,
                            metadata: {
                                source: url,
                                type: "web",
                                agentId,
                            },
                        });
                    }
                } catch (error) {
                    console.error(`Failed to load URL ${url}:`, error);
                }
            }
        }

        if (!documents.length && !systemPrompt) {
            throw new Error("No documents loaded and no system prompt provided");
        }

        // Step 4: Split into chunks
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 4000,
            chunkOverlap: 400,
            separators: ["\n\n", "\n", " ", ""],
        });

        const chunks: Document[] = [];
        for (const doc of documents) {
            const splitDocs = await splitter.splitText(doc.pageContent);
            for (let i = 0; i < splitDocs.length; i++) {
                chunks.push({
                    pageContent: splitDocs[i],
                    metadata: {
                        ...doc.metadata,
                        chunkIndex: i,
                        uploadedAt: new Date().toISOString(),
                        tenantId,
                    },
                });
            }
        }

        // Step 5: Embed and store in pgvector
        await addDocuments(chunks);

        // Step 6: Create or update agent
        await executeQuery(
            `INSERT INTO knowledge_base.agents (agent_id, name, status, doc_count, tenant_id, config, system_prompt)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (agent_id) DO UPDATE SET
         status = $3,
         updated_at = NOW(),
         system_prompt = CASE WHEN $7::text IS NOT NULL AND $7::text != '' THEN $7 ELSE knowledge_base.agents.system_prompt END`,
            [agentId, agentId, "trained", chunks.length, tenantId, {}, systemPrompt],
        );

        // Keep doc_count accurate (especially when replacing existing files)
        await executeQuery(
            `UPDATE knowledge_base.agents
         SET doc_count = (SELECT COUNT(*) FROM knowledge_base.documents WHERE metadata->>'agentId' = $1)
         WHERE agent_id = $1`,
            [agentId]
        );

        return {
            success: true,
            documentsProcessed: chunks.length,
            tokensUsed: estimateTokens(chunks),
            agentId,
            uploadedFiles,
        };
    } catch (error) {
        console.error("Training error:", error);
        throw error;
    }
}

function estimateTokens(chunks: Document[]): number {
    const text = chunks.map((c) => c.pageContent).join("");
    return Math.ceil(text.length / 4);
}

export async function getAgentStatus(agentId: string): Promise<Agent | null> {
    const results = await executeQuery<Agent>(
        `SELECT * FROM knowledge_base.agents WHERE agent_id = $1`,
        [agentId],
    );

    return results[0] || null;
}

export async function listAgents(tenantId?: number): Promise<Agent[]> {
    const query = tenantId
        ? `SELECT * FROM knowledge_base.agents WHERE tenant_id = $1 ORDER BY updated_at DESC`
        : `SELECT * FROM knowledge_base.agents ORDER BY updated_at DESC`;

    const params = tenantId ? [tenantId] : [];
    return executeQuery(query, params);
}

export async function getAgentFiles(agentId: string): Promise<AgentFile[]> {
    return executeQuery(
        `SELECT * FROM knowledge_base.files WHERE agent_id = $1 ORDER BY created_at DESC`,
        [agentId]
    );
}

export async function deleteFile(fileId: string): Promise<boolean> {
    // 1. Get file info to delete from S3
    const fileResult = await executeQuery<{ s3_key: string; agent_id: string }>(
        `SELECT s3_key, agent_id FROM knowledge_base.files WHERE id = $1`,
        [fileId]
    );

    if (!fileResult.length) return false;

    const file = fileResult[0];

    // 2. Delete from S3
    try {
        await deleteFileFromS3(file.s3_key);
    } catch (e) {
        console.warn(`Failed to delete from S3: ${file.s3_key}`, e);
    }

    // 3. Delete documents (chunks)
    await executeQuery(
        `DELETE FROM knowledge_base.documents WHERE metadata->>'fileId' = $1`,
        [fileId]
    );

    // 4. Delete file record
    await executeQuery(
        `DELETE FROM knowledge_base.files WHERE id = $1`,
        [fileId]
    );

    // 5. Update agent doc_count
    await executeQuery(
        `UPDATE knowledge_base.agents 
         SET doc_count = (SELECT COUNT(*) FROM knowledge_base.documents WHERE agent_id = $1)
         WHERE agent_id = $1`,
        [file.agent_id]
    );

    return true;
}

export async function updateAgent(agentId: string, data: { systemPrompt?: string }): Promise<Agent | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.systemPrompt !== undefined) {
        updates.push(`system_prompt = $${idx++}`);
        values.push(data.systemPrompt);
    }

    if (updates.length > 0) {
        values.push(agentId);
        await executeQuery(
            `UPDATE knowledge_base.agents SET ${updates.join(", ")} WHERE agent_id = $${idx}`,
            values
        );
    }

    return getAgentStatus(agentId);
}

export async function deleteAgent(agentId: string): Promise<boolean> {
    // 1. Get all files for this agent to delete from S3
    const files = await executeQuery<{ s3_key: string }>(
        `SELECT s3_key FROM knowledge_base.files WHERE agent_id = $1`,
        [agentId]
    );

    // 2. Delete all files from S3
    for (const file of files) {
        try {
            await deleteFileFromS3(file.s3_key);
        } catch (e) {
            console.warn(`Failed to delete file from S3 during agent deletion: ${file.s3_key}`, e);
        }
    }

    // 3. Delete documents (embeddings)
    await executeQuery(
        `DELETE FROM knowledge_base.documents WHERE metadata->>'agentId' = $1`,
        [agentId]
    );

    // 4. Delete file records
    await executeQuery(
        `DELETE FROM knowledge_base.files WHERE agent_id = $1`,
        [agentId]
    );

    // 5. Delete conversation history (optional but good for cleanup)
    await executeQuery(
        `DELETE FROM knowledge_base.conversations WHERE agent_id = $1`,
        [agentId]
    );

    // 6. Delete the agent record
    await executeQuery(
        `DELETE FROM knowledge_base.agents WHERE agent_id = $1`,
        [agentId]
    );

    return true;
}

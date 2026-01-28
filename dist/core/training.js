"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.trainAgent = trainAgent;
exports.getAgentStatus = getAgentStatus;
exports.listAgents = listAgents;
exports.getAgentFiles = getAgentFiles;
exports.deleteFile = deleteFile;
exports.updateAgent = updateAgent;
exports.deleteAgent = deleteAgent;
const textsplitters_1 = require("@langchain/textsplitters");
const vectorstore_1 = require("./vectorstore");
const db_1 = require("./db");
const storage_1 = require("./storage");
const cheerio = __importStar(require("cheerio"));
async function parsePDF(buffer) {
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buffer);
    return data.text;
}
async function trainAgent(files, agentId, urls, tenantId, systemPrompt) {
    const documents = [];
    let uploadedFiles = [];
    const fileIdsToReplace = new Set();
    try {
        const fileIds = new Map();
        if (files.length > 0) {
            try {
                console.log(`Uploading ${files.length} files to S3...`);
                uploadedFiles = await (0, storage_1.uploadFilesToS3)(files, agentId, tenantId);
                console.log(`Uploaded files to S3:`, uploadedFiles.map(f => f.url));
            }
            catch (s3Error) {
                console.warn("S3 upload failed, saving to local context folder instead:", s3Error instanceof Error ? s3Error.message : s3Error);
                uploadedFiles = await (0, storage_1.uploadFilesToContextFolder)(files, agentId, tenantId);
                console.log(`Saved files locally:`, uploadedFiles.map(f => f.url));
            }
            for (const uploaded of uploadedFiles) {
                const originalFile = files.find(f => f.originalname === uploaded.file);
                const size = originalFile ? originalFile.buffer.length : 0;
                const mimeType = originalFile ? originalFile.mimetype : "application/octet-stream";
                const dbResult = await (0, db_1.executeQuery)(`INSERT INTO knowledge_base.files 
                    (agent_id, file_name, s3_key, s3_url, file_type, file_size, tenant_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7) 
                    ON CONFLICT DO NOTHING 
                    RETURNING id`, [
                    agentId,
                    uploaded.file,
                    uploaded.key,
                    uploaded.url,
                    mimeType,
                    size,
                    tenantId || null
                ]);
                if (dbResult && dbResult.length > 0) {
                    fileIds.set(uploaded.file, dbResult[0].id);
                }
                else {
                    const existing = await (0, db_1.executeQuery)(`SELECT id FROM knowledge_base.files WHERE agent_id = $1 AND file_name = $2`, [agentId, uploaded.file]);
                    if (existing && existing.length > 0) {
                        fileIds.set(uploaded.file, existing[0].id);
                        fileIdsToReplace.add(existing[0].id);
                    }
                }
            }
        }
        for (const fileId of fileIdsToReplace) {
            await (0, db_1.executeQuery)(`DELETE FROM knowledge_base.documents WHERE metadata->>'fileId' = $1`, [fileId]);
        }
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
            }
            else if (file.mimetype === "text/markdown" ||
                file.mimetype === "text/x-markdown" ||
                file.originalname.endsWith(".md") ||
                file.originalname.endsWith(".markdown")) {
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
            }
            else if (file.mimetype === "text/plain" ||
                file.originalname.endsWith(".txt")) {
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
            }
            else if (file.mimetype ===
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
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
        if (urls?.length) {
            for (const url of urls) {
                try {
                    const response = await fetch(url);
                    const html = await response.text();
                    const $ = cheerio.load(html);
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
                }
                catch (error) {
                    console.error(`Failed to load URL ${url}:`, error);
                }
            }
        }
        if (!documents.length && !systemPrompt) {
            throw new Error("No documents loaded and no system prompt provided");
        }
        const splitter = new textsplitters_1.RecursiveCharacterTextSplitter({
            chunkSize: 4000,
            chunkOverlap: 400,
            separators: ["\n\n", "\n", " ", ""],
        });
        const chunks = [];
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
        await (0, vectorstore_1.addDocuments)(chunks);
        await (0, db_1.executeQuery)(`INSERT INTO knowledge_base.agents (agent_id, name, status, doc_count, tenant_id, config, system_prompt)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (agent_id) DO UPDATE SET
         status = $3,
         updated_at = NOW(),
         system_prompt = CASE WHEN $7::text IS NOT NULL AND $7::text != '' THEN $7 ELSE knowledge_base.agents.system_prompt END`, [agentId, agentId, "trained", chunks.length, tenantId, {}, systemPrompt]);
        await (0, db_1.executeQuery)(`UPDATE knowledge_base.agents
         SET doc_count = (SELECT COUNT(*) FROM knowledge_base.documents WHERE metadata->>'agentId' = $1)
         WHERE agent_id = $1`, [agentId]);
        return {
            success: true,
            documentsProcessed: chunks.length,
            tokensUsed: estimateTokens(chunks),
            agentId,
            uploadedFiles,
        };
    }
    catch (error) {
        console.error("Training error:", error);
        throw error;
    }
}
function estimateTokens(chunks) {
    const text = chunks.map((c) => c.pageContent).join("");
    return Math.ceil(text.length / 4);
}
async function getAgentStatus(agentId) {
    const results = await (0, db_1.executeQuery)(`SELECT * FROM knowledge_base.agents WHERE agent_id = $1`, [agentId]);
    return results[0] || null;
}
async function listAgents(tenantId) {
    const query = tenantId
        ? `SELECT * FROM knowledge_base.agents WHERE tenant_id = $1 ORDER BY updated_at DESC`
        : `SELECT * FROM knowledge_base.agents ORDER BY updated_at DESC`;
    const params = tenantId ? [tenantId] : [];
    return (0, db_1.executeQuery)(query, params);
}
async function getAgentFiles(agentId) {
    return (0, db_1.executeQuery)(`SELECT * FROM knowledge_base.files WHERE agent_id = $1 ORDER BY created_at DESC`, [agentId]);
}
async function deleteFile(fileId) {
    const fileResult = await (0, db_1.executeQuery)(`SELECT s3_key, agent_id FROM knowledge_base.files WHERE id = $1`, [fileId]);
    if (!fileResult.length)
        return false;
    const file = fileResult[0];
    try {
        await (0, storage_1.deleteFileFromS3)(file.s3_key);
    }
    catch (e) {
        console.warn(`Failed to delete from S3: ${file.s3_key}`, e);
    }
    await (0, db_1.executeQuery)(`DELETE FROM knowledge_base.documents WHERE metadata->>'fileId' = $1`, [fileId]);
    await (0, db_1.executeQuery)(`DELETE FROM knowledge_base.files WHERE id = $1`, [fileId]);
    await (0, db_1.executeQuery)(`UPDATE knowledge_base.agents 
         SET doc_count = (SELECT COUNT(*) FROM knowledge_base.documents WHERE agent_id = $1)
         WHERE agent_id = $1`, [file.agent_id]);
    return true;
}
async function updateAgent(agentId, data) {
    const updates = [];
    const values = [];
    let idx = 1;
    if (data.systemPrompt !== undefined) {
        updates.push(`system_prompt = $${idx++}`);
        values.push(data.systemPrompt);
    }
    if (updates.length > 0) {
        values.push(agentId);
        await (0, db_1.executeQuery)(`UPDATE knowledge_base.agents SET ${updates.join(", ")} WHERE agent_id = $${idx}`, values);
    }
    return getAgentStatus(agentId);
}
async function deleteAgent(agentId) {
    const files = await (0, db_1.executeQuery)(`SELECT s3_key FROM knowledge_base.files WHERE agent_id = $1`, [agentId]);
    for (const file of files) {
        try {
            await (0, storage_1.deleteFileFromS3)(file.s3_key);
        }
        catch (e) {
            console.warn(`Failed to delete file from S3 during agent deletion: ${file.s3_key}`, e);
        }
    }
    await (0, db_1.executeQuery)(`DELETE FROM knowledge_base.documents WHERE metadata->>'agentId' = $1`, [agentId]);
    await (0, db_1.executeQuery)(`DELETE FROM knowledge_base.files WHERE agent_id = $1`, [agentId]);
    await (0, db_1.executeQuery)(`DELETE FROM knowledge_base.conversations WHERE agent_id = $1`, [agentId]);
    await (0, db_1.executeQuery)(`DELETE FROM knowledge_base.agents WHERE agent_id = $1`, [agentId]);
    return true;
}
//# sourceMappingURL=training.js.map
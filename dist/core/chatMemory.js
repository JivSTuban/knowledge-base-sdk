"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendChatMessage = appendChatMessage;
exports.appendChatMessages = appendChatMessages;
exports.getThreadMessages = getThreadMessages;
const db_1 = require("./db");
async function appendChatMessage(input) {
    await (0, db_1.executeQuery)(`INSERT INTO knowledge_base.chat_messages
         (tenant_id, agent_id, thread_id, role, content, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`, [
        input.tenantId ?? null,
        input.agentId,
        input.threadId,
        input.role,
        input.content,
        input.metadata ?? null,
    ]);
}
async function appendChatMessages(inputs) {
    for (const input of inputs) {
        await appendChatMessage(input);
    }
}
async function getThreadMessages(input) {
    const limit = Math.max(1, Math.min(input.limit ?? 50, 500));
    const rows = await (0, db_1.executeQuery)(`SELECT id, tenant_id, agent_id, thread_id, role, content, metadata, created_at
         FROM knowledge_base.chat_messages
         WHERE agent_id = $1
           AND thread_id = $2
           AND (tenant_id IS NOT DISTINCT FROM $3)
         ORDER BY created_at DESC
         LIMIT $4`, [input.agentId, input.threadId, input.tenantId ?? null, limit]);
    return rows.reverse();
}
//# sourceMappingURL=chatMemory.js.map
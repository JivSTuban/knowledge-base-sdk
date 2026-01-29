-- Knowledge Base SDK v1.2: chatbot memory (thread-scoped)

CREATE TABLE IF NOT EXISTS knowledge_base.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id INTEGER NULL,
  agent_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('system','user','assistant','tool')),
  content TEXT NOT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup of a conversation/thread
CREATE INDEX IF NOT EXISTS chat_messages_thread_idx
  ON knowledge_base.chat_messages (tenant_id, agent_id, thread_id, created_at);

-- Helpful for cleanup/retention policies
CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx
  ON knowledge_base.chat_messages (created_at);

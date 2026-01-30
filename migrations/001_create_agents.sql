CREATE SCHEMA IF NOT EXISTS knowledge_base AUTHORIZATION ayahaytech;
GRANT USAGE ON SCHEMA knowledge_base TO PUBLIC;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_base.agents (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  description TEXT,
  document_count INTEGER DEFAULT 0,
  doc_count INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  tenant_id INTEGER,
  config JSONB DEFAULT '{}',
  system_prompt TEXT DEFAULT 'You are a helpful AI assistant.'
);

CREATE TABLE IF NOT EXISTS knowledge_base.conversations (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255),
  message_type VARCHAR(50) DEFAULT 'query',
  query TEXT NOT NULL,
  content TEXT,
  response TEXT,
  tokens_used INTEGER DEFAULT 0,
  cost_estimate NUMERIC DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_base.documents (
  id SERIAL PRIMARY KEY,
  doc_id VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  embedding vector(1024),
  source VARCHAR(255),
  tenant_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_base.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(255) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  s3_key VARCHAR(255) NOT NULL,
  s3_url VARCHAR(255) NOT NULL,
  file_type VARCHAR(50),
  file_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  tenant_id INTEGER
);

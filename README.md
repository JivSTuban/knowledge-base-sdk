# @ayahay/knowledge-base-sdk

A comprehensive TypeScript SDK for building RAG (Retrieval-Augmented Generation) powered knowledge base systems with OpenAI, PostgreSQL pgvector, and S3 storage.

## Features

- 🤖 **AI-Powered Q&A**: Train agents with documents and query them using GPT-4 with retrieval-augmented generation
- 📄 **Multi-Format Support**: Process PDF, Markdown, TXT, DOCX files and web URLs
- 🔄 **Streaming Responses**: Real-time streaming for chat interfaces
- 🗄️ **Vector Search**: PostgreSQL pgvector integration for semantic similarity search
- ☁️ **Flexible Storage**: S3 or local file storage with automatic fallback
- 👥 **Multi-Tenant**: Built-in tenant isolation support
- 🌐 **Client SDK**: Ready-to-use HTTP client for frontend applications
- 📝 **TypeScript**: Full type safety with comprehensive type definitions

## Installation

### For Monorepo Projects

```bash
pnpm add '@ayahay/knowledge-base-sdk@workspace:*'
```

### For External Projects

```bash
npm install @ayahay/knowledge-base-sdk
# or
pnpm add @ayahay/knowledge-base-sdk
# or
yarn add @ayahay/knowledge-base-sdk
```

## Quick Start

### Server-Side Usage (Node.js)

```typescript
import { trainAgent, queryAgent, streamQueryAgent } from '@ayahay/knowledge-base-sdk';

// 1. Train an agent with documents
const result = await trainAgent(
  [{ buffer: fileBuffer, mimetype: 'application/pdf', originalname: 'guide.pdf' }],
  'support-bot',
  ['https://docs.example.com'],
  1, // tenantId (optional)
  'You are a helpful customer support agent...' // system prompt (optional)
);

// 2. Query the agent
const answer = await queryAgent('support-bot', 'How do I reset my password?');
console.log(answer);

// 3. Stream responses for real-time interaction
const stream = await streamQueryAgent('support-bot', 'Explain the pricing plans');
for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

### Client-Side Usage (Browser/Frontend)

```typescript
import { KnowledgeBaseClient } from '@ayahay/knowledge-base-sdk';

const client = new KnowledgeBaseClient({
  baseUrl: 'https://api.example.com',
  apiKey: 'your-api-key', // optional
});

// Train with browser File objects
await client.train({
  agentId: 'support-bot',
  files: [file1, file2],
  urls: ['https://docs.example.com'],
  systemPrompt: 'You are a helpful assistant...',
});

// Query with streaming
const stream = await client.streamQuery({
  agentId: 'support-bot',
  query: 'How do I get started?',
});

for await (const chunk of stream) {
  console.log(chunk); // Display each chunk as it arrives
}
```

## Core API Reference

### Training

#### `trainAgent(files, agentId, urls?, tenantId?, systemPrompt?)`

Train a knowledge base agent with documents and/or URLs.

**Parameters:**
- `files`: Array of file objects with `buffer`, `mimetype`, and `originalname`
- `agentId`: Unique identifier for the agent
- `urls`: Optional array of URLs to scrape and process
- `tenantId`: Optional tenant ID for multi-tenancy
- `systemPrompt`: Optional custom system prompt for the agent

**Returns:** `Promise<TrainingResult>`

```typescript
const result = await trainAgent(
  [{ buffer, mimetype: 'application/pdf', originalname: 'doc.pdf' }],
  'my-agent',
  ['https://example.com/docs'],
  1,
  'You are an expert assistant...'
);
// Returns: { success: true, agentId, filesProcessed, urlsProcessed, totalChunks, message }
```

### Querying

#### `queryAgent(agentId, query, conversationId?)`

Query an agent and get a complete response.

**Parameters:**
- `agentId`: ID of the agent to query
- `query`: User question/query
- `conversationId`: Optional conversation ID for context

**Returns:** `Promise<string>`

#### `streamQueryAgent(agentId, query, conversationId?)`

Query an agent with streaming responses.

**Parameters:**
- `agentId`: ID of the agent to query
- `query`: User question/query
- `conversationId`: Optional conversation ID for context

**Returns:** `AsyncGenerator<string>`

### Agent Management

#### `getAgentStatus(agentId)`

Get details for a specific agent.

**Returns:** `Promise<Agent | null>`

#### `listAgents(tenantId?)`

List all agents, optionally filtered by tenant.

**Returns:** `Promise<Agent[]>`

#### `updateAgent(agentId, data)`

Update agent configuration (e.g., system prompt).

**Parameters:**
- `agentId`: ID of the agent to update
- `data`: Object with `systemPrompt` property

**Returns:** `Promise<Agent>`

#### `deleteAgent(agentId)`

Delete an agent and all associated data.

**Returns:** `Promise<boolean>`

### File Management

#### `getAgentFiles(agentId)`

Get all files associated with an agent.

**Returns:** `Promise<AgentFile[]>`

#### `deleteFile(fileId)`

Delete a specific file.

**Returns:** `Promise<boolean>`

## Client SDK Reference

### `KnowledgeBaseClient`

HTTP client for frontend applications.

#### Constructor

```typescript
const client = new KnowledgeBaseClient({
  baseUrl: 'https://api.example.com',
  apiKey: 'optional-api-key',
  headers: {
    'X-Custom-Header': 'value',
  },
});
```

#### Methods

- `train(request)`: Train an agent
- `query(options)`: Query an agent (non-streaming)
- `streamQuery(options)`: Query an agent (streaming)
- `listAgents()`: List all agents
- `getAgent(agentId)`: Get agent details
- `updateAgent(agentId, data)`: Update agent
- `deleteAgent(agentId)`: Delete agent
- `listFiles(agentId)`: List agent files
- `deleteFile(fileId)`: Delete a file

## Environment Variables

### Required

```env
OPENAI_API_KEY=sk-...
```

### Database Configuration

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your-password
DB_NAME=your-database
DB_SSL_CA=/path/to/ca-cert.pem  # Optional, for SSL
```

### Storage Configuration (Optional)

The SDK supports both S3 and local file storage. If S3 credentials are not provided, it automatically falls back to local storage.

#### S3 Storage

```env
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=your-bucket-name
AWS_REGION=ap-southeast-2
```

#### Local Storage (Fallback)

```env
KB_CONTEXT_DIR=./context  # Default: ./context
```

## Database Setup

The SDK requires PostgreSQL with the pgvector extension.

### 1. Install pgvector

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. Create Schema

```sql
CREATE SCHEMA IF NOT EXISTS knowledge_base;
```

### 3. Create Tables

The SDK will automatically create required tables on first use, but you can also create them manually:

```sql
-- Agents table
CREATE TABLE knowledge_base.agents (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'idle',
  config JSONB DEFAULT '{}',
  system_prompt TEXT,
  tenant_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Documents table with vector embeddings
CREATE TABLE knowledge_base.documents (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  embedding vector(1536),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES knowledge_base.agents(agent_id) ON DELETE CASCADE
);

-- Files table
CREATE TABLE knowledge_base.files (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR(255) NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  file_type VARCHAR(50),
  file_path TEXT,
  s3_url TEXT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES knowledge_base.agents(agent_id) ON DELETE CASCADE
);

-- Create vector similarity index
CREATE INDEX ON knowledge_base.documents USING ivfflat (embedding vector_cosine_ops);
```

## Examples

### Complete Server Example

```typescript
import {
  trainAgent,
  queryAgent,
  streamQueryAgent,
  listAgents,
  getAgentFiles,
} from '@ayahay/knowledge-base-sdk';

async function main() {
  // 1. Train an agent
  const trainingResult = await trainAgent(
    [{ buffer: pdfBuffer, mimetype: 'application/pdf', originalname: 'guide.pdf' }],
    'customer-support',
    ['https://help.example.com'],
    undefined,
    'You are a customer support agent for Acme Corp...'
  );
  console.log('Training complete:', trainingResult);

  // 2. List all agents
  const agents = await listAgents();
  console.log('Available agents:', agents);

  // 3. Query the agent
  const answer = await queryAgent('customer-support', 'What are your business hours?');
  console.log('Answer:', answer);

  // 4. Stream a response
  console.log('Streaming answer:');
  const stream = await streamQueryAgent('customer-support', 'Explain your refund policy');
  for await (const chunk of stream) {
    process.stdout.write(chunk);
  }
  console.log('\n');

  // 5. Check agent files
  const files = await getAgentFiles('customer-support');
  console.log('Agent files:', files);
}

main().catch(console.error);
```

### React Chat Component

```typescript
import React, { useState } from 'react';
import { KnowledgeBaseClient } from '@ayahay/knowledge-base-sdk';

const client = new KnowledgeBaseClient({
  baseUrl: process.env.REACT_APP_API_URL!,
});

export function ChatBox({ agentId }: { agentId: string }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const question = input;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setLoading(true);

    try {
      const stream = await client.streamQuery({ agentId, query: question });
      let answer = '';

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      for await (const chunk of stream) {
        answer += chunk;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1].content = answer;
          return updated;
        });
      }
    } catch (error) {
      console.error('Query failed:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={msg.role}>
            {msg.content}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          placeholder="Ask a question..."
        />
        <button type="submit" disabled={loading}>
          Send
        </button>
      </form>
    </div>
  );
}
```

## TypeScript Types

The SDK exports all necessary types for full type safety:

```typescript
import type {
  Agent,
  AgentFile,
  TrainingResult,
  QueryOptions,
  ClientConfig,
  ClientTrainRequest,
  Document,
  DocumentMetadata,
} from '@ayahay/knowledge-base-sdk';
```

## Integration Guides

- [Marketplace Integration Guide](../../MARKETPLACE_INTEGRATION_GUIDE.md) - Complete guide for integrating the SDK into marketplace applications

## Best Practices

1. **Agent IDs**: Use descriptive, kebab-case identifiers (e.g., `customer-support`, `product-faq`)
2. **System Prompts**: Provide clear, specific instructions that define the agent's role and behavior
3. **Chunking**: The SDK automatically chunks large documents; optimal chunk size is 1000 characters with 200 character overlap
4. **Error Handling**: Always wrap SDK calls in try-catch blocks
5. **Rate Limiting**: Implement rate limiting when exposing the SDK through public APIs
6. **Tenant Isolation**: Use the `tenantId` parameter to ensure proper multi-tenant isolation
7. **File Validation**: Validate file types and sizes before uploading (supported: PDF, MD, TXT, DOCX)

## Troubleshooting

### Common Issues

**Database Connection Fails**
- Verify PostgreSQL is running and credentials are correct
- Ensure pgvector extension is installed
- Check if the database user has proper permissions

**Training Returns No Documents**
- Check if files are not empty
- Verify URLs are accessible
- Ensure file types are supported

**Queries Return Generic Responses**
- Train the agent with more relevant documents
- Refine the system prompt
- Check if the agent has any documents (use `getAgentFiles()`)

**S3 Upload Fails**
- Verify AWS credentials
- Check bucket permissions
- The SDK will automatically fall back to local storage

## Contributing

Contributions are welcome! Please ensure:
- Code follows existing patterns
- Types are properly defined
- Tests pass (if applicable)
- Documentation is updated

## License

MIT

## Support

For issues, questions, or feature requests:
- Open an issue in the repository
- Contact the Ayahai development team
- Check the integration guides for common use cases

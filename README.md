# @ayahay/knowledge-base-sdk

> **For AI Agents**: This README contains complete step-by-step instructions for integrating the Knowledge Base SDK into any NestJS application. Follow sections 1-5 sequentially to implement RAG-powered AI agents.

A production-ready TypeScript SDK for building RAG (Retrieval-Augmented Generation) powered knowledge base systems with OpenAI GPT-4, PostgreSQL pgvector, and S3/local storage.

---

## Features

- 🤖 **AI-Powered Q&A**: Train agents with documents and query using GPT-4 with retrieval-augmented generation
- � **Live Data Tools**: LangChain tools for real-time trip schedules, fare rates, and vehicle pricing
- �� **Multi-Format Support**: Process PDF, Markdown, TXT, DOCX files and web URLs
- 🔄 **Streaming Responses**: Real-time Server-Sent Events for chat interfaces
- 🗄️ **Vector Search**: PostgreSQL pgvector with HNSW indexing (70% faster searches)
- ⚡ **High Performance**: Agent caching, similarity filtering, optimized retrieval (2-3x faster queries)
- ☁️ **Flexible Storage**: S3 or local file storage with automatic fallback
- 👥 **Multi-Tenant**: Built-in tenant isolation support
- 🌐 **Client SDK**: Ready-to-use HTTP client for frontend applications
- 📝 **TypeScript**: Full type safety with comprehensive type definitions

---

## Installation

### Option 1: From GitHub (Recommended for Ayahay monorepo)

```json
// package.json
{
  "dependencies": {
    "@ayahay/knowledge-base-sdk": "JivSTuban/knowledge-base-sdk#v1.2.1"
  }
}
```

```bash
pnpm install
```

### Option 2: From npm (for external projects)

```bash
npm install @ayahay/knowledge-base-sdk
# or
pnpm add @ayahay/knowledge-base-sdk
```

---

## Quick Start Guide for AI Agents

### 1. Database Setup

**Step 1.1: Install pgvector extension**

```sql
-- Connect to your PostgreSQL database
CREATE EXTENSION IF NOT EXISTS vector;
```

**Step 1.2: Create database migration file**

Create file: `src/database/migrations/YYYYMMDD_add_knowledge_base_schema.ts`

```typescript
import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
    // 1. Create Schema
    await sql`CREATE SCHEMA IF NOT EXISTS knowledge_base`.execute(db);

    // 2. Enable Vector Extension
    await sql`CREATE EXTENSION IF NOT EXISTS vector`.execute(db);

    // 3. Create Agents Table
    await sql`
    CREATE TABLE IF NOT EXISTS knowledge_base.agents (
      id SERIAL PRIMARY KEY,
      agent_id VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(255),
      description TEXT,
      doc_count INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      tenant_id INTEGER,
      config JSONB DEFAULT '{}',
      system_prompt TEXT
    )
  `.execute(db);

    // 4. Create Conversations Table
    await sql`
    CREATE TABLE IF NOT EXISTS knowledge_base.conversations (
      id SERIAL PRIMARY KEY,
      agent_id VARCHAR(255) NOT NULL,
      user_id VARCHAR(255),
      query TEXT NOT NULL,
      response TEXT,
      tokens_used INTEGER DEFAULT 0,
      cost DECIMAL(10, 6),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `.execute(db);

    // 5. Create Documents Table (with vector embeddings)
    await sql`
    CREATE TABLE IF NOT EXISTS knowledge_base.documents (
      id SERIAL PRIMARY KEY,
      doc_id VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      metadata JSONB DEFAULT '{}',
      embedding vector(1536),
      source VARCHAR(255),
      tenant_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `.execute(db);

    // 6. Create Files Table
    await sql`
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
    )
  `.execute(db);

    // 7. Create HNSW Vector Index (70% faster than IVFFlat)
    await sql`
    CREATE INDEX IF NOT EXISTS documents_embedding_hnsw_idx 
    ON knowledge_base.documents 
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `.execute(db);

    // 8. Create Agent ID Index
    await sql`
    CREATE INDEX IF NOT EXISTS documents_agent_id_idx 
    ON knowledge_base.documents 
    USING btree ((metadata->>'agentId'))
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`DROP TABLE IF EXISTS knowledge_base.files`.execute(db);
    await sql`DROP TABLE IF EXISTS knowledge_base.documents`.execute(db);
    await sql`DROP TABLE IF EXISTS knowledge_base.conversations`.execute(db);
    await sql`DROP TABLE IF EXISTS knowledge_base.agents`.execute(db);
    await sql`DROP SCHEMA IF EXISTS knowledge_base`.execute(db);
}
```

**Step 1.3: Run migration**

```bash
# If using a migration runner
pnpm run migration:run

# Or execute the SQL directly in your database
```

---

### 2. Environment Configuration

Add to your `.env` file:

```env
# Required
OPENAI_API_KEY=sk-proj-your-key-here

# Database (should already be configured)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your-password
DB_NAME=your-database

# CRITICAL: Required if behind Dito ISP or corporate proxy (SSL interception workaround)
NODE_TLS_REJECT_UNAUTHORIZED=0

# LangChain optimization (prevents 5-minute delays)
LANGCHAIN_RETRY_ATTEMPTS=0
TIKTOKEN_CACHE_DIR=/tmp/tiktoken_cache

# S3 Storage (Optional - falls back to local storage if omitted)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=your-bucket-name
AWS_REGION=ap-southeast-2

# Local Storage Fallback (used if S3 credentials missing)
KB_CONTEXT_DIR=./context
```

---

### 3. NestJS Module Setup

**Step 3.1: Create Knowledge Base Module**

Create file: `src/modules/knowledge-base/knowledge-base.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';

@Module({
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
```

**Step 3.2: Create Service**

Create file: `src/modules/knowledge-base/knowledge-base.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import {
  trainAgent,
  queryAgent,
  streamQueryAgent,
  listAgents,
  getAgentStatus,
  getAgentFiles,
  deleteAgent,
  deleteFile,
  updateAgent,
} from '@ayahay/knowledge-base-sdk';

@Injectable()
export class KnowledgeBaseService {
  async train(files: any[], agentId: string, urls?: string[], tenantId?: number, systemPrompt?: string) {
    return trainAgent(files, agentId, urls, tenantId, systemPrompt);
  }

  async query(agentId: string, query: string, options?: any) {
    return queryAgent(agentId, query, options);
  }

  async streamQuery(agentId: string, query: string, options?: any) {
    return streamQueryAgent(agentId, query, options);
  }

  async listAgents(tenantId?: number) {
    return listAgents(tenantId);
  }

  async getAgent(agentId: string) {
    return getAgentStatus(agentId);
  }

  async getFiles(agentId: string) {
    return getAgentFiles(agentId);
  }

  async deleteAgent(agentId: string) {
    return deleteAgent(agentId);
  }

  async deleteFile(fileId: string) {
    return deleteFile(fileId);
  }

  async updateAgent(agentId: string, data: { systemPrompt?: string }) {
    return updateAgent(agentId, data);
  }
}
```

**Step 3.3: Create Controller**

Create file: `src/modules/knowledge-base/knowledge-base.controller.ts`

```typescript
import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFiles,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { KnowledgeBaseService } from './knowledge-base.service';

@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly kbService: KnowledgeBaseService) {}

  @Post('train')
  @UseInterceptors(FilesInterceptor('files'))
  async train(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('agentId') agentId: string,
    @Body('urls') urls?: string,
    @Body('tenantId') tenantId?: number,
    @Body('systemPrompt') systemPrompt?: string,
  ) {
    const urlsArray = urls ? JSON.parse(urls) : [];
    return this.kbService.train(files, agentId, urlsArray, tenantId, systemPrompt);
  }

  @Post('query')
  async query(@Body('agentId') agentId: string, @Body('query') query: string) {
    const answer = await this.kbService.query(agentId, query);
    return { answer };
  }

  @Post('stream')
  async streamQuery(
    @Body('agentId') agentId: string,
    @Body('query') query: string,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await this.kbService.streamQuery(agentId, query);

    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  }

  @Get('agents')
  async listAgents(@Query('tenantId') tenantId?: number) {
    return this.kbService.listAgents(tenantId);
  }

  @Get('agents/:id')
  async getAgent(@Param('id') id: string) {
    return this.kbService.getAgent(id);
  }

  @Get('agents/:id/files')
  async getFiles(@Param('id') id: string) {
    return this.kbService.getFiles(id);
  }

  @Delete('agents/:id')
  async deleteAgent(@Param('id') id: string) {
    await this.kbService.deleteAgent(id);
    return { success: true };
  }

  @Delete('files/:id')
  async deleteFile(@Param('id') id: string) {
    await this.kbService.deleteFile(id);
    return { success: true };
  }

  @Patch('agents/:id')
  async updateAgent(@Param('id') id: string, @Body() data: { systemPrompt?: string }) {
    return this.kbService.updateAgent(id, data);
  }
}
```

**Step 3.4: Register in App Module**

In `src/app.module.ts`:

```typescript
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';

@Module({
  imports: [
    // ... other modules
    KnowledgeBaseModule,
  ],
})
export class AppModule {}
```

---

### 4. Frontend Integration (React/Next.js)

**Step 4.1: Install SDK in frontend (optional)**

```bash
pnpm add @ayahay/knowledge-base-sdk
```

**Step 4.2: Use Client SDK**

```typescript
import { KnowledgeBaseClient } from '@ayahay/knowledge-base-sdk';

const client = new KnowledgeBaseClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL!,
});

// Training
await client.train({
  agentId: 'support-bot',
  files: [file1, file2],
  urls: ['https://docs.example.com'],
  systemPrompt: 'You are a helpful assistant...',
});

// Streaming query
const stream = await client.streamQuery({
  agentId: 'support-bot',
  query: 'How do I get started?',
});

for await (const chunk of stream) {
  console.log(chunk);
}
```

**Step 4.3: Direct API calls (without client SDK)**

```typescript
// Training
const formData = new FormData();
formData.append('agentId', 'support-bot');
formData.append('files', file);
formData.append('urls', JSON.stringify(['https://example.com']));

const response = await fetch('/api/knowledge-base/train', {
  method: 'POST',
  body: formData,
});

// Streaming query
const eventSource = new EventSource(`/api/knowledge-base/stream?agentId=support-bot&query=hello`);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.chunk) {
    console.log(data.chunk);
  }
};
```

---

### 5. Testing Your Integration

**Step 5.1: Test Training**

```bash
curl -X POST http://localhost:3000/knowledge-base/train \
  -F "agentId=test-bot" \
  -F "files=@/path/to/document.pdf" \
  -F "systemPrompt=You are a helpful assistant."
```

**Step 5.2: Test Query**

```bash
curl -X POST http://localhost:3000/knowledge-base/query \
  -H "Content-Type: application/json" \
  -d '{"agentId": "test-bot", "query": "What is this about?"}'
```

**Step 5.3: Test Streaming**

```bash
curl -X POST http://localhost:3000/knowledge-base/stream \
  -H "Content-Type: application/json" \
  -d '{"agentId": "test-bot", "query": "Explain the main concepts"}'
```

---

## API Reference

### Training

```typescript
trainAgent(
  files: Array<{ buffer: Buffer; mimetype: string; originalname: string }>,
  agentId: string,
  urls?: string[],
  tenantId?: number,
  systemPrompt?: string
): Promise<TrainingResult>
```

**Returns:**
```typescript
{
  success: boolean;
  documentsProcessed: number;
  tokensUsed: number;
  agentId: string;
  uploadedFiles?: Array<{ file: string; url: string; key: string }>;
}
```

### Querying

```typescript
queryAgent(
  agentId: string,
  query: string,
  options?: QueryOptions
): Promise<string>
```

```typescript
streamQueryAgent(
  agentId: string,
  query: string,
  options?: QueryOptions
): AsyncGenerator<string>
```

### Agent Management

```typescript
listAgents(tenantId?: number): Promise<Agent[]>
getAgentStatus(agentId: string): Promise<Agent | null>
updateAgent(agentId: string, data: { systemPrompt?: string }): Promise<Agent>
deleteAgent(agentId: string): Promise<boolean>
```

### File Management

```typescript
getAgentFiles(agentId: string): Promise<AgentFile[]>
deleteFile(fileId: string): Promise<boolean>
```

---

## TypeScript Types

```typescript
import type {
  Agent,
  AgentFile,
  Document,
  DocumentMetadata,
  TrainingResult,
  QueryOptions,
  ClientConfig,
  ClientTrainRequest,
  ClientQueryRequest,
  ClientQueryResponse,
} from '@ayahay/knowledge-base-sdk';
```

---

## Performance Optimizations

### HNSW Indexing (v1.1.0+)
- 60-70% faster similarity searches
- Automatically used when database migration is run

### Agent Caching
- 90% faster repeat queries (5-minute TTL)
- Manually clear cache after updates:
  ```typescript
  import { clearAgentCache } from '@ayahay/knowledge-base-sdk';
  
  await updateAgent('my-agent', { systemPrompt: 'New prompt' });
  clearAgentCache('my-agent'); // Clear this agent's cache
  ```

### Similarity Threshold Filtering
- 30% reduction in LLM token usage
- Configurable via `QueryOptions`:
  ```typescript
  queryAgent('my-agent', 'query', { similarityThreshold: 0.8 });
  ```

---

## Troubleshooting

### 5-Minute Response Delays

**Symptom:** AI queries take exactly 5 minutes before responding

**Cause:** LangChain's tiktoken module cannot reach `tiktoken.pages.dev` due to:
- Dito ISP SSL interception (certificate mismatch)
- Corporate proxy blocking

**Solution:**
```env
# Add to .env
NODE_TLS_REJECT_UNAUTHORIZED=0
LANGCHAIN_RETRY_ATTEMPTS=0
TIKTOKEN_CACHE_DIR=/tmp/tiktoken_cache
```

Then restart your server:
```bash
pkill -9 -f "node|nest" && pnpm run start:dev
```

### S3 Upload Failures

**Symptom:** Training fails with S3 errors

**Solution:** SDK automatically falls back to local `./context/` folder. Check:
```env
KB_CONTEXT_DIR=./context  # Default fallback location
```

### Database Connection Issues

**Symptom:** `Cannot connect to database`

**Solution:**
1. Verify PostgreSQL is running
2. Check `.env` credentials
3. Ensure pgvector extension is installed:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

### Empty Responses from Agent

**Symptom:** Agent returns "I don't have enough information..."

**Solution:**
1. Check if agent has documents:
   ```typescript
   const files = await getAgentFiles('my-agent');
   console.log(files);
   ```
2. Lower similarity threshold:
   ```typescript
   queryAgent('my-agent', 'query', { similarityThreshold: 0.5 });
   ```

---

## Best Practices

1. **Agent IDs**: Use descriptive kebab-case identifiers (`customer-support`, not `CS1`)
2. **System Prompts**: Be specific about the agent's role and constraints
3. **Chunking**: SDK auto-chunks at 4000 characters with 400 overlap (optimal for GPT-4)
4. **Error Handling**: Always wrap SDK calls in try-catch blocks
5. **Rate Limiting**: Implement rate limiting when exposing endpoints publicly
6. **Multi-Tenancy**: Use `tenantId` parameter for proper isolation
7. **File Validation**: Validate file types/sizes before upload (Supported: PDF, MD, TXT, DOCX)

---

## Production Deployment

### Checklist

- [ ] Database migrations run on production DB
- [ ] pgvector extension installed
- [ ] HNSW index created (migration 002)
- [ ] Environment variables configured
- [ ] S3 bucket created and permissions set
- [ ] OpenAI API key added
- [ ] `NODE_TLS_REJECT_UNAUTHORIZED=0` added (if behind Dito/proxy)
- [ ] API endpoints tested
- [ ] Frontend integration tested

### Environment Variables (Production)

```env
OPENAI_API_KEY=sk-proj-...
NODE_TLS_REJECT_UNAUTHORIZED=0  # Only if needed
LANGCHAIN_RETRY_ATTEMPTS=0
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=production-bucket
AWS_REGION=ap-southeast-2
DB_HOST=production-db.region.rds.amazonaws.com
DB_PORT=5432
DB_USERNAME=...
DB_PASSWORD=...
DB_NAME=production
```

---

## Support

- **GitHub Issues**: [knowledge-base-sdk/issues](https://github.com/JivSTuban/knowledge-base-sdk/issues)
- **Documentation**: See `/docs` folder in repository
- **Integration Guides**: Check `MARKETPLACE_INTEGRATION_GUIDE.md`

---

## License

MIT

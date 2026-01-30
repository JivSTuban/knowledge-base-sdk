# Changelog

All notable changes to the Knowledge Base SDK will be documented in this file.

## [1.2.1] - 2026-01-30

### Added
- **Live Data Tools**: Integrated LangChain tools for real-time trip and fare queries
  - `search_trips` - Search available ferry trips between ports
  - `get_fare_rates` - Get passenger ticket pricing
  - `get_vehicle_rates` - Get vehicle/cargo pricing
- **Port Code Mappings**: Comprehensive port code reference in tool descriptions
  - BOG (Bogo), COR (Cordova), CEB (Cebu), MNL (Manila), TAG (Tagbilaran)
  - PAL (Cagayan), DUM (Dumaguete), SIQ (Siquijor), ILO (Iloilo)
- **Tool Context**: New `ToolContext` interface for tenant-scoped API requests
- **Non-streaming Query**: Added `queryAgentWithTools` for tool-enabled queries

### Changed
- Enhanced tool descriptions with explicit port code mappings to improve LLM accuracy
- Tools now support both single-tenant and aggregator modes
- Improved error handling in tool execution

### Fixed
- Corrected port code interpretation (Cordova = COR, not MNL)
- Fixed tool result formatting for LangChain compatibility

## [1.2.0] - 2026-01-26

### Added
- Complete removal of tiktoken to eliminate 5-min delays
- Direct OpenAI SDK integration
- Dito ISP SSL interception workaround
- Migration to HNSW indexing for 70% faster searches

### Changed
- Optimized vector similarity search performance
- Improved error handling and logging

## [1.1.2] - 2026-01-20

### Added
- Initial release with pgvector RAG support
- Document ingestion (PDF, TXT, DOCX, MD, URLs)
- Agent lifecycle management
- S3 file upload with local fallback
- Streaming chat support

### Features
- Knowledge base training
- Similarity search with pgvector
- Agent management (create, delete, update)
- File management
- Conversation history

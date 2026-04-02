// src/rag — public re-exports
//
// Agents and extractors import from '../rag' (not from individual files).
// Only the types and classes that external code needs are exported here.

export type {
  Chunk,
  CitedChunk,
  ChunkVector,
  Manifest,
  RetrieveOptions,
  TaxonomyConcept,
  SourceFrontmatter,
} from './types';
export type { EmbedFunction } from './Embedder';
export { Chunker } from './Chunker';
export { Embedder, makeOpenAIEmbedFn } from './Embedder';
export { Retriever } from './Retriever';
export { LegalRagService } from './LegalRagService';
export type { RagServiceConfig, RagBuildConfig } from './LegalRagService';

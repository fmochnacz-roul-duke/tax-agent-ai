// ─────────────────────────────────────────────────────────────
// RAG type definitions
//
// Everything else in src/rag/ imports from here — keeping the
// shared vocabulary in one place makes it easy to extend when
// new Tax OS modules are added (Phase 15+).
// ─────────────────────────────────────────────────────────────

// One section of a legal source document, ready to be embedded.
// Produced by the Chunker from a source .md file.
export interface Chunk {
  // Unique across the entire knowledge base: "MF-OBJ-2025::2-3"
  chunk_id: string;

  // ID that matches an entry in data/legal_sources_registry.json
  source_id: string;

  // The section number or provision reference: "§2.3", "Art. 4a pkt 29"
  section_ref: string;

  // Human-readable section title: "Kryteria uznania działalności za rzeczywistą"
  section_title: string;

  // IDs from data/tax_taxonomy.json — used for filtered retrieval
  concept_ids: string[];

  // Which Tax OS modules use this chunk: ["WHT"], ["WHT", "TP_screening"]
  module_relevance: string[];

  // Source language: "pl" (Polish) or "en" (English)
  language: string;

  // The full section text, including the heading line.
  // Sent to the embedding model and injected into the agent prompt as a citation.
  text: string;

  char_count: number;
}

// A Chunk that has been scored against a query.
// Returned by Retriever.search() and LegalRagService.retrieve().
export interface CitedChunk extends Omit<Chunk, 'char_count'> {
  // Cosine similarity score between the query embedding and this chunk, 0–1.
  // Higher = more relevant.
  score: number;
}

// One row in data/knowledge_base/embeddings/vectors.json
export interface ChunkVector {
  chunk_id: string;
  embedding: number[]; // dimensionality depends on the model
}

// Stored at data/knowledge_base/embeddings/manifest.json
// Tracks which version of each source file was last indexed.
export interface Manifest {
  // ISO 8601 timestamp of last build run
  indexed_at: string;

  // Name of the OpenAI embedding model used (e.g. "text-embedding-3-small")
  model: string;

  // source_id → SHA-256 hex hash of the source .md file at build time.
  // If the hash changes, the source is re-chunked and re-embedded on the next build.
  source_hashes: Record<string, string>;
}

// Parsed fields from the YAML frontmatter block of a source .md file.
export interface SourceFrontmatter {
  source_id: string;
  language: string;
  module_relevance: string[];

  // Default concept_ids applied to every chunk in this document.
  // Can be refined by creating one file per sub-section.
  concept_ids: string[];
}

// Options for LegalRagService.retrieve()
export interface RetrieveOptions {
  // If provided, only chunks that share at least one concept_id are considered.
  concept_ids?: string[];

  // If provided, only chunks with this module in module_relevance are considered.
  // Use this to scope retrieval to a single Tax OS module.
  module?: string;

  // If provided, only chunks from these source documents are considered.
  source_ids?: string[];

  // Maximum number of chunks to return, sorted by score. Default: 5.
  top_k?: number;
}

// A minimal view of a taxonomy concept — only what the RAG layer needs.
// The full concept is in data/tax_taxonomy.json.
export interface TaxonomyConcept {
  id: string;
  rag_keywords: string[];
}

// ─────────────────────────────────────────────────────────────
// RAG type definitions
//
// Everything else in src/rag/ imports from here — keeping the
// shared vocabulary in one place makes it easy to extend when
// new Tax OS modules are added (Phase 15+).
//
// Phase 16 additions:
//   SourceType  — the legal authority tier of a source document
//   source_type — propagated through SourceFrontmatter → Chunk → CitedChunk
//   RetrieveOptions.source_type — filter retrieval by authority tier
// ─────────────────────────────────────────────────────────────

// SourceType classifies a legal source by its position in the authority hierarchy.
// Values mirror the "source_types" map in data/legal_sources_registry.json.
//
// Used both as a frontmatter field on .md source files and as a filter parameter
// on consult_legal_sources, so the agent can ask: "retrieve only statutory text"
// or "retrieve only ministerial guidance" rather than searching the entire corpus.
export type SourceType =
  | 'statute' // Primary legislation (CIT Act, PIT Act)
  | 'directive' // EU secondary legislation (I&R Directive, P-S Directive)
  | 'treaty' // Bilateral double taxation convention
  | 'convention' // Multilateral convention (MLI)
  | 'guidance' // Official ministerial or regulatory guidance (MF Objaśnienia)
  | 'oecd' // OECD publication or standard (TP Guidelines, BEPS Actions)
  | 'commentary'; // Academic or professional commentary;

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

  // ISO 8601 date when a human last confirmed this source reflects current law.
  // Propagated from the source file's frontmatter into every chunk it produces.
  last_verified?: string;

  // Phase 16: legal authority tier of the source document.
  // Propagated from frontmatter so retrieval can be filtered by authority level.
  source_type?: SourceType;

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

  // ISO 8601 date when a human last confirmed this source reflects current law.
  // Optional — not every source has been reviewed since initial import.
  // Surfaces in CitedChunk so the agent prompt can warn when a source is unverified.
  last_verified?: string;

  // Phase 16: legal authority tier — parsed from the 'source_type' frontmatter field.
  // Propagated to every Chunk the document produces.
  source_type?: SourceType;
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

  // Phase 16: if provided, only chunks whose source_type matches are considered.
  // Use 'statute' to retrieve only primary legislation (CIT Act),
  // 'guidance' for ministerial guidance (MF Objaśnienia) only, etc.
  // Omit (or pass undefined) to search all source types.
  source_type?: SourceType;

  // Maximum number of chunks to return, sorted by score. Default: 5.
  top_k?: number;
}

// A minimal view of a taxonomy concept — only what the RAG layer needs.
// The full concept is in data/tax_taxonomy.json.
export interface TaxonomyConcept {
  id: string;
  rag_keywords: string[];
}

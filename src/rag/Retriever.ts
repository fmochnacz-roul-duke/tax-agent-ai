import { Chunk, CitedChunk, ChunkVector, RetrieveOptions } from './types';

// ─────────────────────────────────────────────────────────────
// Retriever
//
// Given pre-loaded chunk metadata and embedding vectors, finds
// the most relevant chunks for a query embedding using cosine
// similarity.
//
// The Retriever is deliberately stateless with respect to I/O
// — it operates entirely on data passed to its constructor.
// This makes it straightforward to test without touching disk.
// ─────────────────────────────────────────────────────────────
export class Retriever {
  // Indexed lookup: chunk_id → embedding vector, built once in the constructor.
  private readonly vectorIndex: Map<string, number[]>;

  constructor(
    private readonly chunks: Chunk[],
    vectors: ChunkVector[]
  ) {
    this.vectorIndex = new Map(vectors.map((v) => [v.chunk_id, v.embedding]));
  }

  // Searches for the top-k most relevant chunks for the given query embedding.
  //
  // Optional filters (all are AND-combined):
  //   concept_ids — chunk must share at least one concept_id with the filter list
  //   module      — chunk must include this string in its module_relevance list
  //   source_ids  — chunk's source_id must be in this list
  search(queryEmbedding: number[], options: RetrieveOptions = {}): CitedChunk[] {
    const { concept_ids, module: moduleName, source_ids, top_k = 5 } = options;

    // Step 1: apply filters
    const candidates = this.chunks.filter((chunk) => {
      // Only consider chunks that have a precomputed embedding
      if (!this.vectorIndex.has(chunk.chunk_id)) return false;

      if (concept_ids && concept_ids.length > 0) {
        const hasOverlap = concept_ids.some((id) => chunk.concept_ids.includes(id));
        if (!hasOverlap) return false;
      }

      if (moduleName !== undefined) {
        if (!chunk.module_relevance.includes(moduleName)) return false;
      }

      if (source_ids && source_ids.length > 0) {
        if (!source_ids.includes(chunk.source_id)) return false;
      }

      return true;
    });

    // Step 2: score each candidate against the query
    const scored = candidates.map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, this.vectorIndex.get(chunk.chunk_id)!),
    }));

    // Step 3: sort descending by score and take the top_k
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, top_k).map(({ chunk, score }) => ({
      chunk_id: chunk.chunk_id,
      source_id: chunk.source_id,
      section_ref: chunk.section_ref,
      section_title: chunk.section_title,
      concept_ids: chunk.concept_ids,
      module_relevance: chunk.module_relevance,
      language: chunk.language,
      text: chunk.text,
      score,
    }));
  }
}

// ─────────────────────────────────────────────────────────────
// cosineSimilarity
//
// Returns the cosine similarity between two equal-length vectors,
// ranging from -1 (opposite) through 0 (orthogonal) to 1 (identical).
//
// OpenAI's embedding vectors are unit-normalised, which means
// cosine similarity = dot product.  We compute the full formula
// here so the function is correct for non-unit vectors too.
// ─────────────────────────────────────────────────────────────
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}. ` +
        'Both vectors must come from the same embedding model.'
    );
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  // Guard against zero-magnitude vectors (e.g. all-zero mock embeddings)
  return denom === 0 ? 0 : dot / denom;
}

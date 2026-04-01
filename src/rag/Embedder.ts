import OpenAI from 'openai';
import { Chunk, ChunkVector } from './types';

// ─────────────────────────────────────────────────────────────
// EmbedFunction
//
// A function that converts an array of text strings into their
// embedding vectors.
//
// This type is the injection point for testing: tests pass a
// deterministic mock function; production code passes the
// makeOpenAIEmbedFn() factory result.
// ─────────────────────────────────────────────────────────────
export type EmbedFunction = (texts: string[]) => Promise<number[][]>;

// ─────────────────────────────────────────────────────────────
// Embedder
//
// Converts an array of Chunk objects into ChunkVector objects
// by calling the provided EmbedFunction in batches.
//
// Usage (production):
//   const client  = new OpenAI();
//   const embedFn = makeOpenAIEmbedFn(client, 'text-embedding-3-small');
//   const embedder = new Embedder(embedFn);
//   const vectors  = await embedder.embedChunks(chunks);
//
// Usage (tests):
//   const embedder = new Embedder(mockEmbedFn);
// ─────────────────────────────────────────────────────────────
export class Embedder {
  // OpenAI's embeddings API accepts up to 2048 inputs per request.
  // We use a conservative batch size to stay well within that limit.
  private readonly batchSize = 100;

  constructor(private readonly embedFn: EmbedFunction) {}

  // Embeds all chunks, returning one ChunkVector per input chunk.
  // Chunks are processed in batches to avoid hitting API limits.
  async embedChunks(chunks: Chunk[]): Promise<ChunkVector[]> {
    const vectors: ChunkVector[] = [];

    for (let i = 0; i < chunks.length; i += this.batchSize) {
      const batch = chunks.slice(i, i + this.batchSize);
      const texts = batch.map(c => c.text);

      const embeddings = await this.embedFn(texts);

      for (let j = 0; j < batch.length; j++) {
        vectors.push({
          chunk_id:  batch[j].chunk_id,
          embedding: embeddings[j],
        });
      }
    }

    return vectors;
  }

  // Embeds a single query string.
  async embedQuery(text: string): Promise<number[]> {
    const results = await this.embedFn([text]);
    return results[0];
  }
}

// ─────────────────────────────────────────────────────────────
// makeOpenAIEmbedFn
//
// Factory that creates an EmbedFunction backed by the OpenAI
// Embeddings API.  Keeps the Embedder class free of any direct
// OpenAI SDK dependency — useful for swapping providers later.
// ─────────────────────────────────────────────────────────────
export function makeOpenAIEmbedFn(client: OpenAI, model: string): EmbedFunction {
  return async (texts: string[]): Promise<number[][]> => {
    const response = await client.embeddings.create({ model, input: texts });

    // The API guarantees responses are in the same order as inputs,
    // but we sort by index to be safe.
    return response.data
      .sort((a, b) => a.index - b.index)
      .map(e => e.embedding);
  };
}

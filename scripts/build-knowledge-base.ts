// scripts/build-knowledge-base.ts
//
// Builds (or incrementally updates) the RAG knowledge base.
// Run this after adding or changing source files in data/knowledge_base/sources/.
//
// Usage:
//   npm run rag:build
//
// What it does:
//   1. Reads all .md files from data/knowledge_base/sources/ (skips TEMPLATE.md)
//   2. Chunks each file using Chunker (splits at H2/H3 headings)
//   3. Detects which sources changed since last build (SHA-256 comparison)
//   4. Re-embeds only changed/new sources using OpenAI text-embedding-3-small
//   5. Writes:
//        data/knowledge_base/chunks/index.json     — all chunks (human-readable)
//        data/knowledge_base/embeddings/vectors.json — embedding vectors
//        data/knowledge_base/embeddings/manifest.json — build metadata + file hashes
//
// Environment variables:
//   OPENAI_API_KEY          (required)
//   OPENAI_EMBEDDING_MODEL  (optional — defaults to text-embedding-3-small)

import * as path from 'path';
import * as dotenv from 'dotenv';
import OpenAI from 'openai';
import { LegalRagService } from '../src/rag/LegalRagService';
import { makeOpenAIEmbedFn } from '../src/rag/Embedder';

dotenv.config();

async function main(): Promise<void> {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY is not set in .env');
    console.error('The build script calls the OpenAI Embeddings API to create vectors.');
    process.exit(1);
  }

  const model = process.env['OPENAI_EMBEDDING_MODEL'] ?? 'text-embedding-3-small';

  const knowledgeBasePath = path.resolve(__dirname, '..', 'data', 'knowledge_base');
  const taxonomyPath      = path.resolve(__dirname, '..', 'data', 'tax_taxonomy.json');

  console.log('Building RAG knowledge base...');
  console.log(`  Sources:   ${knowledgeBasePath}/sources/`);
  console.log(`  Taxonomy:  ${taxonomyPath}`);
  console.log(`  Model:     ${model}`);
  console.log('');

  const client  = new OpenAI({ apiKey });
  const embedFn = makeOpenAIEmbedFn(client, model);

  await LegalRagService.build({
    knowledgeBasePath,
    taxonomyPath,
    embedFn,
    model,
  });
}

main().catch((err: unknown) => {
  console.error('Build failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

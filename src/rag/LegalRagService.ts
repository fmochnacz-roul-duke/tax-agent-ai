import * as fs   from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Chunk, ChunkVector, CitedChunk, Manifest, RetrieveOptions, TaxonomyConcept } from './types';
import { Chunker } from './Chunker';
import { Embedder, EmbedFunction, makeOpenAIEmbedFn } from './Embedder';
import { Retriever } from './Retriever';

// ─────────────────────────────────────────────────────────────
// LegalRagService
//
// The public API for the RAG layer.  Agents and extractors call
// retrieve() — they never touch the Chunker, Embedder, or
// Retriever directly.
//
// Key feature: taxonomy-powered query expansion.
// Before embedding the query, the service looks up the concept_ids
// in the taxonomy and appends all their rag_keywords.  This converts
// an English question into a query that also contains Polish legal
// terms, OECD references, and statutory citations — making retrieval
// precise across multilingual source documents.
//
// Two factory methods:
//
//   LegalRagService.fromDisk(options)
//     Production use.  Loads chunks and vectors from the knowledge
//     base directory.  Calls OpenAI for query embeddings.
//
//   LegalRagService.fromData(options)
//     Test use.  Accepts in-memory chunks, vectors, and taxonomy.
//     Injects a mock EmbedFunction so no API calls are made.
//
// To rebuild the knowledge base after source files change:
//
//   npm run rag:build
//   (runs scripts/build-knowledge-base.ts which calls LegalRagService.build())
// ─────────────────────────────────────────────────────────────

export interface RagServiceConfig {
  knowledgeBasePath: string;  // absolute path to data/knowledge_base/
  taxonomyPath:      string;  // absolute path to data/tax_taxonomy.json
  embedFn?:          EmbedFunction;  // injectable — defaults to OpenAI
  model?:            string;  // embedding model — defaults to text-embedding-3-small
}

export interface RagBuildConfig extends RagServiceConfig {
  embedFn: EmbedFunction;  // required for build (not optional)
}

// Minimal shape of data/tax_taxonomy.json that we need to parse.
interface TaxonomyFile {
  concepts: TaxonomyConcept[];
}

export class LegalRagService {
  private constructor(
    private readonly retriever: Retriever,
    private readonly embedder:  Embedder,
    private readonly taxonomy:  TaxonomyConcept[],
  ) {}

  // ── Factory: production (loads from disk) ─────────────────

  static fromDisk(config: RagServiceConfig): LegalRagService {
    const chunksPath   = path.join(config.knowledgeBasePath, 'chunks', 'index.json');
    const vectorsPath  = path.join(config.knowledgeBasePath, 'embeddings', 'vectors.json');

    if (!fs.existsSync(chunksPath)) {
      throw new Error(
        `Chunk index not found at ${chunksPath}. ` +
        'Run "npm run rag:build" to build the knowledge base first.'
      );
    }
    if (!fs.existsSync(vectorsPath)) {
      throw new Error(
        `Embedding vectors not found at ${vectorsPath}. ` +
        'Run "npm run rag:build" to build the knowledge base first.'
      );
    }

    const chunks:  Chunk[]       = JSON.parse(fs.readFileSync(chunksPath,  'utf-8'));
    const vectors: ChunkVector[] = JSON.parse(fs.readFileSync(vectorsPath, 'utf-8'));
    const taxonomy = LegalRagService.loadTaxonomy(config.taxonomyPath);

    const embedFn = config.embedFn ?? LegalRagService.makeDefaultEmbedFn(config.model);
    const embedder   = new Embedder(embedFn);
    const retriever  = new Retriever(chunks, vectors);

    return new LegalRagService(retriever, embedder, taxonomy);
  }

  // ── Factory: test (accepts in-memory data) ────────────────

  static fromData(options: {
    chunks:   Chunk[];
    vectors:  ChunkVector[];
    taxonomy: TaxonomyConcept[];
    embedFn:  EmbedFunction;
  }): LegalRagService {
    const retriever = new Retriever(options.chunks, options.vectors);
    const embedder  = new Embedder(options.embedFn);
    return new LegalRagService(retriever, embedder, options.taxonomy);
  }

  // ── Public API: retrieve ──────────────────────────────────

  // Finds the most relevant legal text chunks for a given query.
  //
  // The query is expanded with taxonomy rag_keywords before embedding.
  // This makes retrieval effective across Polish and English source texts
  // even when the query is in English.
  //
  // Example:
  //   query: "Does this holding company have genuine business activity?"
  //   concept_ids: ["holding_company", "condition_iii_genuine_business"]
  //
  //   Expanded query appends: "spółka holdingowa", "§2.3.1", "Art. 4a pkt 29 lit. c",
  //   "rzeczywista działalność gospodarcza", "genuine business activity", etc.
  async retrieve(query: string, options: RetrieveOptions = {}): Promise<CitedChunk[]> {
    const expandedQuery = this.expandQuery(query, options.concept_ids ?? []);
    const queryEmbedding = await this.embedder.embedQuery(expandedQuery);
    return this.retriever.search(queryEmbedding, options);
  }

  // ── Static: build the knowledge base ─────────────────────

  // Reads all .md source files, chunks them, embeds new/changed chunks,
  // and writes the results to the knowledge base directory.
  //
  // Incremental: only re-embeds sources whose file content has changed
  // since the last build (detected via SHA-256 hash).
  //
  // Output files:
  //   {knowledgeBasePath}/chunks/index.json     — all chunks (human-readable)
  //   {knowledgeBasePath}/embeddings/vectors.json — all chunk vectors
  //   {knowledgeBasePath}/embeddings/manifest.json — build metadata
  static async build(config: RagBuildConfig): Promise<void> {
    const sourcesDir   = path.join(config.knowledgeBasePath, 'sources');
    const chunksDir    = path.join(config.knowledgeBasePath, 'chunks');
    const embeddingDir = path.join(config.knowledgeBasePath, 'embeddings');

    fs.mkdirSync(chunksDir,    { recursive: true });
    fs.mkdirSync(embeddingDir, { recursive: true });

    // Load existing manifest (or start fresh)
    const manifestPath = path.join(embeddingDir, 'manifest.json');
    const existingManifest: Manifest = fs.existsSync(manifestPath)
      ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      : { indexed_at: '', model: '', source_hashes: {} };

    const model = config.model ?? 'text-embedding-3-small';
    const embedder = new Embedder(config.embedFn);
    const chunker  = new Chunker();

    // Load existing chunks and vectors (for unchanged sources)
    const chunksPath  = path.join(chunksDir,    'index.json');
    const vectorsPath = path.join(embeddingDir, 'vectors.json');
    const existingChunks:  Chunk[]       = fs.existsSync(chunksPath)  ? JSON.parse(fs.readFileSync(chunksPath,  'utf-8')) : [];
    const existingVectors: ChunkVector[] = fs.existsSync(vectorsPath) ? JSON.parse(fs.readFileSync(vectorsPath, 'utf-8')) : [];

    // Index existing data by source_id for quick lookup
    const chunksBySource  = new Map<string, Chunk[]>();
    const vectorsByChunk  = new Map<string, ChunkVector>();
    for (const c of existingChunks)  {
      const arr = chunksBySource.get(c.source_id) ?? [];
      arr.push(c);
      chunksBySource.set(c.source_id, arr);
    }
    for (const v of existingVectors) vectorsByChunk.set(v.chunk_id, v);

    // Discover source files
    const sourceFiles = fs.readdirSync(sourcesDir)
      .filter(f => f.endsWith('.md') && !f.startsWith('TEMPLATE'));

    if (sourceFiles.length === 0) {
      console.log('No source files found in', sourcesDir);
      console.log('Add source .md files and run again. See TEMPLATE.md for the format.');
      return;
    }

    const allChunks:  Chunk[]       = [];
    const allVectors: ChunkVector[] = [];
    const newHashes:  Record<string, string> = {};

    for (const file of sourceFiles) {
      const filePath = path.join(sourcesDir, file);
      const content  = fs.readFileSync(filePath, 'utf-8');
      const hash     = crypto.createHash('sha256').update(content).digest('hex');

      // Parse source_id from frontmatter to use as the key
      let sourceId: string;
      try {
        const idMatch = content.match(/^source_id:\s*(.+)$/m);
        sourceId = idMatch ? idMatch[1].trim() : file.replace('.md', '');
      } catch {
        sourceId = file.replace('.md', '');
      }

      newHashes[sourceId] = hash;

      const previousHash = existingManifest.source_hashes[sourceId];
      const hasChanged   = previousHash !== hash;
      const modelChanged = existingManifest.model !== model;

      if (!hasChanged && !modelChanged) {
        // Reuse existing chunks and vectors for this source
        const reusedChunks   = chunksBySource.get(sourceId) ?? [];
        const reusedVectors  = reusedChunks
          .map(c => vectorsByChunk.get(c.chunk_id))
          .filter((v): v is ChunkVector => v !== undefined);

        allChunks.push(...reusedChunks);
        allVectors.push(...reusedVectors);
        console.log(`  [unchanged] ${sourceId} — reusing ${reusedChunks.length} chunks`);
        continue;
      }

      // Re-chunk and re-embed this source
      console.log(`  [indexing]  ${sourceId} (${hasChanged ? 'content changed' : 'model changed'})`);
      let chunks: Chunk[];
      try {
        chunks = chunker.chunk(content);
      } catch (e) {
        console.error(`  [error]     ${file}: ${(e as Error).message}`);
        continue;
      }

      const vectors = await embedder.embedChunks(chunks);

      allChunks.push(...chunks);
      allVectors.push(...vectors);
      console.log(`  [done]      ${sourceId} — ${chunks.length} chunks embedded`);
    }

    // Write outputs
    const manifest: Manifest = {
      indexed_at:    new Date().toISOString(),
      model,
      source_hashes: newHashes,
    };

    fs.writeFileSync(chunksPath,   JSON.stringify(allChunks,   null, 2), 'utf-8');
    fs.writeFileSync(vectorsPath,  JSON.stringify(allVectors,  null, 2), 'utf-8');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest,    null, 2), 'utf-8');

    console.log(`\nKnowledge base built: ${allChunks.length} chunks across ${sourceFiles.length} source(s).`);
  }

  // ── Private helpers ────────────────────────────────────────

  // Expands the query by appending rag_keywords from the matched taxonomy concepts.
  // This is the key mechanism that makes Polish legal text retrievable from
  // English queries — the keywords bridge the language gap at embedding time.
  private expandQuery(query: string, conceptIds: string[]): string {
    if (conceptIds.length === 0) return query;

    const keywords = conceptIds.flatMap(id => {
      const concept = this.taxonomy.find(c => c.id === id);
      return concept?.rag_keywords ?? [];
    });

    if (keywords.length === 0) return query;

    // Deduplicate keywords before appending
    const unique = [...new Set(keywords)];
    return `${query} ${unique.join(' ')}`;
  }

  private static loadTaxonomy(taxonomyPath: string): TaxonomyConcept[] {
    if (!fs.existsSync(taxonomyPath)) {
      console.warn(`Taxonomy file not found at ${taxonomyPath} — query expansion disabled.`);
      return [];
    }
    const raw = JSON.parse(fs.readFileSync(taxonomyPath, 'utf-8')) as TaxonomyFile;
    return raw.concepts.map(c => ({ id: c.id, rag_keywords: c.rag_keywords }));
  }

  private static makeDefaultEmbedFn(model?: string): EmbedFunction {
    // Import here to avoid requiring OpenAI in test environments
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const OpenAI = require('openai').default as typeof import('openai').default;
    const client = new OpenAI();  // reads OPENAI_API_KEY from env
    return makeOpenAIEmbedFn(client, model ?? 'text-embedding-3-small');
  }
}

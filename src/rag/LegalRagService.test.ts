import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LegalRagService } from './LegalRagService';
import { Chunk, ChunkVector, TaxonomyConcept } from './types';
import { EmbedFunction } from './Embedder';

// ─────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────

function makeChunk(id: string, conceptIds: string[], module_relevance: string[] = ['WHT']): Chunk {
  return {
    chunk_id:         id,
    source_id:        'MF-OBJ-2025',
    section_ref:      '§2.3',
    section_title:    'Substance criteria',
    concept_ids:      conceptIds,
    module_relevance,
    language:         'pl',
    text:             `Content of chunk ${id}.`,
    char_count:       20,
  };
}

function makeVector(chunk_id: string, v: number[]): ChunkVector {
  return { chunk_id, embedding: v };
}

// Taxonomy with two concepts, each with distinct keywords
const testTaxonomy: TaxonomyConcept[] = [
  {
    id:           'headcount',
    rag_keywords: ['pracownicy', 'employees', 'personel', 'headcount'],
  },
  {
    id:           'beneficial_owner',
    rag_keywords: ['rzeczywisty właściciel', 'beneficial owner', 'Art. 4a pkt 29'],
  },
];

// A deterministic EmbedFunction: produces a unique 3D vector per unique text.
// We use a simple hash: the vector is [len, firstCharCode, sum % 1] normalised.
// What matters for tests is that the function is called and returns consistent results.
let capturedQueries: string[] = [];

const mockEmbedFn: EmbedFunction = async (texts: string[]): Promise<number[][]> => {
  capturedQueries.push(...texts);
  return texts.map(t => {
    const x = t.length % 10;
    const y = (t.charCodeAt(0) ?? 0) % 10;
    const z = t.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 10;
    const mag = Math.sqrt(x * x + y * y + z * z) || 1;
    return [x / mag, y / mag, z / mag];
  });
};

// ─────────────────────────────────────────────────────────────
// Query expansion
// ─────────────────────────────────────────────────────────────

describe('LegalRagService — query expansion', () => {

  it('appends taxonomy rag_keywords to the query before embedding', async () => {
    capturedQueries = [];

    const chunks  = [makeChunk('C1', ['headcount'])];
    const vectors = [makeVector('C1', [1, 0, 0])];
    const service = LegalRagService.fromData({ chunks, vectors, taxonomy: testTaxonomy, embedFn: mockEmbedFn });

    await service.retrieve('Does this entity have employees?', { concept_ids: ['headcount'] });

    // The captured query should contain the original text PLUS headcount keywords
    assert.ok(capturedQueries.length > 0);
    const expandedQuery = capturedQueries[0];
    assert.ok(expandedQuery.includes('pracownicy'),     'should contain Polish keyword "pracownicy"');
    assert.ok(expandedQuery.includes('employees'),      'should contain English keyword "employees"');
    assert.ok(expandedQuery.includes('Does this entity'), 'should preserve original query');
  });

  it('expands with keywords from multiple concepts', async () => {
    capturedQueries = [];

    const chunks  = [makeChunk('C1', ['headcount', 'beneficial_owner'])];
    const vectors = [makeVector('C1', [1, 0, 0])];
    const service = LegalRagService.fromData({ chunks, vectors, taxonomy: testTaxonomy, embedFn: mockEmbedFn });

    await service.retrieve('BO test query', { concept_ids: ['headcount', 'beneficial_owner'] });

    const expandedQuery = capturedQueries[0];
    assert.ok(expandedQuery.includes('pracownicy'),           'headcount PL keyword');
    assert.ok(expandedQuery.includes('rzeczywisty właściciel'), 'beneficial_owner PL keyword');
    assert.ok(expandedQuery.includes('Art. 4a pkt 29'),       'statutory reference');
  });

  it('does not expand when no concept_ids are provided', async () => {
    capturedQueries = [];

    const originalQuery = 'What is the headcount?';
    const service = LegalRagService.fromData({
      chunks:   [makeChunk('C1', ['headcount'])],
      vectors:  [makeVector('C1', [1, 0, 0])],
      taxonomy: testTaxonomy,
      embedFn:  mockEmbedFn,
    });

    await service.retrieve(originalQuery);

    // Without concept_ids, the query is passed through unchanged
    assert.equal(capturedQueries[0], originalQuery);
  });

  it('deduplicates keywords that appear in multiple concepts', async () => {
    capturedQueries = [];

    // Create two concepts that share a keyword
    const sharedKeyword = 'substance';
    const taxonomy: TaxonomyConcept[] = [
      { id: 'c1', rag_keywords: [sharedKeyword, 'unique1'] },
      { id: 'c2', rag_keywords: [sharedKeyword, 'unique2'] },
    ];

    const service = LegalRagService.fromData({
      chunks:   [makeChunk('C1', ['c1', 'c2'])],
      vectors:  [makeVector('C1', [1, 0, 0])],
      taxonomy,
      embedFn:  mockEmbedFn,
    });

    await service.retrieve('query', { concept_ids: ['c1', 'c2'] });

    const expanded = capturedQueries[0];
    // Count occurrences of the shared keyword
    const occurrences = expanded.split(sharedKeyword).length - 1;
    assert.equal(occurrences, 1, `"${sharedKeyword}" should appear exactly once`);
  });

});

// ─────────────────────────────────────────────────────────────
// Retrieval and filtering
// ─────────────────────────────────────────────────────────────

describe('LegalRagService — retrieve', () => {

  it('returns CitedChunk objects with all required fields', async () => {
    const chunk   = makeChunk('C1', ['headcount']);
    const vectors = [makeVector('C1', [1, 0, 0])];
    const service = LegalRagService.fromData({ chunks: [chunk], vectors, taxonomy: testTaxonomy, embedFn: mockEmbedFn });

    const results = await service.retrieve('employees query', { concept_ids: ['headcount'] });

    assert.ok(results.length > 0);
    const r = results[0];
    assert.ok(typeof r.chunk_id     === 'string');
    assert.ok(typeof r.source_id    === 'string');
    assert.ok(typeof r.section_ref  === 'string');
    assert.ok(typeof r.text         === 'string');
    assert.ok(typeof r.score        === 'number');
    assert.ok(Array.isArray(r.concept_ids));
  });

  it('respects module filter', async () => {
    const chunks = [
      makeChunk('WHT1',  ['headcount'], ['WHT']),
      makeChunk('TP1',   ['headcount'], ['TP_screening']),
    ];
    const vectors = [
      makeVector('WHT1', [1, 0, 0]),
      makeVector('TP1',  [1, 0, 0]),
    ];
    const service = LegalRagService.fromData({ chunks, vectors, taxonomy: testTaxonomy, embedFn: mockEmbedFn });

    const results = await service.retrieve('query', { module: 'WHT' });
    assert.ok(results.every(r => r.module_relevance.includes('WHT')));
    assert.ok(!results.some(r => r.chunk_id === 'TP1'));
  });

  it('returns empty array when knowledge base has no matching chunks', async () => {
    const service = LegalRagService.fromData({
      chunks:   [],
      vectors:  [],
      taxonomy: testTaxonomy,
      embedFn:  mockEmbedFn,
    });

    const results = await service.retrieve('any query');
    assert.deepEqual(results, []);
  });

  it('respects top_k option', async () => {
    const chunks  = ['A', 'B', 'C', 'D', 'E'].map(id => makeChunk(id, ['headcount']));
    const vectors = chunks.map((c, i) => makeVector(c.chunk_id, [1 - i * 0.1, 0, 0]));
    const service = LegalRagService.fromData({ chunks, vectors, taxonomy: testTaxonomy, embedFn: mockEmbedFn });

    const results = await service.retrieve('query', { top_k: 3 });
    assert.equal(results.length, 3);
  });

});

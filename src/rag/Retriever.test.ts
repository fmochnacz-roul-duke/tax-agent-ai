import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Retriever } from './Retriever';
import { Chunk, ChunkVector } from './types';

// ─────────────────────────────────────────────────────────────
// Test data helpers
// ─────────────────────────────────────────────────────────────

function makeChunk(overrides: Partial<Chunk> & { chunk_id: string }): Chunk {
  return {
    source_id: 'TEST-SRC',
    section_ref: '§2.3',
    section_title: 'Test section',
    concept_ids: ['headcount'],
    module_relevance: ['WHT'],
    language: 'pl',
    text: 'Test chunk content.',
    char_count: 19,
    ...overrides,
  };
}

function makeVector(chunk_id: string, embedding: number[]): ChunkVector {
  return { chunk_id, embedding };
}

// ─────────────────────────────────────────────────────────────
// Cosine similarity behaviour
// ─────────────────────────────────────────────────────────────

describe('Retriever — cosine similarity', () => {
  it('returns the highest-scoring chunk for an identical query vector', () => {
    // Two chunks with distinct embedding directions
    const chunks = [
      makeChunk({ chunk_id: 'A', text: 'Alpha content.' }),
      makeChunk({ chunk_id: 'B', text: 'Beta content.' }),
    ];
    const vectors = [makeVector('A', [1, 0, 0]), makeVector('B', [0, 1, 0])];
    const retriever = new Retriever(chunks, vectors);

    // Query identical to chunk A's vector → chunk A should score highest
    const results = retriever.search([1, 0, 0]);
    assert.equal(results[0].chunk_id, 'A');
    assert.ok(results[0].score > results[1].score);
  });

  it('returns score of 1.0 for an identical unit vector', () => {
    const chunks = [makeChunk({ chunk_id: 'X' })];
    const vectors = [makeVector('X', [0.6, 0.8])];
    const retriever = new Retriever(chunks, vectors);

    const results = retriever.search([0.6, 0.8]);
    // Allow floating-point tolerance
    assert.ok(Math.abs(results[0].score - 1.0) < 1e-9);
  });

  it('returns score of 0.0 for orthogonal vectors', () => {
    const chunks = [makeChunk({ chunk_id: 'X' })];
    const vectors = [makeVector('X', [1, 0])];
    const retriever = new Retriever(chunks, vectors);

    const results = retriever.search([0, 1]);
    assert.ok(Math.abs(results[0].score) < 1e-9);
  });

  it('handles zero-vector gracefully (returns score 0)', () => {
    const chunks = [makeChunk({ chunk_id: 'X' })];
    const vectors = [makeVector('X', [0, 0, 0])];
    const retriever = new Retriever(chunks, vectors);

    const results = retriever.search([0, 0, 0]);
    assert.equal(results[0].score, 0);
  });

  it('throws on dimension mismatch', () => {
    const chunks = [makeChunk({ chunk_id: 'X' })];
    const vectors = [makeVector('X', [1, 0, 0])];
    const retriever = new Retriever(chunks, vectors);

    assert.throws(
      () => retriever.search([1, 0]), // 2D query vs 3D chunk
      /dimension mismatch/
    );
  });
});

// ─────────────────────────────────────────────────────────────
// Filtering
// ─────────────────────────────────────────────────────────────

describe('Retriever — filtering', () => {
  const chunks = [
    makeChunk({
      chunk_id: 'A',
      concept_ids: ['headcount'],
      module_relevance: ['WHT'],
      source_id: 'SRC-1',
    }),
    makeChunk({
      chunk_id: 'B',
      concept_ids: ['conduit_entity'],
      module_relevance: ['WHT'],
      source_id: 'SRC-2',
    }),
    makeChunk({
      chunk_id: 'C',
      concept_ids: ['arm_length_principle'],
      module_relevance: ['TP_screening'],
      source_id: 'SRC-3',
    }),
  ];
  const vectors = [
    makeVector('A', [1, 0, 0]),
    makeVector('B', [1, 0, 0]),
    makeVector('C', [1, 0, 0]),
  ];
  const retriever = new Retriever(chunks, vectors);

  it('filters by concept_ids (at least one must match)', () => {
    const results = retriever.search([1, 0, 0], { concept_ids: ['headcount'] });
    assert.equal(results.length, 1);
    assert.equal(results[0].chunk_id, 'A');
  });

  it('filters by module', () => {
    const results = retriever.search([1, 0, 0], { module: 'TP_screening' });
    assert.equal(results.length, 1);
    assert.equal(results[0].chunk_id, 'C');
  });

  it('filters by source_ids', () => {
    const results = retriever.search([1, 0, 0], { source_ids: ['SRC-2', 'SRC-3'] });
    assert.equal(results.length, 2);
    const ids = results.map((r) => r.chunk_id).sort();
    assert.deepEqual(ids, ['B', 'C']);
  });

  it('returns empty array when no chunk matches the filter', () => {
    const results = retriever.search([1, 0, 0], { concept_ids: ['nonexistent_concept'] });
    assert.equal(results.length, 0);
  });

  it('combines filters with AND logic', () => {
    // concept_ids filter matches A and B; module filter keeps only B
    const results = retriever.search([1, 0, 0], {
      concept_ids: ['headcount', 'conduit_entity'],
      module: 'WHT',
      source_ids: ['SRC-2'],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].chunk_id, 'B');
  });
});

// ─────────────────────────────────────────────────────────────
// top_k and ordering
// ─────────────────────────────────────────────────────────────

describe('Retriever — top_k and ordering', () => {
  it('respects top_k limit', () => {
    const chunks = ['A', 'B', 'C', 'D'].map((id) => makeChunk({ chunk_id: id }));
    const vectors = [
      makeVector('A', [1, 0, 0]),
      makeVector('B', [0.9, 0.1, 0]),
      makeVector('C', [0.8, 0.2, 0]),
      makeVector('D', [0.7, 0.3, 0]),
    ];
    const retriever = new Retriever(chunks, vectors);
    const results = retriever.search([1, 0, 0], { top_k: 2 });
    assert.equal(results.length, 2);
  });

  it('returns results sorted by score descending', () => {
    const chunks = ['A', 'B', 'C'].map((id) => makeChunk({ chunk_id: id }));
    const vectors = [
      makeVector('A', [0.5, 0.5, 0]), // lower similarity
      makeVector('B', [0.9, 0.1, 0]), // medium
      makeVector('C', [1, 0, 0]), // highest
    ];
    const retriever = new Retriever(chunks, vectors);
    const results = retriever.search([1, 0, 0]);

    for (let i = 1; i < results.length; i++) {
      assert.ok(
        results[i - 1].score >= results[i].score,
        'results should be in descending score order'
      );
    }
    assert.equal(results[0].chunk_id, 'C');
  });

  it('excludes chunks without a precomputed vector', () => {
    const chunks = [
      makeChunk({ chunk_id: 'A' }),
      makeChunk({ chunk_id: 'B' }), // no vector for B
    ];
    const vectors = [makeVector('A', [1, 0, 0])];
    const retriever = new Retriever(chunks, vectors);

    const results = retriever.search([1, 0, 0]);
    assert.equal(results.length, 1);
    assert.equal(results[0].chunk_id, 'A');
  });
});

// ─────────────────────────────────────────────────────────────
// Phase 16 — source_type filter
// ─────────────────────────────────────────────────────────────

describe('Retriever — Phase 16 source_type filter', () => {
  const embedding = [1, 0, 0];

  // Two chunks: one statute, one guidance.
  const chunks = [
    makeChunk({ chunk_id: 'S1', source_id: 'PL-CIT-2026', source_type: 'statute' as const }),
    makeChunk({ chunk_id: 'G1', source_id: 'MF-OBJ-2025', source_type: 'guidance' as const }),
    // A chunk with no source_type — should always pass through when filter is absent.
    makeChunk({ chunk_id: 'U1', source_id: 'UNTYPED' }),
  ];
  const vectors = [
    makeVector('S1', embedding),
    makeVector('G1', embedding),
    makeVector('U1', embedding),
  ];
  const retriever = new Retriever(chunks, vectors);

  it('filters to only statute chunks when source_type is "statute"', () => {
    const results = retriever.search(embedding, { source_type: 'statute' });
    // S1 (statute) + U1 (no type → passes through) = 2 results
    assert.equal(results.length, 2);
    const ids = results.map((r) => r.chunk_id).sort();
    assert.deepEqual(ids, ['S1', 'U1']);
  });

  it('filters to only guidance chunks when source_type is "guidance"', () => {
    const results = retriever.search(embedding, { source_type: 'guidance' });
    // G1 (guidance) + U1 (no type → passes through) = 2 results
    assert.equal(results.length, 2);
    const ids = results.map((r) => r.chunk_id).sort();
    assert.deepEqual(ids, ['G1', 'U1']);
  });

  it('returns all chunks when source_type is undefined (no filter)', () => {
    const results = retriever.search(embedding);
    assert.equal(results.length, 3);
  });

  it('forwards source_type in CitedChunk when chunk carries it', () => {
    const results = retriever.search(embedding, { source_type: 'statute' });
    const statute = results.find((r) => r.chunk_id === 'S1');
    assert.ok(statute !== undefined, 'statute chunk should be in results');
    assert.equal(statute.source_type, 'statute', 'source_type should be forwarded to CitedChunk');
  });

  it('omits source_type from CitedChunk when chunk has none', () => {
    const results = retriever.search(embedding);
    const untyped = results.find((r) => r.chunk_id === 'U1');
    assert.ok(untyped !== undefined, 'untyped chunk should be in results');
    assert.ok(
      !Object.prototype.hasOwnProperty.call(untyped, 'source_type'),
      'source_type should be absent from CitedChunk when chunk has none'
    );
  });
});

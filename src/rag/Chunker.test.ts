import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Chunker } from './Chunker';

// ─────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────

// Builds a minimal valid source file string from the provided body.
function makeSource(body: string, fm: Record<string, string> = {}): string {
  const defaults = {
    source_id:        'TEST-SRC',
    language:         'pl',
    module_relevance: '[WHT]',
    concept_ids:      '[beneficial_owner, headcount]',
  };
  const merged = { ...defaults, ...fm };
  const fmLines = Object.entries(merged).map(([k, v]) => `${k}: ${v}`).join('\n');
  return `---\n${fmLines}\n---\n${body}`;
}

const chunker = new Chunker();

// ─────────────────────────────────────────────────────────────
// Frontmatter parsing
// ─────────────────────────────────────────────────────────────

describe('Chunker — frontmatter parsing', () => {

  it('reads source_id from frontmatter', () => {
    const source = makeSource('## §2.3 Title\n\nSome content here.', { source_id: 'MF-OBJ-2025' });
    const chunks = chunker.chunk(source);
    assert.ok(chunks.length > 0);
    assert.equal(chunks[0].source_id, 'MF-OBJ-2025');
  });

  it('reads language from frontmatter', () => {
    const source = makeSource('## §2.3 Title\n\nContent.', { language: 'pl' });
    const chunks = chunker.chunk(source);
    assert.equal(chunks[0].language, 'pl');
  });

  it('reads module_relevance array from frontmatter', () => {
    const source = makeSource('## §2.3 Title\n\nContent.', { module_relevance: '[WHT, TP_screening]' });
    const chunks = chunker.chunk(source);
    assert.deepEqual(chunks[0].module_relevance, ['WHT', 'TP_screening']);
  });

  it('reads concept_ids array from frontmatter', () => {
    const source = makeSource('## §2.3 Title\n\nContent.', { concept_ids: '[headcount, genuine_business_activity]' });
    const chunks = chunker.chunk(source);
    assert.deepEqual(chunks[0].concept_ids, ['headcount', 'genuine_business_activity']);
  });

  it('throws when frontmatter is missing', () => {
    assert.throws(
      () => chunker.chunk('No frontmatter here.\n\n## §2.3 Title\n\nContent.'),
      /missing YAML frontmatter/
    );
  });

  it('throws when source_id is missing from frontmatter', () => {
    const source = `---\nlanguage: pl\nmodule_relevance: [WHT]\nconcept_ids: []\n---\n\n## §2.3\n\nContent.`;
    assert.throws(
      () => chunker.chunk(source),
      /missing required field: source_id/
    );
  });

});

// ─────────────────────────────────────────────────────────────
// Body splitting
// ─────────────────────────────────────────────────────────────

describe('Chunker — body splitting', () => {

  it('produces one chunk per H2 section', () => {
    const source = makeSource([
      '## §2.2 Conduit indicators',
      '',
      'Conduit entity content here.',
      '',
      '## §2.3 Substance factors',
      '',
      'Substance factor content here.',
    ].join('\n'));

    const chunks = chunker.chunk(source);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].section_ref, '§2.2');
    assert.equal(chunks[1].section_ref, '§2.3');
  });

  it('produces one chunk per H3 section', () => {
    const source = makeSource([
      '## §2.3 Section',
      '',
      'Section intro.',
      '',
      '### §2.3.1 Subsection A',
      '',
      'Subsection A content.',
      '',
      '### §2.3.2 Subsection B',
      '',
      'Subsection B content.',
    ].join('\n'));

    const chunks = chunker.chunk(source);
    // §2.3 becomes one chunk (intro text); §2.3.1 and §2.3.2 are separate
    assert.ok(chunks.length >= 2);
    const refs = chunks.map(c => c.section_ref);
    assert.ok(refs.includes('§2.3.1'));
    assert.ok(refs.includes('§2.3.2'));
  });

  it('skips H1 lines (document title)', () => {
    const source = makeSource([
      '# Document Title',
      '',
      '## §2.3 Real section',
      '',
      'Real content here.',
    ].join('\n'));

    const chunks = chunker.chunk(source);
    assert.equal(chunks.length, 1);
    assert.ok(!chunks[0].text.startsWith('# Document Title'));
  });

  it('includes heading line in chunk text for LLM context', () => {
    const source = makeSource([
      '## §2.3 Kryteria uznania działalności',
      '',
      'Content of the section.',
    ].join('\n'));

    const chunks = chunker.chunk(source);
    assert.equal(chunks.length, 1);
    assert.ok(chunks[0].text.includes('## §2.3 Kryteria uznania działalności'));
  });

  it('creates a preamble chunk for text before the first H2', () => {
    const source = makeSource([
      'This is preamble text explaining the document.',
      '',
      '## §2.2 First real section',
      '',
      'Section content.',
    ].join('\n'));

    const chunks = chunker.chunk(source);
    assert.ok(chunks.length >= 2);
    const preamble = chunks.find(c => c.section_ref === 'preamble');
    assert.ok(preamble, 'expected a preamble chunk');
    assert.ok(preamble.text.includes('preamble text'));
  });

  it('omits sections with no meaningful content', () => {
    const source = makeSource([
      '## §2.2 Empty section',
      '',
      '## §2.3 Real section',
      '',
      'This section has content.',
    ].join('\n'));

    const chunks = chunker.chunk(source);
    const refs = chunks.map(c => c.section_ref);
    assert.ok(!refs.includes('§2.2'), 'empty section should be omitted');
    assert.ok(refs.includes('§2.3'));
  });

  it('all chunks inherit concept_ids from frontmatter', () => {
    const source = makeSource([
      '## §2.2 Section A\n\nContent A.',
      '## §2.3 Section B\n\nContent B.',
    ].join('\n'), { concept_ids: '[headcount, genuine_business_activity]' });

    const chunks = chunker.chunk(source);
    for (const chunk of chunks) {
      assert.deepEqual(chunk.concept_ids, ['headcount', 'genuine_business_activity']);
    }
  });

});

// ─────────────────────────────────────────────────────────────
// Chunk ID generation
// ─────────────────────────────────────────────────────────────

describe('Chunker — chunk_id generation', () => {

  it('chunk_id starts with source_id', () => {
    const source = makeSource('## §2.3 Title\n\nContent.', { source_id: 'MF-OBJ-2025' });
    const chunks = chunker.chunk(source);
    assert.ok(chunks[0].chunk_id.startsWith('MF-OBJ-2025::'));
  });

  it('chunk_id is unique when two sections produce the same slug', () => {
    // Two sections with the same §2.3 reference (edge case)
    const source = makeSource([
      '## §2.3 First occurrence\n\nContent of first.',
      '## §2.3 Second occurrence\n\nContent of second.',
    ].join('\n'));

    const chunks = chunker.chunk(source);
    const ids = chunks.map(c => c.chunk_id);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, 'all chunk_ids must be unique');
  });

});

// ─────────────────────────────────────────────────────────────
// Section reference extraction
// ─────────────────────────────────────────────────────────────

describe('Chunker — extractSectionRef', () => {

  it('extracts Polish section symbol (§2.3)', () => {
    assert.equal(chunker.extractSectionRef('§2.3 Kryteria uznania'), '§2.3');
  });

  it('extracts Polish article reference (Art. 4a pkt 29)', () => {
    assert.equal(chunker.extractSectionRef('Art. 4a pkt 29 — Definicja rzeczywistego właściciela'), 'Art. 4a pkt 29');
  });

  it('extracts English article reference (Article 1)', () => {
    assert.equal(chunker.extractSectionRef('Article 1 — Scope of application'), 'Article 1');
  });

  it('extracts OECD decimal reference (6.32)', () => {
    assert.equal(chunker.extractSectionRef('6.32 Development functions'), '6.32');
  });

  it('falls back to first 40 chars for unrecognised patterns', () => {
    const heading = 'Introduction to the beneficial owner concept';
    const result  = chunker.extractSectionRef(heading);
    assert.equal(result, heading.slice(0, 40).trim());
  });

});

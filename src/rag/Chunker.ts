import { Chunk, SourceFrontmatter } from './types';

// ─────────────────────────────────────────────────────────────
// Chunker
//
// Converts a source Markdown file (with YAML frontmatter) into
// an array of Chunk objects — one chunk per H2/H3 section.
//
// Expected source file format:
//
//   ---
//   source_id: MF-OBJ-2025
//   language: pl
//   module_relevance: [WHT]
//   concept_ids: [headcount, physical_office_presence, decision_making_independence]
//   ---
//
//   # Document Title          ← H1 is skipped (not a chunk boundary)
//
//   Preamble text...          ← becomes a "preamble" chunk if non-empty
//
//   ## §2.3 Section Title     ← H2 starts a new chunk
//
//   Section content...
//
//   ### §2.3.1 Subsection     ← H3 also starts a new chunk
//
//   Subsection content...
//
// The heading line is included at the top of each chunk's text so the
// LLM receives full context when the chunk is injected into the prompt.
//
// concept_ids from the frontmatter are inherited by every chunk in the
// document.  For finer-grained tagging, split the source into one file
// per section (each with its own narrower concept_ids in the frontmatter).
// ─────────────────────────────────────────────────────────────

export class Chunker {
  chunk(sourceContent: string): Chunk[] {
    const { frontmatter, body } = this.parseFrontmatter(sourceContent);
    return this.splitIntoChunks(frontmatter, body);
  }

  // ── Frontmatter parsing ────────────────────────────────────

  private parseFrontmatter(content: string): { frontmatter: SourceFrontmatter; body: string } {
    // Match the --- ... --- block at the very start of the file.
    // \r?\n handles both Unix (LF) and Windows (CRLF) line endings.
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) {
      throw new Error(
        'Source file is missing YAML frontmatter. ' +
          'The file must start with a ---\\n...\\n---\\n block.'
      );
    }
    const [, fmText, body] = match;
    return {
      frontmatter: this.parseFmFields(fmText),
      body: body.trim(),
    };
  }

  // Parses simple YAML: scalar values and [comma, separated, arrays].
  // We intentionally do not use a YAML library to avoid adding a dependency.
  private parseFmFields(text: string): SourceFrontmatter {
    const fields: Record<string, string | string[]> = {};

    for (const line of text.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const key = line.slice(0, colonIdx).trim();
      const rawValue = line.slice(colonIdx + 1).trim();

      if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
        const inner = rawValue.slice(1, -1);
        fields[key] = inner
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      } else {
        fields[key] = rawValue;
      }
    }

    const str = (k: string): string => (typeof fields[k] === 'string' ? (fields[k] as string) : '');
    const arr = (k: string): string[] => (Array.isArray(fields[k]) ? (fields[k] as string[]) : []);

    const sourceId = str('source_id');
    if (!sourceId) {
      throw new Error('Frontmatter is missing required field: source_id');
    }

    return {
      source_id: sourceId,
      language: str('language') || 'en',
      module_relevance: arr('module_relevance'),
      concept_ids: arr('concept_ids'),
      last_verified: str('last_verified') || undefined,
    };
  }

  // ── Body splitting ─────────────────────────────────────────

  private splitIntoChunks(fm: SourceFrontmatter, body: string): Chunk[] {
    const lines = body.split('\n');
    const chunks: Chunk[] = [];

    // Track used chunk_ids and add a numeric suffix on collision
    // (e.g. if two sections happen to resolve to the same slug).
    const usedIds = new Set<string>();

    let currentRef = 'preamble';
    let currentTitle = 'Document Preamble';
    let currentLines: string[] = [];

    // Flushes the accumulated lines as a Chunk (if there is real content).
    const flushChunk = (): void => {
      const text = currentLines.join('\n').trim();

      // A chunk consisting only of its own heading line has no content.
      const contentWithoutHeading = text.replace(/^#{2,3}\s+.+(\r?\n|$)/, '').trim();
      if (!contentWithoutHeading) return;

      // Deduplicate IDs if the same section slug appears more than once.
      const baseId = `${fm.source_id}::${this.slugify(currentRef)}`;
      let chunk_id = baseId;
      let suffix = 1;
      while (usedIds.has(chunk_id)) {
        chunk_id = `${baseId}-${suffix++}`;
      }
      usedIds.add(chunk_id);

      chunks.push({
        chunk_id,
        source_id: fm.source_id,
        section_ref: currentRef,
        section_title: currentTitle,
        concept_ids: [...fm.concept_ids],
        module_relevance: [...fm.module_relevance],
        language: fm.language,
        last_verified: fm.last_verified,
        text,
        char_count: text.length,
      });
    };

    for (const line of lines) {
      // H1 lines are the document title — skip them entirely.
      if (/^# [^#]/.test(line)) continue;

      // H2 or H3 lines start a new chunk.
      const headingMatch = line.match(/^(#{2,3}) (.+)$/);
      if (headingMatch) {
        flushChunk();
        const headingText = headingMatch[2].trim();
        currentRef = this.extractSectionRef(headingText);
        currentTitle = headingText;
        currentLines = [line]; // heading is the first line of the new chunk
        continue;
      }

      currentLines.push(line);
    }

    flushChunk(); // flush the final section

    return chunks;
  }

  // ── Helpers ────────────────────────────────────────────────

  // Extracts the canonical reference from a heading string.
  // The reference is the shortest identifier that is legally meaningful.
  //
  // "§2.3 Kryteria uznania..."         → "§2.3"
  // "Art. 4a pkt 29 — Definicja..."    → "Art. 4a pkt 29"
  // "Article 1 — Scope"                → "Article 1"
  // "6.32 Development functions"        → "6.32"
  extractSectionRef(heading: string): string {
    const patterns: RegExp[] = [
      /^(§[\d.]+)/,
      /^(art\.\s*\d+[a-z]*(?:\s+(?:ust|pkt|lit)\.?\s*\d+[a-z]*)*)/i,
      /^(article\s+\d+[a-z]*)/i,
      /^(\d+(?:\.\d+)+)/,
    ];
    for (const p of patterns) {
      const m = heading.match(p);
      if (m) return m[1].trim();
    }
    return heading.slice(0, 40).trim();
  }

  // Converts a section reference into a URL-safe slug for use in chunk_id.
  // "§2.3" → "23", "Art. 4a pkt 29" → "art-4a-pkt-29"
  private slugify(s: string): string {
    return s
      .toLowerCase()
      .replace(/§/g, '')
      .replace(/[.]/g, '')
      .replace(/[\s/]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

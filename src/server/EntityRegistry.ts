// ─────────────────────────────────────────────────────────────────────────────
// EntityRegistry — Phase 11
//
// Persists a lightweight summary of every completed WHT analysis to
// data/registry.json so the tax team has an audit trail and can avoid
// repeating the same groundwork for known entities.
//
// Key design decisions:
//
//   1. Storage format: JSON (not SQLite) — human-readable, zero extra
//      dependencies, sufficient for the target user count (1–3 analysts).
//      Phase 14 (batch processing) can migrate to SQLite if needed.
//
//   2. Lookup key: entity_name + country, both lowercased and trimmed.
//      A second analysis of the same entity updates the existing entry
//      (upsert), preserving the original created_at timestamp and the
//      review_status a tax professional may have set manually.
//
//   3. No import from BeneficialOwnerAgent.ts — circular dependency
//      avoided.  The save() method accepts an AnalysisReport interface
//      defined here.  WhtReport from BeneficialOwnerAgent satisfies it
//      via TypeScript structural typing without needing an explicit import.
//
//   4. The registry file path defaults to data/registry.json at the
//      project root, but can be overridden in the constructor — tests
//      pass a temp path to avoid touching the real file.
//
// Registry file format (data/registry.json):
//
//   { "entries": [ <RegistryEntry>, ... ] }
//
//   Entries are sorted newest-updated-first.  Each entry stores enough
//   to answer "have we seen this entity before and what did we conclude?"
//   without loading the full report from disk.
// ─────────────────────────────────────────────────────────────────────────────

import * as fs   from 'fs';
import * as path from 'path';
import * as os   from 'os';

// ── Types ─────────────────────────────────────────────────────────────────────

// ReviewStatus describes where a report is in the human-review workflow.
//   draft       — machine output, not yet reviewed by a tax professional
//   reviewed    — a professional has read it (not yet ready to act on)
//   signed_off  — a professional has approved it; safe to act on
//
// We default to 'draft' and never downgrade a status automatically —
// a professional who signed off stays signed off unless they explicitly
// change it.
export type ReviewStatus = 'draft' | 'reviewed' | 'signed_off';

// RegistryEntry is what gets stored per entity/country pair.
// The fields with ? are optional because not every analysis produces them
// (e.g. substance_tier is only present when check_entity_substance was called).
export interface RegistryEntry {
  entity_name:        string;
  country:            string;
  income_type:        string;
  review_status:      ReviewStatus;
  data_confidence:    'HIGH' | 'MEDIUM' | 'LOW';
  substance_tier?:    string;    // STRONG / ADEQUATE / WEAK / CONDUIT
  bo_overall?:        string;    // PASS / FAIL / UNCERTAIN from bo_preliminary.overall
  conclusion_summary: string;    // first 200 chars of the agent's conclusion
  created_at:         string;    // ISO 8601 — set once on first analysis, never changed
  updated_at:         string;    // ISO 8601 — updated on every re-analysis
  report_path?:       string;    // path to the full JSON report on disk
  // Phase 12b: human review fields — set by updateReviewStatus(), never by save()
  reviewer_note?:     string;    // free-text note from the reviewer
  reviewed_at?:       string;    // ISO 8601 — date of the last review action
  reviewed_by?:       string;    // name of the reviewer (free text)
}

// AnalysisReport describes the fields EntityRegistry.save() needs from the
// completed analysis.  WhtReport (from BeneficialOwnerAgent.ts) satisfies this
// interface automatically via structural typing — no import needed.
export interface AnalysisReport {
  entity_name:     string;
  country:         string;
  income_type:     string;
  data_confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  conclusion:      string;
  findings:        Record<string, unknown>;
}

// RegistryFile is the shape of the JSON file on disk.
interface RegistryFile {
  entries: RegistryEntry[];
}

// ── EntityRegistry ────────────────────────────────────────────────────────────

export class EntityRegistry {
  // filePath: where registry.json lives.
  // entries:  in-memory Map from registry key → entry.
  //           We keep a Map while the process is running so lookups are O(1),
  //           and write the full array to disk on every change.

  private filePath: string;
  private entries: Map<string, RegistryEntry>;

  constructor(filePath?: string) {
    // When no path is given, resolve relative to the project root.
    // path.resolve() with no base uses the current working directory
    // (which is the project root when running npm scripts).
    this.filePath = filePath ?? path.resolve('data', 'registry.json');
    this.entries  = this.loadFromDisk();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  // save() stores or updates the registry entry for an entity after an analysis.
  // If the entity/country pair already exists:
  //   - created_at is preserved (keeps the first-analysis date)
  //   - review_status is preserved (a professional's sign-off is not wiped)
  //   - all other fields are replaced with the latest values
  // Returns the saved entry so callers can log it.
  save(report: AnalysisReport, reportPath?: string): RegistryEntry {
    const key      = this.makeKey(report.entity_name, report.country);
    const existing = this.entries.get(key);
    const now      = new Date().toISOString();

    // Extract substance_tier and bo_preliminary.overall from the findings map.
    // findings['entity_substance'] is the parsed SubstanceResult object (or absent
    // if the agent never called check_entity_substance).
    const { substanceTier, boOverall } = extractSubstanceFields(report.findings);

    const entry: RegistryEntry = {
      entity_name:        report.entity_name,
      country:            report.country,
      income_type:        report.income_type,
      // Preserve the review status a professional set — never auto-downgrade.
      review_status:      existing?.review_status ?? 'draft',
      data_confidence:    report.data_confidence,
      // Spread optional fields only when they have values
      ...(substanceTier !== undefined ? { substance_tier: substanceTier } : {}),
      ...(boOverall     !== undefined ? { bo_overall:     boOverall }     : {}),
      // Truncate long conclusions so the registry stays compact.
      // A tax professional can open the full report for the complete text.
      conclusion_summary: report.conclusion.slice(0, 200),
      created_at:         existing?.created_at ?? now,
      updated_at:         now,
      ...(reportPath !== undefined ? { report_path: reportPath } : {}),
    };

    this.entries.set(key, entry);
    this.persist();
    return entry;
  }

  // findByEntity() looks up the most recent analysis for an entity/country pair.
  // Returns undefined when the entity has never been analysed before.
  findByEntity(entityName: string, country: string): RegistryEntry | undefined {
    return this.entries.get(this.makeKey(entityName, country));
  }

  // listAll() returns all entries sorted newest-first (by updated_at).
  listAll(): RegistryEntry[] {
    return [...this.entries.values()].sort(
      (a, b) => b.updated_at.localeCompare(a.updated_at)
    );
  }

  // size() — how many unique entity/country pairs are in the registry.
  size(): number {
    return this.entries.size;
  }

  // updateReviewStatus() allows a human reviewer to progress an entry through
  // the review workflow: draft → reviewed → signed_off (or back to draft).
  //
  // Parameters:
  //   entityName   — must match the entity_name used when save() was called
  //   country      — same case-insensitive match as save()
  //   status       — the new ReviewStatus to set
  //   reviewerNote — optional free-text note (overwrites any previous note)
  //   reviewedBy   — optional reviewer name (overwrites any previous name)
  //
  // Returns the updated entry, or undefined if the entity/country pair is not
  // found in the registry.
  updateReviewStatus(
    entityName:   string,
    country:      string,
    status:       ReviewStatus,
    reviewerNote?: string,
    reviewedBy?:   string
  ): RegistryEntry | undefined {
    const key     = this.makeKey(entityName, country);
    const existing = this.entries.get(key);
    if (existing === undefined) return undefined;

    // Build the updated entry. The spread operator (...existing) copies all
    // current fields, then we override only the review-related ones.
    // The conditional spreads (...(x !== undefined ? { field: x } : {})) only
    // add the field when a value was provided — passing undefined does NOT
    // clear a previously-set reviewer_note or reviewed_by.
    const updated: RegistryEntry = {
      ...existing,
      review_status: status,
      reviewed_at:   new Date().toISOString(),
      ...(reviewerNote !== undefined ? { reviewer_note: reviewerNote } : {}),
      ...(reviewedBy   !== undefined ? { reviewed_by:   reviewedBy }   : {}),
    };

    this.entries.set(key, updated);
    this.persist();
    return updated;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  // makeKey() builds a stable, case-insensitive lookup key.
  // "Orange S.A." + "France" → "orange s.a.::france"
  // We normalise here so slight name variations in future don't create duplicates.
  private makeKey(entityName: string, country: string): string {
    return `${entityName.trim().toLowerCase()}::${country.trim().toLowerCase()}`;
  }

  // loadFromDisk() reads registry.json if it exists and returns a populated Map.
  // If the file is missing or corrupted, returns an empty Map — fresh start.
  private loadFromDisk(): Map<string, RegistryEntry> {
    const map = new Map<string, RegistryEntry>();
    if (!fs.existsSync(this.filePath)) return map;

    try {
      const raw    = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as RegistryFile;

      for (const entry of parsed.entries) {
        map.set(this.makeKey(entry.entity_name, entry.country), entry);
      }
    } catch {
      // Corrupted file — log to console but continue with an empty registry
      // rather than crashing the server/agent.
      console.warn('[EntityRegistry] registry.json is corrupted — starting fresh');
    }

    return map;
  }

  // persist() writes the current in-memory Map back to registry.json.
  // Called after every save() so the file is always up to date.
  // mkdirSync with recursive:true creates data/ if it doesn't exist yet.
  private persist(): void {
    const data: RegistryFile = { entries: this.listAll() };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

// ── Module-level helper ───────────────────────────────────────────────────────
//
// extractSubstanceFields() pulls substance_tier and bo_preliminary.overall
// out of the findings map.  It is a standalone function (not a class method)
// because the logic is self-contained and easier to unit-test in isolation.
//
// findings['entity_substance'] is already parsed (WhtReport.findings is
// Record<string, unknown> — the agent called parseFindings() before saving).
// We do a runtime type-check at every level because the shape comes from the
// LLM and can theoretically deviate from the TypeScript interface.

export function extractSubstanceFields(findings: Record<string, unknown>): {
  substanceTier: string | undefined;
  boOverall:     string | undefined;
} {
  const sub = findings['entity_substance'];

  if (sub === null || typeof sub !== 'object') {
    return { substanceTier: undefined, boOverall: undefined };
  }

  const subObj = sub as Record<string, unknown>;

  const substanceTier =
    typeof subObj['substance_tier'] === 'string'
      ? subObj['substance_tier']
      : undefined;

  const boPrelim = subObj['bo_preliminary'];
  const boOverall =
    boPrelim !== null && typeof boPrelim === 'object'
      ? (boPrelim as Record<string, unknown>)['overall']
      : undefined;

  return {
    substanceTier,
    boOverall: typeof boOverall === 'string' ? boOverall : undefined,
  };
}

// ── Singleton helper for the web server ──────────────────────────────────────
//
// The web server creates exactly one registry instance at startup and reuses it
// for the lifetime of the process.  This is exported so server/index.ts can call
// getRegistry() instead of managing the lifecycle itself.
//
// Tests should never call getRegistry() — they create their own instances with
// a temp file path.

let _registry: EntityRegistry | undefined;

export function getRegistry(): EntityRegistry {
  if (_registry === undefined) {
    _registry = new EntityRegistry();
  }
  return _registry;
}

// Exported for tests that need to inspect the temp-path pattern.
export { os };

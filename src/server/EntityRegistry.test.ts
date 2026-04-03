// ─────────────────────────────────────────────────────────────────────────────
// EntityRegistry — unit tests
//
// EntityRegistry is pure I/O logic: reads/writes JSON, no LLM calls, no async.
// Every test creates its own temp file so the real data/registry.json is never
// touched.  The temp file is deleted in a teardown after each test.
//
// Coverage:
//   - save() creates a new entry for an unknown entity
//   - save() updates (upserts) when the entity/country pair is already known
//   - save() preserves created_at on upsert
//   - save() preserves review_status on upsert
//   - save() truncates conclusion to 200 chars
//   - save() extracts substance_tier and bo_overall from findings
//   - findByEntity() returns the entry by name/country
//   - findByEntity() returns undefined for an unknown entity
//   - listAll() returns entries sorted newest-first
//   - size() reflects the number of unique entity/country pairs
//   - Constructor: loads an existing registry file on startup
//   - Constructor: handles a missing file gracefully (fresh start)
//   - Constructor: handles a corrupted file gracefully (fresh start)
//   - extractSubstanceFields() extracts tier and bo_overall
//   - extractSubstanceFields() returns undefineds when findings is empty
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { EntityRegistry, extractSubstanceFields, AnalysisReport } from './EntityRegistry';

// ── Helpers ───────────────────────────────────────────────────────────────────

// makeTempPath() returns a unique file path in the OS temp directory.
// Using Date.now() + a counter ensures uniqueness even when tests run in
// parallel (node:test can run describe blocks concurrently).
let counter = 0;
function makeTempPath(): string {
  return path.join(os.tmpdir(), `registry_test_${Date.now()}_${counter++}.json`);
}

// A minimal valid AnalysisReport — the fields EntityRegistry.save() needs.
// Uses TypeScript's Readonly<> to prevent accidental mutation in tests.
function makeReport(overrides: Partial<AnalysisReport> = {}): AnalysisReport {
  return {
    entity_name: 'Alpine Holdings S.A.',
    country: 'Luxembourg',
    income_type: 'dividend',
    data_confidence: 'LOW',
    conclusion: 'The entity fails the beneficial owner test. Condition (ii) is not met.',
    findings: {},
    ...overrides,
  };
}

// A SubstanceResult object matching the shape stored in WhtReport.findings.
// findings['entity_substance'] is the *parsed* object (not a JSON string),
// because buildReport() calls parseFindings() before saving.
function makeSubstanceFinding(tier: string, boOverall: string): Record<string, unknown> {
  return {
    entity_substance: {
      substance_tier: tier,
      bo_preliminary: {
        overall: boOverall,
      },
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EntityRegistry', () => {
  let tempPath: string;

  beforeEach(() => {
    tempPath = makeTempPath();
  });

  afterEach(() => {
    // Clean up the temp file if it was created
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  });

  // ── save() ──────────────────────────────────────────────────────────────────

  it('save() creates a new entry for an unknown entity', () => {
    const registry = new EntityRegistry(tempPath);
    const report = makeReport();

    const entry = registry.save(report);

    assert.equal(entry.entity_name, 'Alpine Holdings S.A.');
    assert.equal(entry.country, 'Luxembourg');
    assert.equal(entry.income_type, 'dividend');
    assert.equal(entry.review_status, 'draft');
    assert.equal(entry.data_confidence, 'LOW');
    assert.ok(entry.created_at.length > 0);
    assert.ok(entry.updated_at.length > 0);
  });

  it('save() persists to disk — file is readable after save', () => {
    const registry = new EntityRegistry(tempPath);
    registry.save(makeReport());

    // File must exist and parse correctly
    assert.ok(fs.existsSync(tempPath));
    const raw = fs.readFileSync(tempPath, 'utf-8');
    const parsed = JSON.parse(raw) as { entries: unknown[] };
    assert.equal(parsed.entries.length, 1);
  });

  it('save() upserts — calling save() twice for the same entity replaces the entry', () => {
    const registry = new EntityRegistry(tempPath);
    registry.save(makeReport({ data_confidence: 'LOW' }));
    registry.save(makeReport({ data_confidence: 'MEDIUM' }));

    assert.equal(registry.size(), 1);
    const entry = registry.findByEntity('Alpine Holdings S.A.', 'Luxembourg');
    assert.equal(entry?.data_confidence, 'MEDIUM');
  });

  it('save() preserves created_at on upsert', () => {
    const registry = new EntityRegistry(tempPath);
    const first = registry.save(makeReport());

    // Small delay is not needed — we just want to confirm created_at is copied
    const second = registry.save(makeReport({ data_confidence: 'MEDIUM' }));

    assert.equal(second.created_at, first.created_at);
  });

  it('save() preserves review_status set by a professional on upsert', () => {
    const registry = new EntityRegistry(tempPath);

    // First analysis — default status is draft
    registry.save(makeReport());

    // Simulate a professional manually updating the status in the JSON
    const raw = fs.readFileSync(tempPath, 'utf-8');
    const data = JSON.parse(raw) as { entries: Array<{ review_status: string }> };
    data.entries[0].review_status = 'signed_off';
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');

    // Re-run the analysis (re-analysis)
    const registry2 = new EntityRegistry(tempPath);
    const entry = registry2.save(makeReport({ data_confidence: 'HIGH' }));

    // The professional's sign-off must survive
    assert.equal(entry.review_status, 'signed_off');
  });

  it('save() truncates conclusion to 200 characters', () => {
    const longConclusion = 'A'.repeat(300);
    const registry = new EntityRegistry(tempPath);
    const entry = registry.save(makeReport({ conclusion: longConclusion }));

    assert.equal(entry.conclusion_summary.length, 200);
  });

  it('save() stores conclusion verbatim when it is shorter than 200 characters', () => {
    const short = 'Short conclusion.';
    const registry = new EntityRegistry(tempPath);
    const entry = registry.save(makeReport({ conclusion: short }));

    assert.equal(entry.conclusion_summary, short);
  });

  it('save() stores the report_path when provided', () => {
    const registry = new EntityRegistry(tempPath);
    const entry = registry.save(makeReport(), 'reports/alpine_2026-04-02.json');

    assert.equal(entry.report_path, 'reports/alpine_2026-04-02.json');
  });

  it('save() extracts substance_tier and bo_overall from findings', () => {
    const registry = new EntityRegistry(tempPath);
    const findings = makeSubstanceFinding('WEAK', 'FAIL');
    const entry = registry.save(makeReport({ findings }));

    assert.equal(entry.substance_tier, 'WEAK');
    assert.equal(entry.bo_overall, 'FAIL');
  });

  it('save() leaves substance_tier and bo_overall absent when findings is empty', () => {
    const registry = new EntityRegistry(tempPath);
    const entry = registry.save(makeReport({ findings: {} }));

    assert.equal(entry.substance_tier, undefined);
    assert.equal(entry.bo_overall, undefined);
  });

  it('save() is case-insensitive — same entity with different capitalisation upserts', () => {
    const registry = new EntityRegistry(tempPath);
    registry.save(makeReport({ entity_name: 'Orange S.A.', country: 'France' }));
    registry.save(makeReport({ entity_name: 'ORANGE S.A.', country: 'FRANCE' }));

    // Both normalise to the same key — still one entry
    assert.equal(registry.size(), 1);
  });

  // ── findByEntity() ──────────────────────────────────────────────────────────

  it('findByEntity() returns the entry for a known entity/country', () => {
    const registry = new EntityRegistry(tempPath);
    registry.save(makeReport());

    const entry = registry.findByEntity('Alpine Holdings S.A.', 'Luxembourg');
    assert.ok(entry !== undefined);
    assert.equal(entry.entity_name, 'Alpine Holdings S.A.');
  });

  it('findByEntity() is case-insensitive', () => {
    const registry = new EntityRegistry(tempPath);
    registry.save(makeReport());

    const entry = registry.findByEntity('ALPINE HOLDINGS S.A.', 'LUXEMBOURG');
    assert.ok(entry !== undefined);
  });

  it('findByEntity() returns undefined for an unknown entity', () => {
    const registry = new EntityRegistry(tempPath);
    const entry = registry.findByEntity('Unknown Corp', 'Germany');
    assert.equal(entry, undefined);
  });

  // ── listAll() ───────────────────────────────────────────────────────────────

  it('listAll() returns all entries sorted newest-first by updated_at', () => {
    const registry = new EntityRegistry(tempPath);

    registry.save(makeReport({ entity_name: 'A Corp', country: 'France' }));
    registry.save(makeReport({ entity_name: 'B Holdings', country: 'Germany' }));
    registry.save(makeReport({ entity_name: 'C Ltd', country: 'Malta' }));

    const list = registry.listAll();
    assert.equal(list.length, 3);
    // Newest-first: C Ltd was saved last
    assert.equal(list[0].entity_name, 'C Ltd');
  });

  it('listAll() returns an empty array when the registry is empty', () => {
    const registry = new EntityRegistry(tempPath);
    assert.deepEqual(registry.listAll(), []);
  });

  // ── size() ──────────────────────────────────────────────────────────────────

  it('size() reflects the number of unique entity/country pairs', () => {
    const registry = new EntityRegistry(tempPath);
    assert.equal(registry.size(), 0);

    registry.save(makeReport({ entity_name: 'A', country: 'France' }));
    assert.equal(registry.size(), 1);

    registry.save(makeReport({ entity_name: 'B', country: 'Germany' }));
    assert.equal(registry.size(), 2);

    // Upsert — size does not increase
    registry.save(makeReport({ entity_name: 'A', country: 'France' }));
    assert.equal(registry.size(), 2);
  });

  // ── Constructor: persistence across instances ────────────────────────────────

  it('Constructor loads an existing registry file — entries survive process restart', () => {
    // First instance writes to disk
    const registry1 = new EntityRegistry(tempPath);
    registry1.save(makeReport());

    // Second instance reads from the same file
    const registry2 = new EntityRegistry(tempPath);
    assert.equal(registry2.size(), 1);

    const entry = registry2.findByEntity('Alpine Holdings S.A.', 'Luxembourg');
    assert.ok(entry !== undefined);
    assert.equal(entry.income_type, 'dividend');
  });

  it('Constructor handles a missing file gracefully (fresh start)', () => {
    // tempPath does not exist yet — no error, empty registry
    const registry = new EntityRegistry(tempPath);
    assert.equal(registry.size(), 0);
  });

  it('Constructor handles a corrupted JSON file gracefully (fresh start)', () => {
    // Write garbage bytes to simulate a corrupted file
    fs.writeFileSync(tempPath, 'not json at all!!!');
    const registry = new EntityRegistry(tempPath);
    assert.equal(registry.size(), 0);
  });
});

// ── updateReviewStatus() ─────────────────────────────────────────────────────

describe('updateReviewStatus', () => {
  // Each test uses its own temp file, same pattern as the EntityRegistry suite.
  let tempPath: string;
  beforeEach(() => {
    tempPath = makeTempPath();
  });
  afterEach(() => {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      /* already gone */
    }
  });

  it('returns undefined for an unknown entity', () => {
    const registry = new EntityRegistry(tempPath);
    const result = registry.updateReviewStatus('Unknown Corp', 'Germany', 'reviewed');
    assert.equal(result, undefined);
  });

  it('changes review_status from draft to reviewed', () => {
    const registry = new EntityRegistry(tempPath);
    registry.save(makeReport());
    const updated = registry.updateReviewStatus('Alpine Holdings S.A.', 'Luxembourg', 'reviewed');
    assert.ok(updated !== undefined);
    assert.equal(updated.review_status, 'reviewed');
  });

  it('changes review_status from draft to signed_off', () => {
    const registry = new EntityRegistry(tempPath);
    registry.save(makeReport());
    const updated = registry.updateReviewStatus('Alpine Holdings S.A.', 'Luxembourg', 'signed_off');
    assert.ok(updated !== undefined);
    assert.equal(updated.review_status, 'signed_off');
  });

  it('allows resetting signed_off back to draft', () => {
    const registry = new EntityRegistry(tempPath);
    registry.save(makeReport());
    registry.updateReviewStatus('Alpine Holdings S.A.', 'Luxembourg', 'signed_off');
    const reset = registry.updateReviewStatus('Alpine Holdings S.A.', 'Luxembourg', 'draft');
    assert.ok(reset !== undefined);
    assert.equal(reset.review_status, 'draft');
  });

  it('sets reviewed_at to a valid ISO datetime string', () => {
    const registry = new EntityRegistry(tempPath);
    registry.save(makeReport());
    const updated = registry.updateReviewStatus('Alpine Holdings S.A.', 'Luxembourg', 'reviewed');
    assert.ok(updated?.reviewed_at !== undefined);
    // ISO 8601 datetime contains a T separator between date and time
    assert.ok(updated!.reviewed_at!.includes('T'), 'reviewed_at must be a full ISO datetime');
  });

  it('stores reviewer_note when provided', () => {
    const registry = new EntityRegistry(tempPath);
    registry.save(makeReport());
    const updated = registry.updateReviewStatus(
      'Alpine Holdings S.A.',
      'Luxembourg',
      'reviewed',
      'Checked against treaty PDF — rates confirmed'
    );
    assert.equal(updated?.reviewer_note, 'Checked against treaty PDF — rates confirmed');
  });

  it('stores reviewed_by when provided', () => {
    const registry = new EntityRegistry(tempPath);
    registry.save(makeReport());
    const updated = registry.updateReviewStatus(
      'Alpine Holdings S.A.',
      'Luxembourg',
      'reviewed',
      undefined,
      'Jan Kowalski'
    );
    assert.equal(updated?.reviewed_by, 'Jan Kowalski');
  });

  it('stores both reviewer_note and reviewed_by when provided', () => {
    const registry = new EntityRegistry(tempPath);
    registry.save(makeReport());
    const updated = registry.updateReviewStatus(
      'Alpine Holdings S.A.',
      'Luxembourg',
      'signed_off',
      'All conditions verified',
      'Anna Nowak'
    );
    assert.equal(updated?.reviewer_note, 'All conditions verified');
    assert.equal(updated?.reviewed_by, 'Anna Nowak');
  });

  it('does not clear an existing reviewer_note when none is provided', () => {
    const registry = new EntityRegistry(tempPath);
    registry.save(makeReport());
    // First update: set a note
    registry.updateReviewStatus('Alpine Holdings S.A.', 'Luxembourg', 'reviewed', 'First note');
    // Second update: no note argument — should keep the first note
    const updated = registry.updateReviewStatus('Alpine Holdings S.A.', 'Luxembourg', 'signed_off');
    assert.equal(updated?.reviewer_note, 'First note');
  });

  it('persists to disk — review_status survives a registry reload', () => {
    const registry = new EntityRegistry(tempPath);
    registry.save(makeReport());
    registry.updateReviewStatus('Alpine Holdings S.A.', 'Luxembourg', 'signed_off');

    // Reload from disk — simulates server restart
    const reloaded = new EntityRegistry(tempPath);
    const entry = reloaded.findByEntity('Alpine Holdings S.A.', 'Luxembourg');
    assert.equal(entry?.review_status, 'signed_off');
  });

  it('is case-insensitive — matches regardless of capitalisation', () => {
    const registry = new EntityRegistry(tempPath);
    registry.save(makeReport());
    const updated = registry.updateReviewStatus('ALPINE HOLDINGS S.A.', 'LUXEMBOURG', 'reviewed');
    assert.ok(updated !== undefined);
    assert.equal(updated.review_status, 'reviewed');
  });

  it('does not change created_at or updated_at from save()', () => {
    const registry = new EntityRegistry(tempPath);
    registry.save(makeReport());
    const before = registry.findByEntity('Alpine Holdings S.A.', 'Luxembourg')!;

    registry.updateReviewStatus('Alpine Holdings S.A.', 'Luxembourg', 'reviewed');
    const after = registry.findByEntity('Alpine Holdings S.A.', 'Luxembourg')!;

    // The analysis timestamp must not change when someone just updates review status
    assert.equal(after.created_at, before.created_at);
    assert.equal(after.updated_at, before.updated_at);
  });
});

// ── extractSubstanceFields() ─────────────────────────────────────────────────

describe('extractSubstanceFields', () => {
  it('extracts substance_tier and bo_overall when both are present', () => {
    const findings = makeSubstanceFinding('STRONG', 'PASS');
    const result = extractSubstanceFields(findings);

    assert.equal(result.substanceTier, 'STRONG');
    assert.equal(result.boOverall, 'PASS');
  });

  it('returns undefineds when entity_substance is absent', () => {
    const result = extractSubstanceFields({});
    assert.equal(result.substanceTier, undefined);
    assert.equal(result.boOverall, undefined);
  });

  it('returns undefineds when entity_substance is null', () => {
    const result = extractSubstanceFields({ entity_substance: null });
    assert.equal(result.substanceTier, undefined);
    assert.equal(result.boOverall, undefined);
  });

  it('returns undefined substanceTier when substance_tier is not a string', () => {
    const findings = {
      entity_substance: { substance_tier: 42, bo_preliminary: { overall: 'PASS' } },
    };
    const result = extractSubstanceFields(findings);
    assert.equal(result.substanceTier, undefined);
    assert.equal(result.boOverall, 'PASS');
  });

  it('returns undefined boOverall when bo_preliminary is absent', () => {
    const findings = { entity_substance: { substance_tier: 'ADEQUATE' } };
    const result = extractSubstanceFields(findings);
    assert.equal(result.substanceTier, 'ADEQUATE');
    assert.equal(result.boOverall, undefined);
  });

  it('returns undefined boOverall when overall is not a string', () => {
    const findings = {
      entity_substance: { substance_tier: 'WEAK', bo_preliminary: { overall: false } },
    };
    const result = extractSubstanceFields(findings);
    assert.equal(result.boOverall, undefined);
  });
});

// ── Phase 15: force-draft on REJECTED bo_overall ──────────────────────────────
//
// A REJECTED verdict may indicate a conduit structure — an existing sign-off
// must not survive a re-analysis that returns REJECTED.
//
describe('EntityRegistry.save() — force-draft on REJECTED', () => {
  let tmpPath: string;
  let registry: EntityRegistry;

  beforeEach(() => {
    tmpPath = makeTempPath();
    registry = new EntityRegistry(tmpPath);
  });

  afterEach(() => {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  });

  it('new entry with REJECTED bo_overall starts as draft', () => {
    const report = makeReport({ bo_overall: 'REJECTED' });
    const entry = registry.save(report);
    assert.equal(entry.review_status, 'draft');
  });

  it('re-analysis with REJECTED resets signed_off to draft', () => {
    // First save — signed off by a reviewer.
    const first = makeReport({ bo_overall: 'CONFIRMED' });
    registry.save(first);
    registry.updateReviewStatus('Alpine Holdings S.A.', 'Luxembourg', 'signed_off', 'analyst');

    // Second save — new analysis returns REJECTED.
    const second = makeReport({ bo_overall: 'REJECTED' });
    const entry = registry.save(second);

    // Must be reset to draft regardless of prior sign-off.
    assert.equal(entry.review_status, 'draft');
  });

  it('re-analysis with CONFIRMED + HIGH preserves signed_off status', () => {
    // Phase 17: only CONFIRMED + high-quality data should preserve a sign-off.
    // Use HIGH confidence here so LOW does not also trigger the force-draft rule.
    const first = makeReport({ bo_overall: 'CONFIRMED', data_confidence: 'HIGH' });
    registry.save(first);
    registry.updateReviewStatus('Alpine Holdings S.A.', 'Luxembourg', 'signed_off', 'analyst');

    const second = makeReport({ bo_overall: 'CONFIRMED', data_confidence: 'HIGH' });
    const entry = registry.save(second);

    // CONFIRMED + HIGH — sign-off is preserved.
    assert.equal(entry.review_status, 'signed_off');
  });

  it('re-analysis with UNCERTAIN resets signed_off to draft', () => {
    // Phase 17: UNCERTAIN verdict means the BO test is inconclusive.
    // A prior sign-off must be cleared so a human re-examines the entry.
    const first = makeReport({ bo_overall: 'CONFIRMED', data_confidence: 'HIGH' });
    registry.save(first);
    registry.updateReviewStatus('Alpine Holdings S.A.', 'Luxembourg', 'signed_off', 'analyst');

    const second = makeReport({ bo_overall: 'UNCERTAIN', data_confidence: 'MEDIUM' });
    const entry = registry.save(second);

    assert.equal(entry.review_status, 'draft');
  });

  it('re-analysis with NO_TREATY + HIGH preserves signed_off status', () => {
    // NO_TREATY is a definitive (non-risky) verdict — preserves sign-off when data is good.
    const first = makeReport({ bo_overall: 'CONFIRMED', data_confidence: 'HIGH' });
    registry.save(first);
    registry.updateReviewStatus('Alpine Holdings S.A.', 'Luxembourg', 'signed_off', 'analyst');

    const second = makeReport({ bo_overall: 'NO_TREATY', data_confidence: 'HIGH' });
    const entry = registry.save(second);

    assert.equal(entry.review_status, 'signed_off');
  });

  it('new entry with no bo_overall (undefined) defaults to draft', () => {
    // Legacy callers that do not yet pass bo_overall should still get draft.
    const report = makeReport({ bo_overall: undefined });
    const entry = registry.save(report);
    assert.equal(entry.review_status, 'draft');
  });
});

// ── Phase 17: force-draft on UNCERTAIN and LOW confidence ─────────────────────
//
// Phase 17 extends the force-draft logic introduced in Phase 15 (REJECTED).
// UNCERTAIN verdicts and LOW confidence reports are also unsafe to act on
// without professional review — an existing sign-off must be cleared.
//
describe('EntityRegistry.save() — Phase 17 force-draft rules', () => {
  let tmpPath: string;
  let registry: EntityRegistry;

  beforeEach(() => {
    tmpPath = makeTempPath();
    registry = new EntityRegistry(tmpPath);
  });

  afterEach(() => {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  });

  it('re-analysis with UNCERTAIN bo_overall resets signed_off to draft', () => {
    // Sign off on a confirmed result, then re-run and get UNCERTAIN.
    registry.save(makeReport({ bo_overall: 'CONFIRMED', data_confidence: 'HIGH' }));
    registry.updateReviewStatus('Alpine Holdings S.A.', 'Luxembourg', 'signed_off');

    const entry = registry.save(makeReport({ bo_overall: 'UNCERTAIN', data_confidence: 'MEDIUM' }));

    assert.equal(entry.review_status, 'draft');
  });

  it('re-analysis with LOW data_confidence resets signed_off to draft', () => {
    // Sign off on a high-confidence result, then re-run with LOW confidence.
    registry.save(makeReport({ bo_overall: 'CONFIRMED', data_confidence: 'HIGH' }));
    registry.updateReviewStatus('Alpine Holdings S.A.', 'Luxembourg', 'signed_off');

    // LOW confidence — substance is simulated; sign-off should not survive.
    const entry = registry.save(makeReport({ bo_overall: 'CONFIRMED', data_confidence: 'LOW' }));

    assert.equal(entry.review_status, 'draft');
  });

  it('LOW data_confidence forces draft even when bo_overall is CONFIRMED', () => {
    // The confidence rule is independent of bo_overall.
    // Even a CONFIRMED BO verdict with LOW confidence is not sign-off-worthy.
    const entry = registry.save(makeReport({ bo_overall: 'CONFIRMED', data_confidence: 'LOW' }));

    assert.equal(entry.review_status, 'draft');
  });

  it('CONFIRMED + MEDIUM preserves signed_off status', () => {
    // MEDIUM confidence is acceptable for a sign-off — only LOW forces draft.
    registry.save(makeReport({ bo_overall: 'CONFIRMED', data_confidence: 'MEDIUM' }));
    registry.updateReviewStatus('Alpine Holdings S.A.', 'Luxembourg', 'signed_off');

    const entry = registry.save(makeReport({ bo_overall: 'CONFIRMED', data_confidence: 'MEDIUM' }));

    assert.equal(entry.review_status, 'signed_off');
  });
});

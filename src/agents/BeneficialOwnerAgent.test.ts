// ─────────────────────────────────────────────────────────────────────────────
// BeneficialOwnerAgent — unit tests
//
// Tests for the exported pure functions:
//   - validateInput        (QA-2: Zod schema replaces hand-written validation)
//   - computeReportConfidence  (Phase 13: now also accepts Citation[])
//   - computeBoOverall     (Phase 15: deterministic BO verdict from findings)
//   - computeConduitRisk   (Phase 15: routing jurisdiction + entity type check)
//   - parseFindings
//
// These functions are deterministic and require no LLM calls or file I/O.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeReportConfidence,
  computeBoOverall,
  computeConduitRisk,
  parseFindings,
  validateInput,
} from './BeneficialOwnerAgent';
import type { Citation } from './BeneficialOwnerAgent';

// ── validateInput ─────────────────────────────────────────────────────────────

// A minimal valid input object — all required fields present and correct.
// Optional fields are omitted to test the happy path without extras.
const VALID_INPUT = {
  entity_name: 'Alpine Holdings S.A.',
  country: 'Luxembourg',
  income_type: 'dividend',
  shareholding_percentage: 25,
};

test('validateInput: accepts a valid minimal input', () => {
  const result = validateInput(VALID_INPUT);
  assert.equal(result.entity_name, 'Alpine Holdings S.A.');
  assert.equal(result.country, 'Luxembourg');
  assert.equal(result.income_type, 'dividend');
  assert.equal(result.shareholding_percentage, 25);
});

test('validateInput: accepts all optional fields when present and valid', () => {
  const result = validateInput({
    ...VALID_INPUT,
    substance_notes: 'Large operating company',
    annual_payment_pln: 3000000,
    related_party: true,
    ddq_path: 'data/ddqs/test.txt',
  });
  assert.equal(result.substance_notes, 'Large operating company');
  assert.equal(result.annual_payment_pln, 3000000);
  assert.equal(result.related_party, true);
  assert.equal(result.ddq_path, 'data/ddqs/test.txt');
});

test('validateInput: rejects null', () => {
  assert.throws(() => validateInput(null), /Invalid input/);
});

test('validateInput: rejects a non-object (string)', () => {
  assert.throws(() => validateInput('not an object'), /Invalid input/);
});

test('validateInput: rejects empty entity_name', () => {
  assert.throws(() => validateInput({ ...VALID_INPUT, entity_name: '' }), /non-empty/);
});

test('validateInput: rejects missing entity_name', () => {
  const { entity_name: _omit, ...rest } = VALID_INPUT;
  assert.throws(() => validateInput(rest), /Invalid input/);
});

test('validateInput: rejects empty country', () => {
  assert.throws(() => validateInput({ ...VALID_INPUT, country: '' }), /non-empty/);
});

test('validateInput: rejects invalid income_type', () => {
  assert.throws(
    () => validateInput({ ...VALID_INPUT, income_type: 'gift' }),
    /income_type must be one of/
  );
});

test('validateInput: accepts all three valid income_type values', () => {
  for (const type of ['dividend', 'interest', 'royalty'] as const) {
    const result = validateInput({ ...VALID_INPUT, income_type: type });
    assert.equal(result.income_type, type);
  }
});

test('validateInput: rejects shareholding_percentage below 0', () => {
  assert.throws(
    () => validateInput({ ...VALID_INPUT, shareholding_percentage: -1 }),
    /shareholding_percentage/
  );
});

test('validateInput: rejects shareholding_percentage above 100', () => {
  assert.throws(
    () => validateInput({ ...VALID_INPUT, shareholding_percentage: 101 }),
    /shareholding_percentage/
  );
});

test('validateInput: accepts shareholding_percentage at boundary values (0 and 100)', () => {
  assert.doesNotThrow(() => validateInput({ ...VALID_INPUT, shareholding_percentage: 0 }));
  assert.doesNotThrow(() => validateInput({ ...VALID_INPUT, shareholding_percentage: 100 }));
});

test('validateInput: rejects shareholding_percentage as a string', () => {
  assert.throws(
    () => validateInput({ ...VALID_INPUT, shareholding_percentage: '25' }),
    /shareholding_percentage/
  );
});

test('validateInput: rejects negative annual_payment_pln', () => {
  assert.throws(
    () => validateInput({ ...VALID_INPUT, annual_payment_pln: -1 }),
    /annual_payment_pln/
  );
});

test('validateInput: accepts annual_payment_pln of 0 (unknown amount convention)', () => {
  assert.doesNotThrow(() => validateInput({ ...VALID_INPUT, annual_payment_pln: 0 }));
});

test('validateInput: rejects related_party as a string', () => {
  assert.throws(() => validateInput({ ...VALID_INPUT, related_party: 'yes' }), /related_party/);
});

test('validateInput: error message lists all invalid fields at once', () => {
  // Zod validates all fields before throwing — so multiple errors are reported
  // in a single throw rather than stopping at the first failure.
  let message = '';
  try {
    validateInput({
      entity_name: '',
      country: '',
      income_type: 'bad',
      shareholding_percentage: -5,
    });
  } catch (err) {
    message = (err as Error).message;
  }
  // All four bad fields should appear in the same error message
  assert.match(message, /entity_name/);
  assert.match(message, /country/);
  assert.match(message, /income_type/);
  assert.match(message, /shareholding_percentage/);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Builds a Citation for consult_legal_sources with the given chunk count and
// top score.  Used to exercise the RAG legal grounding gate.
function ragCitation(chunkCount: number, topScore: number): Citation {
  return {
    tool: 'consult_legal_sources',
    source: 'legal_knowledge_base',
    chunk_count: chunkCount,
    top_score: topScore,
  };
}

// Builds a finding string for entity_substance with the given confidence level.
// Mirrors the shape WhtEnvironment.checkEntitySubstance() returns.
function substanceFinding(confidence: 'HIGH' | 'MEDIUM' | 'LOW'): string {
  return JSON.stringify({ confidence, source: 'DDQ' });
}

// Builds a finding string for wht_rate with the given verified flag.
// Mirrors the shape WhtEnvironment.getTreatyRate() returns.
function rateFinding(verified: boolean): string {
  return JSON.stringify({ verified, rate: 5, source: 'treaties.json' });
}

// Builds a finding string for fact_check_result with the given overall assessment.
function factCheckFinding(overall: 'CONFIRMS' | 'INCONCLUSIVE' | 'UNDERMINES'): string {
  return JSON.stringify({ overall_assessment: overall, source: 'Gemini' });
}

// ── computeReportConfidence — LOW cases ───────────────────────────────────────

test('computeReportConfidence: LOW when substance confidence is LOW (simulated)', () => {
  const findings = { entity_substance: substanceFinding('LOW') };
  assert.equal(computeReportConfidence(findings), 'LOW');
});

test('computeReportConfidence: LOW when substance finding is unparseable JSON', () => {
  const findings = { entity_substance: 'not-json' };
  assert.equal(computeReportConfidence(findings), 'LOW');
});

test('computeReportConfidence: LOW when fact_check UNDERMINES — overrides everything', () => {
  // Even with strong RAG and verified rates, UNDERMINES locks the result to LOW.
  const findings = {
    fact_check_result: factCheckFinding('UNDERMINES'),
    wht_rate: rateFinding(true),
  };
  const citations = [ragCitation(3, 0.8)];
  assert.equal(computeReportConfidence(findings, citations), 'LOW');
});

// Phase 14: Ghost Activation — treaty rate mismatch tests.

test('computeReportConfidence: LOW when wht_rate has treaty_verification_status DIFFERS', () => {
  // DIFFERS means TreatyVerifierAgent found the actual treaty rate is different
  // from what treaties.json claims.  The report rate is wrong → unconditionally LOW,
  // regardless of substance or RAG grounding.
  const findings = {
    wht_rate: JSON.stringify({
      treaty_rate_percent: 5,
      verified: false,
      source: 'treaties.json',
      treaty_verification_status: 'DIFFERS',
      treaty_verification_note: 'Gemini found 10% in treaty text, not 5%',
    }),
  };
  const citations = [ragCitation(3, 0.8)];
  assert.equal(computeReportConfidence(findings, citations), 'LOW');
});

test('computeReportConfidence: NOT_FOUND verification status does NOT lower confidence', () => {
  // NOT_FOUND is the simulate-mode fallback — no API key or Gemini unavailable.
  // It means "we could not verify" — neutral, not a contradiction.  The report
  // should still reach MEDIUM (rates unverified, no RAG) rather than drop to LOW.
  const findings = {
    wht_rate: JSON.stringify({
      treaty_rate_percent: 5,
      verified: false,
      source: 'treaties.json',
      treaty_verification_status: 'NOT_FOUND',
      treaty_verification_note: 'Simulation mode — GEMINI_API_KEY not configured.',
    }),
  };
  assert.equal(computeReportConfidence(findings, []), 'MEDIUM');
});

// ── computeReportConfidence — MEDIUM cases ────────────────────────────────────

test('computeReportConfidence: MEDIUM when treaty rates are unverified', () => {
  // No substance finding (skips that check), rates unverified → MEDIUM.
  const findings = { wht_rate: rateFinding(false) };
  assert.equal(computeReportConfidence(findings), 'MEDIUM');
});

test('computeReportConfidence: MEDIUM when rates are unverified, even with strong RAG', () => {
  const findings = { wht_rate: rateFinding(false) };
  const citations = [ragCitation(3, 0.9)];
  assert.equal(computeReportConfidence(findings, citations), 'MEDIUM');
});

test('computeReportConfidence: MEDIUM when no RAG call was made (legal grounding absent)', () => {
  // Rates verified, substance real → normally HIGH, but no RAG → MEDIUM.
  const findings = {
    entity_substance: substanceFinding('HIGH'),
    wht_rate: rateFinding(true),
  };
  assert.equal(computeReportConfidence(findings, []), 'MEDIUM');
});

test('computeReportConfidence: MEDIUM when RAG returned only 1 chunk (chunk_count < 2)', () => {
  const findings = {
    entity_substance: substanceFinding('HIGH'),
    wht_rate: rateFinding(true),
  };
  const citations = [ragCitation(1, 0.9)];
  assert.equal(computeReportConfidence(findings, citations), 'MEDIUM');
});

test('computeReportConfidence: MEDIUM when RAG top_score is below threshold (< 0.55)', () => {
  const findings = {
    entity_substance: substanceFinding('HIGH'),
    wht_rate: rateFinding(true),
  };
  const citations = [ragCitation(3, 0.45)];
  assert.equal(computeReportConfidence(findings, citations), 'MEDIUM');
});

test('computeReportConfidence: MEDIUM when fact_check CONFIRMS but RAG grounding absent', () => {
  const findings = {
    fact_check_result: factCheckFinding('CONFIRMS'),
    wht_rate: rateFinding(true),
  };
  assert.equal(computeReportConfidence(findings, []), 'MEDIUM');
});

test('computeReportConfidence: MEDIUM when fact_check INCONCLUSIVE and RAG grounding absent', () => {
  // INCONCLUSIVE falls through to standard logic; no RAG → caps at MEDIUM.
  const findings = {
    fact_check_result: factCheckFinding('INCONCLUSIVE'),
    wht_rate: rateFinding(true),
  };
  assert.equal(computeReportConfidence(findings, []), 'MEDIUM');
});

// ── computeReportConfidence — HIGH cases ─────────────────────────────────────

test('computeReportConfidence: HIGH with verified rates and strong RAG (no substance)', () => {
  // No substance finding skips that check; verified rates + RAG grounding → HIGH.
  const findings = { wht_rate: rateFinding(true) };
  const citations = [ragCitation(2, 0.7)];
  assert.equal(computeReportConfidence(findings, citations), 'HIGH');
});

test('computeReportConfidence: HIGH with real substance, verified rates, and strong RAG', () => {
  const findings = {
    entity_substance: substanceFinding('HIGH'),
    wht_rate: rateFinding(true),
  };
  const citations = [ragCitation(3, 0.8)];
  assert.equal(computeReportConfidence(findings, citations), 'HIGH');
});

test('computeReportConfidence: HIGH at exact threshold (chunk_count=2, top_score=0.55)', () => {
  const findings = { wht_rate: rateFinding(true) };
  const citations = [ragCitation(2, 0.55)];
  assert.equal(computeReportConfidence(findings, citations), 'HIGH');
});

test('computeReportConfidence: HIGH when fact_check CONFIRMS + rates ok + strong RAG', () => {
  const findings = {
    fact_check_result: factCheckFinding('CONFIRMS'),
    wht_rate: rateFinding(true),
  };
  const citations = [ragCitation(3, 0.75)];
  assert.equal(computeReportConfidence(findings, citations), 'HIGH');
});

test('computeReportConfidence: HIGH when multiple citations — picks the RAG one', () => {
  // Mix of non-RAG and one RAG citation → should still identify the RAG citation.
  const findings = { wht_rate: rateFinding(true) };
  const citations: Citation[] = [
    { tool: 'get_treaty_rate', source: 'treaties.json', finding_key: 'wht_rate' },
    { tool: 'check_mli_ppt', source: 'treaties.json', finding_key: 'mli_ppt_status' },
    ragCitation(2, 0.65),
  ];
  assert.equal(computeReportConfidence(findings, citations), 'HIGH');
});

// ── parseFindings ─────────────────────────────────────────────────────────────

test('parseFindings: parses all values that are valid JSON strings', () => {
  const input = {
    treaty_status: JSON.stringify({ treaty_in_force: true }),
    wht_rate: JSON.stringify({ rate: 5, verified: false }),
  };
  const result = parseFindings(input);
  assert.deepEqual(result['treaty_status'], { treaty_in_force: true });
  assert.deepEqual(result['wht_rate'], { rate: 5, verified: false });
});

test('parseFindings: keeps non-JSON values as strings', () => {
  const input = { notes: 'plain text, not JSON' };
  const result = parseFindings(input);
  assert.equal(result['notes'], 'plain text, not JSON');
});

test('parseFindings: handles empty findings map', () => {
  const result = parseFindings({});
  assert.deepEqual(result, {});
});

test('parseFindings: does not mutate the input findings map', () => {
  const input = { key: JSON.stringify({ value: 42 }) };
  parseFindings(input);
  // The input should remain a string (not replaced with the parsed object)
  assert.equal(typeof input['key'], 'string');
});

// ── computeBoOverall — Phase 15 ───────────────────────────────────────────────

// Helper: produces a raw findings entry from an object (matches how the agent
// stores tool results in memory — each value is a JSON string).
function finding(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

test('computeBoOverall: NO_TREATY when treaty_in_force is false', () => {
  const findings = {
    treaty_status: finding({ treaty_in_force: false }),
  };
  assert.equal(computeBoOverall(findings, 'HIGH'), 'NO_TREATY');
});

test('computeBoOverall: NO_TREATY takes precedence over LOW confidence', () => {
  // Even when data confidence is LOW, no-treaty is returned first.
  const findings = {
    treaty_status: finding({ treaty_in_force: false }),
    entity_substance: finding({ overall: 'FAIL', confidence: 'LOW' }),
  };
  assert.equal(computeBoOverall(findings, 'LOW'), 'NO_TREATY');
});

test('computeBoOverall: UNCERTAIN when data_confidence is LOW (even with substance PASS)', () => {
  const findings = {
    treaty_status: finding({ treaty_in_force: true }),
    entity_substance: finding({ overall: 'PASS', confidence: 'LOW' }),
  };
  assert.equal(computeBoOverall(findings, 'LOW'), 'UNCERTAIN');
});

test('computeBoOverall: REJECTED when entity_substance.overall is FAIL', () => {
  const findings = {
    treaty_status: finding({ treaty_in_force: true }),
    entity_substance: finding({ overall: 'FAIL', confidence: 'HIGH' }),
  };
  assert.equal(computeBoOverall(findings, 'HIGH'), 'REJECTED');
});

test('computeBoOverall: CONFIRMED when entity_substance.overall is PASS and confidence HIGH', () => {
  const findings = {
    treaty_status: finding({ treaty_in_force: true }),
    entity_substance: finding({ overall: 'PASS', confidence: 'HIGH' }),
  };
  assert.equal(computeBoOverall(findings, 'HIGH'), 'CONFIRMED');
});

test('computeBoOverall: CONFIRMED when entity_substance.overall is PASS and confidence MEDIUM', () => {
  const findings = {
    treaty_status: finding({ treaty_in_force: true }),
    entity_substance: finding({ overall: 'PASS', confidence: 'HIGH' }),
  };
  assert.equal(computeBoOverall(findings, 'MEDIUM'), 'CONFIRMED');
});

test('computeBoOverall: UNCERTAIN when entity_substance.overall is UNCERTAIN', () => {
  const findings = {
    treaty_status: finding({ treaty_in_force: true }),
    entity_substance: finding({ overall: 'UNCERTAIN', confidence: 'MEDIUM' }),
  };
  assert.equal(computeBoOverall(findings, 'MEDIUM'), 'UNCERTAIN');
});

test('computeBoOverall: UNCERTAIN when no substance finding is present', () => {
  const findings = {
    treaty_status: finding({ treaty_in_force: true }),
  };
  assert.equal(computeBoOverall(findings, 'MEDIUM'), 'UNCERTAIN');
});

test('computeBoOverall: UNCERTAIN when no findings at all', () => {
  assert.equal(computeBoOverall({}, 'HIGH'), 'UNCERTAIN');
});

test('computeBoOverall: UNCERTAIN when treaty_status finding is unparseable JSON', () => {
  const findings = { treaty_status: 'not-valid-json' };
  // Falls through treaty check; no substance → safe default UNCERTAIN.
  assert.equal(computeBoOverall(findings, 'HIGH'), 'UNCERTAIN');
});

// ── computeConduitRisk — Phase 15 ─────────────────────────────────────────────

test('computeConduitRisk: false when bo_overall is not REJECTED', () => {
  const findings = {
    entity_substance: finding({ entity_type: 'holding_company', overall: 'PASS' }),
  };
  // CONFIRMED verdict — conduit risk only applies to REJECTED.
  assert.equal(computeConduitRisk('CONFIRMED', findings, 'Cyprus'), false);
});

test('computeConduitRisk: true when REJECTED and country is a known routing jurisdiction', () => {
  assert.equal(computeConduitRisk('REJECTED', {}, 'Cyprus'), true);
  assert.equal(computeConduitRisk('REJECTED', {}, 'Luxembourg'), true);
  assert.equal(computeConduitRisk('REJECTED', {}, 'Netherlands'), true);
  assert.equal(computeConduitRisk('REJECTED', {}, 'Ireland'), true);
});

test('computeConduitRisk: routing jurisdiction check is case-insensitive', () => {
  assert.equal(computeConduitRisk('REJECTED', {}, 'CYPRUS'), true);
  assert.equal(computeConduitRisk('REJECTED', {}, ' hong kong '), true);
});

test('computeConduitRisk: true when REJECTED and entity_type is holding_company', () => {
  const findings = {
    entity_substance: finding({ entity_type: 'holding_company', overall: 'FAIL' }),
  };
  // Non-routing country (e.g. Brazil) but holding company structure.
  assert.equal(computeConduitRisk('REJECTED', findings, 'Brazil'), true);
});

test('computeConduitRisk: true when REJECTED and entity_type is shell_company', () => {
  const findings = {
    entity_substance: finding({ entity_type: 'shell_company', overall: 'FAIL' }),
  };
  assert.equal(computeConduitRisk('REJECTED', findings, 'Canada'), true);
});

test('computeConduitRisk: true when REJECTED and entity_type is unknown', () => {
  const findings = {
    entity_substance: finding({ entity_type: 'unknown', overall: 'FAIL' }),
  };
  assert.equal(computeConduitRisk('REJECTED', findings, 'India'), true);
});

test('computeConduitRisk: false when REJECTED but large operating company in non-routing jurisdiction', () => {
  const findings = {
    entity_substance: finding({ entity_type: 'large_operating_company', overall: 'FAIL' }),
  };
  assert.equal(computeConduitRisk('REJECTED', findings, 'France'), false);
});

test('computeConduitRisk: false when REJECTED and no substance finding and non-routing jurisdiction', () => {
  assert.equal(computeConduitRisk('REJECTED', {}, 'Australia'), false);
});

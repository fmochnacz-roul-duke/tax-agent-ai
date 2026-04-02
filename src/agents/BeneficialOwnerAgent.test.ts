// ─────────────────────────────────────────────────────────────────────────────
// BeneficialOwnerAgent — unit tests
//
// Tests for the exported pure functions:
//   - computeReportConfidence  (Phase 13: now also accepts Citation[])
//   - parseFindings
//
// These functions are deterministic and require no LLM calls or file I/O.
// All 196 existing tests continue to pass alongside these.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReportConfidence, parseFindings } from './BeneficialOwnerAgent';
import type { Citation } from './BeneficialOwnerAgent';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Builds a Citation for consult_legal_sources with the given chunk count and
// top score.  Used to exercise the RAG legal grounding gate.
function ragCitation(chunkCount: number, topScore: number): Citation {
  return {
    tool:        'consult_legal_sources',
    source:      'legal_knowledge_base',
    chunk_count: chunkCount,
    top_score:   topScore,
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
    wht_rate:          rateFinding(true),
  };
  const citations = [ragCitation(3, 0.8)];
  assert.equal(computeReportConfidence(findings, citations), 'LOW');
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
    wht_rate:         rateFinding(true),
  };
  assert.equal(computeReportConfidence(findings, []), 'MEDIUM');
});

test('computeReportConfidence: MEDIUM when RAG returned only 1 chunk (chunk_count < 2)', () => {
  const findings = {
    entity_substance: substanceFinding('HIGH'),
    wht_rate:         rateFinding(true),
  };
  const citations = [ragCitation(1, 0.9)];
  assert.equal(computeReportConfidence(findings, citations), 'MEDIUM');
});

test('computeReportConfidence: MEDIUM when RAG top_score is below threshold (< 0.55)', () => {
  const findings = {
    entity_substance: substanceFinding('HIGH'),
    wht_rate:         rateFinding(true),
  };
  const citations = [ragCitation(3, 0.45)];
  assert.equal(computeReportConfidence(findings, citations), 'MEDIUM');
});

test('computeReportConfidence: MEDIUM when fact_check CONFIRMS but RAG grounding absent', () => {
  const findings = {
    fact_check_result: factCheckFinding('CONFIRMS'),
    wht_rate:          rateFinding(true),
  };
  assert.equal(computeReportConfidence(findings, []), 'MEDIUM');
});

test('computeReportConfidence: MEDIUM when fact_check INCONCLUSIVE and RAG grounding absent', () => {
  // INCONCLUSIVE falls through to standard logic; no RAG → caps at MEDIUM.
  const findings = {
    fact_check_result: factCheckFinding('INCONCLUSIVE'),
    wht_rate:          rateFinding(true),
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
    wht_rate:         rateFinding(true),
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
    wht_rate:          rateFinding(true),
  };
  const citations = [ragCitation(3, 0.75)];
  assert.equal(computeReportConfidence(findings, citations), 'HIGH');
});

test('computeReportConfidence: HIGH when multiple citations — picks the RAG one', () => {
  // Mix of non-RAG and one RAG citation → should still identify the RAG citation.
  const findings = { wht_rate: rateFinding(true) };
  const citations: Citation[] = [
    { tool: 'get_treaty_rate',  source: 'treaties.json', finding_key: 'wht_rate' },
    { tool: 'check_mli_ppt',    source: 'treaties.json', finding_key: 'mli_ppt_status' },
    ragCitation(2, 0.65),
  ];
  assert.equal(computeReportConfidence(findings, citations), 'HIGH');
});

// ── parseFindings ─────────────────────────────────────────────────────────────

test('parseFindings: parses all values that are valid JSON strings', () => {
  const input = {
    treaty_status: JSON.stringify({ treaty_in_force: true }),
    wht_rate:      JSON.stringify({ rate: 5, verified: false }),
  };
  const result = parseFindings(input);
  assert.deepEqual(result['treaty_status'], { treaty_in_force: true });
  assert.deepEqual(result['wht_rate'],      { rate: 5, verified: false });
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

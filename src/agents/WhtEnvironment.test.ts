import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WhtEnvironment } from './WhtEnvironment';
import { LegalRagService } from '../rag';
import type { Chunk, ChunkVector, TaxonomyConcept } from '../rag';

// Helper: parse the JSON string every environment method returns
function parse(result: string): Record<string, unknown> {
  return JSON.parse(result) as Record<string, unknown>;
}

const env = new WhtEnvironment({ simulate: true });

// ── checkTreaty ───────────────────────────────────────────────────────────────

test('checkTreaty: Luxembourg treaty is confirmed', () => {
  const result = parse(env.checkTreaty('Luxembourg'));

  assert.equal(result['treaty_in_force'], true);
  assert.ok(
    (result['treaty_name'] as string).includes('Luxembourg'),
    'treaty name should reference Luxembourg'
  );
  assert.equal(result['mli_applies'], true);
  assert.ok(result['source'], 'result should include a source field');
});

test('checkTreaty: unknown country returns treaty_in_force false', () => {
  const result = parse(env.checkTreaty('Atlantis'));

  assert.equal(result['treaty_in_force'], false);
});

// ── getTreatyRate ─────────────────────────────────────────────────────────────

test('getTreatyRate: Luxembourg dividend with ≥10% shareholding returns 5%', () => {
  const result = parse(env.getTreatyRate('Luxembourg', 'dividend', 25));

  assert.equal(result['treaty_rate_percent'], 5);
  assert.equal(result['domestic_rate_percent'], 19);
  assert.ok(
    (result['treaty_article'] as string).includes('Art. 10'),
    'should cite Art. 10 of the DTC'
  );
});

test('getTreatyRate: Luxembourg dividend with <10% shareholding returns 15%', () => {
  const result = parse(env.getTreatyRate('Luxembourg', 'dividend', 5));

  assert.equal(result['treaty_rate_percent'], 15);
});

test('getTreatyRate: shareholding exactly at 10% threshold returns reduced rate', () => {
  const result = parse(env.getTreatyRate('Luxembourg', 'dividend', 10));

  assert.equal(result['treaty_rate_percent'], 5, 'exactly 10% should qualify for reduced rate');
});

test('getTreatyRate: Luxembourg interest returns 5%', () => {
  const result = parse(env.getTreatyRate('Luxembourg', 'interest', 0));

  assert.equal(result['treaty_rate_percent'], 5);
  assert.equal(result['domestic_rate_percent'], 20);
});

test('getTreatyRate: unknown combination returns an error field', () => {
  const result = parse(env.getTreatyRate('Atlantis', 'dividend', 50));

  assert.ok(result['error'], 'should return an error for unknown combination');
});

// ── checkEntitySubstance — Phase 4 entity-aware profiles ─────────────────────
//
// Phase 4 introduced entity-specific substance profiles structured around the
// three-condition BO test from Art. 4a pkt 29 CIT and MF Objaśnienia 2025.
//
// Tests cover: Orange S.A. (STRONG), Alpine Holdings S.A. (WEAK/FAIL),
// and the conservative unknown-entity fallback (CONDUIT/UNCERTAIN).

test('checkEntitySubstance: Orange S.A. — substance_tier is STRONG', async () => {
  const result = parse(await env.checkEntitySubstance('Orange S.A.', 'France'));

  assert.equal(result['entity'], 'Orange S.A.');
  assert.equal(result['country'], 'France');
  assert.equal(result['entity_type'], 'large_operating_company');
  assert.equal(result['substance_tier'], 'STRONG');
  assert.ok(result['source'], 'should include a source field');
});

test('checkEntitySubstance: Orange S.A. — all three BO conditions PASS', async () => {
  const result = parse(await env.checkEntitySubstance('Orange S.A.', 'France'));
  const bo = result['bo_preliminary'] as Record<string, unknown>;

  assert.equal((bo['condition_1_own_benefit'] as Record<string, unknown>)['result'], 'PASS');
  assert.equal((bo['condition_2_not_conduit'] as Record<string, unknown>)['result'], 'PASS');
  assert.equal((bo['condition_3_genuine_activity'] as Record<string, unknown>)['result'], 'PASS');
  assert.equal(bo['overall'], 'PASS');
});

test('checkEntitySubstance: Orange S.A. — no conduit red flags present', async () => {
  const result = parse(await env.checkEntitySubstance('Orange S.A.', 'France'));
  const indicators = result['conduit_indicators'] as Record<string, Record<string, unknown>>;

  assert.equal(indicators['pass_through_obligation']['present'], false);
  assert.equal(indicators['rapid_forwarding']['present'], false);
  assert.equal(indicators['nominal_margin']['present'], false);
});

test('checkEntitySubstance: Alpine Holdings S.A. — substance_tier is WEAK', async () => {
  const result = parse(await env.checkEntitySubstance('Alpine Holdings S.A.', 'Luxembourg'));

  assert.equal(result['entity'], 'Alpine Holdings S.A.');
  assert.equal(result['country'], 'Luxembourg');
  assert.equal(result['entity_type'], 'holding_company');
  assert.equal(result['substance_tier'], 'WEAK');
});

test('checkEntitySubstance: Alpine Holdings S.A. — condition_2_not_conduit FAILS', async () => {
  const result = parse(await env.checkEntitySubstance('Alpine Holdings S.A.', 'Luxembourg'));
  const bo = result['bo_preliminary'] as Record<string, Record<string, unknown>>;

  assert.equal(bo['condition_2_not_conduit']['result'], 'FAIL');
  assert.equal(bo['overall'], 'FAIL');
});

test('checkEntitySubstance: Alpine Holdings S.A. — pass-through red flag is present', async () => {
  const result = parse(await env.checkEntitySubstance('Alpine Holdings S.A.', 'Luxembourg'));
  const indicators = result['conduit_indicators'] as Record<string, Record<string, unknown>>;

  assert.equal(indicators['pass_through_obligation']['present'], true);
  assert.equal(indicators['rapid_forwarding']['present'], true);
});

test('checkEntitySubstance: unknown entity — conservative CONDUIT tier returned', async () => {
  const result = parse(await env.checkEntitySubstance('Unknown Corp Ltd', 'Cayman Islands'));

  assert.equal(result['entity_type'], 'unknown');
  assert.equal(result['substance_tier'], 'CONDUIT');

  const bo = result['bo_preliminary'] as Record<string, unknown>;
  assert.equal(bo['overall'], 'UNCERTAIN');
});

test('checkEntitySubstance: all profiles include confidence field', async () => {
  const orange = parse(await env.checkEntitySubstance('Orange S.A.', 'France'));
  const alpine = parse(await env.checkEntitySubstance('Alpine Holdings S.A.', 'Luxembourg'));
  const unknown = parse(await env.checkEntitySubstance('Unknown Corp Ltd', 'Cayman Islands'));

  // All simulated profiles are LOW confidence — real data requires DDQ (Phase 5)
  assert.equal(orange['confidence'], 'LOW');
  assert.equal(alpine['confidence'], 'LOW');
  assert.equal(unknown['confidence'], 'LOW');
});

// ── checkMliPpt ───────────────────────────────────────────────────────────────

test('checkMliPpt: Luxembourg returns mli_applies true with substance requirements', () => {
  const result = parse(env.checkMliPpt('Luxembourg'));

  assert.equal(result['mli_applies'], true);
  assert.ok(Array.isArray(result['substance_requirements']), 'should list substance requirements');
  assert.ok((result['article'] as string).includes('Article 7'), 'should reference Article 7 MLI');
  assert.ok(result['source'], 'should include a source field');
});

test('checkMliPpt: unknown country returns mli_applies false', () => {
  const result = parse(env.checkMliPpt('Atlantis'));

  assert.equal(result['mli_applies'], false);
});

// ── Live mode — checkTreaty ───────────────────────────────────────────────────
// These tests use simulate:false and read the real data/treaties.json file.

const live = new WhtEnvironment({ simulate: false });

test('live: checkTreaty Luxembourg — treaty confirmed, PPT applies', () => {
  const result = parse(live.checkTreaty('Luxembourg'));

  assert.equal(result['treaty_in_force'], true);
  assert.ok((result['treaty_name'] as string).includes('Luxembourg'));
  assert.equal(result['mli_ppt_applies'], 'YES');
  assert.ok(result['source'], 'should include source field');
});

test('live: checkTreaty Germany — treaty confirmed, PPT does NOT apply', () => {
  const result = parse(live.checkTreaty('Germany'));

  assert.equal(result['treaty_in_force'], true);
  assert.equal(result['mli_ppt_applies'], 'NO');
  const flags = result['mli_flags'] as string[];
  assert.ok(flags.includes('EXCLUDED_BY_POLAND'), 'Germany should carry EXCLUDED_BY_POLAND flag');
});

test('live: checkTreaty Italy — treaty in force, PPT does NOT apply (not ratified)', () => {
  const result = parse(live.checkTreaty('Italy'));

  assert.equal(result['treaty_in_force'], true);
  assert.equal(result['mli_ppt_applies'], 'NO');
  const flags = result['mli_flags'] as string[];
  assert.ok(flags.includes('NOT_RATIFIED'), 'Italy should carry NOT_RATIFIED flag');
});

test('live: checkTreaty alias "UK" resolves to United Kingdom', () => {
  const result = parse(live.checkTreaty('UK'));

  assert.equal(result['treaty_in_force'], true);
  assert.ok((result['treaty_name'] as string).includes('United Kingdom'));
});

test('live: checkTreaty unknown country returns treaty_in_force false', () => {
  const result = parse(live.checkTreaty('Atlantis'));

  assert.equal(result['treaty_in_force'], false);
});

// ── Live mode — getTreatyRate ─────────────────────────────────────────────────

test('live: getTreatyRate Luxembourg dividend ≥25% returns reduced rate', () => {
  // Luxembourg: reduced_rate 0%, threshold 25%
  const result = parse(live.getTreatyRate('Luxembourg', 'dividend', 30));

  assert.equal(result['treaty_rate_percent'], 0, 'reduced rate should be 0% at ≥25%');
  assert.equal(result['domestic_rate_percent'], 19);
  assert.equal(result['verified'], false, 'unverified rates are marked false');
});

test('live: getTreatyRate Luxembourg dividend below threshold returns standard rate', () => {
  const result = parse(live.getTreatyRate('Luxembourg', 'dividend', 10));

  assert.equal(result['treaty_rate_percent'], 15, 'standard rate should be 15% below threshold');
});

test('live: getTreatyRate Germany interest returns 0%', () => {
  const result = parse(live.getTreatyRate('Germany', 'interest', 0));

  assert.equal(result['treaty_rate_percent'], 0);
  assert.equal(result['domestic_rate_percent'], 20);
});

test('live: getTreatyRate Italy dividend is flat 10% regardless of shareholding', () => {
  // Italy: flat rate, reduced_threshold === 0
  const resultLow = parse(live.getTreatyRate('Italy', 'dividend', 5));
  const resultHigh = parse(live.getTreatyRate('Italy', 'dividend', 50));

  assert.equal(resultLow['treaty_rate_percent'], 10, 'flat rate at low holding');
  assert.equal(resultHigh['treaty_rate_percent'], 10, 'flat rate at high holding');
});

test('live: getTreatyRate unknown country returns error', () => {
  const result = parse(live.getTreatyRate('Atlantis', 'dividend', 50));

  assert.ok(result['error'], 'unknown country should return an error field');
});

test('live: getTreatyRate unsupported income type returns error', () => {
  const result = parse(live.getTreatyRate('Germany', 'withholding', 0));

  assert.ok(result['error'], 'unknown income type should return an error field');
});

// ── Live mode — checkMliPpt ───────────────────────────────────────────────────

test('live: checkMliPpt Luxembourg — PPT applies', () => {
  const result = parse(live.checkMliPpt('Luxembourg'));

  assert.equal(result['mli_applies'], true);
  assert.ok(Array.isArray(result['substance_requirements']), 'should list substance requirements');
  assert.ok((result['article'] as string).includes('Article 7'));
});

test('live: checkMliPpt Germany — PPT does NOT apply', () => {
  const result = parse(live.checkMliPpt('Germany'));

  assert.equal(result['mli_applies'], false);
  assert.equal(result['mli_ppt_status'], 'NO');
});

test('live: checkMliPpt Netherlands — VERIFY treated conservatively as NO', () => {
  const result = parse(live.checkMliPpt('Netherlands'));

  assert.equal(result['mli_applies'], false, 'VERIFY status should resolve to mli_applies false');
  assert.equal(result['mli_ppt_status'], 'VERIFY');
  assert.ok(result['caution'], 'should include a caution message');
});

// ── analyseDempe ──────────────────────────────────────────────────────────────
//
// analyseDempe() connects to the Python DDQ service in Phase 6.
// In simulation mode (env created with simulate:true / no service configured),
// it returns hardcoded data. Tests use simulate:true — no HTTP calls are made.
// Tests verify the DEMPE structure and the Art. 12 scope warning are present.

test('analyseDempe: returns all five DEMPE function keys', async () => {
  const result = parse(await env.analyseDempe('Orange S.A.', 'France', 'brand'));
  const functions = result['dempe_functions'] as Record<string, unknown>;

  assert.ok(functions['development'], 'should include development function');
  assert.ok(functions['enhancement'], 'should include enhancement function');
  assert.ok(functions['maintenance'], 'should include maintenance function');
  assert.ok(functions['protection'], 'should include protection function');
  assert.ok(functions['exploitation'], 'should include exploitation function');
});

test('analyseDempe: returns control_test and risk_bearing fields', async () => {
  const result = parse(await env.analyseDempe('Orange S.A.', 'France', 'brand'));

  assert.ok(result['control_test'], 'should include control_test');
  assert.ok(result['risk_bearing'], 'should include risk_bearing');
});

test('analyseDempe: beneficial_owner_dempe field is present', async () => {
  const result = parse(await env.analyseDempe('Orange S.A.', 'France', 'brand'));

  assert.ok(result['beneficial_owner_dempe'], 'should include beneficial_owner_dempe conclusion');
});

test('analyseDempe: art12_scope_warning is present and mentions Art. 7', async () => {
  const result = parse(await env.analyseDempe('Orange S.A.', 'France', 'brand'));
  const warning = result['art12_scope_warning'] as string;

  assert.ok(warning, 'should include art12_scope_warning');
  assert.ok(warning.includes('Art. 7'), 'warning should mention Art. 7 Business Profits fallback');
});

test('analyseDempe: echoes entity_name, country, and ip_type in output', async () => {
  const result = parse(await env.analyseDempe('Test Corp', 'Germany', 'technology'));

  assert.equal(result['entity'], 'Test Corp');
  assert.equal(result['country'], 'Germany');
  assert.equal(result['ip_type'], 'technology');
});

test('analyseDempe: source field marks result as simulated', async () => {
  const result = parse(await env.analyseDempe('Orange S.A.', 'France', 'brand'));

  assert.ok(
    (result['source'] as string).toLowerCase().includes('simulated'),
    'source should indicate simulated data'
  );
});

// ── checkDirectiveExemption ───────────────────────────────────────────────────

test('checkDirectiveExemption: EU member + royalty + ≥25% + ≥2yr → exemption available', () => {
  const result = parse(env.checkDirectiveExemption('France', 'royalty', 50, 5));

  assert.equal(result['exemption_available'], true);
  assert.equal(result['exemption_rate'], 0);
});

test('checkDirectiveExemption: non-EU country → exemption NOT available', () => {
  const result = parse(env.checkDirectiveExemption('United Kingdom', 'royalty', 50, 5));

  assert.equal(result['exemption_available'], false);
  assert.equal(result['exemption_rate'], null);

  const conditions = result['conditions'] as Record<string, Record<string, unknown>>;
  assert.equal(conditions['eu_member_state']['met'], false);
});

test('checkDirectiveExemption: dividend income type → NOT covered by Directive', () => {
  // Dividend income uses the Parent-Sub Directive (Art. 22 CIT), not the I&R Directive
  // The tool only accepts 'interest' | 'royalty', but we test the logic via interest
  const result = parse(env.checkDirectiveExemption('France', 'interest', 50, 5));

  assert.equal(result['exemption_available'], true, 'interest should be covered');
});

test('checkDirectiveExemption: shareholding below 25% → exemption NOT available', () => {
  const result = parse(env.checkDirectiveExemption('France', 'royalty', 20, 5));

  assert.equal(result['exemption_available'], false);

  const conditions = result['conditions'] as Record<string, Record<string, unknown>>;
  assert.equal(conditions['shareholding_threshold']['met'], false);
});

test('checkDirectiveExemption: holding period below 2 years → exemption NOT available', () => {
  const result = parse(env.checkDirectiveExemption('France', 'royalty', 50, 1));

  assert.equal(result['exemption_available'], false);

  const conditions = result['conditions'] as Record<string, Record<string, unknown>>;
  assert.equal(conditions['holding_period']['met'], false);
});

test('checkDirectiveExemption: exemption available → required_documentation is non-empty', () => {
  const result = parse(env.checkDirectiveExemption('France', 'royalty', 50, 5));
  const docs = result['required_documentation'] as unknown[];

  assert.ok(docs.length > 0, 'should list required documents when exemption is available');
});

// ── checkPayAndRefund ─────────────────────────────────────────────────────────

test('checkPayAndRefund: related party + amount above threshold → mechanism applies', () => {
  const result = parse(env.checkPayAndRefund('royalty', true, 5_000_000));

  assert.equal(result['applies'], true);
  assert.ok(result['domestic_withholding_rate'], 'should include domestic rate');
  assert.ok(
    (result['relief_options'] as unknown[]).length > 0,
    'should include relief options when mechanism applies'
  );
});

test('checkPayAndRefund: not a related party → mechanism does NOT apply', () => {
  const result = parse(env.checkPayAndRefund('royalty', false, 5_000_000));

  assert.equal(result['applies'], false);
  assert.equal(result['domestic_withholding_rate'], null);
});

test('checkPayAndRefund: amount below threshold → mechanism does NOT apply', () => {
  const result = parse(env.checkPayAndRefund('royalty', true, 500_000));

  assert.equal(result['applies'], false);
});

test('checkPayAndRefund: unknown amount (0) → conservative assumption, mechanism applies', () => {
  const result = parse(env.checkPayAndRefund('royalty', true, 0));

  assert.equal(result['applies'], true, 'unknown amount should trigger conservative assumption');
});

test('checkPayAndRefund: relief_options include both Opinion and WH-OS paths', () => {
  const result = parse(env.checkPayAndRefund('royalty', true, 5_000_000));
  const options = result['relief_options'] as Array<Record<string, unknown>>;

  const names = options.map((o) => o['option'] as string);
  assert.ok(
    names.some((n) => n.includes('Opinion')),
    'should include Opinion on WHT Exemption'
  );
  assert.ok(
    names.some((n) => n.includes('WH-OS')),
    'should include WH-OS Management Statement'
  );
});

// ── Parameter validation — safety layer (MATE principle E) ───────────────────
//
// The agent loop validates user input at the CLI boundary (validateInput in
// BeneficialOwnerAgent.ts), but the LLM can still fabricate out-of-range values
// when calling tools. The Environment is the last line of defence — it must
// return a structured error rather than silently processing bad inputs.
//
// These tests confirm that every validation guard returns an object with an
// 'error' field (no exception thrown) so the agent loop can surface it cleanly.

test('getTreatyRate: invalid income_type returns error', () => {
  const result = parse(env.getTreatyRate('Luxembourg', 'withholding', 25));

  assert.ok(result['error'], 'invalid income_type should return an error field');
  assert.ok(
    (result['error'] as string).includes('dividend, interest, royalty'),
    'error should list valid types'
  );
});

test('getTreatyRate: shareholding above 100 returns error', () => {
  const result = parse(env.getTreatyRate('Luxembourg', 'dividend', 150));

  assert.ok(result['error'], 'shareholding > 100 should return an error field');
});

test('getTreatyRate: negative shareholding returns error', () => {
  const result = parse(env.getTreatyRate('Luxembourg', 'dividend', -5));

  assert.ok(result['error'], 'negative shareholding should return an error field');
});

test('checkDirectiveExemption: dividend income_type returns directive-scope error', () => {
  const result = parse(env.checkDirectiveExemption('France', 'dividend', 50, 5));

  assert.ok(
    result['error'],
    'dividend should return an error (Directive covers interest/royalty only)'
  );
  assert.ok(
    (result['error'] as string).includes('Parent-Subsidiary'),
    'error should redirect to the Parent-Subsidiary Directive'
  );
});

test('checkDirectiveExemption: negative holding_years returns error', () => {
  const result = parse(env.checkDirectiveExemption('France', 'royalty', 50, -1));

  assert.ok(result['error'], 'negative holding_years should return an error field');
});

test('checkDirectiveExemption: shareholding above 100 returns error', () => {
  const result = parse(env.checkDirectiveExemption('France', 'royalty', 110, 5));

  assert.ok(result['error'], 'shareholding > 100 should return an error field');
});

test('checkPayAndRefund: invalid income_type returns error', () => {
  const result = parse(env.checkPayAndRefund('fee', true, 5_000_000));

  assert.ok(result['error'], 'invalid income_type should return an error field');
});

test('checkPayAndRefund: negative annual_payment returns error', () => {
  const result = parse(env.checkPayAndRefund('royalty', true, -1000));

  assert.ok(result['error'], 'negative annual_payment_pln should return an error field');
});

test('checkEntitySubstance: empty entity_name returns error', async () => {
  const result = parse(await env.checkEntitySubstance('', 'France'));

  assert.ok(result['error'], 'empty entity_name should return an error field');
});

test('checkEntitySubstance: whitespace-only entity_name returns error', async () => {
  const result = parse(await env.checkEntitySubstance('   ', 'France'));

  assert.ok(result['error'], 'whitespace entity_name should return an error field');
});

test('analyseDempe: invalid ip_type returns error', async () => {
  const result = parse(await env.analyseDempe('Orange S.A.', 'France', 'copyright'));

  assert.ok(result['error'], 'invalid ip_type should return an error field');
  assert.ok(
    (result['error'] as string).includes('brand, technology, patent'),
    'error should list valid ip_type values'
  );
});

// Also confirm that validation errors do NOT fire for valid inputs
// (regression guard — prevents over-strict validation that blocks legitimate calls)

test('getTreatyRate: valid inputs do NOT return error (regression guard)', () => {
  const result = parse(env.getTreatyRate('Luxembourg', 'dividend', 25));

  assert.equal(result['error'], undefined, 'valid call should not produce an error field');
});

test('checkDirectiveExemption: valid inputs do NOT return error (regression guard)', () => {
  const result = parse(env.checkDirectiveExemption('France', 'royalty', 50, 5));

  assert.equal(result['error'], undefined, 'valid call should not produce an error field');
});

test('checkPayAndRefund: valid inputs do NOT return error (regression guard)', () => {
  const result = parse(env.checkPayAndRefund('royalty', true, 5_000_000));

  assert.equal(result['error'], undefined, 'valid call should not produce an error field');
});

test('analyseDempe: valid ip_type does NOT return error (regression guard)', async () => {
  const result = parse(await env.analyseDempe('Orange S.A.', 'France', 'brand'));

  assert.equal(result['error'], undefined, 'valid call should not produce an error field');
});

// ── factCheckSubstance — Phase 7 ─────────────────────────────────────────────
//
// Tests run in simulate:true mode — no Gemini API calls, no GEMINI_API_KEY needed.
// The simulation returns INCONCLUSIVE with all claims UNVERIFIED.

const FACT_CHECK_CLAIMS = [
  'Orange S.A. employs approximately 133,000 people globally',
  'Orange S.A. holds 50.67% of Orange Polska S.A.',
];

test('factCheckSubstance: returns entity and country in result', async () => {
  const result = parse(await env.factCheckSubstance('Orange S.A.', 'France', FACT_CHECK_CLAIMS));

  assert.equal(result['entity'], 'Orange S.A.');
  assert.equal(result['country'], 'France');
});

test('factCheckSubstance: result includes claims array and wht_risk_flags', async () => {
  const result = parse(await env.factCheckSubstance('Orange S.A.', 'France', FACT_CHECK_CLAIMS));

  assert.ok(Array.isArray(result['claims']), 'claims should be an array');
  assert.ok(Array.isArray(result['wht_risk_flags']), 'wht_risk_flags should be an array');
  assert.ok(result['overall_assessment'], 'overall_assessment should be present');
});

test('factCheckSubstance: empty entity_name returns error', async () => {
  const result = parse(await env.factCheckSubstance('', 'France', FACT_CHECK_CLAIMS));

  assert.ok(result['error'], 'empty entity_name should return an error field');
});

test('factCheckSubstance: empty claims array returns error', async () => {
  const result = parse(await env.factCheckSubstance('Orange S.A.', 'France', []));

  assert.ok(result['error'], 'empty claims array should return an error field');
});

// ── consultLegalSources ───────────────────────────────────────────────────────
//
// simulate:true → ragService stays undefined → graceful fallback.
// For the "returns real chunks" test we inject a LegalRagService.fromData()
// so no disk reads or OpenAI API calls are needed.

test('consultLegalSources: returns not-available fallback in simulate mode', async () => {
  // env is created with simulate:true at the top of this file.
  // No ragService is injected, so consultLegalSources should degrade gracefully.
  const result = parse(await env.consultLegalSources('What is beneficial owner?'));

  assert.equal(
    result['available'],
    false,
    'simulate mode should return available:false when no ragService is injected'
  );
  assert.ok(
    (result['note'] as string).includes('rag:build'),
    'note should instruct the user to run rag:build'
  );
});

test('consultLegalSources: returns error for empty query', async () => {
  const result = parse(await env.consultLegalSources(''));

  assert.ok(result['error'], 'empty query should return an error field');
  assert.equal(result['source'], 'validation');
});

test('consultLegalSources: returns formatted chunks from injected RAG service', async () => {
  // Build a minimal in-memory RAG service — Chunk + ChunkVector + mock EmbedFunction.
  // LegalRagService.fromData() accepts these directly, making no API calls.

  // A single test chunk representing one section of MF-OBJ-2025.
  const chunk: Chunk = {
    chunk_id: 'MF-OBJ-2025::test-section',
    source_id: 'MF-OBJ-2025',
    section_ref: '§2.3',
    section_title: 'Kryteria uznania działalności za rzeczywistą',
    concept_ids: ['condition_iii_genuine_business'],
    module_relevance: ['WHT'],
    language: 'pl',
    text: '## §2.3 Kryteria uznania działalności za rzeczywistą\n\nTest content.',
    char_count: 70,
  };

  // The embedding vector — we use a 3-dimensional vector to keep the test data small.
  // The mock embedFn always returns this same vector, so cosine similarity will be 1.0
  // (query vector === chunk vector → perfect match).
  const embedding: number[] = [0.1, 0.2, 0.3];

  const chunkVector: ChunkVector = { chunk_id: 'MF-OBJ-2025::test-section', embedding };

  // mockEmbedFn satisfies the EmbedFunction type: (texts: string[]) => Promise<number[][]>
  // It returns one vector per input text, ignoring the actual text content.
  const mockEmbedFn = async (texts: string[]): Promise<number[][]> => texts.map(() => embedding);

  const taxonomy: TaxonomyConcept[] = []; // no expansion needed for this test

  const ragService = LegalRagService.fromData({
    chunks: [chunk],
    vectors: [chunkVector],
    taxonomy,
    embedFn: mockEmbedFn,
  });

  // Inject the mock service.  simulate:true avoids loading treaties.json or
  // calling FactCheckerAgent — we only care about the RAG path here.
  const ragEnv = new WhtEnvironment({ simulate: true, ragService });

  const result = parse(
    await ragEnv.consultLegalSources('genuine business activity', [
      'condition_iii_genuine_business',
    ])
  );

  assert.equal(result['source'], 'legal_knowledge_base');
  assert.equal(result['query'], 'genuine business activity');

  const chunks = result['chunks'] as Record<string, unknown>[];
  assert.ok(Array.isArray(chunks), 'chunks should be an array');
  assert.ok(chunks.length > 0, 'should return at least one chunk');

  const first = chunks[0];
  assert.equal(first['source_id'], 'MF-OBJ-2025');
  assert.equal(first['section_ref'], '§2.3');
  assert.ok(typeof first['score'] === 'number', 'score should be a number');
  assert.ok(first['text'], 'text should be present');
});

// ── Phase 14: consultLegalSources — last_verified surfaced ───────────────────

test('consultLegalSources: last_verified is included in chunk output when set', async () => {
  // Build a chunk that carries a last_verified date (set in DOCS-2).
  // The field is optional on Chunk — this test ensures it is passed through
  // to the JSON result so the agent and user can see when the source was
  // last confirmed against current law.
  const embedding: number[] = [0.5, 0.5];
  const chunkWithDate: Chunk = {
    chunk_id: 'PL-CIT-2026-WHT::art4a-pkt29',
    source_id: 'PL-CIT-2026-WHT',
    section_ref: 'Art. 4a pkt 29',
    section_title: 'Definicja rzeczywistego właściciela',
    concept_ids: ['beneficial_owner'],
    module_relevance: ['WHT'],
    language: 'pl',
    last_verified: '2026-04-02',
    text: '## Art. 4a pkt 29\n\nTest text.',
    char_count: 40,
  };
  const mockEmbedFn = async (texts: string[]): Promise<number[][]> => texts.map(() => embedding);
  const ragService = LegalRagService.fromData({
    chunks: [chunkWithDate],
    vectors: [{ chunk_id: 'PL-CIT-2026-WHT::art4a-pkt29', embedding }],
    taxonomy: [],
    embedFn: mockEmbedFn,
  });

  const ragEnv = new WhtEnvironment({ simulate: true, ragService });
  const result = parse(await ragEnv.consultLegalSources('beneficial owner definition'));

  const chunks = result['chunks'] as Record<string, unknown>[];
  assert.ok(chunks.length > 0, 'should return at least one chunk');
  assert.equal(chunks[0]['last_verified'], '2026-04-02', 'last_verified should be surfaced');
});

test('consultLegalSources: last_verified is absent from output when not set on chunk', async () => {
  // A chunk without last_verified (not yet reviewed) should NOT emit the field —
  // absence is meaningful: it tells the user no human has verified this source yet.
  const embedding: number[] = [0.5, 0.5];
  const chunkNoDate: Chunk = {
    chunk_id: 'SOME-SRC::section-1',
    source_id: 'SOME-SRC',
    section_ref: '§1',
    section_title: 'Test section',
    concept_ids: ['beneficial_owner'],
    module_relevance: ['WHT'],
    language: 'en',
    text: '## §1\n\nSome text.',
    char_count: 20,
  };
  const mockEmbedFn = async (texts: string[]): Promise<number[][]> => texts.map(() => embedding);
  const ragService = LegalRagService.fromData({
    chunks: [chunkNoDate],
    vectors: [{ chunk_id: 'SOME-SRC::section-1', embedding }],
    taxonomy: [],
    embedFn: mockEmbedFn,
  });

  const ragEnv = new WhtEnvironment({ simulate: true, ragService });
  const result = parse(await ragEnv.consultLegalSources('some query'));

  const chunks = result['chunks'] as Record<string, unknown>[];
  assert.ok(chunks.length > 0, 'should return at least one chunk');
  assert.ok(
    !Object.prototype.hasOwnProperty.call(chunks[0], 'last_verified'),
    'last_verified should not appear when absent from the chunk'
  );
});

// ── Phase 14: verifyTreatyRate ────────────────────────────────────────────────

test('verifyTreatyRate: simulate mode returns NOT_FOUND without API call', async () => {
  // In simulate mode (env.simulate = true), TreatyVerifierAgent also runs in
  // simulate mode and returns NOT_FOUND conservatively.  This test ensures the
  // method is callable, returns the right shape, and does NOT lower confidence
  // (only DIFFERS would do that — NOT_FOUND is neutral).
  const result = await env.verifyTreatyRate(
    'france',
    'royalty',
    '10%',
    'Art. 12(2) Poland–France DTC'
  );

  assert.equal(result.status, 'NOT_FOUND', 'simulation should return NOT_FOUND conservatively');
  assert.equal(result.country, 'france', 'country should be echoed back');
  assert.equal(result.income_type, 'royalty', 'income_type should be echoed back');
  assert.equal(result.claimed_rate, '10%', 'claimed_rate should be echoed back');
  assert.equal(result.confirmed_rate, null, 'confirmed_rate should be null in simulation');
  assert.ok(
    Array.isArray(result.sources) && result.sources.length === 0,
    'sources should be empty'
  );
});

// ── Phase 15: Negative tests — no-treaty path ──────────────────────────────────
//
// These tests use live mode (simulate: false) against the real treaties.json
// to verify that the no-treaty code path works correctly for jurisdictions
// not in the database and for known treaty entries.
//
// Live mode is safe here: no API calls are made — all data comes from
// the static treaties.json file read from disk.

const liveEnv = new WhtEnvironment({ simulate: false });

test('Negative: checkTreaty returns treaty_in_force false for Hong Kong (no PL-HK treaty)', () => {
  const result = parse(liveEnv.checkTreaty('Hong Kong'));
  assert.equal(
    result['treaty_in_force'],
    false,
    'Hong Kong has no treaty with Poland — treaty_in_force must be false'
  );
});

test('Negative: getTreatyRate returns domestic rate error for Hong Kong', () => {
  // When treaty_in_force is false, getTreatyRate returns an error — no treaty rate.
  const result = parse(liveEnv.getTreatyRate('Hong Kong', 'royalty', 0));
  assert.ok(
    typeof result['error'] === 'string',
    'Should return an error object when no treaty is in force'
  );
});

test('Negative: Brazil is now a treaty country (PL-BR DTC 2022, applies 2026)', () => {
  const result = parse(liveEnv.checkTreaty('Brazil'));
  assert.equal(result['treaty_in_force'], true, 'PL-BR DTC (2022) is in force as of 01.01.2026');
  assert.equal(
    result['mli_ppt_applies'],
    'NO',
    'MLI PPT does not apply — treaty concluded after MLI deposit window'
  );
});

test('Negative: Brazil royalty rate is 10% (general) with trademark exception in note', () => {
  const result = parse(liveEnv.getTreatyRate('Brazil', 'royalty', 0));
  assert.equal(result['treaty_rate_percent'], 10, 'Standard royalty rate for Brazil is 10%');
  // The trademark exception (15%) must be documented in the verification_note.
  const note = result['verification_note'] as string | undefined;
  assert.ok(
    typeof note === 'string' && note.toLowerCase().includes('trademark'),
    'verification_note must mention the 15% trademark exception'
  );
});

test('Negative: Brazil interest rate is 15% (standard) with bank loan exception in note', () => {
  const result = parse(liveEnv.getTreatyRate('Brazil', 'interest', 0));
  assert.equal(result['treaty_rate_percent'], 15, 'Standard interest rate for Brazil is 15%');
  const note = result['verification_note'] as string | undefined;
  assert.ok(
    typeof note === 'string' && note.toLowerCase().includes('bank'),
    'verification_note must mention the 10% bank loan reduced rate'
  );
});

test('Negative: France royalty rate is 10% — not 5% (common hallucination target)', () => {
  const result = parse(liveEnv.getTreatyRate('France', 'royalty', 0));
  assert.equal(result['treaty_rate_percent'], 10, 'PL-FR DTC Art. 12(2) rate is 10% — not 5%');
});

test('Negative: Malta treaty is in force with MLI PPT YES (refutes "no MLI PPT" assumption)', () => {
  const result = parse(liveEnv.checkTreaty('Malta'));
  assert.equal(result['treaty_in_force'], true);
  assert.equal(
    result['mli_ppt_applies'],
    'YES',
    'Malta MLI PPT applies — refutes the false "no MLI" assumption'
  );
});

test('Negative: getTreatyRate rejects unsupported income_type with structured error', () => {
  const result = parse(liveEnv.getTreatyRate('France', 'salary', 0));
  assert.ok(
    typeof result['error'] === 'string' && result['error'].includes('Unsupported income_type'),
    'Agent must not silently accept invalid income types'
  );
});

test('Negative: getTreatyRate rejects shareholding_percentage > 100', () => {
  const result = parse(liveEnv.getTreatyRate('France', 'dividend', 150));
  assert.ok(
    typeof result['error'] === 'string' && result['error'].includes('shareholding_percentage'),
    'Agent must reject out-of-range shareholding values'
  );
});

// ── Phase 16: consultLegalSources — source_type filter + legal_hierarchy ──────
//
// These tests verify the three Phase 16 additions:
//   1. source_type is surfaced in each returned chunk when the chunk carries it
//   2. legal_hierarchy is derived correctly from source_type
//   3. source_type filter restricts results to only matching chunks
//   4. chunks without source_type still pass through when no filter is applied

function makeRagEnvWithChunks(chunks: Chunk[]): WhtEnvironment {
  const embedding: number[] = [0.5, 0.5];
  const vectors: ChunkVector[] = chunks.map((c) => ({ chunk_id: c.chunk_id, embedding }));
  const mockEmbedFn = async (texts: string[]): Promise<number[][]> => texts.map(() => embedding);
  const ragService = LegalRagService.fromData({ chunks, vectors, taxonomy: [], embedFn: mockEmbedFn });
  return new WhtEnvironment({ simulate: true, ragService });
}

test('Phase 16 — consultLegalSources: statute chunk includes source_type and legal_hierarchy 1', async () => {
  const chunk: Chunk = {
    chunk_id: 'PL-CIT-2026::art4a',
    source_id: 'PL-CIT-2026',
    section_ref: 'Art. 4a pkt 29',
    section_title: 'Definicja rzeczywistego właściciela',
    concept_ids: ['beneficial_owner'],
    module_relevance: ['WHT'],
    language: 'pl',
    source_type: 'statute',
    text: '## Art. 4a pkt 29\n\nBeneficial owner definition.',
    char_count: 50,
  };
  const ragEnv = makeRagEnvWithChunks([chunk]);
  const result = parse(await ragEnv.consultLegalSources('beneficial owner definition'));

  const chunks = result['chunks'] as Record<string, unknown>[];
  assert.ok(chunks.length > 0, 'should return at least one chunk');
  assert.equal(chunks[0]['source_type'], 'statute', 'source_type should be surfaced in chunk output');
  assert.equal(chunks[0]['legal_hierarchy'], 1, 'statute should have legal_hierarchy 1');
});

test('Phase 16 — consultLegalSources: guidance chunk includes source_type and legal_hierarchy 3', async () => {
  const chunk: Chunk = {
    chunk_id: 'MF-OBJ-2025::s2-3',
    source_id: 'MF-OBJ-2025',
    section_ref: '§2.3',
    section_title: 'Kryteria uznania działalności',
    concept_ids: ['condition_iii_genuine_business'],
    module_relevance: ['WHT'],
    language: 'pl',
    source_type: 'guidance',
    text: '## §2.3\n\nGuidance content.',
    char_count: 40,
  };
  const ragEnv = makeRagEnvWithChunks([chunk]);
  const result = parse(await ragEnv.consultLegalSources('genuine business activity'));

  const chunks = result['chunks'] as Record<string, unknown>[];
  assert.ok(chunks.length > 0, 'should return at least one chunk');
  assert.equal(chunks[0]['source_type'], 'guidance', 'source_type should be "guidance"');
  assert.equal(chunks[0]['legal_hierarchy'], 3, 'guidance should have legal_hierarchy 3');
});

test('Phase 16 — consultLegalSources: chunk without source_type omits both fields', async () => {
  const chunk: Chunk = {
    chunk_id: 'UNTYPED-SRC::section-1',
    source_id: 'UNTYPED-SRC',
    section_ref: '§1',
    section_title: 'Some section',
    concept_ids: ['beneficial_owner'],
    module_relevance: ['WHT'],
    language: 'en',
    text: '## §1\n\nUntyped content.',
    char_count: 25,
  };
  const ragEnv = makeRagEnvWithChunks([chunk]);
  const result = parse(await ragEnv.consultLegalSources('query'));

  const chunks = result['chunks'] as Record<string, unknown>[];
  assert.ok(chunks.length > 0, 'should return at least one chunk');
  assert.ok(
    !Object.prototype.hasOwnProperty.call(chunks[0], 'source_type'),
    'source_type should be absent when chunk has no source_type'
  );
  assert.ok(
    !Object.prototype.hasOwnProperty.call(chunks[0], 'legal_hierarchy'),
    'legal_hierarchy should be absent when chunk has no source_type'
  );
});

test('Phase 16 — consultLegalSources: source_type filter returns only matching chunks', async () => {
  // Two chunks: one statute, one guidance. Filter for statute → guidance is excluded.
  const statuteChunk: Chunk = {
    chunk_id: 'PL-CIT-2026::art21',
    source_id: 'PL-CIT-2026',
    section_ref: 'Art. 21',
    section_title: 'WHT rates',
    concept_ids: ['royalty'],
    module_relevance: ['WHT'],
    language: 'pl',
    source_type: 'statute',
    text: '## Art. 21\n\nStatute content.',
    char_count: 35,
  };
  const guidanceChunk: Chunk = {
    chunk_id: 'MF-OBJ-2025::s2-2',
    source_id: 'MF-OBJ-2025',
    section_ref: '§2.2',
    section_title: 'Conduit indicators',
    concept_ids: ['conduit_entity'],
    module_relevance: ['WHT'],
    language: 'pl',
    source_type: 'guidance',
    text: '## §2.2\n\nGuidance content.',
    char_count: 35,
  };
  const ragEnv = makeRagEnvWithChunks([statuteChunk, guidanceChunk]);

  // sourceType 'statute' — only the statute chunk should come back
  const result = parse(await ragEnv.consultLegalSources('WHT rates', undefined, undefined, 'statute'));
  const chunks = result['chunks'] as Record<string, unknown>[];
  assert.equal(chunks.length, 1, 'filter should return exactly 1 chunk');
  assert.equal(chunks[0]['source_id'], 'PL-CIT-2026', 'returned chunk should be the statute');
});

test('Phase 16 — consultLegalSources: passing undefined sourceType returns all chunks', async () => {
  // Both statute and guidance chunks should come back when no filter is applied.
  const statuteChunk: Chunk = {
    chunk_id: 'PL-CIT-2026::art26',
    source_id: 'PL-CIT-2026',
    section_ref: 'Art. 26',
    section_title: 'Remitter obligations',
    concept_ids: ['due_diligence'],
    module_relevance: ['WHT'],
    language: 'pl',
    source_type: 'statute',
    text: '## Art. 26\n\nStatute content.',
    char_count: 30,
  };
  const guidanceChunk: Chunk = {
    chunk_id: 'MF-OBJ-2025::s3-1',
    source_id: 'MF-OBJ-2025',
    section_ref: '§3.1',
    section_title: 'Due diligence',
    concept_ids: ['due_diligence'],
    module_relevance: ['WHT'],
    language: 'pl',
    source_type: 'guidance',
    text: '## §3.1\n\nGuidance content.',
    char_count: 30,
  };
  const ragEnv = makeRagEnvWithChunks([statuteChunk, guidanceChunk]);

  // No sourceType argument → both chunks returned
  const result = parse(await ragEnv.consultLegalSources('due diligence obligations'));
  const chunks = result['chunks'] as Record<string, unknown>[];
  assert.equal(chunks.length, 2, 'no filter should return all chunks');
});

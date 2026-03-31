import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WhtEnvironment } from './WhtEnvironment';

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

// ── checkEntitySubstance ──────────────────────────────────────────────────────

test('checkEntitySubstance: returns substance data with source field', () => {
  const result = parse(env.checkEntitySubstance('Alpine Holdings S.A.', 'Luxembourg'));

  assert.equal(result['entity'], 'Alpine Holdings S.A.');
  assert.equal(result['country'], 'Luxembourg');
  assert.ok(result['conduit_risk'], 'should include a conduit_risk assessment');
  assert.ok(result['source'],       'should include a source field');
});

// ── checkMliPpt ───────────────────────────────────────────────────────────────

test('checkMliPpt: Luxembourg returns mli_applies true with substance requirements', () => {
  const result = parse(env.checkMliPpt('Luxembourg'));

  assert.equal(result['mli_applies'], true);
  assert.ok(Array.isArray(result['substance_requirements']), 'should list substance requirements');
  assert.ok(
    (result['article'] as string).includes('Article 7'),
    'should reference Article 7 MLI'
  );
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
  const resultLow  = parse(live.getTreatyRate('Italy', 'dividend', 5));
  const resultHigh = parse(live.getTreatyRate('Italy', 'dividend', 50));

  assert.equal(resultLow['treaty_rate_percent'],  10, 'flat rate at low holding');
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

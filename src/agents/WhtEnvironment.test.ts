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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FactCheckerAgent } from './FactCheckerAgent';

// All tests run in simulate:true mode — no API calls, no GEMINI_API_KEY required.
// The simulation returns a structurally valid INCONCLUSIVE result for any input.

const agent = new FactCheckerAgent({ simulate: true });

const ORANGE_CLAIMS = [
  'Orange S.A. employs approximately 133,000 people globally',
  'Orange S.A. holds its registered office in Issy-les-Moulineaux, France',
  'Orange S.A. holds 50.67% of Orange Polska S.A.',
  'Orange S.A. filed 436 new patents in 2025',
  'Orange S.A. spent €1.4 billion on R&D in 2025',
];

test('FactCheckerAgent simulation: returns correct entity and country', async () => {
  const result = await agent.verify('Orange S.A.', 'France', ORANGE_CLAIMS);

  assert.equal(result.entity, 'Orange S.A.');
  assert.equal(result.country, 'France');
});

test('FactCheckerAgent simulation: returns one result entry per input claim', async () => {
  const result = await agent.verify('Orange S.A.', 'France', ORANGE_CLAIMS);

  assert.equal(result.claims.length, ORANGE_CLAIMS.length);
});

test('FactCheckerAgent simulation: simulation marks all claims UNVERIFIED', async () => {
  const result = await agent.verify('Orange S.A.', 'France', ORANGE_CLAIMS);

  for (const c of result.claims) {
    assert.equal(
      c.status,
      'UNVERIFIED',
      `claim "${c.claim}" should be UNVERIFIED in simulation mode`
    );
  }
});

test('FactCheckerAgent simulation: simulation returns INCONCLUSIVE overall assessment', async () => {
  const result = await agent.verify('Orange S.A.', 'France', ORANGE_CLAIMS);

  assert.equal(result.overall_assessment, 'INCONCLUSIVE');
});

test('FactCheckerAgent simulation: result includes non-empty wht_risk_flags', async () => {
  const result = await agent.verify('Orange S.A.', 'France', ORANGE_CLAIMS);

  assert.ok(Array.isArray(result.wht_risk_flags));
  assert.ok(result.wht_risk_flags.length > 0, 'simulation should include at least one risk flag');
});

test('FactCheckerAgent simulation: each claim entry has all required fields', async () => {
  const result = await agent.verify('Orange S.A.', 'France', ORANGE_CLAIMS);
  const VALID_STATUSES = new Set(['VERIFIED', 'UNVERIFIED', 'CONTRADICTED']);

  for (const c of result.claims) {
    assert.ok(typeof c.claim === 'string', 'claim must be a string');
    assert.ok(VALID_STATUSES.has(c.status), 'status must be VERIFIED/UNVERIFIED/CONTRADICTED');
    assert.ok(Array.isArray(c.sources), 'sources must be an array');
    assert.ok(typeof c.wht_relevance === 'string', 'wht_relevance must be a string');
  }
});

test('FactCheckerAgent simulation: source field indicates simulation mode', async () => {
  const result = await agent.verify('Orange S.A.', 'France', ORANGE_CLAIMS);

  assert.ok(
    result.source.toLowerCase().includes('simulation'),
    'source should mention simulation when API key is not configured'
  );
});

test('FactCheckerAgent simulation: verification_date is a valid ISO date string', async () => {
  const result = await agent.verify('Orange S.A.', 'France', ORANGE_CLAIMS);

  assert.match(
    result.verification_date,
    /^\d{4}-\d{2}-\d{2}$/,
    'verification_date should be YYYY-MM-DD format'
  );
});

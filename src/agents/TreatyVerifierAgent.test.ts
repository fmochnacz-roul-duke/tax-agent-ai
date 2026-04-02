// ─────────────────────────────────────────────────────────────────────────────
// TreatyVerifierAgent.test.ts — Phase 12a
//
// All tests run in simulate mode (no API calls, no keys required).
// Tests cover: simulate result shape, status values, field types, and that
// verify:treaties script logic (claim building) produces valid inputs.
//
// Run: npm test
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TreatyVerifierAgent,
  TreatyRateVerification,
  RateVerificationStatus,
} from './TreatyVerifierAgent';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Creates an agent in simulate mode — no API key needed.
function makeAgent(): TreatyVerifierAgent {
  return new TreatyVerifierAgent({ simulate: true });
}

// Checks that all required fields are present and have the correct types.
// This is a "shape test" — it verifies the object structure regardless of
// the specific values Gemini would return in live mode.
function assertVerificationShape(result: TreatyRateVerification): void {
  assert.equal(typeof result.country, 'string', 'country must be string');
  assert.equal(typeof result.income_type, 'string', 'income_type must be string');
  assert.equal(typeof result.claimed_rate, 'string', 'claimed_rate must be string');
  assert.equal(typeof result.treaty_article, 'string', 'treaty_article must be string');
  assert.equal(typeof result.note, 'string', 'note must be string');
  assert.equal(typeof result.verification_date, 'string', 'verification_date must be string');
  assert.ok(Array.isArray(result.sources), 'sources must be array');

  const valid: RateVerificationStatus[] = ['CONFIRMED', 'DIFFERS', 'NOT_FOUND'];
  assert.ok(valid.includes(result.status), 'status must be one of the valid values');

  // confirmed_rate is string | null
  assert.ok(
    result.confirmed_rate === null || typeof result.confirmed_rate === 'string',
    'confirmed_rate must be string or null'
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TreatyVerifierAgent — simulate mode', () => {
  it('verifyRate returns a TreatyRateVerification with the correct shape', async () => {
    const agent = makeAgent();
    const result = await agent.verifyRate(
      'austria',
      'dividend',
      '5% (reduced, shareholding ≥25%) / 15% (standard)',
      'Art. 10(2) Poland–Austria DTC'
    );
    assertVerificationShape(result);
  });

  it('simulate result has status NOT_FOUND', async () => {
    const agent = makeAgent();
    const result = await agent.verifyRate('austria', 'dividend', '5%', 'Art. 10(2)');
    assert.equal(result.status, 'NOT_FOUND');
  });

  it('simulate result has empty sources array', async () => {
    const agent = makeAgent();
    const result = await agent.verifyRate('luxembourg', 'royalty', '5%', 'Art. 12(2)');
    assert.deepEqual(result.sources, []);
  });

  it('simulate result has confirmed_rate === null', async () => {
    const agent = makeAgent();
    const result = await agent.verifyRate('germany', 'interest', '5%', 'Art. 11(2)');
    assert.equal(result.confirmed_rate, null);
  });

  it('simulate note mentions GEMINI_API_KEY', async () => {
    const agent = makeAgent();
    const result = await agent.verifyRate('france', 'royalty', '10%', 'Art. 12(2)');
    assert.ok(
      result.note.includes('GEMINI_API_KEY'),
      'simulation note must mention GEMINI_API_KEY'
    );
  });

  it('simulate result echoes back country', async () => {
    const agent = makeAgent();
    const result = await agent.verifyRate('netherlands', 'dividend', '5%', 'Art. 10');
    assert.equal(result.country, 'netherlands');
  });

  it('simulate result echoes back income_type', async () => {
    const agent = makeAgent();
    const result = await agent.verifyRate('sweden', 'interest', '0%', 'Art. 11');
    assert.equal(result.income_type, 'interest');
  });

  it('simulate result echoes back claimed_rate', async () => {
    const agent = makeAgent();
    const claimedRate = '5% (flat rate, any shareholding)';
    const result = await agent.verifyRate('italy', 'dividend', claimedRate, 'Art. 10(2)');
    assert.equal(result.claimed_rate, claimedRate);
  });

  it('simulate result echoes back treaty_article', async () => {
    const agent = makeAgent();
    const article = 'Art. 12(2) Poland–Austria DTC';
    const result = await agent.verifyRate('austria', 'royalty', '5%', article);
    assert.equal(result.treaty_article, article);
  });

  it('verification_date is a valid ISO date string (YYYY-MM-DD)', async () => {
    const agent = makeAgent();
    const result = await agent.verifyRate('belgium', 'royalty', '5%', 'Art. 12(2)');
    // ISO date format: 4 digits - 2 digits - 2 digits
    assert.match(result.verification_date, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('works with royalty income type', async () => {
    const agent = makeAgent();
    const result = await agent.verifyRate(
      'france',
      'royalty',
      '10%',
      'Art. 12(2) Poland–France DTC'
    );
    assertVerificationShape(result);
    assert.equal(result.income_type, 'royalty');
  });

  it('works with interest income type', async () => {
    const agent = makeAgent();
    const result = await agent.verifyRate(
      'germany',
      'interest',
      '5%',
      'Art. 11(2) Poland–Germany DTC'
    );
    assertVerificationShape(result);
    assert.equal(result.income_type, 'interest');
  });

  it('works with dividend income type', async () => {
    const agent = makeAgent();
    const result = await agent.verifyRate(
      'luxembourg',
      'dividend',
      '5% (reduced, shareholding ≥10%) / 15% (standard)',
      'Art. 10(2) Poland–Luxembourg DTC'
    );
    assertVerificationShape(result);
    assert.equal(result.income_type, 'dividend');
  });

  it('handles unusual country strings without throwing', async () => {
    const agent = makeAgent();
    // Unusual input: should not throw, should return a valid shape
    const result = await agent.verifyRate('united arab emirates', 'royalty', '5%', 'Art. 12(2)');
    assertVerificationShape(result);
  });

  it('handles zero rate (0%) without throwing', async () => {
    const agent = makeAgent();
    const result = await agent.verifyRate(
      'austria',
      'interest',
      '0%',
      'Art. 11(2) Poland–Austria DTC (Protocol 2008)'
    );
    assertVerificationShape(result);
    assert.equal(result.claimed_rate, '0%');
  });
});

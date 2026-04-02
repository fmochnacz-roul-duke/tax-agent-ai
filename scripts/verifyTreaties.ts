// ─────────────────────────────────────────────────────────────────────────────
// verifyTreaties.ts — Phase 12a
//
// Offline maintenance script: uses TreatyVerifierAgent (Gemini + Google Search)
// to verify every rate in data/treaties.json and writes the results back.
//
// Usage:
//   npm run verify:treaties              ← verifies all 36 countries
//   npm run verify:treaties -- austria   ← verifies one country only
//
// After running, each rate entry in treaties.json will have:
//   verified:           true   if Gemini found a matching rate in an official source
//   verified_at:        "YYYY-MM-DD"
//   verified_sources:   ["isap.sejm.gov.pl/...", ...]
//   verification_note:  any caveats or discrepancy detail
//
// Requires: GEMINI_API_KEY in .env (falls back to simulation if absent)
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { TreatyVerifierAgent, TreatyRateVerification } from '../src/agents/TreatyVerifierAgent';

// dotenv.config() reads the .env file from the project root into process.env.
// Must be called before any code that reads environment variables.
dotenv.config();

// ── Raw JSON types ────────────────────────────────────────────────────────────
//
// We read treaties.json as plain JavaScript objects before TypeScript can check
// their shape. `Record<string, unknown>` means "an object with string keys where
// the values can be anything". We narrow the shape ourselves in helper functions.

type RawRates = Record<string, unknown>;
type RawEntry = { treaty_name?: string; rates?: RawRates };
type RawDatabase = Record<string, unknown>;

// ── Claim builders ────────────────────────────────────────────────────────────
//
// These functions turn a raw rate object into a human-readable string that
// Gemini can search for. They also return the treaty_article field.
//
// The `unknown` parameter types are intentional — we don't know the JSON shape
// at compile time. We use `typeof` and `in` to narrow before accessing fields.

function buildDividendClaim(rate: unknown): { claimedRate: string; treatyArticle: string } | null {
  if (typeof rate !== 'object' || rate === null) return null;
  const r = rate as Record<string, unknown>;

  const treatyArticle = typeof r['treaty_article'] === 'string' ? r['treaty_article'] : '';
  if (!treatyArticle) return null;

  const reducedThreshold = typeof r['reduced_threshold'] === 'number' ? r['reduced_threshold'] : -1;
  const reducedRate = typeof r['reduced_rate'] === 'number' ? r['reduced_rate'] : null;
  const standardRate = typeof r['standard_rate'] === 'number' ? r['standard_rate'] : null;

  if (reducedRate === null || standardRate === null || reducedThreshold < 0) return null;

  const claimedRate =
    reducedThreshold === 0
      ? `${reducedRate}% (flat rate, any shareholding)`
      : `${reducedRate}% (reduced, shareholding ≥${reducedThreshold}%) / ${standardRate}% (standard)`;

  return { claimedRate, treatyArticle };
}

function buildFlatRateClaim(rate: unknown): { claimedRate: string; treatyArticle: string } | null {
  if (typeof rate !== 'object' || rate === null) return null;
  const r = rate as Record<string, unknown>;

  const treatyArticle = typeof r['treaty_article'] === 'string' ? r['treaty_article'] : '';
  const rateValue = typeof r['rate'] === 'number' ? r['rate'] : null;

  if (!treatyArticle || rateValue === null) return null;

  return { claimedRate: `${rateValue}%`, treatyArticle };
}

// ── Apply verification result to a rate object ────────────────────────────────
//
// Mutates the rate object in-place. We write the result fields regardless of
// status — even NOT_FOUND entries get a verification_date so we know the check
// was attempted and when.

function applyVerification(rate: Record<string, unknown>, result: TreatyRateVerification): void {
  // Only mark verified:true when Gemini found an exact match.
  if (result.status === 'CONFIRMED') {
    rate['verified'] = true;
  }
  // else: leave verified:false — rate is unconfirmed or differs from claimed

  rate['verified_at'] = result.verification_date;
  rate['verified_sources'] = result.sources;
  rate['verification_note'] = result.note;
}

// ── sleep helper ──────────────────────────────────────────────────────────────
//
// Gemini free tier has a rate limit (~15 requests/minute). We wait 1 second
// between calls to stay well within limits.
// Promise + setTimeout is the standard Node.js way to pause async code.

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const treatiesPath = path.join(__dirname, '..', 'data', 'treaties.json');
  const raw = JSON.parse(fs.readFileSync(treatiesPath, 'utf-8')) as RawDatabase;

  // Optional: single-country filter from CLI arg.
  // process.argv is an array: [node, scriptPath, arg1, arg2, ...]
  // We look for the first arg after '--' separator (npm passes args after --)
  const filterArg = process.argv.find((a, i) => i > 1 && !a.startsWith('-'));
  const filterCountry = filterArg?.toLowerCase() ?? null;

  const agent = new TreatyVerifierAgent({ simulate: false });

  // Counters for the final summary line.
  let total = 0;
  let confirmed = 0;
  let differs = 0;
  let notFound = 0;

  // Loop over every key in the database — skip the _meta key.
  for (const [country, rawEntry] of Object.entries(raw)) {
    if (country === '_meta') continue;

    // Apply single-country filter if provided.
    if (filterCountry !== null && country !== filterCountry) continue;

    const entry = rawEntry as RawEntry;
    const rates = entry.rates as RawRates | undefined;
    if (rates === undefined) continue;

    const treatyName = entry.treaty_name ?? country;
    console.log(`\n── ${country.toUpperCase()} (${treatyName}) ──`);

    // ── Dividend ────────────────────────────────────────────────────────────
    const divRate = rates['dividend'];
    if (divRate !== null && divRate !== undefined) {
      const claim = buildDividendClaim(divRate);
      if (claim !== null) {
        console.log(`  dividend  → ${claim.claimedRate}`);
        const result = await agent.verifyRate(
          country,
          'dividend',
          claim.claimedRate,
          claim.treatyArticle
        );
        console.log(
          `             ${result.status}${result.confirmed_rate ? ` (found: ${result.confirmed_rate})` : ''}`
        );
        if (result.sources.length > 0)
          console.log(`             sources: ${result.sources.slice(0, 2).join('; ')}`);
        applyVerification(divRate as Record<string, unknown>, result);
        total++;
        if (result.status === 'CONFIRMED') confirmed++;
        else if (result.status === 'DIFFERS') differs++;
        else notFound++;

        await sleep(1000);
      }
    }

    // ── Interest ────────────────────────────────────────────────────────────
    const intRate = rates['interest'];
    if (intRate !== null && intRate !== undefined) {
      const claim = buildFlatRateClaim(intRate);
      if (claim !== null) {
        console.log(`  interest  → ${claim.claimedRate}`);
        const result = await agent.verifyRate(
          country,
          'interest',
          claim.claimedRate,
          claim.treatyArticle
        );
        console.log(
          `             ${result.status}${result.confirmed_rate ? ` (found: ${result.confirmed_rate})` : ''}`
        );
        if (result.sources.length > 0)
          console.log(`             sources: ${result.sources.slice(0, 2).join('; ')}`);
        applyVerification(intRate as Record<string, unknown>, result);
        total++;
        if (result.status === 'CONFIRMED') confirmed++;
        else if (result.status === 'DIFFERS') differs++;
        else notFound++;

        await sleep(1000);
      }
    }

    // ── Royalty ─────────────────────────────────────────────────────────────
    const royRate = rates['royalty'];
    if (royRate !== null && royRate !== undefined) {
      const claim = buildFlatRateClaim(royRate);
      if (claim !== null) {
        console.log(`  royalty   → ${claim.claimedRate}`);
        const result = await agent.verifyRate(
          country,
          'royalty',
          claim.claimedRate,
          claim.treatyArticle
        );
        console.log(
          `             ${result.status}${result.confirmed_rate ? ` (found: ${result.confirmed_rate})` : ''}`
        );
        if (result.sources.length > 0)
          console.log(`             sources: ${result.sources.slice(0, 2).join('; ')}`);
        applyVerification(royRate as Record<string, unknown>, result);
        total++;
        if (result.status === 'CONFIRMED') confirmed++;
        else if (result.status === 'DIFFERS') differs++;
        else notFound++;

        await sleep(1000);
      }
    }
  }

  // Write the updated treaties.json back to disk.
  // JSON.stringify(value, null, 2) formats the JSON with 2-space indentation.
  fs.writeFileSync(treatiesPath, JSON.stringify(raw, null, 2) + '\n', 'utf-8');

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════');
  console.log('TREATY RATE VERIFICATION COMPLETE');
  console.log(`  Total rates checked : ${total}`);
  console.log(`  CONFIRMED           : ${confirmed}`);
  console.log(`  DIFFERS             : ${differs}`);
  console.log(`  NOT_FOUND           : ${notFound}`);
  console.log(`  treaties.json updated: ${treatiesPath}`);
  console.log('══════════════════════════════════════════');
}

main().catch((err) => {
  console.error('[VERIFY TREATIES] Fatal error:', err);
  process.exit(1);
});

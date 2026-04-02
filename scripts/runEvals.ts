// runEvals.ts — Phase 15: Golden Dataset Evaluation Harness
//
// Loads every JSON file from data/golden_cases/, runs runWhtAnalysis() against
// each case's input, and compares the actual output against expected values.
//
// Triangulation Rule: a case is marked FAIL if EITHER:
//   (a) report.bo_overall !== expected.bo_overall, OR
//   (b) the applied rate does not match expected.treaty_rate_percent
//       (for cases with acceptable_rates[], any rate in the array is a PASS)
//
// Run with:
//   npm run eval
//
// The script exits with code 1 if any case fails, so it can be used in CI.

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { runWhtAnalysis, validateInput } from '../src/agents/BeneficialOwnerAgent';
import type { WhtReport, BoOverall } from '../src/agents/BeneficialOwnerAgent';

dotenv.config();

// ── Types ──────────────────────────────────────────────────────────────────────

// The shape of each file in data/golden_cases/.
// These fields are the source of truth for evaluation.
interface GoldenCase {
  case_id: string;
  description: string;
  legal_notes: string;
  input: Record<string, unknown>;
  expected: {
    bo_overall: BoOverall;
    treaty_rate_percent: number;
    acceptable_rates?: number[]; // when multiple rates are legally valid
    conduit_risk?: boolean;
    eval_note?: string;
  };
}

// Per-case result emitted after each run.
interface EvalResult {
  case_id: string;
  description: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  bo_verdict: 'PASS' | 'FAIL'; // expected vs actual bo_overall
  rate_verdict: 'PASS' | 'FAIL'; // expected vs actual rate
  conduit_verdict?: 'PASS' | 'FAIL'; // only when expected.conduit_risk is set
  expected_bo: BoOverall;
  actual_bo: BoOverall;
  expected_rate: number | number[];
  actual_rate: number | null;
  expected_conduit?: boolean;
  actual_conduit?: boolean;
  data_confidence: string;
  error?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// extractAppliedRate — reads the treaty_rate_percent from the wht_rate finding.
// The agent stores the rate as a number inside the parsed findings object.
// Returns null if the rate was not recorded (e.g. agent bailed before calling get_treaty_rate).
function extractAppliedRate(report: WhtReport): number | null {
  const whtRate = report.findings['wht_rate'];
  if (whtRate === null || whtRate === undefined) return null;
  if (typeof whtRate !== 'object') return null;
  const rate = (whtRate as Record<string, unknown>)['treaty_rate_percent'];
  if (typeof rate === 'number') return rate;
  return null;
}

// ratePass — returns true when the actual rate satisfies the expected value.
// When acceptable_rates is provided, any value in the array is accepted.
// When it is absent, the actual must exactly equal treaty_rate_percent.
function ratePass(
  actual: number | null,
  expected: number,
  acceptable: number[] | undefined
): boolean {
  if (actual === null) return false;
  if (acceptable !== undefined) return acceptable.includes(actual);
  return actual === expected;
}

// pad — right-pads a string for tabular output.
function pad(s: string, width: number): string {
  return s.padEnd(width, ' ');
}

// ── Load golden cases ──────────────────────────────────────────────────────────

const CASES_DIR = path.resolve(__dirname, '..', 'data', 'golden_cases');

if (!fs.existsSync(CASES_DIR)) {
  console.error(`Golden cases directory not found: ${CASES_DIR}`);
  process.exit(1);
}

const caseFiles = fs
  .readdirSync(CASES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort(); // run in filename order (case_01, case_02, …)

if (caseFiles.length === 0) {
  console.error('No golden case files found in data/golden_cases/');
  process.exit(1);
}

console.log(`\n${'─'.repeat(72)}`);
console.log('  WHT Agent — Golden Dataset Evaluation');
console.log(`  Phase 15 | ${caseFiles.length} cases | ${new Date().toISOString()}`);
console.log(`${'─'.repeat(72)}\n`);

// ── Run each case ──────────────────────────────────────────────────────────────

const results: EvalResult[] = [];

for (const file of caseFiles) {
  const filePath = path.join(CASES_DIR, file);
  let gc: GoldenCase;

  // Parse the golden case file.
  try {
    gc = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as GoldenCase;
  } catch (err) {
    results.push({
      case_id: file,
      description: file,
      status: 'ERROR',
      bo_verdict: 'FAIL',
      rate_verdict: 'FAIL',
      expected_bo: 'UNCERTAIN',
      actual_bo: 'UNCERTAIN',
      expected_rate: 0,
      actual_rate: null,
      data_confidence: 'UNKNOWN',
      error: `Could not parse file: ${String(err)}`,
    });
    continue;
  }

  process.stdout.write(`  Running ${gc.case_id}: ${gc.description.slice(0, 50)}… `);

  let report: WhtReport;
  try {
    // validateInput() throws a ZodError if the input is malformed.
    const input = validateInput(gc.input);
    report = await runWhtAnalysis(input);
  } catch (err) {
    results.push({
      case_id: gc.case_id,
      description: gc.description,
      status: 'ERROR',
      bo_verdict: 'FAIL',
      rate_verdict: 'FAIL',
      expected_bo: gc.expected.bo_overall,
      actual_bo: 'UNCERTAIN',
      expected_rate: gc.expected.acceptable_rates ?? gc.expected.treaty_rate_percent,
      actual_rate: null,
      data_confidence: 'UNKNOWN',
      error: String(err),
    });
    console.log('ERROR');
    continue;
  }

  // Evaluate BO verdict.
  const boVerd: 'PASS' | 'FAIL' = report.bo_overall === gc.expected.bo_overall ? 'PASS' : 'FAIL';

  // Evaluate applied rate.
  const actualRate = extractAppliedRate(report);
  const rateVerd: 'PASS' | 'FAIL' = ratePass(
    actualRate,
    gc.expected.treaty_rate_percent,
    gc.expected.acceptable_rates
  )
    ? 'PASS'
    : 'FAIL';

  // Evaluate conduit_risk when the golden case specifies it.
  let conduitVerd: 'PASS' | 'FAIL' | undefined;
  if (gc.expected.conduit_risk !== undefined) {
    conduitVerd = report.conduit_risk === gc.expected.conduit_risk ? 'PASS' : 'FAIL';
  }

  const overallStatus: 'PASS' | 'FAIL' =
    boVerd === 'PASS' &&
    rateVerd === 'PASS' &&
    (conduitVerd === undefined || conduitVerd === 'PASS')
      ? 'PASS'
      : 'FAIL';

  console.log(overallStatus);

  results.push({
    case_id: gc.case_id,
    description: gc.description,
    status: overallStatus,
    bo_verdict: boVerd,
    rate_verdict: rateVerd,
    ...(conduitVerd !== undefined ? { conduit_verdict: conduitVerd } : {}),
    expected_bo: gc.expected.bo_overall,
    actual_bo: report.bo_overall,
    expected_rate: gc.expected.acceptable_rates ?? gc.expected.treaty_rate_percent,
    actual_rate: actualRate,
    ...(gc.expected.conduit_risk !== undefined
      ? {
          expected_conduit: gc.expected.conduit_risk,
          actual_conduit: report.conduit_risk,
        }
      : {}),
    data_confidence: report.data_confidence,
  });
}

// ── Summary table ──────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(72)}`);
console.log('  Summary');
console.log(`${'─'.repeat(72)}`);
console.log(
  `  ${pad('ID', 10)} ${pad('BO', 6)} ${pad('Rate', 6)} ${pad('Conduit', 8)} ${pad('Conf', 8)} ${pad('Status', 6)}`
);
console.log(`  ${'─'.repeat(66)}`);

for (const r of results) {
  const conduitStr = r.conduit_verdict ?? '—';
  const line = [
    pad(r.case_id, 10),
    pad(r.bo_verdict === 'PASS' ? '✔' : '✘ ' + r.actual_bo, 16),
    pad(r.rate_verdict === 'PASS' ? '✔' : '✘ ' + String(r.actual_rate ?? 'null'), 14),
    pad(conduitStr === '—' ? '—' : conduitStr === 'PASS' ? '✔' : '✘', 8),
    pad(r.data_confidence, 8),
    r.status,
  ].join('  ');
  console.log(`  ${line}`);
}

const passed = results.filter((r) => r.status === 'PASS').length;
const failed = results.filter((r) => r.status === 'FAIL').length;
const errors = results.filter((r) => r.status === 'ERROR').length;

console.log(`${'─'.repeat(72)}`);
console.log(`  PASS: ${passed}  FAIL: ${failed}  ERROR: ${errors}  TOTAL: ${results.length}`);
console.log(`${'─'.repeat(72)}\n`);

// Print failure details for any FAIL/ERROR cases.
const nonPassing = results.filter((r) => r.status !== 'PASS');
if (nonPassing.length > 0) {
  console.log('  Failure details:\n');
  for (const r of nonPassing) {
    console.log(`  [${r.case_id}] ${r.description}`);
    if (r.error) {
      console.log(`    ERROR: ${r.error}`);
    } else {
      if (r.bo_verdict === 'FAIL') {
        console.log(`    BO:   expected ${r.expected_bo}  got ${r.actual_bo}`);
      }
      if (r.rate_verdict === 'FAIL') {
        console.log(
          `    Rate: expected ${JSON.stringify(r.expected_rate)}%  got ${String(r.actual_rate)}%`
        );
      }
      if (r.conduit_verdict === 'FAIL') {
        console.log(
          `    Conduit: expected ${String(r.expected_conduit)}  got ${String(r.actual_conduit)}`
        );
      }
    }
    console.log('');
  }
}

// Exit non-zero so CI fails on any case failure.
if (failed > 0 || errors > 0) {
  process.exit(1);
}

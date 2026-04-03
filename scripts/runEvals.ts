// runEvals.ts — QA-4: Golden Dataset Evaluation Harness v2.0
//
// Loads every JSON file from data/golden_cases/, runs runWhtAnalysis() against
// each case's input, and compares the actual output against expected values.
//
// Triangulation Rule: a case is marked FAIL if EITHER:
//   (a) report.bo_overall !== expected.bo_overall, OR
//   (b) the applied rate does not match expected.treaty_rate_percent
//       (for cases with acceptable_rates[], any rate in the array is a PASS)
//
// v2.0 additions (QA-4):
//   - Case status filtering: only 'active' cases run by default.
//     Pass --include-scaffold to also run scaffold cases (EU27 placeholders).
//   - sttr_topup_applies: informational flag shown in output (agent does not yet
//     expose a dedicated STTR field; covered by rate + bo_overall checks).
//   - rate_basis: shown in summary table for context.
//
// Run with:
//   npm run eval
//   npm run eval -- --include-scaffold
//
// The script exits with code 1 if any case fails, so it can be used in CI.

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { runWhtAnalysis, validateInput } from '../src/agents/BeneficialOwnerAgent';
import type { WhtReport, BoOverall } from '../src/agents/BeneficialOwnerAgent';

dotenv.config();

// ── CLI flags ──────────────────────────────────────────────────────────────────

// --include-scaffold: run scaffold cases in addition to active cases.
// Scaffold cases count toward the summary total but are reported separately
// and do NOT cause a non-zero exit code if they fail.
const includeScaffold = process.argv.includes('--include-scaffold');

// ── Types ──────────────────────────────────────────────────────────────────────

// The shape of each file in data/golden_cases/.
// These fields are the source of truth for evaluation.
//
// status — added in QA-4:
//   'active'   — manually reviewed; failures cause CI exit code 1.
//   'scaffold' — auto-generated or rate not yet verified; skipped by default.
//   (omitted)  — treated as 'active' for backward compatibility.
interface GoldenCase {
  case_id: string;
  description: string;
  status?: 'active' | 'scaffold';
  legal_notes?: string;
  input: Record<string, unknown>;
  expected: {
    bo_overall: BoOverall;
    treaty_rate_percent: number;
    acceptable_rates?: number[]; // when multiple rates are legally valid
    conduit_risk?: boolean;
    sttr_topup_applies?: boolean; // v2.0 — STTR 9% floor indicator (informational)
    rate_basis?: string; // v2.0 — 'treaty' | 'domestic' | 'sttr_override' | etc. (display only)
    eval_note?: string;
  };
}

// Per-case result emitted after each run.
interface EvalResult {
  case_id: string;
  description: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  is_scaffold: boolean; // true for scaffold cases
  bo_verdict: 'PASS' | 'FAIL'; // expected vs actual bo_overall
  rate_verdict: 'PASS' | 'FAIL'; // expected vs actual rate
  conduit_verdict?: 'PASS' | 'FAIL'; // only when expected.conduit_risk is set
  sttr_note?: string; // v2.0 — 'YES' | 'NO' when sttr_topup_applies is set
  rate_basis?: string; // v2.0 — from expected.rate_basis
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

const allCaseFiles = fs
  .readdirSync(CASES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort(); // run in filename order (case_01, case_02, …)

if (allCaseFiles.length === 0) {
  console.error('No golden case files found in data/golden_cases/');
  process.exit(1);
}

// Parse all case files, then apply status filter.
const allCases: { file: string; gc: GoldenCase }[] = [];
const parseErrors: string[] = [];

for (const file of allCaseFiles) {
  const filePath = path.join(CASES_DIR, file);
  try {
    const gc = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as GoldenCase;
    allCases.push({ file, gc });
  } catch (err) {
    parseErrors.push(`${file}: ${String(err)}`);
  }
}

// Separate active vs scaffold cases.
const activeCases = allCases.filter((c) => (c.gc.status ?? 'active') === 'active');
const scaffoldCases = allCases.filter((c) => c.gc.status === 'scaffold');

// Decide which cases to run.
const casesToRun = includeScaffold ? allCases : activeCases;

console.log(`\n${'─'.repeat(76)}`);
console.log('  WHT Agent — Golden Dataset Evaluation v2.0');
console.log(
  `  QA-4 | ${casesToRun.length} cases (${activeCases.length} active, ${scaffoldCases.length} scaffold${includeScaffold ? ', all included' : ', scaffold skipped'}) | ${new Date().toISOString()}`
);
console.log(`${'─'.repeat(76)}\n`);

if (parseErrors.length > 0) {
  console.error('  Parse errors (these files were skipped):');
  parseErrors.forEach((e) => console.error(`    ${e}`));
  console.log('');
}

// ── Run each case ──────────────────────────────────────────────────────────────

const results: EvalResult[] = [];

for (const { gc } of casesToRun) {
  const isScaffold = gc.status === 'scaffold';
  const scaffoldLabel = isScaffold ? ' [SCAFFOLD]' : '';

  process.stdout.write(`  Running ${gc.case_id}${scaffoldLabel}: ${gc.description.slice(0, 46)}… `);

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
      is_scaffold: isScaffold,
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

  // v2.0 — STTR informational note. The agent does not yet expose a dedicated
  // sttr_topup_applies field on WhtReport. Coverage is via rate=9% + UNCERTAIN.
  // This note is purely informational and does not affect PASS/FAIL.
  let sttrNote: string | undefined;
  if (gc.expected.sttr_topup_applies !== undefined) {
    sttrNote = gc.expected.sttr_topup_applies ? 'expected:YES' : 'expected:NO';
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
    is_scaffold: isScaffold,
    bo_verdict: boVerd,
    rate_verdict: rateVerd,
    ...(conduitVerd !== undefined ? { conduit_verdict: conduitVerd } : {}),
    ...(sttrNote !== undefined ? { sttr_note: sttrNote } : {}),
    rate_basis: gc.expected.rate_basis,
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

console.log(`\n${'─'.repeat(76)}`);
console.log('  Summary');
console.log(`${'─'.repeat(76)}`);
console.log(
  `  ${pad('ID', 10)} ${pad('BO', 16)} ${pad('Rate', 14)} ${pad('Cond', 5)} ${pad('Basis', 16)} ${pad('Conf', 8)} Status`
);
console.log(`  ${'─'.repeat(72)}`);

for (const r of results) {
  const conduitStr = r.conduit_verdict ?? '—';
  const basisStr = r.rate_basis ?? '—';
  const scaffoldMark = r.is_scaffold ? '†' : ' ';
  const line = [
    pad(r.case_id, 10),
    pad(r.bo_verdict === 'PASS' ? '✔' : '✘ ' + r.actual_bo, 16),
    pad(r.rate_verdict === 'PASS' ? '✔' : '✘ ' + String(r.actual_rate ?? 'null'), 14),
    pad(conduitStr === '—' ? '—' : conduitStr === 'PASS' ? '✔' : '✘', 5),
    pad(basisStr.slice(0, 15), 16),
    pad(r.data_confidence, 8),
    r.status + scaffoldMark,
  ].join('  ');
  console.log(`  ${line}`);
}

// Count active vs scaffold results separately.
const activeResults = results.filter((r) => !r.is_scaffold);
const scaffoldResults = results.filter((r) => r.is_scaffold);

const passed = activeResults.filter((r) => r.status === 'PASS').length;
const failed = activeResults.filter((r) => r.status === 'FAIL').length;
const errors = activeResults.filter((r) => r.status === 'ERROR').length;

const scaffoldPassed = scaffoldResults.filter((r) => r.status === 'PASS').length;
const scaffoldFailed = scaffoldResults.filter((r) => r.status !== 'PASS').length;

console.log(`${'─'.repeat(76)}`);
console.log(
  `  Active  — PASS: ${passed}  FAIL: ${failed}  ERROR: ${errors}  TOTAL: ${activeResults.length}`
);
if (includeScaffold && scaffoldResults.length > 0) {
  console.log(
    `  Scaffold— PASS: ${scaffoldPassed}  FAIL/ERR: ${scaffoldFailed}  TOTAL: ${scaffoldResults.length}  († not counted in CI)`
  );
}
console.log(`${'─'.repeat(76)}\n`);

if (includeScaffold && scaffoldResults.length > 0) {
  console.log('  † Scaffold cases are informational. Promote to active after rate verification.\n');
}

// Print failure details for any FAIL/ERROR cases.
const nonPassing = results.filter((r) => r.status !== 'PASS');
if (nonPassing.length > 0) {
  console.log('  Failure details:\n');
  for (const r of nonPassing) {
    const label = r.is_scaffold ? ' [SCAFFOLD]' : '';
    console.log(`  [${r.case_id}${label}] ${r.description}`);
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

// Exit non-zero on active case failures only.
// Scaffold failures do not fail CI.
if (failed > 0 || errors > 0) {
  process.exit(1);
}

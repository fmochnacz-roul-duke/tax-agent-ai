import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { LLM, Message, Tool, ToolFactory } from '../shared';
import { Goal, buildSystemPrompt } from '../shared/Goal';
import { Memory } from '../shared/Memory';
import { WhtEnvironment } from './WhtEnvironment';

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// BENEFICIAL OWNER AGENT — GAME framework implementation
//
// This is the product-grade version of the WHT agent, built using all four
// GAME components explicitly separated:
//
//   G — Goals defined as structured objects with priorities
//   A — Tools defined with JSON Schema, using ToolFactory for common tools
//   M — Memory class managing both conversation history and structured findings
//   E — WhtEnvironment owns all tool implementations; swap simulate→live here
//
// The agent loop itself is generic — it contains no WHT-specific logic.
// All domain knowledge lives in Goals, Tools, and the Environment.
// ─────────────────────────────────────────────────────────────────────────────

// ── G: GOALS ─────────────────────────────────────────────────────────────────
//
// Goals are ordered by priority. The model sees them highest-first in the
// system prompt. The agent is expected to satisfy them in that order.

const WHT_GOALS: Goal[] = [
  {
    name: 'Verify treaty',
    description:
      'Confirm whether a tax treaty (DTC) is in force between Poland and the ' +
      'beneficial owner\'s country of residence, and whether the MLI applies.',
    priority: 10,
  },
  {
    name: 'Determine WHT rate',
    description:
      'Identify the correct Polish withholding tax rate for the payment type ' +
      'under the applicable treaty, including the condition for the reduced rate.',
    priority: 8,
  },
  {
    name: 'Check EU Directive exemption',
    description:
      'For interest and royalty payments: call check_directive_exemption using ' +
      'the shareholding_percentage stated in the task (e.g. "holds X%") and the ' +
      'holding period from the substance notes. Determines whether the EU Interest ' +
      'and Royalties Directive (2003/49/EC, Art. 21 Polish CIT Act) provides a 0% ' +
      'WHT exemption. Requires: EU member state recipient, ≥25% shareholding held ' +
      'for ≥2 uninterrupted years. If conditions are met, 0% supersedes the treaty ' +
      'rate. The Directive does NOT cover dividends.',
    priority: 7,
  },
  {
    name: 'Assess beneficial owner status',
    description:
      'Call check_entity_substance to obtain a structured substance profile aligned ' +
      'with Art. 4a pkt 29 CIT (MF Objaśnienia podatkowe z 3 lipca 2025 r.). ' +
      'The result includes: (a) substance_tier — STRONG/ADEQUATE/WEAK/CONDUIT; ' +
      '(b) bo_preliminary — preliminary result for each of the three cumulative BO conditions; ' +
      '(c) conduit_indicators — specific red flags (pass-through obligation, rapid forwarding, etc.). ' +
      'Assess all three conditions: ' +
      '(1) own benefit — entity receives income for its own account and exercises economic dominion; ' +
      '(2) not conduit — no contractual OR factual obligation to forward the payment upstream; ' +
      '(3) genuine activity — genuine business in country of residence (holding companies: lower ' +
      'threshold per MF Objaśnienia §2.3.1 applies). ' +
      'The BO test is BINARY — report PASS or FAIL for each condition. ' +
      'A FAIL on any single condition is sufficient to deny treaty/directive benefits.',
    priority: 7,
  },
  {
    name: 'DEMPE analysis for royalties',
    description:
      'When the income is a royalty: determine which entity controls the ' +
      'Development, Enhancement, Maintenance, Protection, and Exploitation ' +
      '(DEMPE) of the intangible (OECD BEPS Actions 8–10). The entity that ' +
      'controls DEMPE functions and bears the associated economic risk is the ' +
      'true economic owner of the IP and entitled to the royalty as beneficial owner. ' +
      'Also verify that the applicable treaty contains a royalties article (Art. 12) ' +
      'and that the payment falls within its definition — if not, the income falls ' +
      'to Business Profits (Art. 7) and Poland has no withholding right.',
    priority: 9,
  },
  {
    name: 'Assess MLI / PPT risk',
    description:
      'Determine whether the MLI Principal Purpose Test applies and whether the ' +
      'entity\'s substance profile creates a risk of treaty benefit denial.',
    priority: 6,
  },
  {
    name: 'Check Pay and Refund compliance',
    description:
      'Determine whether the Polish Pay and Refund mechanism (Art. 26 §2c CIT Act) ' +
      'applies: it is triggered when the recipient is a related party and total ' +
      'payments exceed PLN 2,000,000 in the tax year. If triggered, the Polish payer ' +
      'must withhold at the full domestic rate (20% royalties/interest, 19% dividends) ' +
      'and the recipient claims a refund — unless the payer holds a valid Opinion on ' +
      'WHT Exemption (Art. 26b CIT) or submits a WH-OS management statement.',
    priority: 4,
  },
];

const WHT_PERSONA =
  'You are a Polish withholding tax (WHT) analysis agent working for an ' +
  'in-house tax team. Your role is to analyse payment transactions and ' +
  'determine the correct WHT treatment. Always cite treaty articles and ' +
  'data sources in your final answer. Never guess — use only tool results. ' +
  'Work systematically: check the ESTABLISHED FINDINGS block before every tool ' +
  'call — if a finding already covers the information you need, do not call ' +
  'that tool again. Call terminate as soon as all applicable goals are addressed.';

// ── A: TOOLS (definitions only — implementations are in WhtEnvironment) ───────

function buildWhtTools(): Tool[] {
  return [
    {
      name: 'check_treaty',
      description:
        'Checks whether a Double Taxation Convention is in force between ' +
        'Poland and the specified country, and whether MLI applies.',
      parameters: {
        type: 'object',
        properties: {
          residence_country: {
            type: 'string',
            description: 'Country of residence of the beneficial owner',
          },
        },
        required: ['residence_country'],
      },
    },
    {
      name: 'get_treaty_rate',
      description:
        'Returns the WHT rate under the applicable Poland treaty for a ' +
        'specific income type and shareholding level, plus the domestic rate ' +
        'and treaty article reference.',
      parameters: {
        type: 'object',
        properties: {
          residence_country: { type: 'string', description: 'Country of residence' },
          income_type: {
            type: 'string',
            enum: ['dividend', 'interest', 'royalty'],
            description: 'Type of income',
          },
          shareholding_percentage: {
            type: 'number',
            description: 'Percentage of capital held by recipient (dividends only; pass 0 otherwise)',
          },
        },
        required: ['residence_country', 'income_type', 'shareholding_percentage'],
      },
    },
    {
      name: 'check_entity_substance',
      description:
        'Returns a structured economic substance profile aligned with the Polish ' +
        'BO test (Art. 4a pkt 29 CIT, MF Objaśnienia podatkowe z 3 lipca 2025 r.). ' +
        'Output includes: substance_factors (employees, office, management independence, ' +
        'own assets, operating costs, capital financing), conduit_indicators (pass-through ' +
        'obligation, rapid forwarding, nominal margin, capital insufficiency), ' +
        'substance_tier (STRONG/ADEQUATE/WEAK/CONDUIT), and bo_preliminary — a preliminary ' +
        'pass/fail result for each of the three cumulative BO conditions with supporting notes.',
      parameters: {
        type: 'object',
        properties: {
          entity_name: { type: 'string', description: 'Name of the entity' },
          country: { type: 'string', description: 'Country of registration' },
        },
        required: ['entity_name', 'country'],
      },
    },
    {
      name: 'check_mli_ppt',
      description:
        'Checks whether the MLI Principal Purpose Test (Article 7) applies ' +
        'to the treaty and what substance evidence is required.',
      parameters: {
        type: 'object',
        properties: {
          residence_country: { type: 'string', description: 'Country of residence' },
        },
        required: ['residence_country'],
      },
    },
    {
      name: 'check_directive_exemption',
      description:
        'Checks whether the EU Interest and Royalties Directive (2003/49/EC, ' +
        'Art. 21 Polish CIT Act) provides a 0% WHT exemption. Applies to interest ' +
        'and royalties only — not dividends. Call this for every interest or royalty ' +
        'scenario where the recipient is in an EU member state.',
      parameters: {
        type: 'object',
        properties: {
          residence_country: {
            type: 'string',
            description: 'Country of residence of the recipient',
          },
          income_type: {
            type: 'string',
            enum: ['interest', 'royalty'],
            description: 'Type of income — Directive covers interest and royalties only',
          },
          shareholding_percentage: {
            type: 'number',
            description: 'Percentage of the payer\'s share capital held by the recipient',
          },
          holding_years: {
            type: 'number',
            description: 'Number of years the shareholding has been held uninterruptedly',
          },
        },
        required: ['residence_country', 'income_type', 'shareholding_percentage', 'holding_years'],
      },
    },
    {
      name: 'check_pay_and_refund',
      description:
        'Checks whether the Polish Pay and Refund mechanism (Art. 26 §2c CIT Act) ' +
        'applies. Triggered when the recipient is a related party and total payments ' +
        'exceed PLN 2,000,000 in the tax year. Returns the domestic withholding rate ' +
        'that must be applied upfront and the two relief options (Opinion on WHT ' +
        'Exemption vs. WH-OS statement). Pass annual_payment_pln = 0 if amount is ' +
        'unknown — a conservative assumption (threshold exceeded) will be applied.',
      parameters: {
        type: 'object',
        properties: {
          income_type: {
            type: 'string',
            enum: ['dividend', 'interest', 'royalty'],
            description: 'Type of income',
          },
          related_party: {
            type: 'boolean',
            description: 'Whether the recipient is a related party under Art. 11a CIT',
          },
          annual_payment_pln: {
            type: 'number',
            description: 'Estimated total annual payments in PLN. Pass 0 if unknown.',
          },
        },
        required: ['income_type', 'related_party', 'annual_payment_pln'],
      },
    },
    {
      name: 'analyse_dempe',
      description:
        'Performs a DEMPE analysis (Development, Enhancement, Maintenance, ' +
        'Protection, Exploitation) to assess whether the recipient entity ' +
        'economically owns the intangible and is entitled to the royalty as ' +
        'beneficial owner (OECD BEPS Actions 8–10, TP Guidelines Ch. VI). ' +
        'Also flags whether the applicable treaty Art. 12 covers the payment — ' +
        'call this tool for every royalty income scenario before get_treaty_rate.',
      parameters: {
        type: 'object',
        properties: {
          entity_name: {
            type: 'string',
            description: 'Name of the entity claiming the royalty',
          },
          country: {
            type: 'string',
            description: 'Country of residence of the entity',
          },
          ip_type: {
            type: 'string',
            enum: ['brand', 'technology', 'patent', 'software', 'know_how', 'mixed'],
            description: 'Type of intangible property being licensed',
          },
        },
        required: ['entity_name', 'country', 'ip_type'],
      },
    },
    // ToolFactory.terminate() — no need to type this out per agent
    ToolFactory.terminate(),
  ];
}

// ── M: MODEL EFFICIENCY ───────────────────────────────────────────────────────
//
// MATE principle — M: choose the right model for each iteration, not one model
// for everything.
//
// How it works in this agent:
//   - Early iterations call simple lookup tools (check_treaty, get_treaty_rate,
//     check_directive_exemption). These do not require the most capable model.
//   - Once complex findings arrive — substance profile (entity_substance),
//     DEMPE analysis (dempe_analysis), or MLI PPT assessment (mli_ppt_status) —
//     the model must reason over multi-condition legal frameworks. Switch to the
//     powerful tier for synthesis.
//
// COMPLEX_FINDINGS: the set of finding keys that indicate complex data is present.
// Any key in this set in the current findings map triggers the switch.

const COMPLEX_FINDINGS = new Set([
  'entity_substance',
  'dempe_analysis',
  'mli_ppt_status',
]);

// selectLlm() returns the appropriate LLM instance for the current iteration.
// Takes the current findings map and both LLM instances; returns one of them.
// The agent loop calls this before each generateWithTools() call.
//
// 'findings' is Record<string, string> because Memory.getFindings() returns that type.
// Object.keys() gives us the array of current finding keys to check against the Set.
function selectLlm(
  findings: Record<string, string>,
  fastLlm: LLM,
  powerfulLlm: LLM
): LLM {
  const hasComplexData = Object.keys(findings).some(k => COMPLEX_FINDINGS.has(k));
  return hasComplexData ? powerfulLlm : fastLlm;
}

// ── INPUT PARSING ─────────────────────────────────────────────────────────────
//
// Phase 2: accept structured JSON input from the command line instead of a
// hardcoded task string.
//
// Usage:
//   npm run tax:agent -- --input data/example_input.json
//
// The JSON file must match the AgentInput interface below.
// validateInput() checks every field and exits with a clear error if invalid.
// buildTaskString() turns the structured input into the natural-language
// task string that the agent loop receives.

// AgentInput — the TypeScript type that mirrors the JSON schema.
// 'dividend' | 'interest' | 'royalty' is a union type: only these three string
// values are allowed for income_type. TypeScript enforces this at compile time.
interface AgentInput {
  entity_name: string;
  country: string;
  income_type: 'dividend' | 'interest' | 'royalty';
  shareholding_percentage: number;
  substance_notes?: string;
  // annual_payment_pln: used by check_pay_and_refund to determine whether the
  // PLN 2,000,000 threshold is exceeded. Pass 0 (or omit) if unknown — the
  // tool will apply a conservative assumption (threshold exceeded).
  annual_payment_pln?: number;
  // related_party: whether the recipient is a related party under Art. 11a CIT.
  // When provided, the agent passes this value directly to check_pay_and_refund
  // instead of having to infer it from substance_notes.
  // If omitted, the agent must determine related-party status from context.
  related_party?: boolean;
}

// validateInput() narrows an unknown value to AgentInput.
// We receive JSON.parse() output as type `unknown` (we don't know its shape yet).
// Each check confirms a field exists and has the right type, then TypeScript knows
// the final object satisfies the interface.
function validateInput(raw: unknown): AgentInput {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Input file must contain a JSON object.');
  }

  // Cast to a record so we can access properties by name.
  // Record<string, unknown> means: an object whose keys are strings and whose
  // values are still unknown (we haven't checked them yet).
  const obj = raw as Record<string, unknown>;

  const { entity_name, country, income_type, shareholding_percentage, substance_notes } = obj;

  if (typeof entity_name !== 'string' || entity_name.trim() === '') {
    throw new Error('entity_name must be a non-empty string.');
  }
  if (typeof country !== 'string' || country.trim() === '') {
    throw new Error('country must be a non-empty string.');
  }

  const validTypes = ['dividend', 'interest', 'royalty'] as const;
  // 'as const' tells TypeScript to treat the array as a tuple of literal types,
  // not just string[]. That lets .includes() accept 'dividend' | 'interest' | 'royalty'.
  if (!validTypes.includes(income_type as (typeof validTypes)[number])) {
    throw new Error(`income_type must be one of: ${validTypes.join(', ')}.`);
  }

  if (
    typeof shareholding_percentage !== 'number' ||
    shareholding_percentage < 0 ||
    shareholding_percentage > 100
  ) {
    throw new Error('shareholding_percentage must be a number between 0 and 100.');
  }

  if (substance_notes !== undefined && typeof substance_notes !== 'string') {
    throw new Error('substance_notes must be a string when provided.');
  }

  const { annual_payment_pln } = obj;
  if (
    annual_payment_pln !== undefined &&
    (typeof annual_payment_pln !== 'number' || annual_payment_pln < 0)
  ) {
    throw new Error('annual_payment_pln must be a non-negative number when provided.');
  }

  const { related_party } = obj;
  if (related_party !== undefined && typeof related_party !== 'boolean') {
    throw new Error('related_party must be a boolean (true or false) when provided.');
  }

  return {
    entity_name,
    country,
    income_type: income_type as AgentInput['income_type'],
    shareholding_percentage,
    substance_notes:    substance_notes    as string  | undefined,
    annual_payment_pln: annual_payment_pln as number  | undefined,
    related_party:      related_party      as boolean | undefined,
  };
}

// parseInput() reads process.argv looking for --input <file>.
// process.argv is the array of command-line tokens: the first two entries are
// always 'node' and the script path, so we slice(2) to get the user's flags.
function parseInput(): AgentInput {
  const args = process.argv.slice(2);
  const flag = args.indexOf('--input');

  if (flag === -1 || flag + 1 >= args.length) {
    console.error('Error: --input flag is required.');
    console.error('Usage:   npm run tax:agent -- --input <path-to-json>');
    console.error('Example: npm run tax:agent -- --input data/example_input.json');
    process.exit(1);
  }

  // path.resolve() converts a relative path (e.g. data/example_input.json)
  // to an absolute path based on the current working directory.
  const filePath = path.resolve(args[flag + 1]);

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`Error reading input file: ${filePath}`);
    console.error(String(err));
    process.exit(1);
  }

  try {
    return validateInput(raw);
  } catch (err) {
    console.error(`Invalid input file: ${String(err)}`);
    process.exit(1);
  }
}

// buildTaskString() converts structured input into the natural-language task
// that the agent loop receives as its first user message.
// The agent never sees the raw JSON — it sees this prose description.
function buildTaskString(input: AgentInput): string {
  // Shareholding is always included — for dividends it determines the treaty rate
  // threshold; for interest/royalties it determines EU Directive eligibility.
  const shareClause =
    input.income_type === 'dividend'
      ? `, holding ${input.shareholding_percentage}% of the capital of the paying company`
      : ` (the recipient holds ${input.shareholding_percentage}% of the Polish company's` +
        ` capital — use this figure for the EU Interest and Royalties Directive` +
        ` shareholding threshold check)`;

  // Annual payment amount: tells the agent what to pass to check_pay_and_refund.
  // If omitted or 0, the tool applies a conservative assumption (threshold exceeded).
  const paymentClause =
    input.annual_payment_pln !== undefined
      ? ` Estimated annual payment: PLN ${input.annual_payment_pln.toLocaleString()}` +
        (input.annual_payment_pln === 0
          ? ' (amount unknown — pass 0 to check_pay_and_refund for conservative assumption).'
          : '.')
      : ' Annual payment amount unknown — pass 0 to check_pay_and_refund.';

  // Related party clause: when explicitly provided, the agent passes this value
  // directly to check_pay_and_refund instead of inferring it from substance_notes.
  const relatedPartyClause =
    input.related_party !== undefined
      ? ` The recipient IS${input.related_party ? '' : ' NOT'} a related party under ` +
        `Art. 11a CIT — use this for check_pay_and_refund.`
      : ' Related-party status must be determined from context for check_pay_and_refund.';

  const substanceClause = input.substance_notes
    ? ` Additional context: ${input.substance_notes}`
    : '';

  return (
    `Analyse whether ${input.entity_name}, registered in ${input.country}${shareClause}, ` +
    `qualifies as the beneficial owner of a ${input.income_type} payment from a Polish ` +
    `company. Determine the correct Polish withholding tax rate and assess MLI/PPT risk.` +
    paymentClause +
    relatedPartyClause +
    substanceClause
  );
}

// ── OUTPUT HELPERS ────────────────────────────────────────────────────────────
//
// Phase 3: save a structured JSON report to disk after every run.
//
// resolveOutputPath() — decides where to write the report:
//   - If --output <path> is on the command line, use that path.
//   - Otherwise generate reports/<entity_slug>_<YYYY-MM-DD>.json automatically.
//
// parseFindings() — every tool result in memory is stored as a JSON string.
//   We parse each one back to an object so the report is fully machine-readable.
//
// saveReport() — creates the output directory if needed, then writes the file.

function resolveOutputPath(input: AgentInput): string {
  const args = process.argv.slice(2);
  const flag = args.indexOf('--output');

  if (flag !== -1 && flag + 1 < args.length) {
    // Explicit path supplied by the user
    return path.resolve(args[flag + 1]);
  }

  // Auto-generate: strip non-alphanumeric chars from entity name to make a safe
  // filename, then append today's date.
  const slug = input.entity_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')   // replace runs of non-word chars with _
    .replace(/^_|_$/g, '');        // trim leading/trailing underscores

  const date = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  return path.resolve('reports', `${slug}_${date}.json`);
}

function ensureDir(filePath: string): void {
  // path.dirname() extracts the directory portion of the path.
  // fs.mkdirSync with recursive: true creates all missing parent directories
  // and does nothing if the directory already exists — safe to call every time.
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

// parseFindings() converts the memory findings map from
//   { key: "<json string>" }  →  { key: { ... parsed object ... } }
// so the report does not contain strings-within-strings.
// If a value somehow isn't valid JSON, it is kept as-is.
function parseFindings(findings: Record<string, string>): Record<string, unknown> {
  const parsed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(findings)) {
    try {
      parsed[key] = JSON.parse(value) as unknown;
    } catch {
      parsed[key] = value;
    }
  }
  return parsed;
}

// computeReportConfidence — inspects the findings collected during the run and
// derives an overall data quality level for the report.
//
// Logic:
//   - If substance data is simulated (confidence === 'LOW' in the substance result)
//     → LOW. Phase 4 will always land here until Phase 5 connects real DDQs.
//   - If all substance is real but some treaty rates are unverified → MEDIUM.
//   - If everything is verified → HIGH.
//
// The function accepts Record<string, string> — the raw findings map — and returns
// a union type so TypeScript enforces that only 'HIGH', 'MEDIUM', or 'LOW' can
// come back.
function computeReportConfidence(
  findings: Record<string, string>
): 'HIGH' | 'MEDIUM' | 'LOW' {
  // Check the substance result first — if it is simulated the whole report is LOW.
  // We use a try/catch because JSON.parse can throw if the string is malformed.
  const substanceRaw = findings['entity_substance'];
  if (substanceRaw !== undefined) {
    try {
      const parsed = JSON.parse(substanceRaw) as Record<string, unknown>;
      if (parsed['confidence'] === 'LOW') return 'LOW';
    } catch {
      // If we can't parse it at all, treat as LOW to be conservative.
      return 'LOW';
    }
  }

  // If substance is fine, check whether treaty rates are verified.
  const rateRaw = findings['wht_rate'];
  if (rateRaw !== undefined) {
    try {
      const parsed = JSON.parse(rateRaw) as Record<string, unknown>;
      if (parsed['verified'] === false) return 'MEDIUM';
    } catch {
      return 'MEDIUM';
    }
  }

  return 'HIGH';
}

function saveReport(
  input: AgentInput,
  conclusion: string,
  findings: Record<string, string>,
  outputPath: string
): void {
  const dataConfidence = computeReportConfidence(findings);

  // Map each confidence level to a human-readable note.
  // Record<'HIGH' | 'MEDIUM' | 'LOW', string> is a TypeScript object type where
  // the keys must be exactly those three strings — it prevents typos.
  const confidenceNotes: Record<'HIGH' | 'MEDIUM' | 'LOW', string> = {
    HIGH:
      'All data verified. This report is suitable for internal decision-making.',
    MEDIUM:
      'Treaty rates have not been verified against official treaty texts. ' +
      'Verify before relying on these conclusions for filing or client advice.',
    LOW:
      'Substance data is simulated and treaty rates are unverified. ' +
      'This report is for analysis purposes only — not suitable for filing ' +
      'or client advice without professional verification and real DDQ data.',
  };

  const report = {
    generated_at:      new Date().toISOString(),
    // Spread the input fields at the top level so the report is self-contained
    // — a reader doesn't need to know the original JSON file to understand it.
    entity_name:             input.entity_name,
    country:                 input.country,
    income_type:             input.income_type,
    shareholding_percentage: input.shareholding_percentage,
    ...(input.related_party !== undefined ? { related_party: input.related_party } : {}),
    ...(input.substance_notes ? { substance_notes: input.substance_notes } : {}),
    data_confidence:      dataConfidence,
    data_confidence_note: confidenceNotes[dataConfidence],
    conclusion,
    findings: parseFindings(findings),
  };

  ensureDir(outputPath);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\nReport saved → ${outputPath}`);
  console.log(`Data confidence: ${dataConfidence} — ${confidenceNotes[dataConfidence]}`);
}

// ── AGENT LOOP ────────────────────────────────────────────────────────────────
//
// The loop is domain-agnostic. It receives:
//   - a system prompt (built from Goals)
//   - a task string
//   - the tool definitions (Actions)
//   - a WhtEnvironment instance (Environment)
//   - a Memory instance
//   - outputPath and input (for saving the report on termination)
//
// It knows nothing about WHT — it only orchestrates the GAME components.

async function runAgent(
  systemPrompt: string,
  task: string,
  tools: Tool[],
  env: WhtEnvironment,
  memory: Memory,
  input: AgentInput,
  outputPath: string,
  fastLlm: LLM,
  powerfulLlm: LLM,
  maxIterations: number = 20
): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('BENEFICIAL OWNER AGENT');
  console.log('='.repeat(70));
  console.log('\nTask:', task);
  console.log(`Models: fast=${fastLlm.getModelName()}  powerful=${powerfulLlm.getModelName()}`);
  console.log('-'.repeat(70));

  // Tracks every tool call made so far as "name:argsJSON".
  // Used to detect and skip exact duplicate calls — a common LLM loop pattern.
  const calledTools = new Set<string>();

  // Initialise conversation memory with the system prompt and task.
  memory.addMessage(Message.system(systemPrompt));
  memory.addMessage(Message.user(task));

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`ITERATION ${iteration}`);
    console.log('─'.repeat(70));

    // Inject the findings summary before each LLM call with a clear header that
    // instructs the model not to repeat tool calls already listed here.
    const findingsSummary = memory.buildFindingsSummary();
    const messagesWithFindings: Message[] = findingsSummary
      ? [
          ...memory.getMessages(),
          Message.user(
            'ESTABLISHED FINDINGS — do not repeat tool calls for these topics:\n' +
            findingsSummary +
            '\nContinue working through any remaining goals. ' +
            'Call terminate when all applicable goals are addressed.'
          ),
        ]
      : memory.getMessages();

    // selectLlm() reads the current findings to decide which tier to use.
    // Once substance/DEMPE/MLI data is present, switch to the powerful model.
    const activeLlm = selectLlm(memory.getFindings(), fastLlm, powerfulLlm);
    console.log(`  [MODEL] ${activeLlm.getModelName()}`);
    const response = await activeLlm.generateWithTools(messagesWithFindings, tools);

    // Plain text response — model answered without calling terminate.
    // This happens when the model writes its conclusion as prose instead of
    // using the terminate tool. We treat it as a final answer and save the report.
    if (response.type === 'text') {
      console.log('\nAgent responded directly:\n', response.content);
      saveReport(input, response.content, memory.getFindings(), outputPath);
      return;
    }

    // Store the assistant's tool-call message in memory
    memory.addMessage(response.assistantMessage);

    for (const call of response.calls) {
      console.log(`\n  [TOOL CALL] ${call.name}(${JSON.stringify(call.arguments)})`);

      // ── duplicate guard ───────────────────────────────────────────────────
      // If the model calls the same tool with identical arguments a second time,
      // return a reminder instead of executing — prevents runaway loops.
      // terminate is exempt: we always want to honour a stop signal.
      if (call.name !== 'terminate') {
        const callKey = `${call.name}:${JSON.stringify(call.arguments)}`;
        if (calledTools.has(callKey)) {
          console.log(`  [SKIPPED] Duplicate — result already in findings.`);
          memory.addMessage(Message.tool(
            JSON.stringify({
              note: 'This tool was already called with these exact arguments. ' +
                    'The result is already in the ESTABLISHED FINDINGS. ' +
                    'Do not call it again — proceed to the next goal or call terminate.',
            }),
            call.id
          ));
          continue;
        }
        calledTools.add(callKey);
      }

      // ── terminate ────────────────────────────────────────────────────────
      if (call.name === 'terminate') {
        const answer = call.arguments['answer'] as string;

        console.log('\n' + '='.repeat(70));
        console.log('FINAL ANSWER');
        console.log('='.repeat(70));
        console.log(answer);

        // Print the structured findings for auditability
        const findings = memory.getFindings();
        if (Object.keys(findings).length > 0) {
          console.log('\n' + '─'.repeat(70));
          console.log('STRUCTURED FINDINGS (machine-readable)');
          console.log('─'.repeat(70));
          for (const [key, value] of Object.entries(findings)) {
            console.log(`  ${key}: ${value}`);
          }
        }

        console.log('='.repeat(70) + '\n');

        // Phase 3: save the report to disk
        saveReport(input, answer, findings, outputPath);
        return;
      }

      // ── dispatch to WhtEnvironment ────────────────────────────────────────
      const args = call.arguments;
      let result: string;

      try {
        switch (call.name) {
          case 'check_treaty':
            result = env.checkTreaty(args['residence_country'] as string);
            // Record the finding so the model gets it in the summary next iteration
            memory.recordFinding('treaty_status', result);
            break;

          case 'get_treaty_rate':
            result = env.getTreatyRate(
              args['residence_country'] as string,
              args['income_type'] as string,
              args['shareholding_percentage'] as number
            );
            memory.recordFinding('wht_rate', result);
            break;

          case 'check_entity_substance':
            result = env.checkEntitySubstance(
              args['entity_name'] as string,
              args['country'] as string
            );
            memory.recordFinding('entity_substance', result);
            break;

          case 'check_mli_ppt':
            result = env.checkMliPpt(args['residence_country'] as string);
            memory.recordFinding('mli_ppt_status', result);
            break;

          case 'analyse_dempe':
            result = env.analyseDempe(
              args['entity_name'] as string,
              args['country'] as string,
              args['ip_type'] as string
            );
            memory.recordFinding('dempe_analysis', result);
            break;

          case 'check_directive_exemption':
            result = env.checkDirectiveExemption(
              args['residence_country'] as string,
              args['income_type'] as string,
              args['shareholding_percentage'] as number,
              args['holding_years'] as number
            );
            memory.recordFinding('directive_exemption', result);
            break;

          case 'check_pay_and_refund':
            result = env.checkPayAndRefund(
              args['income_type'] as string,
              args['related_party'] as boolean,
              args['annual_payment_pln'] as number
            );
            memory.recordFinding('pay_and_refund', result);
            break;

          default:
            result = JSON.stringify({ error: `Unknown tool: ${call.name}` });
        }
      } catch (err) {
        result = JSON.stringify({ error: String(err) });
      }

      console.log(`  [TOOL RESULT] ${result}`);
      memory.addMessage(Message.tool(result, call.id));
    }
  }

  console.log('\n[AGENT STOPPED] Maximum iterations reached.');
  saveReport(
    input,
    '[INCOMPLETE — agent reached maximum iterations without a final answer]',
    memory.getFindings(),
    outputPath
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Phase 2: read the task from a structured JSON file passed via --input.
  const input = parseInput();
  const task = buildTaskString(input);

  // Phase 3: resolve where the report will be written.
  // Default: reports/<entity_slug>_<date>.json
  // Override: npm run tax:agent -- --input <file> --output <path>
  const outputPath = resolveOutputPath(input);

  // ── E: ENVIRONMENT ────────────────────────────────────────────────────────
  // Change simulate: false when real data sources are connected.
  // checkEntitySubstance stays simulated permanently until Phase 5.
  const env = new WhtEnvironment({ simulate: false });

  // ── M: MEMORY ─────────────────────────────────────────────────────────────
  const memory = new Memory();

  // Build system prompt from structured goals (G)
  const systemPrompt = buildSystemPrompt(WHT_PERSONA, WHT_GOALS);

  // Tools (A)
  const tools = buildWhtTools();

  // M: Model Efficiency — create both LLM tiers from .env config.
  // LLM.fast() reads OPENAI_MODEL_FAST; LLM.powerful() reads OPENAI_MODEL_POWERFUL.
  // If only OPENAI_MODEL is set, both tiers use the same model (backward-compatible).
  const fastLlm    = LLM.fast();
  const powerfulLlm = LLM.powerful();

  await runAgent(systemPrompt, task, tools, env, memory, input, outputPath, fastLlm, powerfulLlm);
}

main();

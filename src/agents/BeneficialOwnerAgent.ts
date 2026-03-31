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
      'For interest and royalty payments: determine whether the EU Interest and ' +
      'Royalties Directive (2003/49/EC, transposed as Art. 21 Polish CIT Act) ' +
      'provides a 0% WHT exemption. Requires: EU member state recipient, ≥25% ' +
      'shareholding held for ≥2 uninterrupted years, and no artificial arrangement. ' +
      'The Directive does NOT cover dividends — use the Parent-Subsidiary Directive ' +
      '(Art. 22 CIT) for those. If conditions are met, 0% supersedes the treaty rate.',
    priority: 7,
  },
  {
    name: 'Assess beneficial owner status',
    description:
      'Evaluate whether the entity meets the four criteria for beneficial owner ' +
      'status: receives income for own benefit, bears economic risk, has ' +
      'decision-making power, and is not a conduit entity.',
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
  'data sources in your final answer. Never guess — use only tool results.';

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
        'Returns known facts about the entity\'s economic substance: employees, ' +
        'office, board activity, and income flow. Used to assess conduit risk.',
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
  substance_notes?: string;   // ? means the field is optional
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

  return {
    entity_name,
    country,
    income_type: income_type as AgentInput['income_type'],
    shareholding_percentage,
    substance_notes: substance_notes as string | undefined,
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
  const shareClause =
    input.income_type === 'dividend'
      ? `, holding ${input.shareholding_percentage}% of the capital of the paying company`
      : '';

  const substanceClause = input.substance_notes
    ? ` Additional context on entity substance: ${input.substance_notes}`
    : '';

  return (
    `Analyse whether ${input.entity_name}, registered in ${input.country}${shareClause}, ` +
    `qualifies as the beneficial owner of a ${input.income_type} payment from a Polish ` +
    `company. Determine the correct Polish withholding tax rate and assess MLI/PPT risk.` +
    substanceClause
  );
}

// ── AGENT LOOP ────────────────────────────────────────────────────────────────
//
// The loop is domain-agnostic. It receives:
//   - a system prompt (built from Goals)
//   - a task string
//   - the tool definitions (Actions)
//   - a WhtEnvironment instance (Environment)
//   - a Memory instance
//
// It knows nothing about WHT — it only orchestrates the GAME components.

async function runAgent(
  systemPrompt: string,
  task: string,
  tools: Tool[],
  env: WhtEnvironment,
  memory: Memory,
  maxIterations: number = 12
): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('BENEFICIAL OWNER AGENT');
  console.log('='.repeat(70));
  console.log('\nTask:', task);
  console.log('-'.repeat(70));

  const llm = new LLM();

  // Initialise conversation memory with the system prompt and task.
  // The findings summary starts empty and grows as tool results come in.
  memory.addMessage(Message.system(systemPrompt));
  memory.addMessage(Message.user(task));

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`ITERATION ${iteration}`);
    console.log('─'.repeat(70));

    // Inject the findings summary as a user message before each LLM call.
    // This gives the model a clean, up-to-date summary of what has been
    // established — without it needing to re-read the full conversation.
    const findingsSummary = memory.buildFindingsSummary();
    const messagesWithFindings: Message[] = findingsSummary
      ? [
          ...memory.getMessages(),
          Message.user(findingsSummary + 'Continue working through your goals.'),
        ]
      : memory.getMessages();

    const response = await llm.generateWithTools(messagesWithFindings, tools);

    // Plain text response — model answered without tools
    if (response.type === 'text') {
      console.log('\nAgent responded directly:\n', response.content);
      return;
    }

    // Store the assistant's tool-call message in memory
    memory.addMessage(response.assistantMessage);

    for (const call of response.calls) {
      console.log(`\n  [TOOL CALL] ${call.name}(${JSON.stringify(call.arguments)})`);

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
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Phase 2: read the task from a structured JSON file passed via --input.
  // This replaces the hardcoded task string from Phase 1.
  const input = parseInput();
  const task = buildTaskString(input);

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

  await runAgent(systemPrompt, task, tools, env, memory);
}

main();

import * as dotenv from 'dotenv';
import { LLM, Message, Tool } from '../shared';

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// WHAT IS FUNCTION CALLING?
//
// In Module 1 we told the LLM: "respond with THOUGHT: and ACTION: lines".
// That worked, but the model could drift from the format at any time.
//
// Function calling solves this at the API level:
//   1. We pass a `tools` array describing the functions available.
//   2. The model returns a structured JSON object (not free text) when it
//      wants to call a function — format guaranteed by the API.
//   3. We execute the function, then feed the result back as a `tool` message.
//
// This example shows the mechanics with a single tool call before we
// plug it into the full agent loop.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — DEFINE THE TOOLS
//
// Each tool has three parts:
//   name        — the identifier the model will use in its response
//   description — plain English; the model reads this to decide when to use it
//   parameters  — JSON Schema describing the arguments
//
// JSON Schema basics used here:
//   type: "object"        — the arguments are a key/value object
//   properties            — each key and its type/description
//   enum                  — restricts a string to specific allowed values
//   required              — which properties must always be provided
// ─────────────────────────────────────────────────────────────────────────────

const tools: Tool[] = [
  {
    name: 'get_treaty_rate',
    description:
      'Returns the withholding tax rate for a specific income type under the ' +
      "applicable tax treaty between Poland and the beneficial owner's country " +
      'of residence. Also returns the treaty article reference.',
    parameters: {
      type: 'object',
      properties: {
        residence_country: {
          type: 'string',
          description: 'The country of residence of the beneficial owner (e.g. "Luxembourg")',
        },
        income_type: {
          type: 'string',
          enum: ['dividend', 'interest', 'royalty'],
          description: 'The type of income being paid',
        },
        shareholding_percentage: {
          type: 'number',
          description:
            'For dividends only: the percentage of capital held by the recipient. ' +
            'Pass 0 if unknown or not applicable.',
        },
      },
      required: ['residence_country', 'income_type', 'shareholding_percentage'],
    },
  },
  {
    name: 'check_mli_ppt',
    description:
      'Checks whether the MLI Principal Purpose Test (Article 7) applies to ' +
      'the treaty between Poland and the specified country, and what evidence ' +
      'of substance is required to satisfy it.',
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
];

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — IMPLEMENT THE TOOL FUNCTIONS
//
// These are the actual TypeScript functions that run when the model
// requests a tool call. In this module they still return simulated data —
// the point is to learn the wiring. Real data sources come later.
//
// Notice each function:
//   - has explicit parameter types (strict TypeScript)
//   - returns a string (tool results are always sent back as strings)
//   - includes a `source` field in the result so outputs are auditable
// ─────────────────────────────────────────────────────────────────────────────

function getTreatyRate(
  residenceCountry: string,
  incomeType: string,
  shareholdingPercentage: number
): string {
  // Simulated treaty data — will be replaced with real lookups in a later step
  if (residenceCountry.toLowerCase() === 'luxembourg' && incomeType === 'dividend') {
    const rate = shareholdingPercentage >= 10 ? 5 : 15;
    return JSON.stringify({
      rate_percent: rate,
      condition:
        shareholdingPercentage >= 10
          ? 'Reduced rate: beneficial owner holds ≥10% of capital'
          : 'Standard rate: shareholding below 10% threshold',
      treaty_article: 'Art. 10(2) Poland–Luxembourg DTC (1995, as amended)',
      domestic_rate_percent: 19,
      source: 'Simulated — to be replaced with OECD treaty database lookup',
    });
  }

  if (residenceCountry.toLowerCase() === 'luxembourg' && incomeType === 'interest') {
    return JSON.stringify({
      rate_percent: 5,
      condition: 'Beneficial owner test must be met',
      treaty_article: 'Art. 11(2) Poland–Luxembourg DTC (1995, as amended)',
      domestic_rate_percent: 20,
      source: 'Simulated — to be replaced with OECD treaty database lookup',
    });
  }

  return JSON.stringify({
    error: `No treaty rate data available for ${residenceCountry} / ${incomeType} in this simulation.`,
  });
}

function checkMliPpt(residenceCountry: string): string {
  if (residenceCountry.toLowerCase() === 'luxembourg') {
    return JSON.stringify({
      mli_applies: true,
      article: 'Article 7 MLI (Principal Purpose Test)',
      both_signatories: true,
      effect:
        'Treaty benefit may be denied if one of the principal purposes of the ' +
        'arrangement was to obtain it. Substance evidence required.',
      substance_requirements: [
        'Genuine business activity in Luxembourg',
        'Local board with decision-making authority',
        'No automatic pass-through of income to parent',
      ],
      source: 'OECD MLI deposited positions — Poland (2018), Luxembourg (2019)',
    });
  }

  return JSON.stringify({
    mli_applies: false,
    note: `MLI status for ${residenceCountry} not available in this simulation.`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — THE TOOL DISPATCHER
//
// When the model tells us to call a tool, we need to route to the right
// TypeScript function. This replaces the `switch` from Module 1 with a
// cleaner pattern that will scale to many tools.
//
// `Record<string, unknown>` means "an object with string keys and any values".
// It's the type we get back from JSON.parse — we don't know the shape yet.
// ─────────────────────────────────────────────────────────────────────────────

function dispatchTool(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'get_treaty_rate':
      return getTreatyRate(
        args['residence_country'] as string,
        args['income_type'] as string,
        args['shareholding_percentage'] as number
      );

    case 'check_mli_ppt':
      return checkMliPpt(args['residence_country'] as string);

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — THE DEMO
//
// Ask the model a WHT question and let it decide which tools to call.
// We then execute the tools and feed the results back.
// This is a single round-trip — one question, one (or more) tool calls,
// one final answer. The full multi-turn loop comes next in AgentLoop.ts.
// ─────────────────────────────────────────────────────────────────────────────

async function functionCallingDemo(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('MODULE 2: FUNCTION CALLING DEMO');
  console.log('='.repeat(70));

  const llm = new LLM();

  const messages: Message[] = [
    Message.system(
      'You are a Polish withholding tax advisor. ' +
        'Use the available tools to answer questions accurately. ' +
        'Always use tools rather than relying on your own knowledge for rates and treaty details.'
    ),
    Message.user(
      'A Polish company is about to pay a dividend to Alpine Holdings S.A. ' +
        '(Luxembourg), which holds 25% of its capital. ' +
        'What is the correct Polish WHT rate, and does the MLI PPT apply?'
    ),
  ];

  // TURN 1: send the question + tools → model responds with tool calls
  console.log('\nTurn 1 — sending question to model...');
  const response1 = await llm.generateWithTools(messages, tools);

  if (response1.type === 'text') {
    // The model answered without using any tools — happens if it ignores the instruction
    console.log('\nModel answered directly (no tool calls):\n', response1.content);
    return;
  }

  // The model wants to call one or more tools
  console.log(`\nModel requested ${response1.calls.length} tool call(s):`);

  // We must add the assistant's tool-call message to memory BEFORE the results.
  // `assistantMessage` is pre-built by generateWithTools — it carries the raw
  // tool_calls structure the API requires before any `tool` result messages.
  // Pushing this one line is all we need; the complexity is handled in LLM.ts.
  messages.push(response1.assistantMessage);

  // Execute each tool call and add the result as a `tool` message
  for (const call of response1.calls) {
    console.log(`\n  [TOOL CALL] ${call.name}(${JSON.stringify(call.arguments)})`);

    const result = dispatchTool(call.name, call.arguments);
    console.log(`  [TOOL RESULT] ${result}`);

    // `Message.tool(result, call.id)` links this result to the specific call.
    // The `call.id` is the unique ID the API assigned — it must match exactly.
    messages.push(Message.tool(result, call.id));
  }

  // TURN 2: send the full history (question + tool calls + results) back to the model
  // The model now has everything it needs to write a final answer.
  console.log('\nTurn 2 — sending tool results back to model...');
  const response2 = await llm.generateWithTools(messages, tools);

  if (response2.type === 'text') {
    console.log('\n' + '='.repeat(70));
    console.log('FINAL ANSWER');
    console.log('='.repeat(70));
    console.log(response2.content);
    console.log('='.repeat(70) + '\n');
  } else {
    // Model wants to call more tools — in the full agent loop we'd continue
    console.log('\n[More tool calls requested — handle in agent loop]');
  }
}

async function main(): Promise<void> {
  await functionCallingDemo();
}

main();

import * as dotenv from 'dotenv';
import { LLM, Message, Tool } from '../shared';

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// TOOL FUNCTION TYPE
//
// Every tool registered with the agent must conform to this type:
//   - accepts a `Record<string, unknown>` — the parsed arguments from the LLM
//   - returns a string (synchronously) or a Promise<string> (asynchronously)
//
// `Record<string, unknown>` means "an object with string keys and unknown values".
// We use `unknown` instead of `any` because `strict: true` forbids `any`.
// The tool implementation is responsible for casting its specific arguments.
// ─────────────────────────────────────────────────────────────────────────────

type ToolFunction = (args: Record<string, unknown>) => string | Promise<string>;

// ─────────────────────────────────────────────────────────────────────────────
// AGENT LOOP CLASS
//
// Instead of a single function with a hardcoded switch, we now have a class
// where tools are registered dynamically. This makes the agent reusable:
// you instantiate it, register whichever tools you need, and call run().
//
// The `terminate` tool is registered automatically in the constructor —
// it is the signal the agent uses to end the loop and deliver its conclusion.
// ─────────────────────────────────────────────────────────────────────────────

export class AgentLoopFunctionCalling {
  // `tools` holds the JSON Schema definitions — passed to the LLM each turn
  private tools: Tool[] = [];

  // `toolFunctions` maps tool name → implementation function.
  // Map<K, V> is TypeScript's built-in key/value store. It's safer than a plain
  // object for dynamic keys because it has explicit get/set/has methods.
  private toolFunctions: Map<string, ToolFunction> = new Map();

  private maxIterations: number;

  constructor(maxIterations: number = 10) {
    this.maxIterations = maxIterations;

    // Register the terminate tool automatically.
    // When the agent has enough information, it calls terminate(answer: "...").
    // Our loop detects this call and exits — no special text parsing needed.
    this.registerTool(
      JSON.stringify({
        name: 'terminate',
        description:
          'Call this tool when you have gathered enough information to deliver ' +
          'a final answer. Pass your complete conclusion as the answer argument.',
        parameters: {
          type: 'object',
          properties: {
            answer: {
              type: 'string',
              description: 'Your complete final answer and conclusion',
            },
          },
          required: ['answer'],
        },
      }),
      // The implementation just returns the answer string — the loop does the rest
      (args) => args['answer'] as string
    );
  }

  // ── registerTool ────────────────────────────────────────────────────────────
  //
  // Registers a tool so the agent can use it.
  //
  // `toolJson`  — a JSON string describing the tool (name, description, parameters).
  //               Passing JSON rather than a plain object mirrors the course pattern
  //               and makes it easy to define tools as separate constant strings.
  // `fn`        — the TypeScript function to run when the model calls this tool.
  //
  // Calling JSON.parse here is safe because we control the input — these are
  // tool definitions written by us, not user-supplied data.
  // ─────────────────────────────────────────────────────────────────────────────

  registerTool(toolJson: string, fn: ToolFunction): void {
    const toolDef = JSON.parse(toolJson) as Tool;
    this.tools.push(toolDef);
    this.toolFunctions.set(toolDef.name, fn);
  }

  // ── run ─────────────────────────────────────────────────────────────────────
  //
  // Runs the agent loop for a given task.
  //
  // `systemPrompt` — the agent's instructions/persona (set once)
  // `task`         — the user's question or task description
  //
  // The loop:
  //   1. Generate: ask the LLM what to do next (with tools available)
  //   2. If text response: print it and exit (model answered without tools)
  //   3. If tool calls: execute each one
  //      a. If `terminate` was called: print the answer and exit
  //      b. Otherwise: store the result and continue
  // ─────────────────────────────────────────────────────────────────────────────

  async run(systemPrompt: string, task: string): Promise<void> {
    console.log('\n' + '='.repeat(70));
    console.log('WHT AGENT (function calling)');
    console.log('='.repeat(70));
    console.log('\nTask:', task);
    console.log('-'.repeat(70));

    const llm = new LLM();

    const messages: Message[] = [
      Message.system(systemPrompt),
      Message.user(`Task: ${task}`),
    ];

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`ITERATION ${iteration}`);
      console.log('─'.repeat(70));

      // THINK — ask the LLM what to do next
      const response = await llm.generateWithTools(messages, this.tools);

      // Case 1: plain text response (model answered directly, no tool call)
      if (response.type === 'text') {
        console.log('\nAgent responded directly:\n', response.content);
        return;
      }

      // Case 2: tool calls — store the assistant message first (required by API)
      messages.push(response.assistantMessage);

      // Execute each tool call
      for (const call of response.calls) {
        console.log(`\n  [TOOL CALL] ${call.name}(${JSON.stringify(call.arguments)})`);

        // ── terminate: end the loop ──────────────────────────────────────────
        if (call.name === 'terminate') {
          const answer = call.arguments['answer'] as string;
          console.log('\n' + '='.repeat(70));
          console.log('FINAL ANSWER');
          console.log('='.repeat(70));
          console.log(answer);
          console.log('='.repeat(70) + '\n');
          return;
        }

        // ── all other tools: look up and execute ─────────────────────────────
        const fn = this.toolFunctions.get(call.name);

        let result: string;
        if (!fn) {
          // Unknown tool — tell the agent so it can recover
          result = `Error: tool "${call.name}" is not registered.`;
        } else {
          try {
            result = await fn(call.arguments);
          } catch (err) {
            result = `Error executing "${call.name}": ${String(err)}`;
          }
        }

        console.log(`  [TOOL RESULT] ${result}`);

        // STORE — feed the result back as a `tool` message so the agent remembers it
        messages.push(Message.tool(result, call.id));
      }
    }

    console.log('\n[AGENT STOPPED] Maximum iterations reached.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WHT AGENT SETUP
//
// This is the tax-domain layer. It:
//   1. Creates an AgentLoopFunctionCalling instance
//   2. Registers WHT-specific tools with proper JSON Schema definitions
//   3. Runs the agent on a real WHT task
//
// Notice that the tool implementations now return structured JSON strings
// with a `source` field — this is the first step toward auditability.
// ─────────────────────────────────────────────────────────────────────────────

function createWhtAgent(): AgentLoopFunctionCalling {
  const agent = new AgentLoopFunctionCalling(12);

  // ── TOOL: check_treaty ────────────────────────────────────────────────────
  agent.registerTool(
    JSON.stringify({
      name: 'check_treaty',
      description:
        'Checks whether a tax treaty (Double Taxation Convention) is in force ' +
        'between Poland and the specified country of residence, and whether ' +
        'the MLI applies to it.',
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
    }),
    (args) => {
      const country = args['residence_country'] as string;
      if (country.toLowerCase() === 'luxembourg') {
        return JSON.stringify({
          treaty_in_force: true,
          treaty_name: 'Poland–Luxembourg Double Taxation Convention (1995, as amended 2012)',
          mli_applies: true,
          source: 'Polish Ministry of Finance — treaty list (simulated)',
        });
      }
      return JSON.stringify({
        treaty_in_force: false,
        note: `No treaty data available for ${country} in this simulation.`,
      });
    }
  );

  // ── TOOL: get_treaty_rate ─────────────────────────────────────────────────
  agent.registerTool(
    JSON.stringify({
      name: 'get_treaty_rate',
      description:
        'Returns the withholding tax rate for a specific income type under the ' +
        'tax treaty between Poland and the beneficial owner\'s country of residence. ' +
        'Also returns the domestic Polish rate for comparison and the treaty article.',
      parameters: {
        type: 'object',
        properties: {
          residence_country: {
            type: 'string',
            description: 'Country of residence of the beneficial owner',
          },
          income_type: {
            type: 'string',
            enum: ['dividend', 'interest', 'royalty'],
            description: 'Type of income being paid',
          },
          shareholding_percentage: {
            type: 'number',
            description:
              'For dividends: percentage of capital held by the recipient. Pass 0 if unknown.',
          },
        },
        required: ['residence_country', 'income_type', 'shareholding_percentage'],
      },
    }),
    (args) => {
      const country = (args['residence_country'] as string).toLowerCase();
      const type = args['income_type'] as string;
      const pct = args['shareholding_percentage'] as number;

      if (country === 'luxembourg' && type === 'dividend') {
        const rate = pct >= 10 ? 5 : 15;
        return JSON.stringify({
          treaty_rate_percent: rate,
          condition: pct >= 10
            ? 'Reduced rate: beneficial owner holds ≥10% of capital'
            : 'Standard rate applies (shareholding below 10%)',
          domestic_rate_percent: 19,
          treaty_article: 'Art. 10(2) Poland–Luxembourg DTC',
          source: 'Simulated — to be replaced with OECD treaty database',
        });
      }
      if (country === 'luxembourg' && type === 'interest') {
        return JSON.stringify({
          treaty_rate_percent: 5,
          condition: 'Beneficial owner test must be met',
          domestic_rate_percent: 20,
          treaty_article: 'Art. 11(2) Poland–Luxembourg DTC',
          source: 'Simulated — to be replaced with OECD treaty database',
        });
      }
      return JSON.stringify({
        error: `No rate data for ${country} / ${type} in this simulation.`,
      });
    }
  );

  // ── TOOL: check_entity_substance ─────────────────────────────────────────
  agent.registerTool(
    JSON.stringify({
      name: 'check_entity_substance',
      description:
        'Returns known facts about the economic substance of the entity: ' +
        'employees, office, board activity, and income flow patterns. ' +
        'Used to assess whether the entity is a genuine beneficial owner ' +
        'or a conduit.',
      parameters: {
        type: 'object',
        properties: {
          entity_name: {
            type: 'string',
            description: 'Name of the entity to check',
          },
          country: {
            type: 'string',
            description: 'Country where the entity is registered',
          },
        },
        required: ['entity_name', 'country'],
      },
    }),
    (args) => {
      const entity = args['entity_name'] as string;
      const country = args['country'] as string;
      return JSON.stringify({
        entity: entity,
        country: country,
        employees: 3,
        office: 'Own leased premises in Luxembourg City',
        board_meetings: 'Quarterly, majority of directors resident in Luxembourg',
        income_flow: 'Dividend income passed to German parent within 30 days of receipt',
        conduit_risk: 'HIGH — automatic pass-through pattern identified',
        source: 'Simulated due diligence questionnaire response',
      });
    }
  );

  // ── TOOL: check_mli_ppt ───────────────────────────────────────────────────
  agent.registerTool(
    JSON.stringify({
      name: 'check_mli_ppt',
      description:
        'Checks whether the MLI Principal Purpose Test (Article 7) applies ' +
        'to the treaty between Poland and the specified country, and lists ' +
        'what evidence of genuine substance is needed to satisfy it.',
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
    }),
    (args) => {
      const country = (args['residence_country'] as string).toLowerCase();
      if (country === 'luxembourg') {
        return JSON.stringify({
          mli_applies: true,
          article: 'Article 7 MLI (Principal Purpose Test)',
          effect:
            'Treaty benefit denied if obtaining it was one of the principal ' +
            'purposes of the arrangement.',
          substance_requirements: [
            'Genuine business activity in the residence country',
            'Local board with real decision-making authority',
            'No contractual obligation to pass income upstream',
          ],
          source: 'OECD MLI deposited positions — Poland (2018), Luxembourg (2019)',
        });
      }
      return JSON.stringify({ mli_applies: false, note: `MLI status for ${country} not in simulation.` });
    }
  );

  return agent;
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT
//
// Simpler than Module 1 — we no longer need to describe the output format
// in detail because the function calling API handles structure for us.
// ─────────────────────────────────────────────────────────────────────────────

const WHT_SYSTEM_PROMPT = `
You are a Polish withholding tax (WHT) analysis agent.

Your task is to determine:
1. Whether the entity qualifies as a beneficial owner under Polish WHT rules
2. The correct WHT rate to apply
3. Any MLI / Principal Purpose Test risk

Rules:
- Always use the available tools — do not rely on your own knowledge for rates or treaty details.
- Check the treaty, the rate, the entity's substance, and the MLI PPT before concluding.
- When you have gathered all necessary information, call terminate() with a complete answer
  that states: the WHT rate, the beneficial owner assessment, and any PPT risk.
`.trim();

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const agent = createWhtAgent();

  await agent.run(
    WHT_SYSTEM_PROMPT,
    'Analyse whether Alpine Holdings S.A., a Luxembourg-registered holding company ' +
    'that holds 25% of the capital of Pol-Ops Sp. z o.o. (a Polish company), ' +
    'qualifies as the beneficial owner of a dividend to be paid by Pol-Ops. ' +
    'Determine the correct Polish WHT rate to apply.'
  );
}

main();

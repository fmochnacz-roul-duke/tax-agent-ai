import * as dotenv from 'dotenv';
import { LLM, Message } from '../shared';

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — ACTION FORMAT
//
// We need a way for the LLM to tell us what it wants to do next.
// We use a simple plain-text convention instead of JSON here — the system
// prompt teaches the agent to always write exactly two lines:
//
//   THOUGHT: <why I'm doing this>
//   ACTION: <action_name> | <arg1> | <arg2> ...
//
// Or, when the task is complete:
//
//   THOUGHT: <final reasoning>
//   FINAL ANSWER: <conclusion>
//
// We then read those lines in code. This is called "parsing the action".
// ─────────────────────────────────────────────────────────────────────────────

// A TypeScript interface defines the shape of an object — like a contract.
// Every parsed agent response will be one of these two shapes.
interface AgentAction {
  thought: string;      // the THOUGHT line — always present
  type: 'action';       // discriminator: tells TypeScript which shape this is
  name: string;         // e.g. "check_treaty"
  args: string[];       // e.g. ["Poland", "Luxembourg"]
}

interface AgentFinalAnswer {
  thought: string;
  type: 'final_answer'; // discriminator
  answer: string;       // the conclusion text
}

// A "union type" — the result is EITHER an AgentAction OR an AgentFinalAnswer.
// The `|` means "or". TypeScript will force us to check `type` before accessing
// fields that only exist on one of the two shapes.
type ParsedResponse = AgentAction | AgentFinalAnswer;

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — THE PARSER
//
// Takes the raw string the LLM returned and extracts the structured data.
// ─────────────────────────────────────────────────────────────────────────────

function parseAgentResponse(response: string): ParsedResponse {
  // Split the response into individual lines, remove blank lines
  const lines = response
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // Find the THOUGHT line — the LLM's reasoning
  // `.find()` returns the first element that matches the condition, or undefined
  const thoughtLine = lines.find(line => line.startsWith('THOUGHT:'));
  const thought = thoughtLine
    ? thoughtLine.replace('THOUGHT:', '').trim()
    : '(no thought provided)';

  // Check if the agent is done — look for FINAL ANSWER
  const finalLine = lines.find(line => line.startsWith('FINAL ANSWER:'));
  if (finalLine) {
    return {
      thought,
      type: 'final_answer',
      answer: finalLine.replace('FINAL ANSWER:', '').trim(),
    };
  }

  // Otherwise, look for an ACTION line
  const actionLine = lines.find(line => line.startsWith('ACTION:'));
  if (actionLine) {
    const actionContent = actionLine.replace('ACTION:', '').trim();

    // Split by ` | ` to separate the action name from its arguments
    // e.g. "check_treaty | Poland | Luxembourg" → ["check_treaty", "Poland", "Luxembourg"]
    const parts = actionContent.split('|').map(p => p.trim());
    const name = parts[0];           // first element is the action name
    const args = parts.slice(1);     // everything after is arguments

    return {
      thought,
      type: 'action',
      name,
      args,
    };
  }

  // Fallback: if the LLM didn't follow the format, treat it as a final answer
  // so the loop doesn't run forever
  return {
    thought,
    type: 'final_answer',
    answer: response,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — THE ACTION EXECUTOR
//
// In Module 2 we'll call real tools (treaty lookup databases, etc.).
// For now, we simulate tool results with hard-coded strings.
// This lets us test the loop logic without real APIs.
//
// The function takes an AgentAction and returns a string result,
// as if a real tool had been called.
// ─────────────────────────────────────────────────────────────────────────────

function executeAction(action: AgentAction): string {
  console.log(`\n  [TOOL CALL] ${action.name}(${action.args.join(', ')})`);

  switch (action.name) {

    case 'check_treaty': {
      // args[0] = source country, args[1] = residence country
      const [source, residence] = action.args;
      if (residence?.toLowerCase().includes('luxembourg')) {
        return `Treaty confirmed: ${source}–${residence} Double Tax Convention (DTC) is in force. MLI applies.`;
      }
      return `No treaty found between ${source} and ${residence}.`;
    }

    case 'get_treaty_rate': {
      // args[0] = income type (dividend/interest/royalty), args[1] = residence country
      const [incomeType, residence] = action.args;
      if (residence?.toLowerCase().includes('luxembourg') && incomeType?.toLowerCase() === 'dividend') {
        return 'Dividend rate under Poland–Luxembourg DTC: 5% (if beneficial owner holds ≥10% of capital) or 15% (otherwise). Standard Polish domestic rate: 19%.';
      }
      return `Rate for ${incomeType} to ${residence}: data not available in simulation.`;
    }

    case 'check_beneficial_owner_criteria': {
      // args[0] = entity name
      const [entity] = action.args;
      return (
        `Beneficial owner criteria for ${entity}:\n` +
        `  1. Receives income for own benefit (not as agent/nominee) — needs verification\n` +
        `  2. Bears economic risk of the income — needs verification\n` +
        `  3. Has decision-making power over the income — needs verification\n` +
        `  4. Is not a conduit entity (substance check) — needs verification`
      );
    }

    case 'check_mli_ppt': {
      // MLI = Multilateral Instrument, PPT = Principal Purpose Test
      // args[0] = source country, args[1] = residence country
      const [source, residence] = action.args;
      return (
        `MLI status for ${source}–${residence}: Both countries are MLI signatories. ` +
        `Article 7 (PPT) applies. Treaty benefit may be denied if obtaining it was ` +
        `one of the principal purposes of the arrangement. ` +
        `Evidence of genuine economic substance in ${residence} is required.`
      );
    }

    case 'check_entity_substance': {
      // args[0] = entity name, args[1] = country
      const [entity, country] = action.args;
      return (
        `Substance check for ${entity} in ${country}: ` +
        `Entity has 3 employees, own office premises, local board meetings held quarterly. ` +
        `Dividend income flows through to ultimate parent (DE entity) within 30 days. ` +
        `This pass-through pattern may indicate conduit risk.`
      );
    }

    default:
      return `Action "${action.name}" is not yet implemented in this simulation.`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — THE SYSTEM PROMPT
//
// This is the agent's "instruction manual". We write it once at the start.
// It must explain:
//   - the agent's role
//   - the available actions
//   - the exact output format the agent must follow every turn
// ─────────────────────────────────────────────────────────────────────────────

const WHT_AGENT_SYSTEM_PROMPT = `
You are a withholding tax (WHT) analysis agent. Your job is to determine whether
a foreign entity qualifies as a beneficial owner under Polish WHT rules, and what
withholding tax rate applies to a payment made to that entity.

You have access to the following tools (actions):

  check_treaty | <source_country> | <residence_country>
    → Checks if a tax treaty is in force and whether MLI applies.

  get_treaty_rate | <income_type> | <residence_country>
    → Returns the WHT rate under the applicable treaty.
      income_type is one of: dividend, interest, royalty

  check_beneficial_owner_criteria | <entity_name>
    → Lists the four criteria for beneficial owner status.

  check_mli_ppt | <source_country> | <residence_country>
    → Checks whether the MLI Principal Purpose Test (PPT) applies.

  check_entity_substance | <entity_name> | <country>
    → Returns known facts about the entity's economic substance.

RULES:
- Every response must start with THOUGHT: on the first line.
- After THOUGHT, either write ACTION: or FINAL ANSWER: — never both.
- Always check the treaty, the rate, the beneficial owner criteria, substance,
  and MLI before giving a final answer.
- Your FINAL ANSWER must state: the applicable WHT rate, whether the beneficial
  owner test is met, and any MLI/PPT risk.
- Do not invent data — only use results returned by the tools.

OUTPUT FORMAT (follow exactly every turn):
THOUGHT: <your reasoning for this step>
ACTION: <action_name> | <arg1> | <arg2>

OR when done:
THOUGHT: <your final reasoning>
FINAL ANSWER: <your conclusion>
`.trim();

// ─────────────────────────────────────────────────────────────────────────────
// PART 5 — THE AGENT LOOP
//
// This is the heart of the agent. It:
//   1. Initialises the messages[] array with the system prompt and the task
//   2. Loops: generate → parse → execute → store → check done
//   3. Stops when the LLM returns FINAL ANSWER or we hit the max iteration limit
//
// `maxIterations` is a safety valve — without it, a confused agent could loop
// forever and rack up API costs.
// ─────────────────────────────────────────────────────────────────────────────

async function runAgentLoop(task: string, maxIterations: number = 10): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('WHT BENEFICIAL OWNER AGENT');
  console.log('='.repeat(70));
  console.log('\nTask:', task);
  console.log('-'.repeat(70));

  const llm = new LLM();

  // The messages array is the agent's entire working memory.
  // It starts with two messages: the system prompt and the user's task.
  // After that, every LLM response and every tool result gets appended here.
  const messages: Message[] = [
    Message.system(WHT_AGENT_SYSTEM_PROMPT),
    Message.user(`Task: ${task}`),
  ];

  // ── LOOP ──────────────────────────────────────────────────────────────────
  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`ITERATION ${iteration}`);
    console.log('─'.repeat(70));

    // THINK: ask the LLM what to do next, given everything it knows so far
    const rawResponse = await llm.generate(messages);

    // PARSE: extract the structured action or final answer
    const parsed = parseAgentResponse(rawResponse);

    // Always print the agent's thought so we can follow its reasoning
    console.log(`\n  THOUGHT: ${parsed.thought}`);

    // STORE: save the LLM's response as an assistant message.
    // This is what gives the agent memory — without this line, the next
    // iteration would start fresh with no knowledge of previous steps.
    messages.push(Message.assistant(rawResponse));

    // CHECK: did the agent finish?
    if (parsed.type === 'final_answer') {
      console.log('\n' + '='.repeat(70));
      console.log('FINAL ANSWER');
      console.log('='.repeat(70));
      console.log(parsed.answer);
      console.log('='.repeat(70) + '\n');
      return; // exit the function — we're done
    }

    // EXECUTE: run the requested tool and get the result string
    const toolResult = executeAction(parsed);
    console.log(`\n  [TOOL RESULT] ${toolResult}`);

    // STORE: feed the tool result back to the agent as a user message.
    // The agent will see this in the next iteration as "what happened when
    // I took that action" — this closes the observe → remember loop.
    messages.push(Message.user(`Tool result: ${toolResult}`));
  }

  // If we get here, the agent hit the iteration limit without finishing
  console.log('\n[AGENT STOPPED] Maximum iterations reached without a final answer.');
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await runAgentLoop(
    'Analyse whether Alpine Holdings S.A., a Luxembourg-registered holding company, ' +
    'qualifies as the beneficial owner of a dividend to be paid by a Polish operating ' +
    'company (Pol-Ops Sp. z o.o.). Determine the correct Polish WHT rate to apply.'
  );
}

main();

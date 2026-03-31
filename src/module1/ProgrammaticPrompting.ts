import * as dotenv from 'dotenv';
import { LLM, Message } from '../shared';

// Load .env file so process.env.OPENAI_API_KEY is available
// This must be called before anything that uses the LLM
dotenv.config();

// ─────────────────────────────────────────────────────────────
// EXAMPLE 1: Basic Prompt
// Send a single question, get a plain text answer back.
// ─────────────────────────────────────────────────────────────
async function basicPrompt(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('EXAMPLE 1: Basic Prompt');
  console.log('='.repeat(60));

  const llm = new LLM();

  // A "conversation" is just an array of messages.
  // system = the rules/persona we give the LLM
  // user   = our question
  const messages = [
    Message.system(
      'You are a Polish tax advisor specialising in withholding tax (WHT) ' +
      'under Polish corporate income tax law and applicable tax treaties. ' +
      'Give concise, precise answers.'
    ),
    Message.user(
      'In one paragraph: what is a "beneficial owner" in the context of ' +
      'withholding tax, and why does it matter for applying treaty rates?'
    ),
  ];

  const response = await llm.generate(messages);
  console.log('\nLLM response:\n');
  console.log(response);
}

// ─────────────────────────────────────────────────────────────
// EXAMPLE 2: Structured Output (JSON)
// Ask the LLM to respond in JSON so we can use the data in code.
// This is essential for agents — they need machine-readable output.
// ─────────────────────────────────────────────────────────────

// First we define a TypeScript interface — a "contract" that describes
// exactly what shape the JSON object must have.
// The LLM doesn't enforce this — WE do, by telling the LLM the format
// and then parsing its response.
interface TreatyRate {
  country: string;
  dividendRate: number;   // percentage, e.g. 5 means 5%
  interestRate: number;
  royaltyRate: number;
  requiresBeneficialOwner: boolean;
}

async function structuredOutput(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('EXAMPLE 2: Structured Output (JSON)');
  console.log('='.repeat(60));

  const llm = new LLM();

  const messages = [
    Message.system(
      'You are a Polish tax advisor. Always respond with valid JSON only. ' +
      'No explanations, no markdown — raw JSON that can be parsed directly.'
    ),
    Message.user(
      'Provide the withholding tax rates under the Poland–Germany tax treaty ' +
      'for dividends, interest, and royalties paid to a corporate beneficial owner. ' +
      'Use this exact JSON format:\n' +
      '{\n' +
      '  "country": "Germany",\n' +
      '  "dividendRate": <number>,\n' +
      '  "interestRate": <number>,\n' +
      '  "royaltyRate": <number>,\n' +
      '  "requiresBeneficialOwner": <true|false>\n' +
      '}'
    ),
  ];

  const response = await llm.generate(messages);
  console.log('\nRaw LLM response:\n', response);

  // Parse the JSON string into a real TypeScript object.
  // The `as TreatyRate` tells TypeScript: "trust me, this matches the interface."
  // In production you would validate this — for now we keep it simple.
  try {
    const treaty = JSON.parse(response) as TreatyRate;
    console.log('\nParsed and typed:');
    console.log(`  Country:           ${treaty.country}`);
    console.log(`  Dividend rate:     ${treaty.dividendRate}%`);
    console.log(`  Interest rate:     ${treaty.interestRate}%`);
    console.log(`  Royalty rate:      ${treaty.royaltyRate}%`);
    console.log(`  Beneficial owner required: ${treaty.requiresBeneficialOwner}`);
  } catch {
    console.log('Note: response was not valid JSON — prompt may need tuning');
  }
}

// ─────────────────────────────────────────────────────────────
// EXAMPLE 3: Memory (Multi-turn conversation)
// The LLM has no memory between calls. To make it remember
// a previous answer, we include that answer in the next call
// as a Message.assistant(...) entry.
// ─────────────────────────────────────────────────────────────
async function memoryExample(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('EXAMPLE 3: Memory (Multi-turn conversation)');
  console.log('='.repeat(60));

  const llm = new LLM();

  // Turn 1: ask about the beneficial owner test
  const turn1Messages = [
    Message.system(
      'You are a Polish tax advisor specialising in withholding tax. ' +
      'Give structured, practical answers.'
    ),
    Message.user(
      'List the three main criteria a foreign entity must meet to qualify ' +
      'as a beneficial owner under Polish WHT rules. Be concise.'
    ),
  ];

  const turn1Response = await llm.generate(turn1Messages);
  console.log('\nTurn 1 — criteria:\n');
  console.log(turn1Response);

  // Turn 2: follow-up that REQUIRES the LLM to remember turn 1.
  // We rebuild the full message array, adding the previous response
  // as Message.assistant(...) so the LLM "remembers" what it said.
  const turn2Messages = [
    ...turn1Messages,                        // system + user from turn 1
    Message.assistant(turn1Response),        // LLM's own previous answer
    Message.user(
      'For each criterion you listed, give one concrete example of how a ' +
      'Polish revenue authority might challenge it during a WHT audit.'
    ),
  ];

  const turn2Response = await llm.generate(turn2Messages);
  console.log('\nTurn 2 — audit challenges:\n');
  console.log(turn2Response);
}

// ─────────────────────────────────────────────────────────────
// Entry point
// The `main` function runs all three examples in sequence.
// Wrapping everything in main() and calling it at the bottom
// is standard practice in TypeScript — it keeps the top-level
// code clean and makes async/await work properly.
// ─────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  await basicPrompt();
  await structuredOutput();
  await memoryExample();

  console.log('\n' + '='.repeat(60));
  console.log('All examples complete.');
  console.log('='.repeat(60) + '\n');
}

main();

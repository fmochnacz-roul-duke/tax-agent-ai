// ─────────────────────────────────────────────────────────────────────────────
// Memory — the M in GAME
//
// Every agent needs two kinds of memory:
//
//   1. Conversational memory — the `messages[]` array that grows each iteration.
//      This is what the LLM reads. We've had this since Module 1.
//
//   2. Structured memory — a key/value store for derived facts the agent has
//      established. Example: once we know the treaty rate is 5%, we record that
//      fact explicitly rather than relying on the model to re-extract it from
//      a long conversation history.
//
// The Memory class wraps both. The structured store is injected into the prompt
// as a "## Findings so far" block, giving the model a clean summary at the top
// of each iteration instead of making it scan back through the conversation.
//
// Why this matters for auditability:
//   Structured findings are machine-readable. At the end of a run you can
//   extract them directly — no need to parse the model's natural language
//   conclusion to know what rate was determined.
//
// Extensibility note (from GAME framework):
//   Wrapping memory in a class means future storage changes (e.g. persisting
//   to a database between runs, or filtering old messages to save tokens)
//   require no changes to the agent loop — only this class changes.
// ─────────────────────────────────────────────────────────────────────────────

import { Message } from './Message';

export class Memory {
  // The conversation history — passed to the LLM on every iteration
  private messages: Message[] = [];

  // Structured findings — key/value facts the agent has established
  // Record<string, string> means: keys are strings, values are strings
  private findings: Record<string, string> = {};

  // ── conversation memory ────────────────────────────────────────────────────

  addMessage(message: Message): void {
    this.messages.push(message);
  }

  getMessages(): Message[] {
    return this.messages;
  }

  // ── structured findings ────────────────────────────────────────────────────

  // Record a structured fact. Key examples:
  //   'treaty_status', 'wht_rate', 'ppt_risk', 'beneficial_owner_assessment'
  recordFinding(key: string, value: string): void {
    this.findings[key] = value;
  }

  getFindings(): Record<string, string> {
    return { ...this.findings }; // return a copy — callers cannot mutate our store
  }

  hasFinding(key: string): boolean {
    return key in this.findings;
  }

  // ── prompt injection ───────────────────────────────────────────────────────

  // Generates a "## Findings so far" block to prepend to the user turn.
  // Returns an empty string if no findings have been recorded yet.
  //
  // Injecting findings as a user message (rather than into the system prompt)
  // keeps the system prompt stable across iterations — only the findings block
  // changes. This is more token-efficient and easier to debug.
  buildFindingsSummary(): string {
    const keys = Object.keys(this.findings);
    if (keys.length === 0) return '';

    const lines = keys.map((k) => `  - ${k}: ${this.findings[k]}`);
    return `## Findings so far\n${lines.join('\n')}\n\n`;
  }
}

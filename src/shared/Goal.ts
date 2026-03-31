// ─────────────────────────────────────────────────────────────────────────────
// GOAL — the G in GAME
//
// A Goal is a discrete objective the agent must accomplish.
// Breaking the system prompt into structured goals gives us three things:
//
//   1. Priorities   — the agent pursues higher-priority goals first
//   2. Readability  — each goal is named and described independently,
//                     not buried in one large instruction block
//   3. Reusability  — goals can be composed across different agents
//
// `priority` is optional — if omitted it defaults to 0 (lowest).
// Higher numbers = higher priority.
// ─────────────────────────────────────────────────────────────────────────────

export interface Goal {
  name: string;
  description: string;
  priority?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildSystemPrompt
//
// Generates the system prompt string from a persona description and an array
// of Goal objects. Goals are sorted by priority (highest first) before being
// written into the prompt — the model sees the most important objectives at
// the top where attention is strongest.
//
// This replaces hand-writing a monolithic system prompt string. The prompt is
// now a derived artifact of your goal definitions, not a separate thing to
// maintain in sync.
// ─────────────────────────────────────────────────────────────────────────────

export function buildSystemPrompt(persona: string, goals: Goal[]): string {
  // Sort descending by priority — `(b.priority ?? 0) - (a.priority ?? 0)`
  // The `?? 0` means "treat missing priority as zero".
  const sorted = [...goals].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
  );

  const goalLines = sorted
    .map((g, i) => `  ${i + 1}. [Priority ${g.priority ?? 0}] ${g.name}: ${g.description}`)
    .join('\n');

  return (
    `${persona}\n\n` +
    `Your goals (listed highest priority first):\n${goalLines}\n\n` +
    `Rules:\n` +
    `- Always use the available tools — do not rely on your own knowledge for rates or treaty details.\n` +
    `- Work through your goals in priority order.\n` +
    `- When all goals are complete, call terminate() with a comprehensive final answer.`
  );
}

# Module 1 — Programmatic Prompting & Agent Loop

## What This Module Teaches

1. How to send messages to an LLM programmatically (in code, not in a chat UI)
2. How the LLM's "memory" works — and why you must manage it yourself
3. How to build the Agent Loop — the core pattern behind every AI agent

## Exercises in This Module

### Exercise 1: ProgrammaticPrompting.ts
Practice sending different types of prompts:
- Basic question → string response
- Structured prompt → JSON response
- Multi-turn conversation with memory

**Tax application:** Ask the LLM to explain the beneficial owner concept,
then ask follow-up questions — passing previous answers as memory.

### Exercise 2: AgentLoop.ts
Build the full agent loop:
- Agent receives a task
- Loop: think → act → observe → remember → repeat
- Agent terminates when task is complete

**Tax application:** Agent analyses an entity description and determines
whether it qualifies as a beneficial owner for WHT purposes.

## Key Concepts

- `messages[]` array = the agent's entire memory during one run
- `system` message = the agent's rules and persona (set once)
- `user` message = input or action results (fed back each iteration)
- `assistant` message = the agent's previous responses (saved to memory)
- Parse → Execute → Store is the loop's rhythm

## Files

| File | Purpose |
|---|---|
| `ProgrammaticPrompting.ts` | Lessons 1–3: basic prompting, JSON output, memory |
| `AgentLoop.ts` | Lesson 4: full agent loop with actions |

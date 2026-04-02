import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { Message, StoredToolCall } from './Message';

dotenv.config();

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool factory helpers
//
// Common tools that every agent needs should not be re-typed per agent.
// These factory methods are the equivalent of the course's ToolRegistry
// built-ins — a light version without the full registry abstraction.
//
// Where the AgentLanguage abstraction would slot in:
//   An AgentLanguage implementation would own these definitions and inject
//   them automatically. Since we are using FunctionCallingLanguage exclusively,
//   we expose them as plain static helpers instead.
// ─────────────────────────────────────────────────────────────────────────────

export const ToolFactory = {
  // The terminate tool signals the end of the agent loop.
  // The model passes its complete conclusion as the `answer` argument.
  terminate(): Tool {
    return {
      name: 'terminate',
      description:
        'Call this tool when you have gathered all necessary information ' +
        'and are ready to deliver your final answer. ' +
        'Pass your complete conclusion as the answer argument.',
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
    };
  },
};

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>; // parsed — ready to pass to your function
}

// When the model requests tool calls, we return:
//   `calls`            — the parsed tool calls (name + arguments) for you to execute
//   `assistantMessage` — a pre-built Message object to push into your messages[] array.
//                        It carries the raw tool_calls structure that the API requires
//                        to appear before any `tool` result messages.
export type LLMResponse =
  | { type: 'text'; content: string }
  | { type: 'tool_calls'; calls: ToolCall[]; assistantMessage: Message };

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE CONVERSION
//
// Converts our Message objects into the exact shapes the OpenAI API requires.
// Each role has a slightly different required structure — this function handles
// all four cases.
// ─────────────────────────────────────────────────────────────────────────────

function toOpenAIMessages(messages: Message[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.map((msg) => {
    // tool: must include tool_call_id at the top level
    if (msg.role === 'tool') {
      if (!msg.tool_call_id) {
        throw new Error('tool message is missing tool_call_id');
      }
      return {
        role: 'tool' as const,
        content: msg.content,
        tool_call_id: msg.tool_call_id,
      };
    }

    // assistant with tool calls: must include the tool_calls array —
    // this is the structure the API checks before accepting tool results
    if (msg.role === 'assistant' && msg.storedToolCalls) {
      return {
        role: 'assistant' as const,
        content: msg.content || null,
        tool_calls: msg.storedToolCalls, // StoredToolCall matches the API shape exactly
      };
    }

    // system / user / plain assistant
    return {
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content,
    };
  });
}

export class LLM {
  private client: OpenAI;
  private model: string;

  // model is optional: if omitted, falls back to OPENAI_MODEL env var then 'gpt-4o-mini'.
  // Accepting the model at construction time (rather than per-call) lets you create
  // separate instances for different tiers and swap them in the loop without
  // threading a model string through every generateWithTools() call.
  constructor(model?: string) {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  }

  // ── Model tier factory methods ─────────────────────────────────────────────
  //
  // MATE principle — M (Model Efficiency): use the cheapest model that can do
  // the job. Simple lookups (treaty status, rate retrieval) do not need the
  // most capable model. Complex multi-condition legal reasoning (BO assessment,
  // DEMPE synthesis) benefits from a stronger model.
  //
  // Configure via .env:
  //   OPENAI_MODEL_FAST     — cheap/fast model for structured data retrieval
  //                           default: gpt-4o-mini
  //   OPENAI_MODEL_POWERFUL — capable model for multi-step legal synthesis
  //                           default: falls back to OPENAI_MODEL, then gpt-4o-mini
  //
  // If you only set OPENAI_MODEL, both tiers use it — no behaviour change from
  // the old single-model setup.

  static fast(): LLM {
    return new LLM(process.env.OPENAI_MODEL_FAST ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini');
  }

  static powerful(): LLM {
    return new LLM(process.env.OPENAI_MODEL_POWERFUL ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini');
  }

  // Exposes the active model name so the agent loop can log which tier is in use.
  getModelName(): string {
    return this.model;
  }

  // Module 1 method — unchanged
  async generate(messages: Message[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: toOpenAIMessages(messages),
    });
    return response.choices[0].message.content ?? '';
  }

  // Module 2: generate with tools
  async generateWithTools(messages: Message[], tools: Tool[]): Promise<LLMResponse> {
    const openAiTools: OpenAI.Chat.ChatCompletionTool[] = tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: toOpenAIMessages(messages),
      tools: openAiTools,
    });

    const message = response.choices[0].message;

    if (message.tool_calls && message.tool_calls.length > 0) {
      const calls: ToolCall[] = [];
      const stored: StoredToolCall[] = [];

      for (const tc of message.tool_calls) {
        // Narrow to function type — SDK v6 uses a union that may include
        // custom tool call shapes without a `.function` property
        if (tc.type !== 'function') continue;

        calls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
        });

        // Keep the raw structure for round-tripping through the message history
        stored.push({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments, // keep as raw JSON string
          },
        });
      }

      // Build the assistant message now, so callers just push it without
      // having to know about StoredToolCall at all
      const assistantMessage = Message.assistantWithToolCalls(message.content ?? '', stored);

      return { type: 'tool_calls', calls, assistantMessage };
    }

    return { type: 'text', content: message.content ?? '' };
  }
}

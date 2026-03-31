// The four roles the LLM understands:
//   system    = instructions/rules for the AI (set once at the start)
//   user      = input coming from the human (or from the agent environment)
//   assistant = the AI's own previous responses (used to give it memory)
//   tool      = the result of a tool/function call (new in Module 2)
type Role = 'system' | 'user' | 'assistant' | 'tool';

// When the model decides to call tools, its response is not just text —
// it's a structured object that lists which functions to call and with what
// arguments. We need to store that structure so we can send it back to the
// API accurately in subsequent turns.
//
// `StoredToolCall` is our SDK-agnostic version of that structure.
// We keep it in Message.ts so this file has no dependency on the OpenAI SDK.
export interface StoredToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;   // raw JSON string, as the API sends it
  };
}

export class Message {
  constructor(
    public readonly role: Role,
    public readonly content: string,
    // tool_call_id: only for role='tool' — links the result to the call
    public readonly tool_call_id?: string,
    // storedToolCalls: only for role='assistant' when the model requested tools
    public readonly storedToolCalls?: StoredToolCall[]
  ) {}

  static system(content: string): Message {
    return new Message('system', content);
  }

  static user(content: string): Message {
    return new Message('user', content);
  }

  static assistant(content: string): Message {
    return new Message('assistant', content);
  }

  // New in Module 2: an assistant message that carries tool call requests.
  // The `storedToolCalls` will be converted back into the OpenAI format
  // when we send this message to the API in subsequent turns.
  static assistantWithToolCalls(content: string, toolCalls: StoredToolCall[]): Message {
    return new Message('assistant', content, undefined, toolCalls);
  }

  // New in Module 2: return the result of a tool call.
  static tool(content: string, toolCallId: string): Message {
    return new Message('tool', content, toolCallId);
  }
}

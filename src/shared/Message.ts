// The three roles the LLM understands:
//   system    = instructions/rules for the AI (set once at the start)
//   user      = input coming from the human (or from the agent environment)
//   assistant = the AI's own previous responses (used to give it memory)
type Role = 'system' | 'user' | 'assistant';

export class Message {
  constructor(
    public readonly role: Role,
    public readonly content: string
  ) {}

  // Factory methods — shortcuts so you don't have to write `new Message(...)` each time
  static system(content: string): Message {
    return new Message('system', content);
  }

  static user(content: string): Message {
    return new Message('user', content);
  }

  static assistant(content: string): Message {
    return new Message('assistant', content);
  }
}

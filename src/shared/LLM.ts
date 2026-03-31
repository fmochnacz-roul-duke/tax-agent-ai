import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { Message } from './Message';

// Load the .env file so process.env.OPENAI_API_KEY is available
dotenv.config();

export class LLM {
  private client: OpenAI;
  private model: string;

  constructor() {
    // Read API key from .env — never hardcode secrets in source code
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    // Read model from .env, fall back to gpt-4o-mini if not set
    this.model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  }

  // Takes an array of Messages, returns the LLM's response as a plain string
  async generate(messages: Message[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages,   // OpenAI accepts the same {role, content} shape our Message class has
    });

    // The API returns an array of "choices" — we always take the first one
    // The `?? ''` means "use empty string if the value is null/undefined"
    return response.choices[0].message.content ?? '';
  }
}

export interface LLMTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  name?: string;
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  text: string | null;
  toolCalls: LLMToolCall[];
}

export interface ILLMService {
  chat(messages: LLMMessage[], tools?: LLMTool[]): Promise<LLMResponse>;
}

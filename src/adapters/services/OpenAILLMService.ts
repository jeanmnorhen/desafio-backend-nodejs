import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/index.js';
import type { ILLMService, LLMMessage, LLMResponse, LLMTool } from '../../domain/interfaces/ILLMService.js';
import type { Logger } from '../../infrastructure/logger/pino.js';

export class OpenAILLMService implements ILLMService {
  private client: OpenAI;

  constructor(private deps: { apiKey: string; model: string; logger: Logger }) {
    this.client = new OpenAI({ apiKey: deps.apiKey });
  }

  async chat(messages: LLMMessage[], tools?: LLMTool[]): Promise<LLMResponse> {
    const mappedMessages: ChatCompletionMessageParam[] = messages.map((m) => {
      const msg: any = { role: m.role, content: m.content };
      if (m.name) msg.name = m.name;
      if (m.toolCallId) msg.tool_call_id = m.toolCallId;
      return msg;
    });

    const mappedTools: ChatCompletionTool[] | undefined = tools?.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    this.deps.logger.debug({ model: this.deps.model }, 'Calling OpenAI API');

    const completion = await this.client.chat.completions.create({
      model: this.deps.model,
      messages: mappedMessages,
      tools: mappedTools,
      temperature: 0.3,
    });

    this.deps.logger.debug(
      { usage: completion.usage },
      'OpenAI API returned successfully'
    );

    const choice = completion.choices[0];
    if (!choice) {
      throw new Error('No choice returned from OpenAI');
    }

    const toolCalls = choice.message.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments),
    })) || [];

    return {
      text: choice.message.content,
      toolCalls,
    };
  }
}

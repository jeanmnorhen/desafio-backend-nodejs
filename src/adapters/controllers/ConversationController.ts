import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ListConversationsUseCase } from '../../use-cases/ListConversationsUseCase.js';
import type { ListMessagesUseCase } from '../../use-cases/ListMessagesUseCase.js';

export class ConversationController {
  constructor(private deps: { listConversationsUseCase: ListConversationsUseCase; listMessagesUseCase: ListMessagesUseCase }) {}

  async listConversations(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = (request as any).tenantId;
    const conversations = await this.deps.listConversationsUseCase.execute(tenantId);
    return reply.status(200).send({ data: conversations });
  }

  async listMessages(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = (request as any).tenantId;
    const { id } = request.params as { id: string };
    
    try {
      const messages = await this.deps.listMessagesUseCase.execute(tenantId, id);
      return reply.status(200).send({ data: messages });
    } catch (err: any) {
      if (err.message === 'Conversation not found') {
        return reply.status(404).send({ error: err.message });
      }
      throw err;
    }
  }
}

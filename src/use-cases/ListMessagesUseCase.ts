import type { IConversationRepository } from '../domain/interfaces/IConversationRepository.js';
import type { IMessageRepository } from '../domain/interfaces/IMessageRepository.js';

export interface ListMessagesUseCaseDeps {
  conversationRepo: IConversationRepository;
  messageRepo: IMessageRepository;
}

export class ListMessagesUseCase {
  constructor(private deps: ListMessagesUseCaseDeps) {}

  async execute(tenantId: string, conversationId: string) {
    // Validate that the conversation belongs to the tenant
    const conversation = await this.deps.conversationRepo.findById(tenantId, conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    return this.deps.messageRepo.findByConversation(tenantId, conversationId);
  }
}

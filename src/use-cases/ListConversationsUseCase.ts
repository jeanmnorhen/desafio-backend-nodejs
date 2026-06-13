import type { IConversationRepository } from '../domain/interfaces/IConversationRepository.js';

export interface ListConversationsUseCaseDeps {
  conversationRepo: IConversationRepository;
}

export class ListConversationsUseCase {
  constructor(private deps: ListConversationsUseCaseDeps) {}

  async execute(tenantId: string) {
    return this.deps.conversationRepo.listByTenant(tenantId);
  }
}

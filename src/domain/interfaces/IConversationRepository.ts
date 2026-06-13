import type { Conversation } from '../entities/Conversation.js';

export interface ConversationWithContact extends Conversation {
  contactName: string | null;
  contactWaId: string;
}

export interface IConversationRepository {
  findOrCreate(tenantId: string, contactId: string): Promise<Conversation>;
  findById(tenantId: string, id: string): Promise<Conversation | null>;
  listByTenant(tenantId: string): Promise<ConversationWithContact[]>;
}

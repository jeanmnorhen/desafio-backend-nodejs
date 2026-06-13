export type ConversationStatus = 'ACTIVE' | 'CLOSED';

export interface Conversation {
  id: string;
  tenantId: string;
  contactId: string;
  status: ConversationStatus;
  createdAt: Date;
  updatedAt: Date;
}

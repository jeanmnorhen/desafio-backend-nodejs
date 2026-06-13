import type { Message } from '../entities/Message.js';

export interface CreateMessageInput {
  tenantId: string;
  conversationId: string;
  waMessageId: string;
  direction: Message['direction'];
  body: string;
  status: Message['status'];
}

export interface IMessageRepository {
  /** Creates a message. Returns null if waMessageId already exists (idempotency). */
  create(input: CreateMessageInput): Promise<Message | null>;
  findByConversation(tenantId: string, conversationId: string): Promise<Message[]>;
  findById(id: string): Promise<Message | null>;
  updateStatus(id: string, status: Message['status']): Promise<void>;
}

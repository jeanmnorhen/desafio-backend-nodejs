export type MessageDirection = 'INBOUND' | 'OUTBOUND';
export type MessageStatus = 'RECEIVED' | 'PROCESSING' | 'SENT' | 'FAILED';

export interface Message {
  id: string;
  tenantId: string;
  conversationId: string;
  waMessageId: string;
  direction: MessageDirection;
  body: string;
  status: MessageStatus;
  createdAt: Date;
}

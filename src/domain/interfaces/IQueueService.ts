export interface ProcessMessageJobData {
  tenantId: string;
  messageId: string;
  conversationId: string;
  contactWaId: string;
}

export interface IQueueService {
  enqueue(data: ProcessMessageJobData): Promise<void>;
  close(): Promise<void>;
}

import type { ITenantRepository } from '../domain/interfaces/ITenantRepository.js';
import type { IContactRepository } from '../domain/interfaces/IContactRepository.js';
import type { IConversationRepository } from '../domain/interfaces/IConversationRepository.js';
import type { IMessageRepository } from '../domain/interfaces/IMessageRepository.js';
import type { IQueueService } from '../domain/interfaces/IQueueService.js';
import type { Logger } from '../infrastructure/logger/pino.js';

export interface WebhookPayload {
  from: string; // sender phone number
  messageId: string; // wa message id (wamid.xxx)
  text: string; // message body
  contactName: string; // sender profile name
  phoneNumberId: string; // the business phone number id
  timestamp: string;
}

export interface ReceiveWebhookUseCaseDeps {
  tenantRepo: ITenantRepository;
  contactRepo: IContactRepository;
  conversationRepo: IConversationRepository;
  messageRepo: IMessageRepository;
  queueService: IQueueService;
  logger: Logger;
}

export class ReceiveWebhookUseCase {
  constructor(private deps: ReceiveWebhookUseCaseDeps) {}

  async execute(payload: WebhookPayload) {
    const { tenantRepo, contactRepo, conversationRepo, messageRepo, queueService, logger } = this.deps;

    // 1. Find tenant by phone_number_id
    const tenant = await tenantRepo.findByWaPhoneNumberId(payload.phoneNumberId);
    if (!tenant) {
      logger.warn({ phoneNumberId: payload.phoneNumberId }, 'Webhook received for unknown phone_number_id');
      return { duplicate: false, ignored: true, reason: 'Unknown tenant' };
    }

    // 2. Find or create contact
    const contact = await contactRepo.findOrCreate(tenant.id, payload.from, payload.contactName);

    // 3. Find or create conversation
    const conversation = await conversationRepo.findOrCreate(tenant.id, contact.id);

    // 4. Create message
    const message = await messageRepo.create({
      tenantId: tenant.id,
      conversationId: conversation.id,
      waMessageId: payload.messageId,
      direction: 'INBOUND',
      body: payload.text,
      status: 'RECEIVED',
    });

    if (!message) {
      // Message already exists, idempotent return
      logger.info({ messageId: payload.messageId }, 'Duplicate message received, ignoring');
      return { duplicate: true };
    }

    // 5. Enqueue job
    await queueService.enqueue({
      tenantId: tenant.id,
      messageId: message.id,
      conversationId: conversation.id,
      contactWaId: contact.waId,
    });

    logger.info({ messageId: message.id, waMessageId: payload.messageId }, 'Inbound message processed and enqueued');

    return { duplicate: false, messageId: message.id, conversationId: conversation.id };
  }
}

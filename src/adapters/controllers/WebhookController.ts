import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ReceiveWebhookUseCase, WebhookPayload } from '../../use-cases/ReceiveWebhookUseCase.js';
import type { Logger } from '../../infrastructure/logger/pino.js';

export class WebhookController {
  constructor(private deps: { receiveWebhookUseCase: ReceiveWebhookUseCase; verifyToken: string; logger: Logger }) {}

  async handleVerification(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === this.deps.verifyToken) {
      this.deps.logger.info('Webhook verification successful');
      return reply.status(200).send(challenge);
    } else {
      this.deps.logger.warn({ query }, 'Webhook verification failed');
      return reply.status(403).send('Forbidden');
    }
  }

  async handleIncoming(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as any;

      if (body.object !== 'whatsapp_business_account') {
        return reply.status(404).send();
      }

      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.value && change.value.messages) {
            const phoneNumberId = change.value.metadata.phone_number_id;
            
            // Meta includes contacts array with profile names matching the messages by wa_id
            const contacts = change.value.contacts || [];
            
            for (const msg of change.value.messages) {
              if (msg.type !== 'text') {
                this.deps.logger.info({ msgType: msg.type }, 'Ignoring non-text message');
                continue;
              }

              const contact = contacts.find((c: any) => c.wa_id === msg.from);
              const contactName = contact?.profile?.name || null;

              const payload: WebhookPayload = {
                from: msg.from,
                messageId: msg.id,
                text: msg.text.body,
                contactName,
                phoneNumberId,
                timestamp: msg.timestamp,
              };

              // We don't await this so we can return 200 immediately (or we await it if we want backpressure)
              // Since it's quick DB ops + enqueue, awaiting is fine for now
              await this.deps.receiveWebhookUseCase.execute(payload);
            }
          }
        }
      }

      return reply.status(200).send('EVENT_RECEIVED');
    } catch (error) {
      // ALWAYS return 200 to Meta even on internal error to avoid retries bombarding us during an outage
      this.deps.logger.error({ err: error }, 'Error processing webhook payload');
      return reply.status(200).send('EVENT_RECEIVED_WITH_ERROR');
    }
  }
}

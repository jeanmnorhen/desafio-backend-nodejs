import type { IMetaService, MetaSendResult } from '../../domain/interfaces/IMetaService.js';
import type { Logger } from '../../infrastructure/logger/pino.js';

export class MetaAPIService implements IMetaService {
  constructor(private deps: { apiBaseUrl: string; token: string; logger: Logger }) {}

  async sendMessage(phoneNumberId: string, to: string, text: string): Promise<MetaSendResult> {
    const url = `${this.deps.apiBaseUrl}/${phoneNumberId}/messages`;
    
    this.deps.logger.debug({ url, to }, 'Sending message to Meta API');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.deps.token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      this.deps.logger.error({ status: response.status, body: errText }, 'Meta API error');
      throw new Error(`Meta API Error: ${response.status} - ${errText}`);
    }

    const json: any = await response.json();
    
    // Meta mock returns { messages: [{ id: "wamid.out.123" }] }
    const waMessageId = json.messages?.[0]?.id;
    if (!waMessageId) {
      this.deps.logger.warn({ json }, 'Meta API did not return a message ID');
      return { waMessageId: 'unknown' };
    }

    return { waMessageId };
  }
}

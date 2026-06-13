import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReceiveWebhookUseCase, type WebhookPayload } from '../ReceiveWebhookUseCase.js';

describe('ReceiveWebhookUseCase', () => {
  let useCase: ReceiveWebhookUseCase;
  let deps: any;

  beforeEach(() => {
    deps = {
      tenantRepo: { findByWaPhoneNumberId: vi.fn() },
      contactRepo: { findOrCreate: vi.fn() },
      conversationRepo: { findOrCreate: vi.fn() },
      messageRepo: { create: vi.fn() },
      queueService: { enqueue: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn() },
    };
    useCase = new ReceiveWebhookUseCase(deps);
  });

  const mockPayload: WebhookPayload = {
    from: '5511999990000',
    messageId: 'wamid.123',
    text: 'Hello',
    contactName: 'Test User',
    phoneNumberId: 'phone-123',
    timestamp: '1234567890',
  };

  it('deve retornar ignored quando o tenant não existir', async () => {
    deps.tenantRepo.findByWaPhoneNumberId.mockResolvedValue(null);

    const result = await useCase.execute(mockPayload);

    expect(result).toEqual({ duplicate: false, ignored: true, reason: 'Unknown tenant' });
    expect(deps.contactRepo.findOrCreate).not.toHaveBeenCalled();
  });

  it('deve processar e enfileirar a mensagem com sucesso', async () => {
    deps.tenantRepo.findByWaPhoneNumberId.mockResolvedValue({ id: 'tenant-1' });
    deps.contactRepo.findOrCreate.mockResolvedValue({ id: 'contact-1', waId: '5511999990000' });
    deps.conversationRepo.findOrCreate.mockResolvedValue({ id: 'conv-1' });
    deps.messageRepo.create.mockResolvedValue({ id: 'msg-1' });

    const result = await useCase.execute(mockPayload);

    expect(result).toEqual({ duplicate: false, messageId: 'msg-1', conversationId: 'conv-1' });
    expect(deps.queueService.enqueue).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      messageId: 'msg-1',
      conversationId: 'conv-1',
      contactWaId: '5511999990000',
    });
  });

  it('deve retornar duplicate = true quando o repositório retornar nulo (idempotência)', async () => {
    deps.tenantRepo.findByWaPhoneNumberId.mockResolvedValue({ id: 'tenant-1' });
    deps.contactRepo.findOrCreate.mockResolvedValue({ id: 'contact-1', waId: '5511999990000' });
    deps.conversationRepo.findOrCreate.mockResolvedValue({ id: 'conv-1' });
    // Retorna null simulando a violação de constraint UNIQUE no DB
    deps.messageRepo.create.mockResolvedValue(null);

    const result = await useCase.execute(mockPayload);

    expect(result).toEqual({ duplicate: true });
    expect(deps.queueService.enqueue).not.toHaveBeenCalled();
    expect(deps.logger.info).toHaveBeenCalledWith(
      { messageId: 'wamid.123' },
      'Duplicate message received, ignoring'
    );
  });
});

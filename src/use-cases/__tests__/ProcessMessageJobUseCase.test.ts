import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessMessageJobUseCase, type ProcessMessageJobData } from '../ProcessMessageJobUseCase.js';

describe('ProcessMessageJobUseCase', () => {
  let useCase: ProcessMessageJobUseCase;
  let deps: any;

  beforeEach(() => {
    deps = {
      messageRepo: { findById: vi.fn(), updateStatus: vi.fn(), findByConversation: vi.fn(), create: vi.fn() },
      conversationRepo: {},
      orderRepo: {},
      tenantRepo: { findById: vi.fn() },
      llmService: { chat: vi.fn() },
      metaService: { sendMessage: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
      knowledgeBase: 'Mock KB',
    };
    useCase = new ProcessMessageJobUseCase(deps);
  });

  const mockJobData: ProcessMessageJobData = {
    tenantId: 'tenant-1',
    messageId: 'msg-1',
    conversationId: 'conv-1',
    contactWaId: '5511999990000',
  };

  it('deve processar com sucesso e chamar a OpenAI e a Meta API', async () => {
    // Setup mocks
    deps.messageRepo.findById.mockResolvedValue({ id: 'msg-1', status: 'RECEIVED' });
    deps.tenantRepo.findById.mockResolvedValue({ id: 'tenant-1', waPhoneNumberId: 'phone-123' });
    deps.messageRepo.findByConversation.mockResolvedValue([
      { direction: 'INBOUND', body: 'Oi' }
    ]);
    deps.llmService.chat.mockResolvedValue({
      text: 'Olá! Como posso ajudar?',
      toolCalls: []
    });
    deps.messageRepo.create.mockResolvedValue({ id: 'msg-out-1' });
    deps.metaService.sendMessage.mockResolvedValue({ waMessageId: 'wamid.out.123' });

    // Execute
    await useCase.execute(mockJobData);

    // Assertions
    expect(deps.messageRepo.updateStatus).toHaveBeenCalledWith('msg-1', 'PROCESSING');
    expect(deps.llmService.chat).toHaveBeenCalled();
    expect(deps.messageRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      direction: 'OUTBOUND',
      body: 'Olá! Como posso ajudar?',
    }));
    expect(deps.metaService.sendMessage).toHaveBeenCalledWith('phone-123', '5511999990000', 'Olá! Como posso ajudar?');
    expect(deps.messageRepo.updateStatus).toHaveBeenCalledWith('msg-out-1', 'SENT');
  });

  it('deve ignorar a mensagem se o status não for RECEIVED', async () => {
    // Setup mocks - status is PROCESSING
    deps.messageRepo.findById.mockResolvedValue({ id: 'msg-1', status: 'PROCESSING' });

    // Execute
    await useCase.execute(mockJobData);

    // Assertions - shouldn't proceed
    expect(deps.tenantRepo.findById).not.toHaveBeenCalled();
    expect(deps.logger.info).toHaveBeenCalledWith(
      { messageId: 'msg-1' },
      'Message already processed or processing'
    );
  });
});

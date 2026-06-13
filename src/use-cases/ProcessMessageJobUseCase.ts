import { randomUUID } from 'node:crypto';
import type { IMessageRepository } from '../domain/interfaces/IMessageRepository.js';
import type { IConversationRepository } from '../domain/interfaces/IConversationRepository.js';
import type { IOrderRepository } from '../domain/interfaces/IOrderRepository.js';
import type { ITenantRepository } from '../domain/interfaces/ITenantRepository.js';
import type { ILLMService, LLMMessage, LLMTool } from '../domain/interfaces/ILLMService.js';
import type { IMetaService } from '../domain/interfaces/IMetaService.js';
import type { Logger } from '../infrastructure/logger/pino.js';

export interface ProcessMessageJobData {
  tenantId: string;
  messageId: string;
  conversationId: string;
  contactWaId: string;
}

export interface ProcessMessageJobUseCaseDeps {
  messageRepo: IMessageRepository;
  conversationRepo: IConversationRepository;
  orderRepo: IOrderRepository;
  tenantRepo: ITenantRepository;
  llmService: ILLMService;
  metaService: IMetaService;
  logger: Logger;
  knowledgeBase: string;
}

export class ProcessMessageJobUseCase {
  constructor(private deps: ProcessMessageJobUseCaseDeps) {}

  async execute(data: ProcessMessageJobData) {
    const { messageRepo, orderRepo, tenantRepo, llmService, metaService, logger, knowledgeBase } = this.deps;

    logger.info({ jobId: data.messageId }, 'Processing message job started');

    // 1. Load message and update status
    const inboundMessage = await messageRepo.findById(data.messageId);
    if (!inboundMessage) {
      throw new Error(`Message ${data.messageId} not found`);
    }

    if (inboundMessage.status !== 'RECEIVED') {
      logger.info({ messageId: data.messageId }, 'Message already processed or processing');
      return;
    }

    await messageRepo.updateStatus(inboundMessage.id, 'PROCESSING');

    try {
      // 2. Load tenant
      const tenant = await tenantRepo.findById(data.tenantId);
      if (!tenant) {
        throw new Error(`Tenant ${data.tenantId} not found`);
      }

      // 3. Load conversation history
      const history = await messageRepo.findByConversation(data.tenantId, data.conversationId);
      // Take last 20 messages for context
      const recentHistory = history.slice(-20);

      const llmMessages: LLMMessage[] = [
        {
          role: 'system',
          content: `Você é o assistente virtual da NeoFibra, um provedor de internet fibra óptica. Responda APENAS com base na base de conhecimento fornecida abaixo. Se a informação não estiver na base de conhecimento, diga que não tem essa informação e sugira entrar em contato por outro canal. Seja educado, conciso e profissional. Responda em português.

Base de Conhecimento:
${knowledgeBase}`,
        },
      ];

      for (const msg of recentHistory) {
        llmMessages.push({
          role: msg.direction === 'INBOUND' ? 'user' : 'assistant',
          content: msg.body,
        });
      }

      const tools: LLMTool[] = [
        {
          name: 'check_order_status',
          description: 'Consulta o status e detalhes de um pedido pelo seu código identificador (ex: #1234, #9999, PED-1001).',
          parameters: {
            type: 'object',
            properties: {
              orderId: {
                type: 'string',
                description: 'O código ou ID do pedido (ex: #1234 ou PED-1001)',
              },
            },
            required: ['orderId'],
          },
        },
      ];

      // 4. Call LLM
      logger.debug('Calling LLM');
      let llmResponse = await llmService.chat(llmMessages, tools);

      // 5. Handle Tool Calls
      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        logger.info({ toolCalls: llmResponse.toolCalls.length }, 'LLM requested tool calls');
        // Add assistant's message with tool calls to history
        llmMessages.push({
          role: 'assistant',
          content: llmResponse.text || '', // Optional text before tool calls
          // We need a way to pass tool_calls to the history if using official openai interface
          // For simplicity in our interface, we handle the flow directly
        } as any);

        for (const toolCall of llmResponse.toolCalls) {
          if (toolCall.name === 'check_order_status') {
            const { orderId } = toolCall.arguments as { orderId: string };
            const order = await orderRepo.findById(data.tenantId, orderId);
            
            let toolResultContent = '';
            if (order) {
              toolResultContent = `Pedido encontrado. Status: ${order.status}, Itens: ${order.items}, Total: R$ ${order.total}`;
            } else {
              toolResultContent = `Pedido ${orderId} não encontrado.`;
            }

            llmMessages.push({
              role: 'tool',
              toolCallId: toolCall.id,
              name: toolCall.name,
              content: toolResultContent,
            });
          }
        }

        // Call LLM again with tool results
        logger.debug('Calling LLM again with tool results');
        llmResponse = await llmService.chat(llmMessages, tools);
      }

      const replyText = llmResponse.text || 'Desculpe, não entendi.';

      // 6. Persist outbound message
      const outWaMessageId = `wamid.out.${randomUUID()}`;
      const outboundMessage = await messageRepo.create({
        tenantId: data.tenantId,
        conversationId: data.conversationId,
        waMessageId: outWaMessageId,
        direction: 'OUTBOUND',
        body: replyText,
        status: 'PROCESSING',
      });

      if (!outboundMessage) {
         throw new Error('Failed to persist outbound message');
      }

      // 7. Send via Meta API
      logger.debug({ to: data.contactWaId, text: replyText }, 'Sending message via Meta API');
      const metaResult = await metaService.sendMessage(tenant.waPhoneNumberId, data.contactWaId, replyText);

      // Update with the real waMessageId from Meta (if available) and status
      // We can just keep our generated one or update it if Meta returns a different one
      // For this challenge, we assume Meta returns an ID
      await messageRepo.updateStatus(outboundMessage.id, 'SENT');

      logger.info({ jobId: data.messageId, outWaMessageId: metaResult.waMessageId }, 'Message job completed successfully');

    } catch (error) {
      logger.error({ err: error, jobId: data.messageId }, 'Error processing message job');
      await messageRepo.updateStatus(inboundMessage.id, 'FAILED');
      throw error;
    }
  }
}

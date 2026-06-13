import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadEnv } from './infrastructure/config/env.js';
import { createLogger } from './infrastructure/logger/pino.js';
import { getDb, closeDb } from './infrastructure/db/connection.js';

import { DrizzleTenantRepository } from './adapters/repositories/DrizzleTenantRepository.js';
import { DrizzleContactRepository } from './adapters/repositories/DrizzleContactRepository.js';
import { DrizzleConversationRepository } from './adapters/repositories/DrizzleConversationRepository.js';
import { DrizzleMessageRepository } from './adapters/repositories/DrizzleMessageRepository.js';

import { BullMQQueueService } from './adapters/services/BullMQQueueService.js';

import { ReceiveWebhookUseCase } from './use-cases/ReceiveWebhookUseCase.js';
import { ListConversationsUseCase } from './use-cases/ListConversationsUseCase.js';
import { ListMessagesUseCase } from './use-cases/ListMessagesUseCase.js';

import { WebhookController } from './adapters/controllers/WebhookController.js';
import { ConversationController } from './adapters/controllers/ConversationController.js';

import { createServer } from './infrastructure/http/server.js';
import { createSignatureVerifier } from './infrastructure/http/middlewares/signature.js';
import { createTenantAuth } from './infrastructure/http/middlewares/auth.js';
import { registerRoutes } from './infrastructure/http/routes.js';

async function bootstrap() {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);

  try {
    logger.info('Starting WhatsApp Backend server...');

    const db = getDb(env.DATABASE_URL);

    // Repositories
    const tenantRepo = new DrizzleTenantRepository(db);
    const contactRepo = new DrizzleContactRepository(db);
    const conversationRepo = new DrizzleConversationRepository(db);
    const messageRepo = new DrizzleMessageRepository(db);

    // Services
    const queueService = new BullMQQueueService({ redisUrl: env.REDIS_URL, logger });

    // Use Cases
    const receiveWebhookUseCase = new ReceiveWebhookUseCase({
      tenantRepo,
      contactRepo,
      conversationRepo,
      messageRepo,
      queueService,
      logger,
    });

    const listConversationsUseCase = new ListConversationsUseCase({ conversationRepo });
    const listMessagesUseCase = new ListMessagesUseCase({ conversationRepo, messageRepo });

    // Controllers
    const webhookController = new WebhookController({
      receiveWebhookUseCase,
      verifyToken: env.META_VERIFY_TOKEN,
      logger,
    });

    const conversationController = new ConversationController({
      listConversationsUseCase,
      listMessagesUseCase,
    });

    // HTTP Server
    const app = await createServer(logger);
    
    // Middlewares
    const signatureVerifier = createSignatureVerifier(env.META_APP_SECRET);
    const tenantAuth = createTenantAuth(tenantRepo);

    // Routes
    registerRoutes(app, {
      webhookController,
      conversationController,
      signatureVerifier,
      tenantAuth,
    });

    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info(`Server is running on port ${env.PORT}`);

    // Graceful Shutdown
    const shutdown = async () => {
      logger.info('Shutting down server...');
      await app.close();
      await queueService.close();
      await closeDb();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

bootstrap();

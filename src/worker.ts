import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Worker } from 'bullmq';

import { loadEnv } from './infrastructure/config/env.js';
import { createLogger } from './infrastructure/logger/pino.js';
import { getDb, closeDb } from './infrastructure/db/connection.js';

import { DrizzleMessageRepository } from './adapters/repositories/DrizzleMessageRepository.js';
import { DrizzleConversationRepository } from './adapters/repositories/DrizzleConversationRepository.js';
import { DrizzleOrderRepository } from './adapters/repositories/DrizzleOrderRepository.js';
import { DrizzleTenantRepository } from './adapters/repositories/DrizzleTenantRepository.js';

import { OpenAILLMService } from './adapters/services/OpenAILLMService.js';
import { MetaAPIService } from './adapters/services/MetaAPIService.js';
import { getKnowledgeBase } from './adapters/services/KnowledgeBaseLoader.js';

import { ProcessMessageJobUseCase, type ProcessMessageJobData } from './use-cases/ProcessMessageJobUseCase.js';

async function bootstrap() {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);

  try {
    logger.info('Starting WhatsApp Worker...');

    const db = getDb(env.DATABASE_URL);

    // Repositories
    const messageRepo = new DrizzleMessageRepository(db);
    const conversationRepo = new DrizzleConversationRepository(db);
    const orderRepo = new DrizzleOrderRepository(db);
    const tenantRepo = new DrizzleTenantRepository(db);

    // Services
    const llmService = new OpenAILLMService({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL, logger });
    const metaService = new MetaAPIService({ apiBaseUrl: env.META_API_BASE_URL, token: env.META_TOKEN, logger });
    
    const kbPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'knowledge-base');
    const knowledgeBase = await getKnowledgeBase(kbPath);
    
    logger.info({ kbSize: knowledgeBase.length }, 'Loaded Knowledge Base');

    // Use Case
    const processMessageJobUseCase = new ProcessMessageJobUseCase({
      messageRepo,
      conversationRepo,
      orderRepo,
      tenantRepo,
      llmService,
      metaService,
      logger,
      knowledgeBase,
    });

    const url = new URL(env.REDIS_URL);
    const connection = {
      host: url.hostname,
      port: Number(url.port) || 6379,
    };

    // Worker
    const worker = new Worker<ProcessMessageJobData>(
      'message-processing',
      async (job) => {
        await processMessageJobUseCase.execute(job.data);
      },
      { connection, concurrency: 3 }
    );

    worker.on('ready', () => {
      logger.info('Worker is ready and listening for jobs');
    });

    worker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, err }, 'Job failed');
    });

    worker.on('completed', (job) => {
      logger.info({ jobId: job.id }, 'Job completed successfully');
    });

    // Graceful Shutdown
    const shutdown = async () => {
      logger.info('Shutting down worker...');
      await worker.close();
      await closeDb();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (err) {
    logger.fatal({ err }, 'Failed to start worker');
    process.exit(1);
  }
}

bootstrap();

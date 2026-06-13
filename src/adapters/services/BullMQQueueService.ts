import { Queue } from 'bullmq';
import type { IQueueService, ProcessMessageJobData } from '../../domain/interfaces/IQueueService.js';
import type { Logger } from '../../infrastructure/logger/pino.js';

export class BullMQQueueService implements IQueueService {
  private queue: Queue;

  constructor(deps: { redisUrl: string; logger: Logger }) {
    const url = new URL(deps.redisUrl);
    const connection = {
      host: url.hostname,
      port: Number(url.port) || 6379,
      // If there's a username/password, handle them here too, but for local default is enough
    };

    this.queue = new Queue('message-processing', { connection });
    deps.logger.info('BullMQQueueService initialized for queue: message-processing');
  }

  async enqueue(data: ProcessMessageJobData): Promise<void> {
    await this.queue.add('process-message', data, {
      jobId: data.messageId, // idempotency at the queue level
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { Logger } from '../logger/pino.js';

export async function createServer(logger: Logger) {
  const fastify = Fastify({
    logger: logger as any,
  });

  await fastify.register(cors, { origin: true });

  // Add custom content type parser for application/json that preserves raw body for HMAC verification
  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      (req as any).rawBody = body;
      try {
        done(null, JSON.parse(body.toString()));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  fastify.decorateRequest('rawBody', null);
  fastify.decorateRequest('tenantId', null);

  return fastify;
}

export type FastifyApp = Awaited<ReturnType<typeof createServer>>;

import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import type { Logger } from '../logger/pino.js';

export async function createServer(logger: Logger) {
  const fastify = Fastify({
    loggerInstance: logger as any,
  });

  await fastify.register(cors, { origin: true });
  
  // Limite global de chamadas para prevenir DDoS
  await fastify.register(fastifyRateLimit, {
    max: 100, // Máximo de chamadas permitidas
    timeWindow: '1 minute', // por IP neste intervalo
    errorResponseBuilder: function (request, context) {
      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded, retry in ${context.after}`
      };
    }
  });

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

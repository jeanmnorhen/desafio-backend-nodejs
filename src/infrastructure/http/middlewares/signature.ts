import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';

export function verifySignatureRaw(rawBody: Buffer, signature: string, appSecret: string): boolean {
  try {
    const expectedSignature = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    
    if (sigBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

export function createSignatureVerifier(appSecret: string) {
  return async function verifySignature(request: FastifyRequest, reply: FastifyReply) {
    const signature = request.headers['x-hub-signature-256'] as string | undefined;
    if (!signature) {
      return reply.status(401).send({ error: 'Missing X-Hub-Signature-256 header' });
    }

    const rawBody = (request as any).rawBody as Buffer;
    if (!rawBody) {
      return reply.status(401).send({ error: 'Missing raw body for verification' });
    }

    if (!verifySignatureRaw(rawBody, signature, appSecret)) {
      request.log.warn({ signature }, 'Invalid webhook signature');
      return reply.status(401).send({ error: 'Invalid signature' });
    }
  };
}

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ITenantRepository } from '../../../domain/interfaces/ITenantRepository.js';

export function createTenantAuth(tenantRepo: ITenantRepository) {
  return async function authenticateTenant(request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid Authorization header' });
    }
    
    const apiKey = authHeader.slice(7);
    const tenant = await tenantRepo.findByApiKey(apiKey);
    
    if (!tenant) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }
    
    (request as any).tenantId = tenant.id;
  };
}

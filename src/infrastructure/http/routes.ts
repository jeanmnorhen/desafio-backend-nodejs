import type { FastifyApp } from './server.js';
import type { WebhookController } from '../../adapters/controllers/WebhookController.js';
import type { ConversationController } from '../../adapters/controllers/ConversationController.js';

interface RoutesDeps {
  webhookController: WebhookController;
  conversationController: ConversationController;
  signatureVerifier: (request: any, reply: any) => Promise<void>;
  tenantAuth: (request: any, reply: any) => Promise<void>;
}

export function registerRoutes(app: FastifyApp, deps: RoutesDeps) {
  // Webhook routes (Meta)
  app.get('/webhook', (req, reply) => deps.webhookController.handleVerification(req, reply));
  app.post('/webhook', { preHandler: deps.signatureVerifier }, (req, reply) => deps.webhookController.handleIncoming(req, reply));

  // REST API routes (Frontend)
  app.get('/api/conversations', { preHandler: deps.tenantAuth }, (req, reply) => deps.conversationController.listConversations(req, reply));
  app.get('/api/conversations/:id/messages', { preHandler: deps.tenantAuth }, (req, reply) => deps.conversationController.listMessages(req, reply));

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
}

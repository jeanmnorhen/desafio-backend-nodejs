import { eq, and } from 'drizzle-orm';
import type { IConversationRepository, ConversationWithContact } from '../../domain/interfaces/IConversationRepository.js';
import type { Conversation } from '../../domain/entities/Conversation.js';
import type { Database } from '../../infrastructure/db/connection.js';
import * as schema from '../../infrastructure/db/schema.js';

export class DrizzleConversationRepository implements IConversationRepository {
  constructor(private db: Database) {}

  private toDomain(row: typeof schema.conversations.$inferSelect): Conversation {
    return {
      id: row.id,
      tenantId: row.tenantId,
      contactId: row.contactId,
      status: row.status as Conversation['status'],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findOrCreate(tenantId: string, contactId: string): Promise<Conversation> {
    await this.db
      .insert(schema.conversations)
      .values({ tenantId, contactId, status: 'ACTIVE' })
      .onConflictDoNothing({ target: [schema.conversations.tenantId, schema.conversations.contactId] });

    const result = await this.db
      .select()
      .from(schema.conversations)
      .where(and(eq(schema.conversations.tenantId, tenantId), eq(schema.conversations.contactId, contactId)));

    if (!result[0]) {
      throw new Error('Failed to find or create conversation');
    }

    return this.toDomain(result[0]);
  }

  async findById(tenantId: string, id: string): Promise<Conversation | null> {
    const result = await this.db
      .select()
      .from(schema.conversations)
      .where(and(eq(schema.conversations.tenantId, tenantId), eq(schema.conversations.id, id)));
    return result[0] ? this.toDomain(result[0]) : null;
  }

  async listByTenant(tenantId: string): Promise<ConversationWithContact[]> {
    const result = await this.db
      .select({
        conversation: schema.conversations,
        contact: schema.contacts,
      })
      .from(schema.conversations)
      .leftJoin(schema.contacts, eq(schema.conversations.contactId, schema.contacts.id))
      .where(eq(schema.conversations.tenantId, tenantId));

    return result.map(({ conversation, contact }) => ({
      ...this.toDomain(conversation),
      contactName: contact ? contact.name : null,
      contactWaId: contact ? contact.waId : '',
    }));
  }
}

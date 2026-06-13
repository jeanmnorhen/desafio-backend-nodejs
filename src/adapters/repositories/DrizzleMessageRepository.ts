import { eq, and, asc } from 'drizzle-orm';
import type { IMessageRepository, CreateMessageInput } from '../../domain/interfaces/IMessageRepository.js';
import type { Message } from '../../domain/entities/Message.js';
import type { Database } from '../../infrastructure/db/connection.js';
import * as schema from '../../infrastructure/db/schema.js';

export class DrizzleMessageRepository implements IMessageRepository {
  constructor(private db: Database) {}

  private toDomain(row: typeof schema.messages.$inferSelect): Message {
    return {
      id: row.id,
      tenantId: row.tenantId,
      conversationId: row.conversationId,
      waMessageId: row.waMessageId,
      direction: row.direction as Message['direction'],
      body: row.body,
      status: row.status as Message['status'],
      createdAt: row.createdAt,
    };
  }

  async create(input: CreateMessageInput): Promise<Message | null> {
    try {
      const result = await this.db
        .insert(schema.messages)
        .values({
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          waMessageId: input.waMessageId,
          direction: input.direction,
          body: input.body,
          status: input.status,
        })
        .returning();
      
      return this.toDomain(result[0]!);
    } catch (error: any) {
      if (error.code === '23505') {
        // Unique violation (waMessageId already exists)
        return null;
      }
      throw error;
    }
  }

  async findByConversation(tenantId: string, conversationId: string): Promise<Message[]> {
    const result = await this.db
      .select()
      .from(schema.messages)
      .where(and(eq(schema.messages.tenantId, tenantId), eq(schema.messages.conversationId, conversationId)))
      .orderBy(asc(schema.messages.createdAt));
      
    return result.map(this.toDomain);
  }

  async findById(id: string): Promise<Message | null> {
    const result = await this.db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.id, id));
      
    return result[0] ? this.toDomain(result[0]) : null;
  }

  async updateStatus(id: string, status: Message['status']): Promise<void> {
    await this.db
      .update(schema.messages)
      .set({ status })
      .where(eq(schema.messages.id, id));
  }
}

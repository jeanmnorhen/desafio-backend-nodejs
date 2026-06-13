import { eq, and } from 'drizzle-orm';
import type { IContactRepository } from '../../domain/interfaces/IContactRepository.js';
import type { Contact } from '../../domain/entities/Contact.js';
import type { Database } from '../../infrastructure/db/connection.js';
import * as schema from '../../infrastructure/db/schema.js';

export class DrizzleContactRepository implements IContactRepository {
  constructor(private db: Database) {}

  private toDomain(row: typeof schema.contacts.$inferSelect): Contact {
    return {
      id: row.id,
      tenantId: row.tenantId,
      waId: row.waId,
      name: row.name,
      createdAt: row.createdAt,
    };
  }

  async findOrCreate(tenantId: string, waId: string, name: string | null): Promise<Contact> {
    // Attempt to insert and ignore on conflict
    await this.db
      .insert(schema.contacts)
      .values({ tenantId, waId, name })
      .onConflictDoNothing({ target: [schema.contacts.tenantId, schema.contacts.waId] });

    // Read the contact (whether it was just inserted or already existed)
    // If it existed, we might want to update the name, but for simplicity we just read it.
    const result = await this.db
      .select()
      .from(schema.contacts)
      .where(and(eq(schema.contacts.tenantId, tenantId), eq(schema.contacts.waId, waId)));

    if (!result[0]) {
      throw new Error('Failed to find or create contact');
    }

    return this.toDomain(result[0]);
  }

  async findById(tenantId: string, id: string): Promise<Contact | null> {
    const result = await this.db
      .select()
      .from(schema.contacts)
      .where(and(eq(schema.contacts.tenantId, tenantId), eq(schema.contacts.id, id)));
    return result[0] ? this.toDomain(result[0]) : null;
  }
}

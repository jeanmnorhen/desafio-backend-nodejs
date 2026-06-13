import { eq } from 'drizzle-orm';
import type { ITenantRepository } from '../../domain/interfaces/ITenantRepository.js';
import type { Tenant } from '../../domain/entities/Tenant.js';
import type { Database } from '../../infrastructure/db/connection.js';
import * as schema from '../../infrastructure/db/schema.js';

export class DrizzleTenantRepository implements ITenantRepository {
  constructor(private db: Database) {}

  private toDomain(row: typeof schema.tenants.$inferSelect): Tenant {
    return {
      id: row.id,
      name: row.name,
      waPhoneNumberId: row.waPhoneNumberId,
      apiKey: row.apiKey,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findById(id: string): Promise<Tenant | null> {
    const result = await this.db.select().from(schema.tenants).where(eq(schema.tenants.id, id));
    return result[0] ? this.toDomain(result[0]) : null;
  }

  async findByWaPhoneNumberId(waPhoneNumberId: string): Promise<Tenant | null> {
    const result = await this.db.select().from(schema.tenants).where(eq(schema.tenants.waPhoneNumberId, waPhoneNumberId));
    return result[0] ? this.toDomain(result[0]) : null;
  }

  async findByApiKey(apiKey: string): Promise<Tenant | null> {
    const result = await this.db.select().from(schema.tenants).where(eq(schema.tenants.apiKey, apiKey));
    return result[0] ? this.toDomain(result[0]) : null;
  }
}

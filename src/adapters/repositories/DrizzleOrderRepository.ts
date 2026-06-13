import { eq, and } from 'drizzle-orm';
import type { IOrderRepository } from '../../domain/interfaces/IOrderRepository.js';
import type { Order } from '../../domain/entities/Order.js';
import type { Database } from '../../infrastructure/db/connection.js';
import * as schema from '../../infrastructure/db/schema.js';

export class DrizzleOrderRepository implements IOrderRepository {
  constructor(private db: Database) {}

  private toDomain(row: typeof schema.orders.$inferSelect): Order {
    return {
      id: row.id,
      tenantId: row.tenantId,
      customerPhone: row.customerPhone,
      status: row.status as Order['status'],
      items: row.items,
      total: row.total,
      createdAt: row.createdAt,
    };
  }

  async findById(tenantId: string, orderId: string): Promise<Order | null> {
    const result = await this.db
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.tenantId, tenantId), eq(schema.orders.id, orderId)));
      
    return result[0] ? this.toDomain(result[0]) : null;
  }
}

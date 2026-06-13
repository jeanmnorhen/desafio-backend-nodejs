import type { Order } from '../entities/Order.js';

export interface IOrderRepository {
  findById(tenantId: string, orderId: string): Promise<Order | null>;
}

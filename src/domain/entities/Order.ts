export type OrderStatus = 'PREPARANDO' | 'EM_ROTA' | 'ENTREGUE' | 'CANCELADO';

export interface Order {
  id: string;
  tenantId: string;
  customerPhone: string;
  status: OrderStatus;
  items: string;
  total: string;
  createdAt: Date;
}

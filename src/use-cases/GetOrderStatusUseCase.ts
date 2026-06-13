import type { IOrderRepository } from '../domain/interfaces/IOrderRepository.js';

export interface GetOrderStatusUseCaseDeps {
  orderRepo: IOrderRepository;
}

export class GetOrderStatusUseCase {
  constructor(private deps: GetOrderStatusUseCaseDeps) {}

  async execute(tenantId: string, orderId: string) {
    return this.deps.orderRepo.findById(tenantId, orderId);
  }
}

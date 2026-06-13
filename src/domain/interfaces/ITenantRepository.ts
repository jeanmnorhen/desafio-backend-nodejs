import type { Tenant } from '../entities/Tenant.js';

export interface ITenantRepository {
  findById(id: string): Promise<Tenant | null>;
  findByWaPhoneNumberId(waPhoneNumberId: string): Promise<Tenant | null>;
  findByApiKey(apiKey: string): Promise<Tenant | null>;
}

import type { Contact } from '../entities/Contact.js';

export interface IContactRepository {
  findOrCreate(tenantId: string, waId: string, name: string | null): Promise<Contact>;
  findById(tenantId: string, id: string): Promise<Contact | null>;
}

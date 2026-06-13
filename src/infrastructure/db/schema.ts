import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// ─── Tenants ─────────────────────────────────────────────
export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  waPhoneNumberId: text('wa_phone_number_id').notNull().unique(),
  apiKey: text('api_key').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Contacts ────────────────────────────────────────────
export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    waId: text('wa_id').notNull(),
    name: text('name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('contacts_tenant_wa_id_uniq').on(t.tenantId, t.waId),
  ],
);

// ─── Conversations ───────────────────────────────────────
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('conversations_tenant_contact_uniq').on(t.tenantId, t.contactId),
    index('conversations_tenant_id_idx').on(t.tenantId),
  ],
);

// ─── Messages ────────────────────────────────────────────
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    waMessageId: text('wa_message_id').notNull().unique(),
    direction: text('direction').notNull(), // INBOUND | OUTBOUND
    body: text('body').notNull(),
    status: text('status').notNull().default('RECEIVED'), // RECEIVED | PROCESSING | SENT | FAILED
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('messages_conversation_id_idx').on(t.conversationId),
    index('messages_tenant_id_idx').on(t.tenantId),
  ],
);

// ─── Orders (Function Calling mock) ─────────────────────
export const orders = pgTable(
  'orders',
  {
    id: text('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerPhone: text('customer_phone').notNull(),
    status: text('status').notNull(), // PREPARANDO | EM_ROTA | ENTREGUE | CANCELADO
    items: text('items').notNull(),
    total: numeric('total', { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('orders_tenant_id_idx').on(t.tenantId),
  ],
);

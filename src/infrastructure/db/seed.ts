import 'dotenv/config';
import { getDb, closeDb } from './connection.js';
import * as schema from './schema.js';

async function runSeed() {
  console.log('🌱 Starting DB seed...');
  const db = getDb(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/atendimento');

  try {
    // 1. Create default NeoFibra tenant
    console.log('Creating Tenant...');
    const tenantsResult = await db.insert(schema.tenants).values({
      name: 'NeoFibra',
      waPhoneNumberId: '123456789012345',
      apiKey: 'test-api-key-neofibra'
    }).onConflictDoNothing({ target: schema.tenants.waPhoneNumberId }).returning();

    // If it didn't return, it already exists, so we fetch it
    let tenant = tenantsResult[0];
    if (!tenant) {
      const existing = await db.select().from(schema.tenants).where(
        require('drizzle-orm').eq(schema.tenants.waPhoneNumberId, '123456789012345')
      );
      tenant = existing[0];
    }

    if (!tenant) throw new Error('Failed to create or find tenant');

    // 2. Create sample orders for the function calling check_order_status
    console.log('Creating Orders...');
    const orders = [
      { id: 'PED-1001', tenantId: tenant.id, customerPhone: '5511999990000', status: 'EM_ROTA', items: 'Fibra Plus 600Mbps', total: '99.90' },
      { id: 'PED-1002', tenantId: tenant.id, customerPhone: '5511999990000', status: 'ENTREGUE', items: 'Fibra Max 1Gbps + IP Fixo', total: '169.80' },
      { id: 'PED-1003', tenantId: tenant.id, customerPhone: '5511888880000', status: 'PREPARANDO', items: 'Fibra Start 300Mbps + NeoPlay', total: '104.80' },
    ];

    for (const order of orders) {
      await db.insert(schema.orders).values(order).onConflictDoNothing({ target: schema.orders.id });
    }

    console.log('✅ Seed completed successfully!');
  } catch (err) {
    console.error('❌ Seed failed:', err);
  } finally {
    await closeDb();
  }
}

runSeed();

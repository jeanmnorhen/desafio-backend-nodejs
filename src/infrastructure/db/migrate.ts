import 'dotenv/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDb, closeDb } from './connection.js';

async function runMigrate() {
  console.log('🚀 Running migrations...');
  const db = getDb(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/atendimento');

  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('✅ Migrations completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

runMigrate();

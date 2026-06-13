import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sql: ReturnType<typeof postgres> | null = null;

export function getDb(databaseUrl: string) {
  if (db) return db;
  sql = postgres(databaseUrl, { max: 10 });
  db = drizzle(sql, { schema });
  return db;
}

export type Database = ReturnType<typeof getDb>;

export async function closeDb() {
  if (sql) {
    await sql.end();
    sql = null;
    db = null;
  }
}

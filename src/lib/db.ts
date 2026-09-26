import 'server-only';
import pg, { type PoolClient, type QueryResultRow } from 'pg';
import { supabaseRootCa } from './supabase-ca';

const globalPool = globalThis as typeof globalThis & { bookbondsPool?: pg.Pool };
export function databaseConfigured() { return Boolean(process.env.DATABASE_URL); }
export function db() {
  if (!process.env.DATABASE_URL) throw new Error('Database is not configured');
  if (!globalPool.bookbondsPool) globalPool.bookbondsPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL, max: 1, idleTimeoutMillis: 30000,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { ca: supabaseRootCa, rejectUnauthorized: true }
  });
  return globalPool.bookbondsPool;
}
export type Tx = Pick<PoolClient, 'query'>;
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db().connect();
  try { await client.query('BEGIN'); const value = await fn(client); await client.query('COMMIT'); return value; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export async function one<T extends QueryResultRow>(sql: string, args: unknown[] = []): Promise<T | null> {
  const result = await db().query<T>(sql, args); return result.rows[0] ?? null;
}
export async function many<T extends QueryResultRow>(sql: string, args: unknown[] = []): Promise<T[]> {
  return (await db().query<T>(sql, args)).rows;
}
export async function audit(client: Tx, actor: string | null, action: string, targetType: string, targetId: string, data: object = {}, reason: string | null = null) {
  await client.query('insert into audit_events(actor_id,action,target_type,target_id,data,reason) values($1,$2,$3,$4,$5,$6)',[actor,action,targetType,targetId,JSON.stringify(data),reason]);
}

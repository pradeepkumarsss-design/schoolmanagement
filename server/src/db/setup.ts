import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { todayIn } from '../../../shared/auth';
import { MemoryStore } from '../../../shared/memoryStore';
import { RESOURCES } from '../../../shared/resources';
import { buildSeed, DEMO_PASSWORD } from '../../../shared/seed';
import type { Row, Store } from '../../../shared/types';
import { config } from '../config';
import { PgStore } from './pgStore';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = [join(here, '../../migrations'), join(here, '../migrations')];

/** A connection that selects the configured schema before it is handed out. */
class SchemaClient extends pg.Client {
  connect(callback?: any): any {
    const ready = super.connect().then(() => this.query(`SET search_path TO ${config.databaseSchema}`)).then(() => undefined);
    if (!callback) return ready;
    ready.then(() => callback(), callback);
  }
}

/** One place that knows how to reach the database, including hosted Postgres such as Supabase. */
export function createPool(max = 10): pg.Pool {
  const url = new URL(config.databaseUrl);
  const hosted = /supabase\.(co|com)$/.test(url.hostname);
  const mode = config.databaseCaCert ? 'verify' : config.databaseSsl || url.searchParams.get('sslmode') || (hosted ? 'require' : 'disable');
  // node-postgres would otherwise let sslmode in the URL override the settings below.
  url.searchParams.delete('sslmode');
  const ssl = mode === 'disable' ? false
    : mode === 'verify' || mode === 'verify-full' ? { rejectUnauthorized: true, ca: config.databaseCaCert ? readFileSync(config.databaseCaCert, 'utf8') : undefined }
      : { rejectUnauthorized: false };
  const pool = new pg.Pool({ connectionString: url.toString(), ssl, max, ...(config.databaseSchema !== 'public' ? { Client: SchemaClient as any } : {}), idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
  pool.on('error', e => console.error('Database connection error:', e.message));
  return pool;
}

export async function migrate(pool: pg.Pool): Promise<string[]> {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${config.databaseSchema}`);
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  await pool.query('ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY');
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
  const dir = migrationsDir.find(d => { try { return readdirSync(d).length > 0; } catch { return false; } });
  if (!dir) throw new Error('Migrations folder not found');
  const applied: string[] = [];
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(readFileSync(join(dir, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
  return applied;
}

/** Tables ordered so that referenced tables are filled first. */
function insertOrder(): string[] {
  const order: string[] = [], seen = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    for (const f of RESOURCES.find(r => r.name === name)!.fields) if (f.type === 'ref' && f.ref !== name) visit(f.ref!);
    order.push(name);
  };
  RESOURCES.forEach(r => visit(r.name));
  return order;
}

export async function sampleData(): Promise<Record<string, Row[]>> {
  const data = buildSeed(todayIn(config.timeZone));
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of data.users) u.password_hash = hash;
  return data;
}

export async function seed(pool: pg.Pool, reset: boolean): Promise<string> {
  const store = new PgStore(pool);
  if (reset) await pool.query(`TRUNCATE ${RESOURCES.map(r => r.name).join(', ')} CASCADE`);
  else if ((await store.list('users', { limit: 1 })).total > 0) return 'Database already has data. Use "npm run seed:reset" to replace it.';
  const data = await sampleData();
  await store.tx(async s => { for (const name of insertOrder()) await s.bulkCreate(name, data[name] ?? []); });
  return `Seeded ${Object.values(data).reduce((a, r) => a + r.length, 0)} rows across ${RESOURCES.length} tables.`;
}

export async function openStore(): Promise<{ store: Store; close: () => Promise<void>; ping: () => Promise<void> }> {
  if (config.db === 'memory') {
    const store = new MemoryStore(await sampleData());
    return { store, close: async () => {}, ping: async () => {} };
  }
  const pool = createPool();
  const applied = await migrate(pool);
  if (applied.length) console.log(`Applied migrations: ${applied.join(', ')}`);
  return { store: new PgStore(pool), close: () => pool.end(), ping: async () => { await pool.query('SELECT 1'); } };
}

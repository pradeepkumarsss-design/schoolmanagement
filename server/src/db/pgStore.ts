import pg from 'pg';
import { RES } from '../../../shared/resources';
import { AppError, uid, type Page, type Query, type Row, type Store } from '../../../shared/types';

// Return dates as YYYY-MM-DD strings, numerics as numbers and timestamps as ISO strings,
// so rows look the same as they do in the in-memory store.
pg.types.setTypeParser(1082, v => v);
pg.types.setTypeParser(1700, v => parseFloat(v));
pg.types.setTypeParser(1184, v => new Date(v).toISOString());
pg.types.setTypeParser(20, v => parseInt(v, 10));

type Runner = { query: (text: string, values?: any[]) => Promise<pg.QueryResult<any>> };

function columns(resource: string): string[] {
  const res = RES[resource];
  if (!res) throw new AppError(404, `Unknown record type "${resource}"`);
  return ['id', ...res.fields.map(f => f.name)];
}

function toDb(resource: string, data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of RES[resource].fields) if (f.name in data)
    out[f.name] = f.type === 'json' && data[f.name] != null ? JSON.stringify(data[f.name]) : data[f.name] ?? null;
  return out;
}

function translate(e: any, resource: string): never {
  if (e instanceof AppError) throw e;
  const res = RES[resource];
  if (e?.code === '23505') throw new AppError(409, `This ${res.singular.toLowerCase()} already exists (${String(e.detail ?? '').replace(/^Key /, '')})`);
  if (e?.code === '23503') throw new AppError(409, /delete/.test(e.message) ? `Cannot delete: other records still refer to this ${res.singular.toLowerCase()}` : 'A linked record no longer exists');
  if (e?.code === '23514' || e?.code === '23502' || e?.code === '22P02' || e?.code === '22007') throw new AppError(422, `Invalid value: ${e.message}`);
  throw e;
}

export class PgStore implements Store {
  constructor(private pool: pg.Pool, private client?: pg.PoolClient) {}
  private get db(): Runner { return this.client ?? this.pool; }

  private where(resource: string, q: Query, params: any[]): string {
    const cols = new Set(columns(resource));
    const one = (filter: Record<string, any>): string[] => {
      const parts: string[] = [];
      for (const [k, c] of Object.entries(filter)) {
        if (!cols.has(k)) throw new AppError(400, `Cannot filter by "${k}"`);
        const add = (v: any) => { params.push(v); return `$${params.length}`; };
        if (c === null) parts.push(`${k} IS NULL`);
        else if (typeof c !== 'object') parts.push(`${k} = ${add(c)}`);
        else {
          if ('eq' in c) parts.push(c.eq === null ? `${k} IS NULL` : `${k} = ${add(c.eq)}`);
          if ('ne' in c) parts.push(`${k} IS DISTINCT FROM ${add(c.ne)}`);
          if ('gte' in c) parts.push(`${k} >= ${add(c.gte)}`);
          if ('lte' in c) parts.push(`${k} <= ${add(c.lte)}`);
          if ('in' in c) parts.push(`${k} = ANY(${add(c.in)})`);
        }
      }
      return parts;
    };
    const parts = one(q.filter ?? {});
    if (q.or?.length) parts.push('(' + q.or.map(f => '(' + (one(f).join(' AND ') || 'TRUE') + ')').join(' OR ') + ')');
    const fields = RES[resource].searchFields;
    if (q.search?.trim() && fields.length) {
      params.push(`%${q.search.trim().replace(/[%_\\]/g, m => '\\' + m)}%`);
      parts.push('(' + fields.map(f => `${f}::text ILIKE $${params.length}`).join(' OR ') + ')');
    }
    return parts.length ? 'WHERE ' + parts.join(' AND ') : '';
  }

  async list(resource: string, q: Query = {}): Promise<Page> {
    const cols = columns(resource);
    const params: any[] = [];
    const where = this.where(resource, q, params);
    const sort = q.sort ?? RES[resource].defaultSort;
    const key = sort.replace(/^-/, '');
    if (!cols.includes(key)) throw new AppError(400, `Cannot sort by "${key}"`);
    const order = `ORDER BY ${key} ${sort.startsWith('-') ? 'DESC' : 'ASC'} NULLS LAST, id`;
    const limit = Math.min(q.limit ?? 5000, 1_000_000), offset = q.offset ?? 0;
    const rows = (await this.db.query(`SELECT ${cols.join(', ')} FROM ${resource} ${where} ${order} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`, params)).rows;
    let total = offset + rows.length;
    if (rows.length === limit || (offset > 0 && rows.length === 0))
      total = (await this.db.query(`SELECT count(*)::int AS n FROM ${resource} ${where}`, params)).rows[0].n;
    return { rows, total };
  }

  async get(resource: string, id: string) {
    return (await this.db.query(`SELECT ${columns(resource).join(', ')} FROM ${resource} WHERE id = $1`, [id])).rows[0] ?? null;
  }

  async create(resource: string, data: Record<string, any>) {
    const row = { id: data.id ?? uid(), ...toDb(resource, data) };
    const keys = Object.keys(row);
    try {
      return (await this.db.query(`INSERT INTO ${resource} (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING ${columns(resource).join(', ')}`, Object.values(row))).rows[0];
    } catch (e) { translate(e, resource); }
  }

  async update(resource: string, id: string, patch: Record<string, any>) {
    const data = toDb(resource, patch);
    const keys = Object.keys(data);
    if (!keys.length) { const cur = await this.get(resource, id); if (!cur) throw new AppError(404, `${RES[resource].singular} not found`); return cur; }
    try {
      const r = await this.db.query(`UPDATE ${resource} SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1 RETURNING ${columns(resource).join(', ')}`, [id, ...Object.values(data)]);
      if (!r.rows[0]) throw new AppError(404, `${RES[resource].singular} not found`);
      return r.rows[0];
    } catch (e) { translate(e, resource); }
  }

  async remove(resource: string, id: string) {
    columns(resource);
    try { await this.db.query(`DELETE FROM ${resource} WHERE id = $1`, [id]); } catch (e) { translate(e, resource); }
  }

  async bulkCreate(resource: string, rows: Record<string, any>[]) {
    const cols = columns(resource);
    try {
      for (let i = 0; i < rows.length; i += 400) {
        const chunk = rows.slice(i, i + 400);
        const params: any[] = [];
        const values = chunk.map(r => {
          const d = { id: r.id ?? uid(), ...toDb(resource, r) } as Record<string, any>;
          return '(' + cols.map(c => { params.push(d[c] ?? null); return `$${params.length}`; }).join(', ') + ')';
        });
        await this.db.query(`INSERT INTO ${resource} (${cols.join(', ')}) VALUES ${values.join(', ')}`, params);
      }
    } catch (e) { translate(e, resource); }
  }

  async tx<T>(fn: (s: Store) => Promise<T>): Promise<T> {
    if (this.client) return fn(this);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(new PgStore(this.pool, client));
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally { client.release(); }
  }
}

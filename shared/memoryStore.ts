// In-memory Store. Powers the browser demo, the server's DB=memory mode and tests.
import { matches } from './access';
import { RES, RESOURCES } from './resources';
import { AppError, uid, type Page, type Query, type Row, type Store } from './types';

export class MemoryStore implements Store {
  private data: Record<string, Map<string, Row>> = {};

  constructor(seed: Record<string, Row[]> = {}) {
    for (const r of RESOURCES) this.data[r.name] = new Map((seed[r.name] ?? []).map(row => [row.id, row]));
  }

  private table(resource: string) {
    const t = this.data[resource];
    if (!t) throw new AppError(404, `Unknown record type "${resource}"`);
    return t;
  }

  async list(resource: string, q: Query = {}): Promise<Page> {
    const res = RES[resource];
    let rows = [...this.table(resource).values()];
    if (q.filter && Object.keys(q.filter).length) rows = rows.filter(r => matches(r, q.filter!));
    if (q.or?.length) rows = rows.filter(r => q.or!.some(f => matches(r, f)));
    if (q.search?.trim()) {
      const needle = q.search.trim().toLowerCase();
      rows = rows.filter(r => res.searchFields.some(f => String(r[f] ?? '').toLowerCase().includes(needle)));
    }
    const sort = q.sort ?? res.defaultSort;
    const desc = sort.startsWith('-');
    const key = sort.replace(/^-/, '');
    rows.sort((a, b) => {
      const x = a[key], y = b[key];
      const c = x == null ? (y == null ? 0 : 1) : y == null ? -1 : x < y ? -1 : x > y ? 1 : 0;
      return (desc ? -c : c) || (a.id < b.id ? -1 : 1);
    });
    const total = rows.length;
    const offset = q.offset ?? 0;
    return { rows: rows.slice(offset, offset + (q.limit ?? 5000)).map(r => ({ ...r })), total };
  }

  async get(resource: string, id: string) {
    const r = this.table(resource).get(id);
    return r ? { ...r } : null;
  }

  private check(resource: string, row: Row) {
    const res = RES[resource];
    const others = [...this.table(resource).values()].filter(o => o.id !== row.id);
    for (const f of res.fields) {
      if (f.unique && row[f.name] != null && others.some(o => o[f.name] === row[f.name]))
        throw new AppError(409, `Another ${res.singular.toLowerCase()} already uses ${f.label.toLowerCase()} "${row[f.name]}"`);
      if (f.type === 'ref' && row[f.name] != null && !this.data[f.ref!]?.has(row[f.name]))
        throw new AppError(422, 'Some fields need attention', { [f.name]: `${f.label} no longer exists` });
    }
    const ut = res.uniqueTogether;
    if (ut && others.some(o => ut.every(k => o[k] === row[k])))
      throw new AppError(409, `This ${res.singular.toLowerCase()} already exists`);
  }

  async create(resource: string, data: Record<string, any>) {
    const row: Row = { ...data, id: data.id ?? uid() };
    this.check(resource, row);
    this.table(resource).set(row.id, row);
    return { ...row };
  }

  async update(resource: string, id: string, patch: Record<string, any>) {
    const cur = this.table(resource).get(id);
    if (!cur) throw new AppError(404, `${RES[resource].singular} not found`);
    const row = { ...cur, ...patch, id };
    this.check(resource, row);
    this.table(resource).set(id, row);
    return { ...row };
  }

  async remove(resource: string, id: string) {
    for (const r of RESOURCES) for (const f of r.fields) {
      if (f.type !== 'ref' || f.ref !== resource) continue;
      for (const row of this.data[r.name].values())
        if (row[f.name] === id) throw new AppError(409, `Cannot delete: ${r.label.toLowerCase()} still refer to this ${RES[resource].singular.toLowerCase()}`);
    }
    this.table(resource).delete(id);
  }

  async bulkCreate(resource: string, rows: Record<string, any>[]) {
    const t = this.table(resource);
    for (const r of rows) { const row = { ...r, id: r.id ?? uid() } as Row; t.set(row.id, row); }
  }

  async tx<T>(fn: (s: Store) => Promise<T>): Promise<T> { return fn(this); }
}

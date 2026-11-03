// One interface, two transports: HTTP against the API server, or the same shared
// business logic running in the browser over sample data (demo mode).
import { crudCreate, crudGet, crudList, crudRemove, crudUpdate, lookup } from '../../shared/access';
import { todayIn, toAuthUser } from '../../shared/auth';
import { MemoryStore } from '../../shared/memoryStore';
import { roleMismatch } from '../../shared/auth';
import { buildSeed, DEMO_PASSWORD } from '../../shared/seed';
import { runAction } from '../../shared/services';
import { AppError, type AuthUser, type Ctx, type Page, type Query, type Role, type Row } from '../../shared/types';

export type Option = { id: string; label: string };

export interface Client {
  mode: 'api' | 'demo';
  restore(): Promise<AuthUser | null>;
  login(email: string, password: string, role?: Role): Promise<AuthUser>;
  logout(): void;
  list(resource: string, q?: Query): Promise<Page>;
  get(resource: string, id: string): Promise<Row>;
  create(resource: string, data: Record<string, any>): Promise<Row>;
  update(resource: string, id: string, data: Record<string, any>): Promise<Row>;
  remove(resource: string, id: string): Promise<void>;
  lookup(resource: string): Promise<Option[]>;
  action<T = any>(name: string, params?: Record<string, any>): Promise<T>;
  changePassword(current: string, next: string): Promise<void>;
}

const TOKEN_KEY = 'scholaris.token';
const storage = {
  get: () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (v: string | null) => { try { v ? sessionStorage.setItem(TOKEN_KEY, v) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } },
};

class HttpClient implements Client {
  mode = 'api' as const;
  private token: string | null = storage.get();
  onExpired: () => void = () => {};
  constructor(private base: string) {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.base + path, { method, headers: { 'content-type': 'application/json', ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch { throw new AppError(0, 'Cannot reach the server. Check your connection and try again.'); }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && this.token && !path.startsWith('/auth/login')) { this.logout(); this.onExpired(); }
      throw new AppError(res.status, json?.error?.message ?? `Request failed (${res.status})`, json?.error?.details);
    }
    return json as T;
  }
  async restore() { if (!this.token) return null; try { return (await this.req<{ user: AuthUser }>('GET', '/auth/me')).user; } catch { return null; } }
  async login(email: string, password: string, role?: Role) {
    const r = await this.req<{ token: string; user: AuthUser }>('POST', '/auth/login', { email, password, role });
    this.token = r.token; storage.set(r.token);
    return r.user;
  }
  logout() { this.token = null; storage.set(null); }
  list(resource: string, q: Query = {}) {
    const p = new URLSearchParams();
    if (q.filter && Object.keys(q.filter).length) p.set('filter', JSON.stringify(q.filter));
    if (q.search) p.set('search', q.search);
    if (q.sort) p.set('sort', q.sort);
    if (q.limit) p.set('limit', String(q.limit));
    if (q.offset) p.set('offset', String(q.offset));
    return this.req<Page>('GET', `/${resource}?${p}`);
  }
  get(resource: string, id: string) { return this.req<Row>('GET', `/${resource}/${id}`); }
  create(resource: string, data: Record<string, any>) { return this.req<Row>('POST', `/${resource}`, data); }
  update(resource: string, id: string, data: Record<string, any>) { return this.req<Row>('PATCH', `/${resource}/${id}`, data); }
  async remove(resource: string, id: string) { await this.req('DELETE', `/${resource}/${id}`); }
  lookup(resource: string) { return this.req<Option[]>('GET', `/lookup/${resource}`); }
  action<T>(name: string, params: Record<string, any> = {}) { return this.req<T>('POST', `/actions/${name}`, params); }
  async changePassword(current: string, next: string) { await this.req('POST', '/auth/password', { current, next }); }
}

class DemoClient implements Client {
  mode = 'demo' as const;
  private store = new MemoryStore(buildSeed(todayIn()));
  private user: AuthUser | null = null;
  private get ctx(): Ctx {
    if (!this.user) throw new AppError(401, 'Sign in to continue');
    return { store: this.store, user: this.user, today: todayIn() };
  }
  // A short pause so loading states behave as they would against a real server.
  private async run<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise(r => setTimeout(r, 60));
    return JSON.parse(JSON.stringify((await fn()) ?? null));
  }
  async restore() { return null; }
  async login(email: string, password: string, role?: Role) {
    await new Promise(r => setTimeout(r, 250));
    const row = (await this.store.list('users', { filter: { email: email.trim().toLowerCase() }, limit: 1 })).rows[0];
    if (!row || !row.active || password !== DEMO_PASSWORD) throw new AppError(401, 'Email or password is incorrect');
    if (role && row.role !== role) throw new AppError(403, roleMismatch(role));
    await this.store.update('users', row.id, { last_login: new Date().toISOString() });
    return (this.user = await toAuthUser(this.store, row));
  }
  logout() { this.user = null; }
  list(resource: string, q?: Query) { return this.run(() => crudList(this.ctx, resource, q)); }
  get(resource: string, id: string) { return this.run(() => crudGet(this.ctx, resource, id)); }
  create(resource: string, data: Record<string, any>) { return this.run(() => crudCreate(this.ctx, resource, data)); }
  update(resource: string, id: string, data: Record<string, any>) { return this.run(() => crudUpdate(this.ctx, resource, id, data)); }
  remove(resource: string, id: string) { return this.run(() => crudRemove(this.ctx, resource, id)); }
  lookup(resource: string) { return this.run(() => lookup(this.ctx, resource)); }
  action<T>(name: string, params: Record<string, any> = {}) { return this.run<T>(() => runAction(this.ctx, name, params)); }
  async changePassword() { throw new AppError(409, 'Passwords are not used in the demo. Connect the app to the API server to manage them.'); }
}

// The app always talks to the API server (and through it, the database). The in-browser
// sample data is only used by the separate `npm run build:demo` bundle.
const apiUrl = import.meta.env.MODE === 'demo' ? undefined : (import.meta.env.VITE_API_URL as string | undefined) || '/api';
export const http = apiUrl ? new HttpClient(apiUrl) : null;
export const api: Client = http ?? new DemoClient();

// ── Dropdown options and reference labels, cached until something changes.
const lookups = new Map<string, Promise<Option[]>>();
export const getLookup = (resource: string): Promise<Option[]> => {
  if (!lookups.has(resource)) lookups.set(resource, api.lookup(resource).catch(() => { lookups.delete(resource); return []; }));
  return lookups.get(resource)!;
};
export const clearLookups = (resource?: string) => (resource ? lookups.delete(resource) : lookups.clear());

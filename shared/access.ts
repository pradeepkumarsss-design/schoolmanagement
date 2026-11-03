// Permission checks, row-level scoping, validation and guarded CRUD.
// Runs on the API server, and in the browser when the client is in demo mode.
import { RES, gradeFor, labelOf } from './resources';
import { AppError, type AuthUser, type Ctx, type Filter, type Page, type Query, type Resource, type Row } from './types';

export type Action = 'c' | 'r' | 'u' | 'd';

export function can(user: AuthUser, resource: string, action: Action): boolean {
  const res = RES[resource];
  if (!res) return false;
  if (resource === 'audit_logs') return user.role === 'admin' && action === 'r';
  if (user.role === 'admin') return true;
  return (res.access[user.role] ?? '').includes(action);
}

/** Extra conditions forced onto every query a user makes against a resource. */
export function scopeFor(user: AuthUser, res: Resource): { filter: Filter; or?: Filter[] } {
  const filter: Filter = {};
  let or: Filter[] | undefined;
  if (user.role === 'student' || user.role === 'parent') {
    if (res.studentScope) filter[res.studentScope] = { in: user.student_ids };
    if (res.name === 'notices') filter.audience = { in: ['Everyone', user.role === 'student' ? 'Students' : 'Parents'] };
  }
  if (user.role === 'teacher' && res.staffScope) filter[res.staffScope] = user.staff_id ?? '__none__';
  if (res.name === 'messages' && user.role !== 'admin') or = [{ from_user_id: user.id }, { to_user_id: user.id }];
  return { filter, or };
}

function matchesCond(v: any, c: any): boolean {
  if (c === null || typeof c !== 'object') return v === c || (c === null && v == null);
  if ('eq' in c && v !== c.eq) return false;
  if ('ne' in c && v === c.ne) return false;
  if ('gte' in c && !(v != null && v >= c.gte)) return false;
  if ('lte' in c && !(v != null && v <= c.lte)) return false;
  if ('in' in c && !c.in.includes(v)) return false;
  return true;
}
export const matches = (row: Row, f: Filter) => Object.entries(f).every(([k, c]) => matchesCond(row[k], c));

function rowVisible(user: AuthUser, res: Resource, row: Row): boolean {
  const s = scopeFor(user, res);
  return matches(row, s.filter) && (!s.or || s.or.some(f => matches(row, f)));
}

function clean(res: Resource, row: Row): Row {
  const out: Row = { ...row };
  for (const f of res.fields) if (f.hidden) delete out[f.name];
  return out;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Coerce and validate input against the resource definition. Unknown fields are dropped. */
export function validate(res: Resource, input: Record<string, any>, partial: boolean, system = false): Record<string, any> {
  const out: Record<string, any> = {};
  const errors: Record<string, string> = {};
  for (const f of res.fields) {
    if (f.hidden && !system) continue;
    if (f.readonly && !system) continue;
    let v = input[f.name];
    if (v === undefined) {
      if (partial) continue;
      v = f.default ?? null;
    }
    if (v === '' ) v = null;
    if (v == null) {
      if (f.required) errors[f.name] = `${f.label} is required`;
      out[f.name] = null;
      continue;
    }
    switch (f.type) {
      case 'int': case 'money': case 'number': {
        const n = Number(v);
        if (!Number.isFinite(n)) errors[f.name] = `${f.label} must be a number`;
        else if (f.type === 'int' && !Number.isInteger(n)) errors[f.name] = `${f.label} must be a whole number`;
        else if (f.type === 'money' && n < 0) errors[f.name] = `${f.label} cannot be negative`;
        v = n; break;
      }
      case 'bool': v = v === true || v === 'true' || v === 1; break;
      case 'date':
        v = String(v).slice(0, 10);
        if (!ISO_DATE.test(v)) errors[f.name] = `${f.label} must be a date (YYYY-MM-DD)`;
        break;
      case 'select':
        if (!f.options!.includes(String(v))) errors[f.name] = `${f.label} must be one of: ${f.options!.join(', ')}`;
        break;
      case 'email':
        v = String(v).trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errors[f.name] = `${f.label} is not a valid email address`;
        break;
      case 'json': break;
      default:
        v = String(v).trim();
        if (v.length > (f.type === 'longtext' ? 10000 : 500)) errors[f.name] = `${f.label} is too long`;
    }
    out[f.name] = v;
  }
  if (Object.keys(errors).length) throw new AppError(422, 'Some fields need attention', errors);
  return out;
}

/** Derived values that must stay consistent no matter who writes the row. */
function derive(res: Resource, row: Record<string, any>, existing?: Row) {
  const merged = { ...existing, ...row };
  if (res.name === 'marks') {
    if (merged.marks > merged.max_marks) throw new AppError(422, 'Some fields need attention', { marks: `Marks cannot exceed ${merged.max_marks}` });
    if (merged.marks < 0) throw new AppError(422, 'Some fields need attention', { marks: 'Marks cannot be negative' });
    row.grade = gradeFor((merged.marks / merged.max_marks) * 100);
  }
  if (res.name === 'payroll') row.net = (merged.basic ?? 0) + (merged.allowances ?? 0) - (merged.deductions ?? 0);
  if (res.name === 'invoices') {
    const due = (merged.amount ?? 0) - (merged.discount ?? 0);
    const paid = merged.paid ?? 0;
    if (due < paid) throw new AppError(422, 'Some fields need attention', { amount: 'Amount after discount is less than what has already been paid' });
    row.status = paid <= 0 ? 'Unpaid' : paid >= due ? 'Paid' : 'Partial';
  }
  if ((res.name === 'leave_requests' || res.name === 'events') && merged.to_date && merged.from_date && merged.to_date < merged.from_date)
    throw new AppError(422, 'Some fields need attention', { to_date: 'End date is before the start date' });
}

export async function audit(ctx: Ctx, action: string, resource: string, id: string, summary: string) {
  await ctx.store.create('audit_logs', {
    at: new Date().toISOString(), user_id: ctx.user.id, user_name: ctx.user.name, action, resource, record_id: id, summary,
  });
}

const need = (ok: boolean, what: string) => { if (!ok) throw new AppError(403, `Your role cannot ${what}`); };
const resOf = (name: string): Resource => {
  const r = RES[name];
  if (!r) throw new AppError(404, `Unknown record type "${name}"`);
  return r;
};

export async function crudList(ctx: Ctx, resource: string, q: Query = {}): Promise<Page> {
  const res = resOf(resource);
  need(can(ctx.user, resource, 'r'), `view ${res.label.toLowerCase()}`);
  const s = scopeFor(ctx.user, res);
  const valid = new Set(['id', ...res.fields.filter(f => !f.hidden).map(f => f.name)]);
  const filter: Filter = {};
  for (const [k, v] of Object.entries(q.filter ?? {})) if (valid.has(k)) filter[k] = v;
  const sortKey = (q.sort ?? '').replace(/^-/, '');
  const page = await ctx.store.list(resource, {
    filter: { ...filter, ...s.filter }, or: s.or, search: q.search?.slice(0, 80),
    sort: valid.has(sortKey) ? q.sort : res.defaultSort,
    limit: Math.min(Math.max(Number(q.limit) || 25, 1), 5000), offset: Math.max(Number(q.offset) || 0, 0),
  });
  return { rows: page.rows.map(r => clean(res, r)), total: page.total };
}

export async function crudGet(ctx: Ctx, resource: string, id: string): Promise<Row> {
  const res = resOf(resource);
  need(can(ctx.user, resource, 'r'), `view ${res.label.toLowerCase()}`);
  const row = await ctx.store.get(resource, id);
  if (!row || !rowVisible(ctx.user, res, row)) throw new AppError(404, `${res.singular} not found`);
  return clean(res, row);
}

export interface Extras { hash?: (password: string) => Promise<string> }

export async function crudCreate(ctx: Ctx, resource: string, input: Record<string, any>, x: Extras = {}): Promise<Row> {
  const res = resOf(resource);
  need(can(ctx.user, resource, 'c'), `add ${res.label.toLowerCase()}`);
  const data = validate(res, input, false);
  if (resource === 'messages') Object.assign(data, { from_user_id: ctx.user.id, sent_at: new Date().toISOString(), is_read: false });
  if (resource === 'notices') data.author = ctx.user.name;
  if (resource === 'leave_requests') {
    data.status = 'Pending';
    if (ctx.user.role !== 'admin') data.staff_id = ctx.user.staff_id;
    if (!data.staff_id) throw new AppError(422, 'Your account is not linked to a staff record');
  }
  if (resource === 'users') {
    if (!input.password || String(input.password).length < 8)
      throw new AppError(422, 'Some fields need attention', { password: 'Set a password of at least 8 characters' });
    data.password_hash = x.hash ? await x.hash(String(input.password)) : '';
  }
  if (resource === 'invoices') data.paid = 0;
  derive(res, data);
  const row = await ctx.store.create(resource, data);
  if (res.audit) await audit(ctx, 'create', resource, row.id, `Added ${res.singular.toLowerCase()} "${labelOf(resource, row)}"`);
  return clean(res, row);
}

export async function crudUpdate(ctx: Ctx, resource: string, id: string, input: Record<string, any>, x: Extras = {}): Promise<Row> {
  const res = resOf(resource);
  need(can(ctx.user, resource, 'u'), `edit ${res.label.toLowerCase()}`);
  const existing = await ctx.store.get(resource, id);
  if (!existing || !rowVisible(ctx.user, res, existing)) throw new AppError(404, `${res.singular} not found`);
  const data = validate(res, input, true);
  if (resource === 'users' && input.password) {
    if (String(input.password).length < 8) throw new AppError(422, 'Some fields need attention', { password: 'Use at least 8 characters' });
    if (x.hash) data.password_hash = await x.hash(String(input.password));
  }
  if (resource === 'users' && id === ctx.user.id && (data.active === false || (data.role && data.role !== 'admin')))
    throw new AppError(409, 'You cannot deactivate or demote your own account');
  derive(res, data, existing);
  const row = await ctx.store.update(resource, id, data);
  if (res.audit) await audit(ctx, 'update', resource, id, `Edited ${res.singular.toLowerCase()} "${labelOf(resource, row)}" (${Object.keys(data).filter(k => k !== 'password_hash').join(', ')})`);
  return clean(res, row);
}

export async function crudRemove(ctx: Ctx, resource: string, id: string): Promise<void> {
  const res = resOf(resource);
  need(can(ctx.user, resource, 'd'), `delete ${res.label.toLowerCase()}`);
  const existing = await ctx.store.get(resource, id);
  if (!existing || !rowVisible(ctx.user, res, existing)) throw new AppError(404, `${res.singular} not found`);
  if (resource === 'users' && id === ctx.user.id) throw new AppError(409, 'You cannot delete your own account');
  if (resource === 'invoices' && existing.paid > 0) throw new AppError(409, 'This invoice has receipts against it and cannot be deleted');
  await ctx.store.remove(resource, id);
  if (res.audit) await audit(ctx, 'delete', resource, id, `Deleted ${res.singular.toLowerCase()} "${labelOf(resource, existing)}"`);
}

/** id + label pairs for dropdowns and for resolving references in tables. */
export async function lookup(ctx: Ctx, resource: string): Promise<{ id: string; label: string }[]> {
  const res = resOf(resource);
  let rows: Row[];
  if (can(ctx.user, resource, 'r')) {
    const s = scopeFor(ctx.user, res);
    rows = (await ctx.store.list(resource, { filter: s.filter, or: s.or, limit: 5000, sort: res.defaultSort })).rows;
  } else if (res.publicLookup) {
    rows = (await ctx.store.list(resource, { limit: 5000, sort: res.defaultSort })).rows;
  } else throw new AppError(403, `Your role cannot view ${res.label.toLowerCase()}`);
  return rows.map(r => ({ id: r.id, label: labelOf(resource, r) }));
}

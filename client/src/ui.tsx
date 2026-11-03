import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { can } from '../../shared/access';
import { RES } from '../../shared/resources';
import type { AuthUser, Field, Filter, Row } from '../../shared/types';
import { api, clearLookups, getLookup, type Option } from './api';

// ───────────── App context ─────────────
export interface Route { page: string; params?: Record<string, any> }
export interface AppCtx {
  user: AuthUser; today: string; route: Route;
  go: (page: string, params?: Record<string, any>) => void;
  toast: (message: string, tone?: 'ok' | 'bad') => void;
}
export const AppContext = createContext<AppCtx>(null as any);
export const useApp = () => useContext(AppContext);

// ───────────── Formatting ─────────────
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrCompact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 });
export const money = (n: number | null | undefined) => (n == null ? '—' : inr.format(n));
export const moneyShort = (n: number) => (Math.abs(n) >= 100000 ? inrCompact.format(n) : inr.format(n));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDate = (iso?: string | null, year = true) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${year ? ' ' + y : ''}`;
};
export const fmtMonth = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const initials = (name: string) => name.replace(/^(Dr|Mr|Ms|Mrs|Sr)\.?\s+/i, '').split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();

const TONES: Record<string, string[]> = {
  good: ['Paid', 'Present', 'Active', 'Approved', 'Published', 'Returned', 'Enrolled', 'Pass'],
  warn: ['Partial', 'Late', 'Half day', 'Pending', 'Draft', 'Offered', 'Interview', 'Shortlisted', 'On leave', 'Important', 'Marks entry', 'Ongoing', 'Needs improvement'],
  bad: ['Unpaid', 'Absent', 'Rejected', 'Overdue', 'Suspended', 'Urgent', 'Resigned'],
  info: ['Issued', 'Scheduled', 'Applied'],
};
export const toneOf = (v: string) => Object.keys(TONES).find(t => TONES[t].includes(v)) ?? '';
export const Badge = ({ value, tone }: { value: string; tone?: string }) => <span className={`badge ${tone ?? toneOf(value)}`}>{value}</span>;

// ───────────── Data hooks ─────────────
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState(s => ({ ...s, loading: true, error: undefined }));
    fn().then(data => live && setState({ data, loading: false }), e => live && setState({ error: e?.message ?? 'Something went wrong', loading: false }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: useCallback(() => setTick(t => t + 1), []) };
}

export function useOptions(resource: string | undefined, version = 0): Option[] {
  const [opts, setOpts] = useState<Option[]>([]);
  useEffect(() => { let live = true; if (resource) getLookup(resource).then(o => live && setOpts(o)); return () => { live = false; }; }, [resource, version]);
  return opts;
}
export function useLabels(resources: string[], version = 0): Record<string, Record<string, string>> {
  const [maps, setMaps] = useState<Record<string, Record<string, string>>>({});
  const key = resources.join(',');
  useEffect(() => {
    let live = true;
    Promise.all(resources.map(r => getLookup(r))).then(all => live && setMaps(Object.fromEntries(resources.map((r, i) => [r, Object.fromEntries(all[i].map(o => [o.id, o.label]))]))));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);
  return maps;
}

let settingsCache: Promise<Record<string, string>> | null = null;
export function useSettings(): Record<string, string> {
  const [s, setS] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    settingsCache ??= api.list('settings', { limit: 200 }).then(p => Object.fromEntries(p.rows.map(r => [r.key, r.value])), () => { settingsCache = null; return {}; });
    settingsCache.then(v => live && setS(v));
    return () => { live = false; };
  }, []);
  return s;
}
export const resetSettings = () => { settingsCache = null; };

// ───────────── Building blocks ─────────────
export const Spinner = ({ label = 'Loading' }: { label?: string }) => <div className="empty row" style={{ justifyContent: 'center' }}><Loader2 size={16} className="spin" /> {label}…</div>;
export const ErrorNote = ({ message, retry }: { message: string; retry?: () => void }) => (
  <div className="banner bad"><div className="grow">{message}</div>{retry && <button className="btn sm" onClick={retry}>Try again</button>}</div>
);
export function Loader<T>({ state, children }: { state: { data?: T; error?: string; loading: boolean; reload: () => void }; children: (data: T) => ReactNode }) {
  if (state.error) return <ErrorNote message={state.error} retry={state.reload} />;
  if (state.data === undefined) return <Spinner />;
  return <>{children(state.data)}</>;
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="row between" style={{ alignItems: 'flex-end' }}>
      <div className="grow"><h1>{title}</h1>{sub && <p className="muted" style={{ marginTop: 4 }}>{sub}</p>}</div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}
export function Panel({ title, action, children, flush }: { title?: ReactNode; action?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="panel">
      {(title || action) && <div className="panel-head"><h2>{title}</h2>{action}</div>}
      {flush ? children : <div className="panel-body">{children}</div>}
    </section>
  );
}
export function Tile({ label, value, hint, tone, onClick }: { label: string; value: ReactNode; hint?: ReactNode; tone?: string; onClick?: () => void }) {
  const body = <><span className="label">{label}</span><span className="value">{value}</span>{hint && <span className="hint">{tone ? <Badge value={String(hint)} tone={tone} /> : hint}</span>}</>;
  return onClick ? <button className="tile" onClick={onClick}>{body}</button> : <div className="tile">{body}</div>;
}
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return <div className="tabs" role="tablist">{tabs.map(t => <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>{t.label}</button>)}</div>;
}
export function Select({ id, value, onChange, options, placeholder, invalid }: { id?: string; value: string; onChange: (v: string) => void; options: (Option | string)[]; placeholder?: string; invalid?: boolean }) {
  return (
    <select id={id} className={`input${invalid ? ' invalid' : ''}`} value={value ?? ''} onChange={e => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}
export function Modal({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head"><h2>{title}</h2><button className="btn ghost icon" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
export function Busy({ busy, children, ...p }: { busy: boolean; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} disabled={busy || p.disabled}>{busy && <Loader2 size={14} className="spin" />}{children}</button>;
}

// ───────────── Generated forms ─────────────
function FieldInput({ field, value, onChange, error, id }: { field: Field; value: any; onChange: (v: any) => void; error?: string; id: string }) {
  const refOptions = useOptions(field.type === 'ref' ? field.ref : undefined);
  const cls = `input${error ? ' invalid' : ''}`;
  switch (field.type) {
    case 'select': return <Select id={id} value={value ?? ''} onChange={onChange} options={field.options!} placeholder={field.required ? 'Choose…' : '—'} invalid={!!error} />;
    case 'ref': return <Select id={id} value={value ?? ''} onChange={onChange} options={refOptions} placeholder={field.required ? 'Choose…' : 'None'} invalid={!!error} />;
    case 'bool': return <label className="row" style={{ height: 34 }}><input id={id} type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} /> Yes</label>;
    case 'longtext': return <textarea id={id} className={cls} value={value ?? ''} onChange={e => onChange(e.target.value)} rows={4} />;
    case 'date': return <input id={id} type="date" className={cls} value={value ?? ''} onChange={e => onChange(e.target.value)} />;
    case 'int': case 'money': case 'number':
      return <input id={id} type="number" inputMode="decimal" step={field.type === 'int' ? 1 : 'any'} className={cls} value={value ?? ''} onChange={e => onChange(e.target.value)} />;
    default: return <input id={id} type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'} className={cls} value={value ?? ''} onChange={e => onChange(e.target.value)} />;
  }
}

export function RecordForm({ resource, initial, defaults, onSaved, onClose }: { resource: string; initial?: Row; defaults?: Record<string, any>; onSaved: (row: Row) => void; onClose: () => void }) {
  const res = RES[resource];
  const { toast, user, today } = useApp();
  const fields = res.fields.filter(f => !f.hidden && !f.readonly && f.type !== 'json' && !(resource === 'leave_requests' && f.name === 'staff_id' && user.role !== 'admin'));
  const [values, setValues] = useState<Record<string, any>>(() => {
    const v: Record<string, any> = {};
    for (const f of fields) v[f.name] = initial?.[f.name] ?? defaults?.[f.name] ?? f.default ?? (f.type === 'date' && f.required && !initial ? today : '');
    return v;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErrors({}); setFormError('');
    try {
      const row = initial ? await api.update(resource, initial.id, values) : await api.create(resource, values);
      clearLookups(resource);
      toast(`${res.singular} ${initial ? 'saved' : 'added'}`);
      onSaved(row);
    } catch (e: any) {
      if (e.details) setErrors(e.details);
      setFormError(e.message ?? 'Could not save');
    } finally { setBusy(false); }
  };
  return (
    <Modal title={`${initial ? 'Edit' : 'Add'} ${res.singular.toLowerCase()}`} onClose={onClose} wide={fields.length > 8}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><Busy busy={busy} className="btn primary" onClick={save}>{initial ? 'Save changes' : `Add ${res.singular.toLowerCase()}`}</Busy></>}>
      <form className="stack" onSubmit={e => { e.preventDefault(); save(); }}>
        {formError && <ErrorNote message={formError} />}
        <div className="form-grid">
          {fields.map(f => (
            <div key={f.name} className={`field${f.type === 'longtext' ? ' wide' : ''}`}>
              <label htmlFor={`f-${resource}-${f.name}`}>{f.label}{f.required && ' *'}</label>
              <FieldInput id={`f-${resource}-${f.name}`} field={f} value={values[f.name]} error={errors[f.name]} onChange={v => setValues(s => ({ ...s, [f.name]: v }))} />
              {errors[f.name] && <span className="err">{errors[f.name]}</span>}
            </div>
          ))}
          {resource === 'users' && (
            <div className="field">
              <label htmlFor="f-users-password">{initial ? 'New password (optional)' : 'Password *'}</label>
              <input id="f-users-password" type="password" autoComplete="new-password" className={`input${errors.password ? ' invalid' : ''}`} value={values.password ?? ''} onChange={e => setValues(s => ({ ...s, password: e.target.value }))} />
              {errors.password && <span className="err">{errors.password}</span>}
            </div>
          )}
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ───────────── Generated tables ─────────────
export function Cell({ field, row, labels }: { field: Field; row: Row; labels: Record<string, Record<string, string>> }) {
  const v = row[field.name];
  if (v == null || v === '') return <span className="muted">—</span>;
  switch (field.type) {
    case 'money': return <span className="num">{money(v)}</span>;
    case 'date': return <span className="num">{fmtDate(v)}</span>;
    case 'datetime': return <span className="num">{fmtDateTime(v)}</span>;
    case 'bool': return <>{v ? 'Yes' : 'No'}</>;
    case 'select': return toneOf(v) ? <Badge value={v} /> : <>{v}</>;
    case 'ref': return <>{labels[field.ref!]?.[v] ?? '—'}</>;
    case 'json': return Array.isArray(v) ? <>{v.map((l: any, i: number) => <div key={i} className="row between"><span>{l.name}</span><span className="num">{money(l.amount)}</span></div>)}</> : <span className="mono">{JSON.stringify(v)}</span>;
    case 'int': case 'number': return <span className="num">{v}</span>;
    default: return <>{String(v)}</>;
  }
}

export interface ResourceTableProps {
  resource: string;
  title?: string;
  sub?: ReactNode;
  baseFilter?: Filter;
  embedded?: boolean;
  defaults?: Record<string, any>;
  /** Extra buttons per row (rendered in the last column). */
  rowActions?: (row: Row, reload: () => void) => ReactNode;
  /** Extra content at the bottom of the detail dialog. */
  detailActions?: (row: Row, close: () => void, reload: () => void) => ReactNode;
  toolbar?: (reload: () => void) => ReactNode;
  onOpen?: (row: Row) => void;
  version?: number;
  columns?: string[];
}

const PAGE = 20;

export function ResourceTable(p: ResourceTableProps) {
  const res = RES[p.resource];
  const { user, toast } = useApp();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState(res.defaultSort);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [open, setOpen] = useState<Row | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [labelVersion, setLabelVersion] = useState(0);
  const timer = useRef<number>();
  useEffect(() => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => { setTerm(search); setPage(0); }, 250); return () => window.clearTimeout(timer.current); }, [search]);

  const visible = res.fields.filter(f => !f.hidden);
  const cols = (p.columns ? p.columns.map(n => visible.find(f => f.name === n)!).filter(Boolean) : visible.filter(f => f.list !== false && f.type !== 'json' && f.type !== 'longtext').slice(0, 8))
    .filter(f => !(p.baseFilter && f.name in p.baseFilter && typeof p.baseFilter[f.name] !== 'object'));
  const filterFields = useMemo(() => visible.filter(f => (f.type === 'select' && f.list !== false) || (f.type === 'ref' && ['classes', 'exams'].includes(f.ref!))).filter(f => !(p.baseFilter && f.name in p.baseFilter)).slice(0, 3), [p.resource]); // eslint-disable-line
  const refs = useMemo(() => [...new Set(visible.filter(f => f.type === 'ref').map(f => f.ref!))], [p.resource]); // eslint-disable-line
  const labels = useLabels(refs, labelVersion);
  const filterKey = JSON.stringify([filters, p.baseFilter]);

  const state = useAsync(() => {
    const filter: Filter = { ...p.baseFilter };
    for (const [k, v] of Object.entries(filters)) if (v) filter[k] = v;
    return api.list(p.resource, { filter, search: term, sort, limit: PAGE, offset: page * PAGE });
  }, [p.resource, term, filterKey, sort, page, p.version]);
  const reload = () => { state.reload(); setLabelVersion(v => v + 1); };
  const canAdd = can(user, p.resource, 'c'), canEdit = can(user, p.resource, 'u'), canDelete = can(user, p.resource, 'd');
  const total = state.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const remove = async () => {
    if (!open) return;
    try { await api.remove(p.resource, open.id); clearLookups(p.resource); toast(`${res.singular} deleted`); setOpen(null); reload(); }
    catch (e: any) { toast(e.message, 'bad'); }
    setConfirmDelete(false);
  };
  const openRow = (row: Row) => (p.onOpen ? p.onOpen(row) : (setConfirmDelete(false), setOpen(row)));

  return (
    <div className="stack">
      {!p.embedded && <PageHead title={p.title ?? res.label} sub={p.sub} />}
      <section className="panel">
        <div className="panel-head">
          <div className="row grow">
            {res.searchFields.length > 0 && (
              <div className="search"><Search size={15} /><input id={`q-${p.resource}`} className="input" placeholder={`Search ${res.label.toLowerCase()}`} value={search} onChange={e => setSearch(e.target.value)} aria-label={`Search ${res.label}`} /></div>
            )}
            {filterFields.map(f => <div key={f.name} className="filter"><FilterSelect field={f} value={filters[f.name] ?? ''} onChange={v => { setFilters(s => ({ ...s, [f.name]: v })); setPage(0); }} /></div>)}
          </div>
          <div className="row">
            {p.toolbar?.(reload)}
            {canAdd && !['payments', 'book_loans', 'attendance', 'marks'].includes(p.resource) && <button className="btn primary" onClick={() => setEditing('new')}><Plus size={15} /> Add {res.singular.toLowerCase()}</button>}
          </div>
        </div>
        {state.error ? <div className="panel-body"><ErrorNote message={state.error} retry={state.reload} /></div> : !state.data ? <Spinner /> : state.data.rows.length === 0 ? (
          <div className="empty">{term || Object.values(filters).some(Boolean) ? `No ${res.label.toLowerCase()} match these filters.` : `No ${res.label.toLowerCase()} yet.`}</div>
        ) : (
          <div className="table-wrap" style={{ opacity: state.loading ? 0.6 : 1 }}>
            <table>
              <thead><tr>
                {cols.map(f => {
                  const active = sort.replace(/^-/, '') === f.name;
                  return <th key={f.name} className={['money', 'int', 'number'].includes(f.type) ? 'r' : ''}>
                    <button onClick={() => { setSort(active && !sort.startsWith('-') ? `-${f.name}` : f.name); setPage(0); }} title="Sort">
                      {f.label}{active && (sort.startsWith('-') ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                    </button>
                  </th>;
                })}
                {p.rowActions && <th />}
              </tr></thead>
              <tbody>
                {state.data.rows.map(row => (
                  <tr key={row.id} className="click" onClick={() => openRow(row)}>
                    {cols.map((f, i) => <td key={f.name} className={['money', 'int', 'number'].includes(f.type) ? 'r' : ''} style={i === 0 ? { fontWeight: 500 } : undefined}><Cell field={f} row={row} labels={labels} /></td>)}
                    {p.rowActions && <td className="r" onClick={e => e.stopPropagation()}><div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>{p.rowActions(row, reload)}</div></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > 0 && (
          <div className="row between small muted" style={{ padding: '10px 16px', borderTop: '1px solid var(--line)' }}>
            <span className="num">{page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total.toLocaleString('en-IN')}</span>
            <div className="row">
              <button className="btn sm icon" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={14} /></button>
              <span className="num">Page {page + 1} of {pages}</span>
              <button className="btn sm icon" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </section>

      {open && (
        <Modal title={res.singular} onClose={() => setOpen(null)} wide
          footer={confirmDelete ? <>
            <span className="grow">Delete this {res.singular.toLowerCase()}? This cannot be undone.</span>
            <button className="btn" onClick={() => setConfirmDelete(false)}>Keep</button><button className="btn danger" onClick={remove}>Delete</button>
          </> : <>
            {canDelete && <button className="btn danger" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Delete</button>}
            <span className="grow" />
            {p.detailActions?.(open, () => setOpen(null), reload)}
            {canEdit && <button className="btn" onClick={() => { setEditing(open); setOpen(null); }}><Pencil size={14} /> Edit</button>}
          </>}>
          <dl className="kv">
            {visible.map(f => <div key={f.name} style={f.type === 'longtext' || f.type === 'json' ? { gridColumn: '1 / -1' } : undefined}><dt>{f.label}</dt><dd style={f.type === 'longtext' ? { whiteSpace: 'pre-wrap' } : undefined}><Cell field={f} row={open} labels={labels} /></dd></div>)}
          </dl>
        </Modal>
      )}
      {editing && <RecordForm resource={p.resource} initial={editing === 'new' ? undefined : editing} defaults={{ ...p.defaults, ...(p.baseFilter ? Object.fromEntries(Object.entries(p.baseFilter).filter(([, v]) => typeof v !== 'object')) : {}) }} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function FilterSelect({ field, value, onChange }: { field: Field; value: string; onChange: (v: string) => void }) {
  const opts = useOptions(field.type === 'ref' ? field.ref : undefined);
  return <Select id={`flt-${field.name}`} value={value} onChange={onChange} options={field.type === 'ref' ? opts : field.options!} placeholder={`All: ${field.label.toLowerCase()}`} />;
}

export function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div>; }

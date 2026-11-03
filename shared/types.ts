// Core types shared by the API server and the React client.

export type Role = 'admin' | 'teacher' | 'accountant' | 'student' | 'parent';
export const ROLES: Role[] = ['admin', 'teacher', 'accountant', 'student', 'parent'];

export type FieldType =
  | 'text' | 'longtext' | 'int' | 'money' | 'number' | 'date' | 'datetime'
  | 'bool' | 'select' | 'ref' | 'email' | 'phone' | 'json';

export interface Field {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];      // for select
  ref?: string;            // for ref: target resource
  list?: boolean;          // show in table (default true for first fields)
  hidden?: boolean;        // never sent to clients / never shown
  readonly?: boolean;      // set by the system, not editable in forms
  unique?: boolean;
  default?: unknown;
}

/** c = create, r = read, u = update, d = delete */
export type Access = Partial<Record<Role, string>>;

export interface Resource {
  name: string;            // table name
  label: string;           // plural label
  singular: string;
  module: 'Academics' | 'People' | 'Finance' | 'Operations' | 'Communication' | 'System';
  fields: Field[];
  labelField: string | ((row: Row) => string);
  searchFields: string[];
  defaultSort: string;     // e.g. "-date"
  access: Access;          // admin always has full access
  /** field holding the student id; students and parents only see their own rows */
  studentScope?: string;
  /** field holding the staff id; teachers only see their own rows */
  staffScope?: string;
  /** id + label visible to every signed-in user for dropdowns */
  publicLookup?: boolean;
  uniqueTogether?: string[];
  audit?: boolean;
}

export type Row = Record<string, any> & { id: string };
export type Prim = string | number | boolean | null;
export type Cond = Prim | { eq?: Prim; ne?: Prim; gte?: Prim; lte?: Prim; in?: Prim[] };
export type Filter = Record<string, Cond>;

export interface Query {
  filter?: Filter;
  or?: Filter[];
  search?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

export interface Page<T = Row> { rows: T[]; total: number }

export interface Store {
  list(resource: string, q?: Query): Promise<Page>;
  get(resource: string, id: string): Promise<Row | null>;
  create(resource: string, data: Record<string, any>): Promise<Row>;
  update(resource: string, id: string, patch: Record<string, any>): Promise<Row>;
  remove(resource: string, id: string): Promise<void>;
  bulkCreate(resource: string, rows: Record<string, any>[]): Promise<void>;
  /** Run fn atomically. */
  tx<T>(fn: (s: Store) => Promise<T>): Promise<T>;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  staff_id?: string | null;
  /** the student's own id, or a parent's children */
  student_ids: string[];
}

export interface Ctx { store: Store; user: AuthUser; today: string }

export class AppError extends Error {
  status: number;
  details?: Record<string, string>;
  constructor(status: number, message: string, details?: Record<string, string>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const uid = (): string =>
  (globalThis.crypto as any)?.randomUUID?.() ??
  'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

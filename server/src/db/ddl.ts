// Generates the PostgreSQL schema from the shared resource definitions.
// Run `npm run gen:schema` after changing shared/resources.ts and commit the result
// as a new migration.
import { pathToFileURL } from 'node:url';
import { RESOURCES } from '../../../shared/resources';
import type { Field } from '../../../shared/types';

export const sqlType = (f: Field): string => ({
  text: 'text', longtext: 'text', select: 'text', ref: 'text', email: 'text', phone: 'text',
  int: 'integer', money: 'numeric(12,2)', number: 'numeric(8,2)', date: 'date', datetime: 'timestamptz', bool: 'boolean', json: 'jsonb',
}[f.type]);

export function buildSchema(): string {
  const out: string[] = ['-- Generated from shared/resources.ts. Do not edit by hand.', ''];
  for (const r of RESOURCES) {
    const cols = ['  id text PRIMARY KEY'];
    for (const f of r.fields) {
      let c = `  ${f.name} ${sqlType(f)}`;
      if (f.required) c += ' NOT NULL';
      if (f.unique) c += ' UNIQUE';
      if (f.type === 'select') c += ` CHECK (${f.name} IN (${f.options!.map(o => `'${o.replace(/'/g, "''")}'`).join(', ')}))`;
      if (f.type === 'money') c += ` CHECK (${f.name} >= 0)`;
      cols.push(c);
    }
    cols.push('  created_at timestamptz NOT NULL DEFAULT now()', '  updated_at timestamptz NOT NULL DEFAULT now()');
    if (r.uniqueTogether) cols.push(`  CONSTRAINT ${r.name}_uniq UNIQUE (${r.uniqueTogether.join(', ')})`);
    out.push(`CREATE TABLE ${r.name} (\n${cols.join(',\n')}\n);`, '');
  }
  for (const r of RESOURCES) for (const f of r.fields) if (f.type === 'ref') {
    out.push(`ALTER TABLE ${r.name} ADD CONSTRAINT ${r.name}_${f.name}_fk FOREIGN KEY (${f.name}) REFERENCES ${f.ref}(id) ON DELETE RESTRICT;`);
    out.push(`CREATE INDEX ${r.name}_${f.name}_idx ON ${r.name} (${f.name});`);
  }
  out.push('', 'CREATE INDEX attendance_date_idx ON attendance (date);', 'CREATE INDEX attendance_class_date_idx ON attendance (class_id, date);',
    'CREATE INDEX invoices_due_idx ON invoices (due_date) WHERE status <> \'Paid\';', 'CREATE INDEX payments_paid_on_idx ON payments (paid_on);',
    'CREATE INDEX audit_logs_at_idx ON audit_logs (at DESC);', 'CREATE INDEX messages_inbox_idx ON messages (to_user_id, is_read);', '');
  return out.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.stdout.write(buildSchema());

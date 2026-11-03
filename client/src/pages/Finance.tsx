import { Banknote, FilePlus2, Play, Receipt } from 'lucide-react';
import { useState } from 'react';
import { TERMS } from '../../../shared/resources';
import { addDays } from '../../../shared/seed';
import type { Row } from '../../../shared/types';
import { api } from '../api';
import { HBars } from '../charts';
import { Badge, Busy, Empty, ErrorNote, fmtDate, fmtMonth, Loader, Modal, money, moneyShort, PageHead, Panel, ResourceTable, Select, Tabs, Tile, useApp, useAsync, useLabels, useOptions } from '../ui';

const METHODS = ['UPI', 'Cash', 'Card', 'Bank transfer', 'Cheque'];

function CollectModal({ invoice, onClose, onDone }: { invoice: Row; onClose: () => void; onDone: () => void }) {
  const labels = useLabels(['students']);
  const balance = invoice.amount - (invoice.discount ?? 0) - (invoice.paid ?? 0);
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState('UPI');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Row | null>(null);
  const submit = async () => {
    setBusy(true); setError('');
    try { const r = await api.action('fees.collect', { invoice_id: invoice.id, amount: Number(amount), method, reference }); setReceipt(r.receipt); onDone(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  if (receipt) return (
    <Modal title="Payment recorded" onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Done</button>}>
      <div className="stack">
        <div className="row"><Receipt size={18} color="var(--good)" /><b>Receipt <span className="mono">{receipt.receipt_no}</span></b></div>
        <dl className="kv">
          <div><dt>Received from</dt><dd>{labels.students?.[receipt.student_id]}</dd></div><div><dt>Amount</dt><dd className="num" style={{ fontWeight: 600 }}>{money(receipt.amount)}</dd></div>
          <div><dt>Method</dt><dd>{receipt.method}{receipt.reference ? ` · ${receipt.reference}` : ''}</dd></div><div><dt>Date</dt><dd>{fmtDate(receipt.paid_on)}</dd></div>
          <div><dt>Against invoice</dt><dd className="mono">{invoice.invoice_no}</dd></div><div><dt>Balance left</dt><dd className="num">{money(balance - receipt.amount)}</dd></div>
        </dl>
      </div>
    </Modal>
  );
  return (
    <Modal title={`Collect payment · ${invoice.invoice_no}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><Busy busy={busy} className="btn primary" onClick={submit}>Record payment</Busy></>}>
      <div className="stack">
        {error && <ErrorNote message={error} />}
        <div><div style={{ fontWeight: 600 }}>{labels.students?.[invoice.student_id] ?? '…'}</div><div className="small muted">{invoice.title} · due {fmtDate(invoice.due_date)}</div></div>
        <table><tbody>
          {(invoice.lines ?? []).map((l: any, i: number) => <tr key={i}><td style={{ paddingLeft: 0 }}>{l.name}</td><td className="r num">{money(l.amount)}</td></tr>)}
          {invoice.discount > 0 && <tr><td style={{ paddingLeft: 0 }}>Discount</td><td className="r num">− {money(invoice.discount)}</td></tr>}
          {invoice.paid > 0 && <tr><td style={{ paddingLeft: 0 }}>Already paid</td><td className="r num">− {money(invoice.paid)}</td></tr>}
          <tr><td style={{ paddingLeft: 0, fontWeight: 600 }}>Balance</td><td className="r num" style={{ fontWeight: 600 }}>{money(balance)}</td></tr>
        </tbody></table>
        <div className="form-grid">
          <div className="field"><label htmlFor="pay-amount">Amount received (₹) *</label><input id="pay-amount" type="number" className="input num" min={1} max={balance} value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div className="field"><label htmlFor="pay-method">Method *</label><Select id="pay-method" value={method} onChange={setMethod} options={METHODS} /></div>
          <div className="field wide"><label htmlFor="pay-ref">Reference (UPI ID, cheque no.)</label><input id="pay-ref" className="input" value={reference} onChange={e => setReference(e.target.value)} /></div>
        </div>
      </div>
    </Modal>
  );
}

function GenerateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { today, toast } = useApp();
  const classes = useOptions('classes');
  const [term, setTerm] = useState('Term 3'), [due, setDue] = useState(addDays(today, 21)), [classId, setClassId] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const run = async () => {
    setBusy(true); setError('');
    try {
      const r = await api.action('fees.generate', { term, due_date: due, class_id: classId || undefined });
      toast(r.created ? `${r.created} invoices issued, ${money(r.total)} billed` : 'Every student already has an invoice for this term');
      onDone(); onClose();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Issue term invoices" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><Busy busy={busy} className="btn primary" onClick={run}>Issue invoices</Busy></>}>
      <div className="stack">
        {error && <ErrorNote message={error} />}
        <p className="muted">Each active student gets one invoice built from the fee structure for their grade, plus transport and hostel fees where they apply. Students who already have an invoice for the term are skipped.</p>
        <div className="form-grid">
          <div className="field"><label htmlFor="gen-term">Term *</label><Select id="gen-term" value={term} onChange={setTerm} options={TERMS} /></div>
          <div className="field"><label htmlFor="gen-due">Due date *</label><input id="gen-due" type="date" className="input" min={today} value={due} onChange={e => setDue(e.target.value)} /></div>
          <div className="field"><label htmlFor="gen-class">Class</label><Select id="gen-class" value={classId} onChange={setClassId} options={classes} placeholder="All classes" /></div>
        </div>
      </div>
    </Modal>
  );
}

export function FeesPage() {
  const { user } = useApp();
  const staff = user.role === 'admin' || user.role === 'accountant';
  const [tab, setTab] = useState<'invoices' | 'receipts' | 'classes'>('invoices');
  const [collect, setCollect] = useState<Row | null>(null);
  const [generate, setGenerate] = useState(false);
  const [version, setVersion] = useState(0);
  const summary = useAsync(() => (staff ? api.action('fees.summary') : Promise.resolve(null)), [staff, version]);
  const bump = () => setVersion(v => v + 1);

  if (!staff) return (
    <div className="stack">
      <PageHead title="Fees" sub="Invoices and receipts. Pay by UPI or bank transfer, or at the fee counter between 9:00 and 13:00 on working days." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'invoices', label: 'Invoices' }, { id: 'receipts', label: 'Receipts' }]} />
      {tab === 'invoices' ? <ResourceTable resource="invoices" embedded /> : <ResourceTable resource="payments" embedded />}
    </div>
  );
  return (
    <div className="stack">
      <PageHead title="Fees" sub="Issue term invoices, record payments and follow up on dues." />
      <Loader state={summary}>{s => (
        <div className="tiles">
          <Tile label="Billed this year" value={moneyShort(s.billed)} hint={s.byTerm.map((t: any) => `${t.term}: ${t.count}`).join(' · ')} />
          <Tile label="Collected" value={moneyShort(s.collected)} hint={`${Math.round((s.collected / (s.billed || 1)) * 100)}% of billed`} />
          <Tile label="Outstanding" value={moneyShort(s.outstanding)} hint={`${s.byTerm.reduce((a: number, t: any) => a + t.unpaid, 0)} invoices open`} />
          <Tile label="Overdue" value={moneyShort(s.overdue)} hint={`${s.overdueCount} invoices past due date`} tone={s.overdueCount ? 'bad' : 'good'} />
        </div>
      )}</Loader>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'invoices', label: 'Invoices' }, { id: 'receipts', label: 'Receipts' }, { id: 'classes', label: 'Collection by class' }]} />
      {tab === 'invoices' && <ResourceTable resource="invoices" embedded version={version}
        columns={['invoice_no', 'student_id', 'term', 'due_date', 'amount', 'paid', 'status']}
        toolbar={() => <button className="btn" onClick={() => setGenerate(true)}><FilePlus2 size={15} /> Issue term invoices</button>}
        rowActions={row => row.status !== 'Paid' && <button className="btn sm" onClick={() => setCollect(row)}><Banknote size={14} /> Collect</button>} />}
      {tab === 'receipts' && <ResourceTable resource="payments" embedded version={version} />}
      {tab === 'classes' && <Panel title="Share of billed fees collected, by class"><Loader state={summary}>{s => <HBars rows={s.byClass.filter((c: any) => c.billed).map((c: any) => ({ label: c.name, value: Math.round((c.paid / c.billed) * 100), note: <span className="muted"> · {moneyShort(c.billed - c.paid)} due</span> }))} max={100} format={v => `${v}%`} />}</Loader></Panel>}
      {collect && <CollectModal invoice={collect} onClose={() => setCollect(null)} onDone={bump} />}
      {generate && <GenerateModal onClose={() => setGenerate(false)} onDone={bump} />}
    </div>
  );
}

export function PayrollPage() {
  const { user, today, toast } = useApp();
  const staffUser = user.role === 'admin' || user.role === 'accountant';
  const [month, setMonth] = useState(today.slice(0, 7));
  const labels = useLabels(['staff']);
  const state = useAsync(() => (staffUser ? api.list('payroll', { filter: { month }, limit: 500 }) : Promise.resolve({ rows: [], total: 0 })), [month, staffUser]);
  const [busy, setBusy] = useState('');
  if (!staffUser) return <ResourceTable resource="payroll" title="My payslips" sub="Monthly salary statements." />;
  const rows = [...(state.data?.rows ?? [])].sort((a, b) => (labels.staff?.[a.staff_id] ?? '').localeCompare(labels.staff?.[b.staff_id] ?? ''));
  const drafts = rows.filter(r => r.status === 'Draft');
  const total = (k: string) => rows.reduce((a, r) => a + (r[k] ?? 0), 0);
  const run = async (action: 'payroll.run' | 'payroll.pay') => {
    setBusy(action);
    try {
      const r = await api.action(action, { month });
      toast(action === 'payroll.run' ? (r.created ? `${r.created} payslips prepared, ${money(r.total)} net` : 'Payslips already exist for every staff member') : `${r.paid} salaries released, ${money(r.total)}`);
      state.reload();
    } catch (e: any) { toast(e.message, 'bad'); } finally { setBusy(''); }
  };
  return (
    <div className="stack">
      <PageHead title="Payroll" sub="Prepare payslips for the month, review them, then release salaries. Releasing also books the total under Salaries in expenses." />
      <Panel>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ maxWidth: 200 }}><label htmlFor="pr-month">Month</label><input id="pr-month" type="month" className="input" value={month} max={today.slice(0, 7)} onChange={e => e.target.value && setMonth(e.target.value)} /></div>
          <span className="grow" />
          <Busy busy={busy === 'payroll.run'} className="btn" onClick={() => run('payroll.run')}><Play size={15} /> Prepare payslips</Busy>
          <Busy busy={busy === 'payroll.pay'} disabled={!drafts.length} className="btn primary" onClick={() => run('payroll.pay')}><Banknote size={15} /> Release {drafts.length || ''} salaries</Busy>
        </div>
      </Panel>
      <Loader state={state}>{() => rows.length === 0 ? <Panel><Empty>No payslips for {fmtMonth(month)} yet. Select "Prepare payslips" to create them from each staff member's basic pay.</Empty></Panel> : <>
        <div className="tiles">
          <Tile label="Staff on payroll" value={rows.length} hint={drafts.length ? `${drafts.length} in draft` : 'All paid'} tone={drafts.length ? 'warn' : 'good'} />
          <Tile label="Gross pay" value={moneyShort(total('basic') + total('allowances'))} hint={`Basic ${moneyShort(total('basic'))}`} />
          <Tile label="Deductions" value={moneyShort(total('deductions'))} hint="Provident fund, professional tax, loss of pay" />
          <Tile label="Net payable" value={moneyShort(total('net'))} hint={fmtMonth(month)} />
        </div>
        <Panel flush><div className="table-wrap"><table>
          <thead><tr><th>Staff member</th><th className="r">Basic</th><th className="r">Allowances</th><th className="r">Deductions</th><th className="r">Net pay</th><th>Status</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.id}><td style={{ fontWeight: 500 }}>{labels.staff?.[r.staff_id] ?? '…'}</td><td className="r num">{money(r.basic)}</td><td className="r num">{money(r.allowances)}</td><td className="r num">{money(r.deductions)}</td><td className="r num" style={{ fontWeight: 600 }}>{money(r.net)}</td><td><Badge value={r.status} /></td></tr>)}</tbody>
        </table></div></Panel>
      </>}</Loader>
    </div>
  );
}

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { PERIODS } from '../../../shared/resources';
import { api } from '../api';
import { Columns, HBars, S1, S2, Trend } from '../charts';
import { Badge, Empty, fmtDate, fmtMonth, Loader, money, moneyShort, PageHead, Panel, Tile, useApp, useAsync } from '../ui';

const short = (iso: string) => fmtDate(iso, false);

export function EventList({ events }: { events: any[] }) {
  if (!events.length) return <Empty>Nothing on the calendar.</Empty>;
  return (
    <ul className="list">
      {events.map(e => {
        const [d, m] = fmtDate(e.start_date, false).split(' ');
        return (
          <li key={e.id}>
            <div className="datebox"><span>{m}</span><b>{d}</b></div>
            <div className="grow"><div style={{ fontWeight: 500 }}>{e.title}</div>
              <div className="small muted">{e.type}{e.end_date && e.end_date !== e.start_date ? ` · until ${short(e.end_date)}` : ''}{e.location ? ` · ${e.location}` : ''}</div></div>
          </li>
        );
      })}
    </ul>
  );
}
export function NoticeList({ notices }: { notices: any[] }) {
  if (!notices.length) return <Empty>No notices.</Empty>;
  return (
    <ul className="list">
      {notices.map(n => (
        <li key={n.id}><div className="grow">
          <div className="row" style={{ gap: 6 }}><span style={{ fontWeight: 500 }}>{n.title}</span>{n.priority !== 'Normal' && <Badge value={n.priority} />}</div>
          <div className="small muted" style={{ marginTop: 2 }}>{n.body}</div>
          <div className="small muted" style={{ marginTop: 4 }}>{short(n.published_on)} · for {n.audience.toLowerCase()}</div>
        </div></li>
      ))}
    </ul>
  );
}
const Side = ({ d }: { d: any }) => {
  const { go } = useApp();
  return (
    <div className="stack">
      <Panel title="Notices" flush action={<button className="btn ghost sm" onClick={() => go('r:notices')}>All notices</button>}><NoticeList notices={d.notices} /></Panel>
      <Panel title="Coming up" flush action={<button className="btn ghost sm" onClick={() => go('r:events')}>Calendar</button>}><EventList events={d.events} /></Panel>
    </div>
  );
};

function FinancePanels({ f }: { f: any }) {
  const { go } = useApp();
  return (
    <>
      <Panel title="Fees collected and money spent, last 6 months">
        <Columns data={f.feeByMonth.map((m: any) => ({ label: fmtMonth(m.month).slice(0, 3), values: [m.collected, m.spent] }))} series={[{ name: 'Fees collected', color: S1 }, { name: 'Expenses paid out', color: S2 }]} format={moneyShort} />
      </Panel>
      <Panel title="Largest overdue balances" flush action={<button className="btn ghost sm" onClick={() => go('fees')}>Open fees</button>}>
        {f.defaulters.length === 0 ? <Empty>No overdue fees.</Empty> : (
          <div className="table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th className="r">Overdue</th></tr></thead>
            <tbody>{f.defaulters.map((s: any) => <tr key={s.id} className="click" onClick={() => go('student', { id: s.id })}><td style={{ fontWeight: 500 }}>{s.name}</td><td>{s.class_name}</td><td className="r num">{money(s.amount)}</td></tr>)}</tbody></table></div>
        )}
      </Panel>
    </>
  );
}

function Admin({ d }: { d: any }) {
  const { go } = useApp();
  const a = d.attendanceToday, c = d.counts, f = d.finance;
  return (
    <>
      {a.pendingClasses.length > 0 && (
        <div className="banner"><AlertTriangle size={16} style={{ marginTop: 2, flex: 'none' }} />
          <div className="grow"><b>{a.pendingClasses.length} classes have not marked attendance today.</b> <span className="muted">{a.pendingClasses.slice(0, 8).map((x: any) => x.name.replace('Grade ', '')).join(', ')}{a.pendingClasses.length > 8 ? '…' : ''}</span></div>
          <button className="btn sm" onClick={() => go('attendance', { class_id: a.pendingClasses[0].id })}>Mark now</button></div>
      )}
      <div className="tiles">
        <Tile label="Students enrolled" value={c.students.toLocaleString('en-IN')} hint={`${c.girls} girls · ${c.students - c.girls} boys · ${c.classes} sections`} onClick={() => go('r:students')} />
        <Tile label="Present today" value={a.marked ? `${a.pct}%` : '—'} hint={a.marked ? `${a.absent} absent of ${a.marked} marked` : 'Not marked yet'} onClick={() => go('attendance')} />
        <Tile label="Fees collected this month" value={moneyShort(f.collectedThisMonth)} hint={`${Math.round((f.collected / (f.billed || 1)) * 100)}% of billed fees collected`} onClick={() => go('fees')} />
        <Tile label="Fees overdue" value={moneyShort(f.overdueAmount)} hint={`${f.overdueCount} invoices past due date`} onClick={() => go('fees')} />
      </div>
      <div className="grid split">
        <div className="stack">
          <Panel title="Attendance, last 14 school days"><Trend points={d.attendanceTrend.map((p: any) => ({ label: short(p.date), value: p.pct }))} min={80} max={100} format={v => `${Math.round(v * 10) / 10}%`} /></Panel>
          <FinancePanels f={f} />
        </div>
        <div className="stack">
          <Panel title="Needs your attention" flush>
            <ul className="list">
              <Todo n={c.admissionsOpen} text="admission applications in progress" onClick={() => go('r:admissions')} />
              <Todo n={c.leavePending} text="leave requests waiting for a decision" onClick={() => go('r:leave_requests')} />
              <Todo n={c.lowStock} text="inventory items at or below reorder level" onClick={() => go('r:inventory_items')} />
              <Todo n={c.overdueLoans} text="library books overdue" onClick={() => go('library')} />
              <Todo n={d.unread} text="unread messages" onClick={() => go('messages')} />
            </ul>
          </Panel>
          <Side d={d} />
        </div>
      </div>
    </>
  );
}
const Todo = ({ n, text, onClick }: { n: number; text: string; onClick: () => void }) => (
  <li style={{ alignItems: 'center' }}>
    {n > 0 ? <span className="badge warn num">{n}</span> : <CheckCircle2 size={16} color="var(--good)" />}
    <span className="grow">{n > 0 ? text : `No ${text}`}</span>
    {n > 0 && <button className="btn ghost sm" onClick={onClick}>Review</button>}
  </li>
);

function Accountant({ d }: { d: any }) {
  const { go } = useApp();
  const f = d.finance;
  return (
    <>
      {!d.payrollDone && <div className="banner info"><div className="grow"><b>Payroll for {fmtMonth(d.month)} has not been prepared.</b></div><button className="btn sm" onClick={() => go('payroll')}>Open payroll</button></div>}
      <div className="tiles">
        <Tile label="Collected this month" value={moneyShort(f.collectedThisMonth)} hint={`Spent ${moneyShort(f.spentThisMonth)}`} />
        <Tile label="Outstanding fees" value={moneyShort(f.outstanding)} hint={`of ${moneyShort(f.billed)} billed this year`} onClick={() => go('fees')} />
        <Tile label="Overdue" value={moneyShort(f.overdueAmount)} hint={`${f.overdueCount} invoices past due date`} onClick={() => go('fees')} />
        <Tile label="Expenses awaiting payment" value={d.pendingExpenses.length} hint={money(d.pendingExpenses.reduce((a: number, e: any) => a + e.amount, 0))} onClick={() => go('r:expenses')} />
      </div>
      <div className="grid split">
        <div className="stack">
          <FinancePanels f={f} />
          <Panel title="Latest receipts" flush>
            <div className="table-wrap"><table><thead><tr><th>Receipt</th><th>Student</th><th>Method</th><th>Date</th><th className="r">Amount</th></tr></thead>
              <tbody>{d.recent.map((p: any) => <tr key={p.id}><td className="mono">{p.receipt_no}</td><td>{p.student}</td><td>{p.method}</td><td className="num">{short(p.paid_on)}</td><td className="r num">{money(p.amount)}</td></tr>)}</tbody></table></div>
          </Panel>
        </div>
        <Side d={d} />
      </div>
    </>
  );
}

function Teacher({ d }: { d: any }) {
  const { go } = useApp();
  return (
    <>
      {d.myClasses.filter((c: any) => !c.marked).map((c: any) => (
        <div className="banner" key={c.id}><AlertTriangle size={16} style={{ marginTop: 2, flex: 'none' }} /><div className="grow"><b>Attendance for {c.name} is not marked today.</b></div>
          <button className="btn sm" onClick={() => go('attendance', { class_id: c.id })}>Mark attendance</button></div>
      ))}
      <div className="tiles">
        <Tile label="Periods today" value={d.periods.length} hint={`${d.weeklyPeriods} periods a week`} onClick={() => go('timetable')} />
        {d.myClasses.map((c: any) => <Tile key={c.id} label={`${c.name} · class teacher`} value={c.marked ? `${c.present}/${c.strength}` : `${c.strength} students`} hint={c.marked ? 'present today' : 'attendance pending'} onClick={() => go('attendance', { class_id: c.id })} />)}
        <Tile label="Homework to collect" value={d.homework.length} hint="set by you, due soon" onClick={() => go('r:assignments')} />
        <Tile label="Unread messages" value={d.unread} onClick={() => go('messages')} />
      </div>
      <div className="grid split">
        <div className="stack">
          <Panel title="Today's periods" flush>
            {d.periods.length === 0 ? <Empty>No classes scheduled today.</Empty> : (
              <div className="table-wrap"><table><thead><tr><th>Period</th><th>Time</th><th>Class</th><th>Subject</th><th>Room</th></tr></thead>
                <tbody>{d.periods.map((p: any) => <tr key={p.period}><td className="num">{p.period}</td><td className="num muted">{PERIODS[p.period - 1]?.time}</td><td style={{ fontWeight: 500 }}>{p.class_name}</td><td>{p.subject}</td><td>{p.room}</td></tr>)}</tbody></table></div>
            )}
          </Panel>
          {d.myClasses.map((c: any) => <Panel key={c.id} title={`${c.name} attendance, last 10 school days`}><Trend points={c.trend.map((p: any) => ({ label: short(p.date), value: p.pct }))} min={70} max={100} height={170} format={v => `${Math.round(v)}%`} /></Panel>)}
          <Panel title="Homework you have set" flush>
            {d.homework.length === 0 ? <Empty>No homework due.</Empty> : <ul className="list">{d.homework.map((h: any) => <li key={h.id}><div className="grow"><div style={{ fontWeight: 500 }}>{h.title}</div><div className="small muted">{h.class_name} · {h.subject}</div></div><span className="small num muted">due {short(h.due_date)}</span></li>)}</ul>}
          </Panel>
        </div>
        <div className="stack">
          <Panel title="My leave" flush action={<button className="btn ghost sm" onClick={() => go('r:leave_requests')}>Apply</button>}>
            {d.leave.length === 0 ? <Empty>No leave requests.</Empty> : <ul className="list">{d.leave.map((l: any) => <li key={l.id} style={{ alignItems: 'center' }}><div className="grow">{l.type} · {l.days} {l.days === 1 ? 'day' : 'days'}<div className="small muted">from {short(l.from_date)}</div></div><Badge value={l.status} /></li>)}</ul>}
          </Panel>
          <Side d={d} />
        </div>
      </div>
    </>
  );
}

function Family({ d }: { d: any }) {
  const { go, user } = useApp();
  return (
    <div className="grid split">
      <div className="stack">
        {d.children.map((c: any) => (
          <section className="panel" key={c.student.id}>
            <div className="panel-head">
              <div><h2>{user.role === 'parent' ? c.student.name : 'My school day'}</h2><div className="small muted">{c.class_name} · Roll no. {c.student.roll_no} · {c.student.admission_no}</div></div>
              <button className="btn sm" onClick={() => go('student', { id: c.student.id })}>Full profile</button>
            </div>
            <div className="panel-body stack">
              <div className="tiles">
                <Tile label="Attendance" value={`${c.attendance.pct}%`} hint={c.attendance.today ? `Today: ${c.attendance.today}` : `${c.attendance.absent} days absent`} />
                <Tile label="Fees due" value={money(c.feesDue)} hint={c.nextDue ? `Pay by ${short(c.nextDue.due_date)}` : 'Nothing to pay'} tone={c.nextDue ? (c.nextDue.due_date < d.today ? 'bad' : 'warn') : 'good'} onClick={() => go('r:invoices')} />
                <Tile label={c.results.length ? c.results[c.results.length - 1].exam : 'Latest exam'} value={c.results.length ? `${c.results[c.results.length - 1].pct}%` : '—'} hint="View report card" onClick={() => go('exams', { student_id: c.student.id })} />
              </div>
              <div className="grid cols-2">
                <div><h3 style={{ marginBottom: 8 }}>Today's timetable</h3>
                  {c.timetable.length === 0 ? <p className="muted">No classes today.</p> : <table><tbody>{c.timetable.map((t: any) => <tr key={t.period}><td className="num muted" style={{ paddingLeft: 0, width: 110 }}>{PERIODS[t.period - 1]?.time}</td><td><b style={{ fontWeight: 500 }}>{t.subject}</b><div className="small muted">{t.teacher}</div></td></tr>)}</tbody></table>}
                </div>
                <div className="stack">
                  <div><h3 style={{ marginBottom: 8 }}>Homework due</h3>
                    {c.homework.length === 0 ? <p className="muted">Nothing due.</p> : <ul className="list">{c.homework.map((h: any) => <li key={h.id} style={{ paddingInline: 0 }}><div className="grow"><div>{h.title}</div><div className="small muted">{h.subject}</div></div><span className="small num muted">{short(h.due_date)}</span></li>)}</ul>}
                  </div>
                  {c.loans.length > 0 && <div><h3 style={{ marginBottom: 8 }}>Library books</h3><ul className="list">{c.loans.map((l: any, i: number) => <li key={i} style={{ paddingInline: 0, alignItems: 'center' }}><span className="grow">{l.title}</span>{l.overdue ? <Badge value="Overdue" /> : <span className="small num muted">return by {short(l.due_on)}</span>}</li>)}</ul></div>}
                </div>
              </div>
              {c.results.length > 1 && <div><h3 style={{ marginBottom: 8 }}>Exam results so far</h3><HBars rows={c.results.map((r: any) => ({ label: r.exam, value: r.pct }))} max={100} format={v => `${v}%`} /></div>}
            </div>
          </section>
        ))}
        {d.children.length === 0 && <Empty>This account is not linked to a student yet. Ask the school office to link it.</Empty>}
      </div>
      <Side d={d} />
    </div>
  );
}

export function Dashboard() {
  const { user, today } = useApp();
  const state = useAsync(() => api.action('dashboard'), []);
  const hour = new Date().getHours();
  const body: Record<string, (d: any) => ReactNode> = { admin: d => <Admin d={d} />, accountant: d => <Accountant d={d} />, teacher: d => <Teacher d={d} />, student: d => <Family d={d} />, parent: d => <Family d={d} /> };
  return (
    <div className="stack">
      <PageHead title={`Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${user.name.replace(/^Dr\.\s*/, '').split(' ')[0]}`} sub={new Date(today + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} />
      <Loader state={state}>{d => body[user.role](d)}</Loader>
    </div>
  );
}

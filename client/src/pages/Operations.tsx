import { BookUp, Undo2 } from 'lucide-react';
import { useState } from 'react';
import type { Row } from '../../../shared/types';
import { api } from '../api';
import { Columns, HBars, S1, S2 } from '../charts';
import { Busy, Empty, ErrorNote, fmtDateTime, fmtMonth, Loader, Modal, money, moneyShort, PageHead, Panel, ResourceTable, Select, Tabs, useApp, useAsync, useLabels, useOptions } from '../ui';

// ───────────── Library ─────────────
export function LibraryPage() {
  const { user, toast, today } = useApp();
  const staff = user.role === 'admin' || user.role === 'teacher';
  const [tab, setTab] = useState<'books' | 'out' | 'history'>('books');
  const [issue, setIssue] = useState(false);
  const [version, setVersion] = useState(0);
  const books = useOptions('books', version), students = useOptions(staff ? 'students' : undefined);
  const [bookId, setBookId] = useState(''), [studentId, setStudentId] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const bump = () => setVersion(v => v + 1);
  const submit = async () => {
    setBusy(true); setError('');
    try { const loan = await api.action('library.issue', { book_id: bookId, student_id: studentId }); toast(`Book issued. Return by ${loan.due_on}`); setIssue(false); setBookId(''); setStudentId(''); bump(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const giveBack = async (row: Row) => {
    try { const r = await api.action('library.return', { loan_id: row.id }); toast(r.fine ? `Returned ${r.late} days late. Fine ${money(r.fine)}` : 'Book returned'); bump(); }
    catch (e: any) { toast(e.message, 'bad'); }
  };
  return (
    <div className="stack">
      <PageHead title="Library" sub={staff ? 'Catalogue, issue and return. A student can hold three books at a time.' : 'Browse the catalogue and see what is borrowed.'}>
        {staff && <button className="btn primary" onClick={() => { setIssue(true); setError(''); }}><BookUp size={15} /> Issue a book</button>}
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'books', label: 'Catalogue' }, { id: 'out', label: staff ? 'Books out' : 'Borrowed now' }, { id: 'history', label: 'Returned' }]} />
      {tab === 'books' && <ResourceTable resource="books" embedded version={version} />}
      {tab === 'out' && <ResourceTable resource="book_loans" embedded version={version} baseFilter={{ status: 'Issued' }} columns={['book_id', 'student_id', 'issued_on', 'due_on']}
        rowActions={row => <>{row.due_on < today && <span className="badge bad">Overdue</span>}{staff && <button className="btn sm" onClick={() => giveBack(row)}><Undo2 size={14} /> Return</button>}</>} />}
      {tab === 'history' && <ResourceTable resource="book_loans" embedded version={version} baseFilter={{ status: 'Returned' }} columns={['book_id', 'student_id', 'issued_on', 'returned_on', 'fine']} />}
      {issue && (
        <Modal title="Issue a book" onClose={() => setIssue(false)} footer={<><button className="btn" onClick={() => setIssue(false)}>Cancel</button><Busy busy={busy} disabled={!bookId || !studentId} className="btn primary" onClick={submit}>Issue book</Busy></>}>
          <div className="stack">
            {error && <ErrorNote message={error} />}
            <div className="form-grid">
              <div className="field wide"><label htmlFor="iss-book">Book *</label><Select id="iss-book" value={bookId} onChange={setBookId} options={books} placeholder="Choose a title" /></div>
              <div className="field wide"><label htmlFor="iss-student">Borrower *</label><Select id="iss-student" value={studentId} onChange={setStudentId} options={students} placeholder="Choose a student" /></div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ───────────── Messages ─────────────
export function MessagesPage() {
  const { user, toast } = useApp();
  const [box, setBox] = useState<'inbox' | 'sent'>('inbox');
  const [open, setOpen] = useState<Row | null>(null);
  const [compose, setCompose] = useState<{ to: string; subject: string; body: string } | null>(null);
  const people = useOptions('users');
  const names = useLabels(['users']).users ?? {};
  const state = useAsync(() => api.list('messages', { filter: box === 'inbox' ? { to_user_id: user.id } : { from_user_id: user.id }, limit: 100 }), [box]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const read = async (m: Row) => { setOpen(m); if (box === 'inbox' && !m.is_read) { await api.action('messages.read', { id: m.id }).catch(() => {}); state.reload(); } };
  const send = async () => {
    setBusy(true); setError('');
    try { await api.create('messages', { to_user_id: compose!.to, subject: compose!.subject, body: compose!.body }); toast('Message sent'); setCompose(null); setBox('sent'); state.reload(); }
    catch (e: any) { setError(e.details ? Object.values(e.details).join('. ') : e.message); } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <PageHead title="Messages" sub="Private messages between the school and families."><button className="btn primary" onClick={() => { setCompose({ to: '', subject: '', body: '' }); setError(''); }}>New message</button></PageHead>
      <Tabs value={box} onChange={b => { setBox(b); setOpen(null); }} tabs={[{ id: 'inbox', label: 'Inbox' }, { id: 'sent', label: 'Sent' }]} />
      <div className="grid cols-2">
        <Panel flush>
          <Loader state={state}>{d => d.rows.length === 0 ? <Empty>{box === 'inbox' ? 'No messages yet.' : 'You have not sent any messages.'}</Empty> : (
            <ul className="list">{d.rows.map(m => (
              <li key={m.id} style={{ cursor: 'pointer', background: open?.id === m.id ? 'var(--sunken)' : undefined }} onClick={() => read(m)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && read(m)}>
                <div className="grow">
                  <div className="row between" style={{ flexWrap: 'nowrap' }}><span style={{ fontWeight: box === 'inbox' && !m.is_read ? 600 : 400 }}>{names[box === 'inbox' ? m.from_user_id : m.to_user_id] ?? '…'}</span><span className="small muted num">{fmtDateTime(m.sent_at)}</span></div>
                  <div style={{ fontWeight: box === 'inbox' && !m.is_read ? 600 : 400 }}>{m.subject}</div>
                </div>
                {box === 'inbox' && !m.is_read && <span className="badge info">New</span>}
              </li>
            ))}</ul>
          )}</Loader>
        </Panel>
        <Panel title={open ? open.subject : 'Message'} action={open && box === 'inbox' ? <button className="btn sm" onClick={() => setCompose({ to: open.from_user_id, subject: open.subject.startsWith('Re: ') ? open.subject : `Re: ${open.subject}`, body: '' })}>Reply</button> : undefined}>
          {open ? <div className="stack tight"><div className="small muted">From {names[open.from_user_id]} to {names[open.to_user_id]} · {fmtDateTime(open.sent_at)}</div><p style={{ whiteSpace: 'pre-wrap' }}>{open.body}</p></div> : <Empty>Select a message to read it.</Empty>}
        </Panel>
      </div>
      {compose && (
        <Modal title="New message" onClose={() => setCompose(null)} footer={<><button className="btn" onClick={() => setCompose(null)}>Cancel</button><Busy busy={busy} className="btn primary" onClick={send}>Send</Busy></>}>
          <div className="stack">
            {error && <ErrorNote message={error} />}
            <div className="field"><label htmlFor="msg-to">To *</label><Select id="msg-to" value={compose.to} onChange={v => setCompose({ ...compose, to: v })} options={people.filter(p => p.id !== user.id)} placeholder="Choose a person" /></div>
            <div className="field"><label htmlFor="msg-subject">Subject *</label><input id="msg-subject" className="input" value={compose.subject} onChange={e => setCompose({ ...compose, subject: e.target.value })} /></div>
            <div className="field"><label htmlFor="msg-body">Message *</label><textarea id="msg-body" className="input" rows={6} value={compose.body} onChange={e => setCompose({ ...compose, body: e.target.value })} /></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ───────────── Reports ─────────────
export function ReportsPage() {
  const { go } = useApp();
  const [examId, setExamId] = useState('');
  const state = useAsync(() => api.action('reports.overview', { exam_id: examId || undefined }), [examId]);
  const short = (n: string) => n.replace('Grade ', '');
  return (
    <div className="stack">
      <PageHead title="Reports" sub="Enrolment, attendance, results and money across the school." />
      <Loader state={state}>{d => (
        <div className="grid cols-2">
          <Panel title="Students by grade">
            <Columns data={d.strength.map((g: any) => ({ label: String(g.grade), values: [g.girls, g.boys] }))} series={[{ name: 'Girls', color: S1 }, { name: 'Boys', color: S2 }]} stacked />
          </Panel>
          <Panel title="Attendance by class, last 5 weeks">
            <div style={{ maxHeight: 250, overflowY: 'auto' }}><HBars rows={[...d.attendanceByClass].sort((a: any, b: any) => a.pct - b.pct).map((c: any) => ({ id: c.id, label: short(c.name), value: c.pct }))} max={100} format={v => `${v}%`} onPick={id => go('attendance', { class_id: id })} /></div>
          </Panel>
          <Panel title={`Average score by class${d.exam ? ` · ${d.exam.name}` : ''}`} action={<div style={{ width: 200, maxWidth: '100%' }}><Select id="rep-exam" value={d.exam?.id ?? ''} onChange={setExamId} options={d.exams} /></div>}>
            {d.results.length ? <Columns data={d.results.map((r: any) => ({ label: short(r.name), values: [r.avg] }))} series={[{ name: 'Average score', color: S1 }]} max={100} format={v => `${Math.round(v)}%`} /> : <Empty>No published exam yet.</Empty>}
          </Panel>
          <Panel title="Students by overall result grade">
            {d.results.length ? <Columns data={d.grades.map((g: any) => ({ label: g.grade, values: [g.count] }))} series={[{ name: 'Students', color: S1 }]} /> : <Empty>No published exam yet.</Empty>}
          </Panel>
          <Panel title="Average score by subject">
            {d.subjectAvg.length ? <HBars rows={d.subjectAvg.map((s: any) => ({ label: s.subject, value: s.avg }))} max={100} format={v => `${v}%`} /> : <Empty>No published exam yet.</Empty>}
          </Panel>
          {d.finance && <Panel title="Fees collected and expenses, last 6 months">
            <Columns data={d.finance.byMonth.map((m: any) => ({ label: fmtMonth(m.month).slice(0, 3), values: [m.collected, m.spent] }))} series={[{ name: 'Fees collected', color: S1 }, { name: 'Expenses', color: S2 }]} format={moneyShort} />
          </Panel>}
          {d.finance && <Panel title="Where the money went, last 6 months">
            <HBars rows={d.finance.byCategory.map((c: any) => ({ label: c.category, value: c.amount }))} format={moneyShort} />
          </Panel>}
          <Panel title="Class results" flush>
            {d.results.length ? <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}><table>
              <thead><tr><th>Class</th><th className="r">Students</th><th className="r">Average</th><th className="r">Passed all subjects</th></tr></thead>
              <tbody>{d.results.map((r: any) => <tr key={r.id}><td style={{ fontWeight: 500 }}>{r.name}</td><td className="r num">{r.students}</td><td className="r num">{r.avg}%</td><td className="r num">{r.pass}%</td></tr>)}</tbody>
            </table></div> : <Empty>No published exam yet.</Empty>}
          </Panel>
        </div>
      )}</Loader>
    </div>
  );
}

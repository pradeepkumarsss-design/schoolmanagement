import { Check, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import type { Row } from '../../../shared/types';
import { api, clearLookups } from '../api';
import { HBars } from '../charts';
import { Badge, Busy, Empty, ErrorNote, fmtDate, initials, Loader, Modal, money, PageHead, Panel, ResourceTable, Select, Tile, useApp, useAsync, useOptions } from '../ui';

export function StudentsPage() {
  const { go } = useApp();
  return <ResourceTable resource="students" sub="Select a student to see details, or open the profile for attendance, results and fees in one place."
    rowActions={row => <button className="btn sm" onClick={() => go('student', { id: row.id })}>Profile</button>} />;
}

const MARK: Record<string, string> = { Present: 'P', Absent: 'A', Late: 'L', 'Half day': 'H' };
const TONE: Record<string, string> = { Present: 'good', Absent: 'bad', Late: 'warn', 'Half day': 'warn' };

export function StudentProfile() {
  const { route, go, user } = useApp();
  const id = route.params?.id ?? user.student_ids[0];
  const state = useAsync(() => api.action('student.profile', { id }), [id]);
  const staff = user.role !== 'student' && user.role !== 'parent';
  const kids = useOptions(staff ? undefined : 'students');
  return (
    <div className="stack">
      {kids.length > 1 && <div className="row">{kids.map(k => <button key={k.id} className="btn sm" aria-pressed={k.id === id} onClick={() => go('student', { id: k.id })} style={k.id === id ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>{k.label}</button>)}</div>}
      <Loader state={state}>{p => {
        const s = p.student;
        return <>
          <div className="row" style={{ gap: 14 }}>
            <div className="avatar" style={{ width: 52, height: 52, fontSize: 18 }}>{initials(s.name)}</div>
            <div className="grow"><h1>{s.name}</h1><div className="row muted" style={{ marginTop: 4 }}><span>{p.class_name} · Roll no. {s.roll_no}</span><span className="mono">{s.admission_no}</span><Badge value={s.status} /></div></div>
            {p.results.length > 0 && <button className="btn" onClick={() => go('exams', { student_id: s.id })}>Report cards</button>}
          </div>
          <div className="tiles">
            <Tile label="Attendance" value={`${p.attendance.pct}%`} hint={`${p.attendanceCounts.Absent} absent · ${p.attendanceCounts.Late} late of ${p.attendance.days} days`} />
            <Tile label="Latest result" value={p.results.length ? `${p.results[p.results.length - 1].pct}%` : '—'} hint={p.results.length ? p.results[p.results.length - 1].exam : 'No published exam'} />
            {user.role !== 'teacher' && <Tile label="Fees due" value={money(p.feesDue)} hint={p.nextDue ? `Next due ${fmtDate(p.nextDue.due_date)}` : 'All paid'} tone={p.nextDue ? 'warn' : 'good'} />}
            <Tile label="Library books out" value={p.loans.length} hint={p.loans.some((l: any) => l.overdue) ? 'Overdue' : p.loans.length ? 'On time' : 'None'} tone={p.loans.some((l: any) => l.overdue) ? 'bad' : undefined} />
          </div>
          <div className="grid cols-2">
            <Panel title="Student details">
              <dl className="kv">
                <div><dt>Date of birth</dt><dd>{fmtDate(s.dob)}</dd></div><div><dt>Gender</dt><dd>{s.gender}</dd></div>
                <div><dt>Admitted on</dt><dd>{fmtDate(s.admission_date)}</dd></div><div><dt>Phone</dt><dd className="num">{s.phone ?? '—'}</dd></div>
                <div style={{ gridColumn: '1 / -1' }}><dt>Address</dt><dd>{s.address ?? '—'}</dd></div>
                <div><dt>Bus route</dt><dd>{p.route ? `${p.route.name} (${p.route.vehicle_no})` : 'Not using school transport'}</dd></div>
                <div><dt>Hostel</dt><dd>{p.hostel ? `${p.hostel.block}, room ${p.hostel.room_no}` : 'Day scholar'}</dd></div>
              </dl>
            </Panel>
            <Panel title="Parent or guardian">
              {p.guardian ? <dl className="kv">
                <div><dt>Name</dt><dd style={{ fontWeight: 500 }}>{p.guardian.name}</dd></div><div><dt>Relation</dt><dd>{p.guardian.relation}</dd></div>
                <div><dt>Phone</dt><dd className="num">{p.guardian.phone}</dd></div><div><dt>Email</dt><dd>{p.guardian.email ?? '—'}</dd></div>
                <div><dt>Occupation</dt><dd>{p.guardian.occupation ?? '—'}</dd></div>
              </dl> : <Empty>No guardian on record.</Empty>}
            </Panel>
            <Panel title="Attendance, last 30 school days">
              <div className="row" style={{ gap: 4 }}>
                {[...p.attendanceLog].reverse().map((a: any) => <span key={a.date} className={`badge plain ${TONE[a.status]}`} title={`${fmtDate(a.date)}: ${a.status}`} style={{ width: 26, justifyContent: 'center', padding: '3px 0', borderRadius: 5 }}><b style={{ fontWeight: 600 }}>{MARK[a.status]}</b></span>)}
              </div>
              <p className="small muted" style={{ marginTop: 10 }}>P present · A absent · L late · H half day. Oldest first.</p>
            </Panel>
            <Panel title="Exam results">
              {p.results.length ? <HBars rows={p.results.map((r: any) => ({ label: r.exam, value: r.pct }))} max={100} format={v => `${v}%`} /> : <Empty>No published results yet.</Empty>}
            </Panel>
          </div>
          {user.role !== 'teacher' && <Panel title="Fee invoices" flush>
            {p.invoices.length === 0 ? <Empty>No invoices.</Empty> : <div className="table-wrap"><table>
              <thead><tr><th>Invoice</th><th>For</th><th>Due</th><th className="r">Amount</th><th className="r">Paid</th><th>Status</th></tr></thead>
              <tbody>{p.invoices.map((i: any) => <tr key={i.id}><td className="mono">{i.invoice_no}</td><td>{i.title}</td><td className="num">{fmtDate(i.due_date)}</td><td className="r num">{money(i.amount - i.discount)}</td><td className="r num">{money(i.paid)}</td><td><Badge value={i.status} /></td></tr>)}</tbody>
            </table></div>}
          </Panel>}
        </>;
      }}</Loader>
    </div>
  );
}

const STAGES = ['Applied', 'Shortlisted', 'Interview', 'Offered', 'Enrolled', 'Rejected'];

export function AdmissionsPage() {
  const { toast } = useApp();
  const classes = useOptions('classes');
  const [version, setVersion] = useState(0);
  const all = useAsync(() => api.list('admissions', { limit: 1000 }), [version]);
  const [enrol, setEnrol] = useState<Row | null>(null);
  const [classId, setClassId] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const s = await api.action('admissions.enroll', { id: enrol!.id, class_id: classId });
      clearLookups('students');
      toast(`${s.name} enrolled. Admission no. ${s.admission_no}`); setEnrol(null); setVersion(v => v + 1);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <PageHead title="Admissions" sub="Track each application from enquiry to enrolment. Enrolling creates the student and guardian records." />
      <Loader state={all}>{d => <div className="tiles">{STAGES.map(s => <Tile key={s} label={s} value={d.rows.filter(r => r.status === s).length} />)}</div>}</Loader>
      <ResourceTable resource="admissions" embedded version={version}
        rowActions={row => !['Enrolled', 'Rejected'].includes(row.status) && <button className="btn sm" onClick={() => { setEnrol(row); setClassId(''); setError(''); }}><UserPlus size={14} /> Enrol</button>} />
      {enrol && (
        <Modal title={`Enrol ${enrol.applicant_name}`} onClose={() => setEnrol(null)} footer={<><button className="btn" onClick={() => setEnrol(null)}>Cancel</button><Busy busy={busy} disabled={!classId} className="btn primary" onClick={submit}>Enrol student</Busy></>}>
          <div className="stack">
            {error && <ErrorNote message={error} />}
            <p className="muted">Applied for Grade {enrol.grade_applied}. Guardian: {enrol.guardian_name}, {enrol.phone}.</p>
            <div className="field"><label htmlFor="enrol-class">Section *</label><Select id="enrol-class" value={classId} onChange={setClassId} options={classes.filter(c => c.label.startsWith(`Grade ${enrol.grade_applied}-`))} placeholder="Choose a section" /></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function LeavePage() {
  const { user, toast } = useApp();
  const decide = async (row: Row, status: string, reload: () => void) => {
    try { await api.action('leave.decide', { id: row.id, status }); toast(`Leave ${status.toLowerCase()}`); reload(); } catch (e: any) { toast(e.message, 'bad'); }
  };
  return <ResourceTable resource="leave_requests" title={user.role === 'teacher' ? 'My leave' : 'Leave requests'} sub={user.role === 'admin' ? 'Approve or reject pending requests. Approved unpaid leave is deducted when payroll is prepared.' : 'Apply for leave and track the decision.'}
    rowActions={user.role === 'admin' ? (row, reload) => row.status === 'Pending' && <>
      <button className="btn sm" onClick={() => decide(row, 'Approved', reload)}><Check size={14} /> Approve</button>
      <button className="btn sm danger" onClick={() => decide(row, 'Rejected', reload)}><X size={14} /> Reject</button></> : undefined} />;
}

import { CheckCheck, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ATTENDANCE, DAYS, gradeFor, PERIODS } from '../../../shared/resources';
import { weekday } from '../../../shared/seed';
import { api } from '../api';
import { Badge, Busy, Empty, ErrorNote, fmtDate, Loader, Modal, PageHead, Panel, ResourceTable, Select, Spinner, Tabs, useApp, useAsync, useLabels, useOptions, useSettings } from '../ui';

const Pick = ({ label, id, children }: { label: string; id: string; children: React.ReactNode }) => <div className="field" style={{ flex: '1 1 180px', maxWidth: 260 }}><label htmlFor={id}>{label}</label>{children}</div>;

// ───────────── Attendance ─────────────
export function AttendancePage() {
  const { user, today, route, toast } = useApp();
  const classes = useOptions('classes');
  const [classId, setClassId] = useState<string>(route.params?.class_id ?? '');
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<any[] | null>(null);
  const [marked, setMarked] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const staff = user.role === 'admin' || user.role === 'teacher';

  useEffect(() => {
    if (!staff || !classId || !date) { setRows(null); return; }
    let live = true;
    setError(''); setRows(null);
    api.action('attendance.sheet', { class_id: classId, date }).then(r => { if (live) { setRows(r.students); setMarked(r.marked); } }, e => live && setError(e.message));
    return () => { live = false; };
  }, [classId, date, staff]);

  if (!staff) return <ResourceTable resource="attendance" title="Attendance" sub="Daily attendance as marked by the class teacher." />;

  const counts = Object.fromEntries(ATTENDANCE.map(s => [s, rows?.filter(r => r.status === s).length ?? 0]));
  const set = (i: number, patch: any) => setRows(rs => rs!.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.action('attendance.mark', { class_id: classId, date, entries: rows });
      setMarked(true);
      toast(`Attendance saved: ${r.saved - r.absent} present, ${r.absent} absent`);
    } catch (e: any) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const sunday = weekday(date) === 0;
  return (
    <div className="stack">
      <PageHead title="Attendance" sub="Mark the register once a day for each class. You can correct it later." />
      <Panel>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Pick label="Class" id="att-class"><Select id="att-class" value={classId} onChange={setClassId} options={classes} placeholder="Choose a class" /></Pick>
          <Pick label="Date" id="att-date"><input id="att-date" type="date" className="input" value={date} max={today} onChange={e => setDate(e.target.value)} /></Pick>
          {rows && <div className="row" style={{ flex: '1 1 260px', justifyContent: 'flex-end' }}>
            {marked ? <Badge value="Marked" tone="good" /> : <Badge value="Not marked yet" tone="warn" />}
            <span className="small muted num">{counts.Present} present · {counts.Absent} absent · {counts.Late} late · {counts['Half day']} half day</span>
          </div>}
        </div>
      </Panel>
      {error && <ErrorNote message={error} />}
      {!classId ? <Panel><Empty>Choose a class to open its register.</Empty></Panel> : sunday ? <Panel><Empty>{fmtDate(date)} is a Sunday. Choose a working day.</Empty></Panel> : !rows ? !error && <Spinner /> : (
        <section className="panel">
          <div className="panel-head">
            <h2>{classes.find(c => c.id === classId)?.label} · {fmtDate(date)}</h2>
            <div className="row">
              <button className="btn" onClick={() => setRows(rs => rs!.map(r => ({ ...r, status: 'Present' })))}><CheckCheck size={15} /> All present</button>
              <Busy busy={busy} className="btn primary" onClick={save}><Save size={15} /> Save register</Busy>
            </div>
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th style={{ width: 60 }}>Roll</th><th>Student</th><th>Status</th><th className="hide-sm">Note</th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={r.student_id}>
                <td className="num muted">{r.roll_no}</td><td style={{ fontWeight: 500 }}>{r.name}</td>
                <td><div className="seg" role="group" aria-label={`Status for ${r.name}`}>
                  {ATTENDANCE.map(s => <button key={s} aria-pressed={r.status === s} className={s === 'Absent' ? 't-bad' : s === 'Present' ? '' : 't-warn'} onClick={() => set(i, { status: s })}>{s}</button>)}
                </div></td>
                <td className="hide-sm"><input id={`att-note-${r.student_id}`} className="input" style={{ minWidth: 140 }} placeholder="Optional" value={r.note ?? ''} onChange={e => set(i, { note: e.target.value })} aria-label={`Note for ${r.name}`} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
    </div>
  );
}

// ───────────── Timetable ─────────────
export function TimetablePage() {
  const { user, today, toast } = useApp();
  const family = user.role === 'student' || user.role === 'parent';
  const classes = useOptions('classes');
  const subjects = useOptions('subjects');
  const teachers = useOptions('staff');
  const labels = useLabels(['subjects', 'staff', 'classes']);
  const kids = useAsync(() => (family ? api.list('students', { limit: 20 }) : Promise.resolve({ rows: [], total: 0 })), [family]);
  const [mine, setMine] = useState(user.role === 'teacher');
  const [classId, setClassId] = useState('');
  const [edit, setEdit] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (family && kids.data?.rows[0] && !classId) setClassId(kids.data.rows[0].class_id); }, [kids.data, family, classId]);

  const byTeacher = mine && user.role === 'teacher';
  const state = useAsync(async () => {
    if (byTeacher) return (await api.list('timetable', { filter: { teacher_id: user.staff_id ?? '' }, limit: 200 })).rows;
    if (!classId) return [];
    return (await api.list('timetable', { filter: { class_id: classId }, limit: 200 })).rows;
  }, [classId, byTeacher]);
  const grid = useMemo(() => Object.fromEntries((state.data ?? []).map(t => [`${t.day}-${t.period}`, t])), [state.data]);
  const dow = weekday(today);
  const admin = user.role === 'admin' && !!classId;

  const save = async (clear = false) => {
    setBusy(true);
    try {
      await api.action('timetable.set', { class_id: classId, day: edit.day, period: edit.period, subject_id: clear ? null : edit.subject_id, teacher_id: edit.teacher_id, room: edit.room });
      toast(clear ? 'Period cleared' : 'Timetable updated'); setEdit(null); state.reload();
    } catch (e: any) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <PageHead title="Timetable" sub={admin ? 'Select a period to change its subject, teacher or room. Double-booking a teacher is blocked.' : 'Six working days, seven periods a day.'} />
      <Panel>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          {family ? (kids.data && kids.data.rows.length > 1 && <Pick label="Student" id="tt-kid"><Select id="tt-kid" value={classId} onChange={setClassId} options={kids.data.rows.map(k => ({ id: k.class_id, label: k.name }))} /></Pick>)
            : <Pick label="Class" id="tt-class"><Select id="tt-class" value={byTeacher ? '' : classId} onChange={v => { setClassId(v); setMine(false); }} options={classes} placeholder="Choose a class" /></Pick>}
          {user.role === 'teacher' && <button className="btn" aria-pressed={mine} onClick={() => setMine(true)}>My timetable</button>}
          <span className="grow" />
          <span className="small muted">{byTeacher ? `${state.data?.length ?? 0} periods a week` : classes.find(c => c.id === classId)?.label}</span>
        </div>
      </Panel>
      {!byTeacher && !classId ? <Panel><Empty>Choose a class to see its week.</Empty></Panel> : (
        <Panel flush>
          <Loader state={state}>{() => (
            <div className="table-wrap" style={{ padding: 8 }}>
              <table className="tt">
                <thead><tr><th style={{ width: 96 }} />{DAYS.map((d, i) => <th key={d} style={i + 1 === dow ? { color: 'var(--ink)' } : undefined}>{d}{i + 1 === dow && ' · today'}</th>)}</tr></thead>
                <tbody>{PERIODS.map(p => (
                  <tr key={p.n}>
                    <th style={{ textAlign: 'left' }}><span style={{ color: 'var(--ink)' }}>Period {p.n}</span><br /><span className="num" style={{ fontWeight: 400 }}>{p.time}</span></th>
                    {DAYS.map((_, i) => {
                      const t = grid[`${i + 1}-${p.n}`];
                      const open = () => admin && setEdit({ day: i + 1, period: p.n, subject_id: t?.subject_id ?? '', teacher_id: t?.teacher_id ?? '', room: t?.room ?? '', exists: !!t });
                      return (
                        <td key={i} className={`${t ? '' : 'free'}${i + 1 === dow ? ' now' : ''}${admin ? ' edit' : ''}`} onClick={open} tabIndex={admin ? 0 : undefined} onKeyDown={e => e.key === 'Enter' && open()}>
                          {t ? <><b>{labels.subjects?.[t.subject_id] ?? '…'}</b><span className="muted">{byTeacher ? labels.classes?.[t.class_id] : labels.staff?.[t.teacher_id] ?? 'No teacher'}{t.room ? ` · ${t.room}` : ''}</span></> : <span className="muted">Free</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}</Loader>
        </Panel>
      )}
      {edit && (
        <Modal title={`${classes.find(c => c.id === classId)?.label} · ${DAYS[edit.day - 1]}, period ${edit.period}`} onClose={() => setEdit(null)}
          footer={<>{edit.exists && <Busy busy={busy} className="btn danger" onClick={() => save(true)}>Clear period</Busy>}<span className="grow" /><button className="btn" onClick={() => setEdit(null)}>Cancel</button><Busy busy={busy} className="btn primary" disabled={!edit.subject_id} onClick={() => save()}>Save period</Busy></>}>
          <div className="form-grid">
            <div className="field"><label htmlFor="tt-subject">Subject *</label><Select id="tt-subject" value={edit.subject_id} onChange={v => setEdit({ ...edit, subject_id: v })} options={subjects} placeholder="Choose…" /></div>
            <div className="field"><label htmlFor="tt-teacher">Teacher</label><Select id="tt-teacher" value={edit.teacher_id} onChange={v => setEdit({ ...edit, teacher_id: v })} options={teachers} placeholder="None" /></div>
            <div className="field"><label htmlFor="tt-room">Room</label><input id="tt-room" className="input" value={edit.room} onChange={e => setEdit({ ...edit, room: e.target.value })} placeholder="Class room" /></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ───────────── Exams, marks and report cards ─────────────
function MarksEntry() {
  const { toast } = useApp();
  const exams = useOptions('exams'), classes = useOptions('classes');
  const [examId, setExamId] = useState(''), [classId, setClassId] = useState(''), [subjectId, setSubjectId] = useState('');
  const subjects = useAsync(() => (classId ? api.action('class.subjects', { class_id: classId }) : Promise.resolve([])), [classId]);
  const [sheet, setSheet] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSubjectId(''); }, [classId]);
  useEffect(() => {
    setSheet(null); setError('');
    if (!examId || !classId || !subjectId) return;
    let live = true;
    api.action('marks.sheet', { exam_id: examId, class_id: classId, subject_id: subjectId }).then(s => live && setSheet(s), e => live && setError(e.message));
    return () => { live = false; };
  }, [examId, classId, subjectId]);
  const entered = sheet?.students.filter((s: any) => s.marks !== null && s.marks !== '') ?? [];
  const invalid = entered.some((s: any) => Number(s.marks) < 0 || Number(s.marks) > sheet.max_marks || Number.isNaN(Number(s.marks)));
  const avg = entered.length ? Math.round((entered.reduce((a: number, s: any) => a + Number(s.marks), 0) / entered.length) * 10) / 10 : null;
  const save = async () => {
    setBusy(true);
    try { const r = await api.action('marks.save', { exam_id: examId, class_id: classId, subject_id: subjectId, entries: sheet.students }); toast(`Marks saved (${r.saved} changed)`); }
    catch (e: any) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <Panel>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Pick label="Exam" id="mk-exam"><Select id="mk-exam" value={examId} onChange={setExamId} options={exams} placeholder="Choose an exam" /></Pick>
          <Pick label="Class" id="mk-class"><Select id="mk-class" value={classId} onChange={setClassId} options={classes} placeholder="Choose a class" /></Pick>
          <Pick label="Subject" id="mk-subject"><Select id="mk-subject" value={subjectId} onChange={setSubjectId} options={subjects.data ?? []} placeholder={classId ? 'Choose a subject' : 'Choose a class first'} /></Pick>
        </div>
      </Panel>
      {error && <ErrorNote message={error} />}
      {!sheet ? <Panel><Empty>{examId && classId && subjectId && !error ? 'Loading…' : 'Choose an exam, class and subject to open the mark sheet.'}</Empty></Panel> : (
        <section className="panel">
          <div className="panel-head">
            <div><h2>Mark sheet · out of {sheet.max_marks}</h2><div className="small muted num">{entered.length} of {sheet.students.length} entered{avg !== null && ` · class average ${avg}`}</div></div>
            <div className="row">{sheet.status === 'Published' && <Badge value="Published" />}<Busy busy={busy} disabled={invalid} className="btn primary" onClick={save}><Save size={15} /> Save marks</Busy></div>
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th style={{ width: 60 }}>Roll</th><th>Student</th><th style={{ width: 130 }}>Marks</th><th>Grade</th></tr></thead>
            <tbody>{sheet.students.map((s: any, i: number) => {
              const n = s.marks === null || s.marks === '' ? null : Number(s.marks);
              const bad = n !== null && (Number.isNaN(n) || n < 0 || n > sheet.max_marks);
              return (
                <tr key={s.student_id}><td className="num muted">{s.roll_no}</td><td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td><input id={`mk-${s.student_id}`} type="number" min={0} max={sheet.max_marks} step="0.5" className={`input num${bad ? ' invalid' : ''}`} value={s.marks ?? ''} aria-label={`Marks for ${s.name}`}
                    onChange={e => setSheet({ ...sheet, students: sheet.students.map((x: any, k: number) => (k === i ? { ...x, marks: e.target.value } : x)) })} /></td>
                  <td>{bad ? <span className="small" style={{ color: 'var(--bad)' }}>0 to {sheet.max_marks} only</span> : n === null ? <span className="muted">—</span> : <span className="mono">{gradeFor((n / sheet.max_marks) * 100)}</span>}</td></tr>
              );
            })}</tbody>
          </table></div>
        </section>
      )}
    </div>
  );
}

export function ReportCardView({ studentId, examId }: { studentId: string; examId: string }) {
  const state = useAsync(() => api.action('report.card', { student_id: studentId, exam_id: examId }), [studentId, examId]);
  const settings = useSettings();
  return (
    <Loader state={state}>{c => (
      <div className="card-sheet stack">
        <header><h2 style={{ fontSize: 20 }}>{settings.school_name ?? 'School'}</h2><div className="small muted">{settings.school_address}</div><div className="muted">Progress report · {c.exam.name} · {c.exam.term}</div></header>
        <dl className="kv">
          <div><dt>Student</dt><dd style={{ fontWeight: 600 }}>{c.student.name}</dd></div><div><dt>Admission no.</dt><dd className="mono">{c.student.admission_no}</dd></div>
          <div><dt>Class and roll no.</dt><dd>{c.class_name} · {c.student.roll_no}</dd></div><div><dt>Class teacher</dt><dd>{c.class_teacher ?? '—'}</dd></div>
        </dl>
        {c.subjects.length === 0 ? <Empty>No marks have been entered for this exam.</Empty> : <>
          <div className="table-wrap"><table>
            <thead><tr><th>Subject</th><th className="r">Marks</th><th className="r">Out of</th><th>Grade</th><th className="r">Class average</th><th className="r">Highest</th></tr></thead>
            <tbody>
              {c.subjects.map((s: any) => <tr key={s.subject}><td style={{ fontWeight: 500 }}>{s.subject}</td><td className="r num" style={s.pass ? undefined : { color: 'var(--bad)', fontWeight: 600 }}>{s.marks}</td><td className="r num muted">{s.max_marks}</td><td className="mono">{s.grade}</td><td className="r num muted">{s.average}</td><td className="r num muted">{s.highest}</td></tr>)}
              <tr><td style={{ fontWeight: 600 }}>Total</td><td className="r num" style={{ fontWeight: 600 }}>{c.total}</td><td className="r num muted">{c.max}</td><td className="mono">{c.grade}</td><td /><td /></tr>
            </tbody>
          </table></div>
          <div className="tiles">
            <div className="tile"><span className="label">Percentage</span><span className="value">{c.pct}%</span></div>
            <div className="tile"><span className="label">Overall grade</span><span className="value">{c.grade}</span></div>
            <div className="tile"><span className="label">Class rank</span><span className="value">{c.rank}<span className="muted" style={{ fontSize: 14 }}> of {c.classSize}</span></span></div>
            <div className="tile"><span className="label">Attendance</span><span className="value">{c.attendance.pct}%</span><span className="hint num">{c.attendance.present} of {c.attendance.days} days</span></div>
          </div>
          <div className="row between"><span>Result: <Badge value={c.result} /></span><span className="small muted">Grades follow the nine-point scale: A1 91–100, A2 81–90, B1 71–80, B2 61–70, C1 51–60, C2 41–50, D 33–40, E below 33.</span></div>
        </>}
      </div>
    )}</Loader>
  );
}

function ReportCards() {
  const { user, route } = useApp();
  const family = user.role === 'student' || user.role === 'parent';
  const classes = useOptions(family ? undefined : 'classes');
  const exams = useAsync(() => api.list('exams', { filter: family ? { status: 'Published' } : {}, sort: '-start_date', limit: 50 }), [family]);
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState<string>(route.params?.student_id ?? '');
  const [examId, setExamId] = useState('');
  const students = useAsync(() => (family ? api.list('students', { limit: 20 }) : classId ? api.list('students', { filter: { class_id: classId }, sort: 'roll_no', limit: 100 }) : Promise.resolve({ rows: [], total: 0 })), [classId, family]);
  useEffect(() => { if (!examId && exams.data?.rows.length) setExamId((exams.data.rows.find(e => e.status === 'Published') ?? exams.data.rows[0]).id); }, [exams.data, examId]);
  useEffect(() => { if (family && !studentId && students.data?.rows[0]) setStudentId(students.data.rows[0].id); }, [students.data, family, studentId]);
  return (
    <div className="stack">
      <Panel>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Pick label="Exam" id="rc-exam"><Select id="rc-exam" value={examId} onChange={setExamId} options={(exams.data?.rows ?? []).map(e => ({ id: e.id, label: e.name }))} /></Pick>
          {!family && <Pick label="Class" id="rc-class"><Select id="rc-class" value={classId} onChange={v => { setClassId(v); setStudentId(''); }} options={classes} placeholder="Choose a class" /></Pick>}
          {(!family || (students.data?.rows.length ?? 0) > 1) && <Pick label="Student" id="rc-student"><Select id="rc-student" value={studentId} onChange={setStudentId} options={(students.data?.rows ?? []).map(s => ({ id: s.id, label: family ? s.name : `${s.roll_no}. ${s.name}` }))} placeholder={family ? undefined : classId ? 'Choose a student' : 'Choose a class first'} /></Pick>}
        </div>
      </Panel>
      {studentId && examId ? <ReportCardView studentId={studentId} examId={examId} /> : <Panel><Empty>{family ? 'No published results yet.' : 'Choose a class and a student to see the report card.'}</Empty></Panel>}
    </div>
  );
}

export function ExamsPage() {
  const { user, route } = useApp();
  const family = user.role === 'student' || user.role === 'parent';
  const [tab, setTab] = useState<'schedule' | 'marks' | 'cards'>(route.params?.student_id ? 'cards' : 'schedule');
  if (family) return <div className="stack"><PageHead title="Results" sub="Report cards appear here once the school publishes results." /><ReportCards /></div>;
  return (
    <div className="stack">
      <PageHead title="Exams and results" sub="Schedule exams, enter marks subject by subject, then publish to release report cards to families." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'schedule', label: 'Exam schedule' }, { id: 'marks', label: 'Enter marks' }, { id: 'cards', label: 'Report cards' }]} />
      {tab === 'schedule' && <ResourceTable resource="exams" embedded />}
      {tab === 'marks' && <MarksEntry />}
      {tab === 'cards' && <ReportCards />}
    </div>
  );
}

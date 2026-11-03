// Business operations that span several record types. One implementation, used by the
// API server (POST /api/actions/:name) and by the browser demo.
import { audit } from './access';
import { ATTENDANCE, DAYS, gradeFor } from './resources';
import { addDays, weekday } from './seed';
import { AppError, type Ctx, type Filter, type Role, type Row } from './types';

const all = async (ctx: Ctx, resource: string, filter: Filter = {}, sort?: string): Promise<Row[]> =>
  (await ctx.store.list(resource, { filter, sort, limit: 1_000_000 })).rows;
const byId = (rows: Row[]) => Object.fromEntries(rows.map(r => [r.id, r])) as Record<string, Row>;
const sum = (rows: Row[], f: (r: Row) => number) => rows.reduce((a, r) => a + (f(r) || 0), 0);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const balance = (i: Row) => i.amount - (i.discount ?? 0) - (i.paid ?? 0);
const presentish = (s: string) => s === 'Present' || s === 'Late' || s === 'Half day';
const staffRoles: Role[] = ['admin', 'teacher', 'accountant'];

function assertStudent(ctx: Ctx, studentId: string) {
  if ((ctx.user.role === 'student' || ctx.user.role === 'parent') && !ctx.user.student_ids.includes(studentId))
    throw new AppError(404, 'Student not found');
}
const must = <T,>(v: T | null | undefined, what: string): T => {
  if (v == null) throw new AppError(404, `${what} not found`);
  return v;
};
const lastMonths = (today: string, n: number): string[] => {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - n + i, 1)).toISOString().slice(0, 7));
};
async function nextNumber(ctx: Ctx, resource: string, field: string, prefix: string): Promise<(i: number) => string> {
  const last = (await ctx.store.list(resource, { sort: `-${field}`, limit: 1 })).rows[0];
  const n = last ? parseInt(String(last[field]).split('-').pop()!, 10) || 0 : 0;
  return (i: number) => `${prefix}-${String(n + 1 + i).padStart(5, '0')}`;
}
const yy = (today: string) => { const [y, m] = today.split('-').map(Number); return (m >= 6 ? y : y - 1) % 100; };

async function attendanceTrend(ctx: Ctx, filter: Filter, days: number) {
  const from = addDays(ctx.today, -Math.ceil(days * 1.25) - 1);
  const rows = await all(ctx, 'attendance', { ...filter, date: { gte: from } });
  const by: Record<string, { p: number; n: number }> = {};
  for (const a of rows) { const d = (by[a.date] ??= { p: 0, n: 0 }); d.n++; if (presentish(a.status)) d.p++; }
  return Object.keys(by).sort().slice(-days).map(date => ({ date, pct: pct(by[date].p, by[date].n), present: by[date].p, total: by[date].n }));
}

async function childCard(ctx: Ctx, studentId: string) {
  const student = must(await ctx.store.get('students', studentId), 'Student');
  const cls = await ctx.store.get('classes', student.class_id);
  const att = await all(ctx, 'attendance', { student_id: studentId });
  const invoices = await all(ctx, 'invoices', { student_id: studentId });
  const exams = byId(await all(ctx, 'exams'));
  const marks = await all(ctx, 'marks', { student_id: studentId });
  const perExam: Record<string, { got: number; max: number }> = {};
  for (const m of marks) { const e = (perExam[m.exam_id] ??= { got: 0, max: 0 }); e.got += m.marks; e.max += m.max_marks; }
  const results = Object.entries(perExam).map(([id, v]) => ({ exam_id: id, exam: exams[id]?.name, date: exams[id]?.start_date, pct: pct(v.got, v.max) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const dow = weekday(ctx.today);
  const subjects = byId(await all(ctx, 'subjects'));
  const staff = byId(await all(ctx, 'staff'));
  const tt = dow === 0 ? [] : (await all(ctx, 'timetable', { class_id: student.class_id, day: dow })).sort((a, b) => a.period - b.period)
    .map(t => ({ period: t.period, subject: subjects[t.subject_id]?.name, teacher: staff[t.teacher_id]?.name, room: t.room }));
  const homework = (await all(ctx, 'assignments', { class_id: student.class_id, due_date: { gte: ctx.today } }, 'due_date')).slice(0, 5)
    .map(h => ({ id: h.id, title: h.title, due_date: h.due_date, subject: subjects[h.subject_id]?.name }));
  const loans = await all(ctx, 'book_loans', { student_id: studentId, status: 'Issued' });
  const books = byId(await all(ctx, 'books'));
  return {
    student: { id: student.id, name: student.name, admission_no: student.admission_no, roll_no: student.roll_no },
    class_name: cls?.name ?? '—',
    attendance: { pct: pct(att.filter(a => presentish(a.status)).length, att.length), absent: att.filter(a => a.status === 'Absent').length, days: att.length,
      today: att.find(a => a.date === ctx.today)?.status ?? null },
    feesDue: sum(invoices, balance), nextDue: invoices.filter(i => balance(i) > 0).sort((a, b) => (a.due_date < b.due_date ? -1 : 1))[0] ?? null,
    results, timetable: tt, homework,
    loans: loans.map(l => ({ title: books[l.book_id]?.title, due_on: l.due_on, overdue: l.due_on < ctx.today })),
  };
}

type Handler = { roles: Role[]; run: (ctx: Ctx, p: any) => Promise<any> };

export const ACTIONS: Record<string, Handler> = {
  // ───────────── Dashboards ─────────────
  dashboard: {
    roles: ['admin', 'teacher', 'accountant', 'student', 'parent'],
    async run(ctx) {
      const { role } = ctx.user;
      const month = ctx.today.slice(0, 7);
      const events = (await all(ctx, 'events', { end_date: { gte: ctx.today } }, 'start_date')).slice(0, 6);
      const audience = role === 'student' ? ['Everyone', 'Students'] : role === 'parent' ? ['Everyone', 'Parents'] : ['Everyone', 'Staff', 'Students', 'Parents'];
      const notices = (await all(ctx, 'notices', { audience: { in: audience } }, '-published_on')).slice(0, 5);
      const unread = (await ctx.store.list('messages', { filter: { to_user_id: ctx.user.id, is_read: false }, limit: 1 })).total;
      const base = { role, events, notices, unread, today: ctx.today };

      if (role === 'student' || role === 'parent')
        return { ...base, children: await Promise.all(ctx.user.student_ids.map(id => childCard(ctx, id))) };

      if (role === 'teacher') {
        const classes = await all(ctx, 'classes');
        const mine = classes.filter(c => c.class_teacher_id === ctx.user.staff_id);
        const dow = weekday(ctx.today);
        const subjects = byId(await all(ctx, 'subjects'));
        const classMap = byId(classes);
        const periods = dow === 0 ? [] : (await all(ctx, 'timetable', { teacher_id: ctx.user.staff_id ?? '', day: dow })).sort((a, b) => a.period - b.period)
          .map(t => ({ period: t.period, class_name: classMap[t.class_id]?.name, subject: subjects[t.subject_id]?.name, room: t.room }));
        const myClasses = await Promise.all(mine.map(async c => {
          const strength = (await ctx.store.list('students', { filter: { class_id: c.id, status: 'Active' }, limit: 1 })).total;
          const today = await all(ctx, 'attendance', { class_id: c.id, date: ctx.today });
          return { id: c.id, name: c.name, strength, marked: today.length > 0, present: today.filter(a => presentish(a.status)).length,
            trend: await attendanceTrend(ctx, { class_id: c.id }, 10) };
        }));
        const homework = (await all(ctx, 'assignments', { teacher_id: ctx.user.staff_id ?? '', due_date: { gte: addDays(ctx.today, -2) } }, 'due_date')).slice(0, 6)
          .map(h => ({ ...h, class_name: classMap[h.class_id]?.name, subject: subjects[h.subject_id]?.name }));
        const leave = await all(ctx, 'leave_requests', { staff_id: ctx.user.staff_id ?? '' }, '-from_date');
        const weekly = (await ctx.store.list('timetable', { filter: { teacher_id: ctx.user.staff_id ?? '' }, limit: 1 })).total;
        return { ...base, periods, myClasses, homework, leave: leave.slice(0, 4), weeklyPeriods: weekly };
      }

      // admin and accountant
      const invoices = await all(ctx, 'invoices');
      const months = lastMonths(ctx.today, 6);
      const payments = await all(ctx, 'payments', { paid_on: { gte: months[0] + '-01' } });
      const expenses = await all(ctx, 'expenses', { date: { gte: months[0] + '-01' } });
      const feeByMonth = months.map(m => ({ month: m, collected: sum(payments.filter(p => p.paid_on.startsWith(m)), p => p.amount), spent: sum(expenses.filter(e => e.date.startsWith(m)), e => e.amount) }));
      const outstanding = sum(invoices, balance);
      const overdue = invoices.filter(i => balance(i) > 0 && i.due_date < ctx.today);
      const students = byId(await all(ctx, 'students'));
      const classes = await all(ctx, 'classes');
      const classMap = byId(classes);
      const dues: Record<string, number> = {};
      for (const i of overdue) dues[i.student_id] = (dues[i.student_id] ?? 0) + balance(i);
      const defaulters = Object.entries(dues).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([id, amount]) => ({ id, name: students[id]?.name, class_name: classMap[students[id]?.class_id]?.name, amount }));
      const finance = {
        collectedThisMonth: feeByMonth[feeByMonth.length - 1].collected, outstanding, overdueAmount: sum(overdue, balance), overdueCount: overdue.length,
        billed: sum(invoices, i => i.amount - (i.discount ?? 0)), collected: sum(invoices, i => i.paid),
        spentThisMonth: feeByMonth[feeByMonth.length - 1].spent, feeByMonth, defaulters,
      };
      if (role === 'accountant') {
        const recent = (await ctx.store.list('payments', { sort: '-paid_on', limit: 7 })).rows.map(p => ({ ...p, student: students[p.student_id]?.name }));
        const pendingExpenses = await all(ctx, 'expenses', { status: { in: ['Pending', 'Approved'] } }, '-date');
        const payrollDone = (await ctx.store.list('payroll', { filter: { month }, limit: 1 })).total > 0;
        return { ...base, finance, recent, pendingExpenses, payrollDone, month };
      }
      const active = Object.values(students).filter(s => s.status === 'Active');
      const todayAtt = await all(ctx, 'attendance', { date: ctx.today });
      const markedClasses = new Set(todayAtt.map(a => a.class_id));
      const staff = await all(ctx, 'staff');
      const inventory = await all(ctx, 'inventory_items');
      const loans = await all(ctx, 'book_loans', { status: 'Issued' });
      return {
        ...base, finance,
        counts: {
          students: active.length, girls: active.filter(s => s.gender === 'Female').length, staff: staff.filter(s => s.status !== 'Resigned').length,
          teachers: staff.filter(s => s.category === 'Teaching' && s.status !== 'Resigned').length, classes: classes.length,
          admissionsOpen: (await all(ctx, 'admissions', { status: { in: ['Applied', 'Shortlisted', 'Interview', 'Offered'] } })).length,
          leavePending: (await all(ctx, 'leave_requests', { status: 'Pending' })).length,
          lowStock: inventory.filter(i => i.quantity <= i.reorder_level).length, overdueLoans: loans.filter(l => l.due_on < ctx.today).length,
        },
        attendanceToday: { present: todayAtt.filter(a => presentish(a.status)).length, marked: todayAtt.length, absent: todayAtt.filter(a => a.status === 'Absent').length,
          pct: pct(todayAtt.filter(a => presentish(a.status)).length, todayAtt.length),
          pendingClasses: weekday(ctx.today) === 0 ? [] : classes.filter(c => !markedClasses.has(c.id)).map(c => ({ id: c.id, name: c.name })) },
        attendanceTrend: await attendanceTrend(ctx, {}, 14),
      };
    },
  },

  // ───────────── Attendance ─────────────
  'attendance.sheet': {
    roles: ['admin', 'teacher'],
    async run(ctx, { class_id, date }) {
      const students = await all(ctx, 'students', { class_id, status: 'Active' }, 'roll_no');
      const marked = byId((await all(ctx, 'attendance', { class_id, date })).map(a => ({ ...a, id: a.student_id, att_id: a.id })));
      return { marked: Object.keys(marked).length > 0, students: students.map(s => ({ student_id: s.id, name: s.name, roll_no: s.roll_no, status: marked[s.id]?.status ?? 'Present', note: marked[s.id]?.note ?? '' })) };
    },
  },
  'attendance.mark': {
    roles: ['admin', 'teacher'],
    async run(ctx, { class_id, date, entries }) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new AppError(422, 'Choose a date');
      if (date > ctx.today) throw new AppError(422, 'Attendance cannot be marked for a future date');
      if (weekday(date) === 0) throw new AppError(422, 'Sunday is not a working day');
      const cls = must(await ctx.store.get('classes', class_id), 'Class');
      if (!Array.isArray(entries) || !entries.length) throw new AppError(422, 'No students to mark');
      const valid = new Set((await all(ctx, 'students', { class_id })).map(s => s.id));
      return ctx.store.tx(async s => {
        const existing = byId((await s.list('attendance', { filter: { class_id, date }, limit: 1_000_000 })).rows.map(a => ({ ...a, key: a.student_id })).map(a => ({ ...a, id: a.key, att_id: a.id })));
        const fresh: Row[] = [];
        for (const e of entries) {
          if (!valid.has(e.student_id)) throw new AppError(422, 'A student on this sheet is not in the class');
          if (!ATTENDANCE.includes(e.status)) throw new AppError(422, `Unknown attendance status "${e.status}"`);
          const cur = existing[e.student_id];
          if (cur) { if (cur.status !== e.status || (cur.note ?? '') !== (e.note ?? '')) await s.update('attendance', cur.att_id, { status: e.status, note: e.note || null }); }
          else fresh.push({ id: `att_${e.student_id}_${date}`, student_id: e.student_id, class_id, date, status: e.status, note: e.note || null });
        }
        if (fresh.length) await s.bulkCreate('attendance', fresh);
        const absent = entries.filter((e: any) => e.status === 'Absent').length;
        await audit({ ...ctx, store: s }, 'action', 'attendance', class_id, `Marked attendance for ${cls.name} on ${date}: ${entries.length - absent} present, ${absent} absent`);
        return { saved: entries.length, absent };
      });
    },
  },

  // ───────────── Timetable ─────────────
  'class.subjects': {
    roles: ['admin', 'teacher'],
    async run(ctx, { class_id }) {
      const subjects = byId(await all(ctx, 'subjects'));
      const ids = [...new Set((await all(ctx, 'timetable', { class_id })).map(t => t.subject_id))];
      return ids.map(id => subjects[id]).filter(s => s && s.type !== 'Co-curricular').map(s => ({ id: s.id, label: s.name }));
    },
  },
  'timetable.set': {
    roles: ['admin'],
    async run(ctx, { class_id, day, period, subject_id, teacher_id, room }) {
      const cls = must(await ctx.store.get('classes', class_id), 'Class');
      const cur = (await all(ctx, 'timetable', { class_id, day, period }))[0];
      if (!subject_id) { if (cur) await ctx.store.remove('timetable', cur.id); return { cleared: true }; }
      if (teacher_id) {
        const clash = (await all(ctx, 'timetable', { teacher_id, day, period })).find(t => t.class_id !== class_id);
        if (clash) {
          const other = await ctx.store.get('classes', clash.class_id);
          throw new AppError(409, `That teacher already takes ${other?.name ?? 'another class'} on ${DAYS[day - 1]}, period ${period}`);
        }
      }
      const data = { class_id, day, period, subject_id, teacher_id: teacher_id || null, room: room || cls.room };
      const row = cur ? await ctx.store.update('timetable', cur.id, data) : await ctx.store.create('timetable', data);
      await audit(ctx, 'action', 'timetable', row.id, `Changed ${cls.name} timetable for ${DAYS[day - 1]}, period ${period}`);
      return row;
    },
  },

  // ───────────── Exams ─────────────
  'marks.sheet': {
    roles: ['admin', 'teacher'],
    async run(ctx, { exam_id, class_id, subject_id }) {
      const exam = must(await ctx.store.get('exams', exam_id), 'Exam');
      const students = await all(ctx, 'students', { class_id, status: 'Active' }, 'roll_no');
      const marks = Object.fromEntries((await all(ctx, 'marks', { exam_id, class_id, subject_id })).map(m => [m.student_id, m]));
      return { max_marks: exam.max_marks, status: exam.status, students: students.map(s => ({ student_id: s.id, name: s.name, roll_no: s.roll_no, marks: marks[s.id]?.marks ?? null, grade: marks[s.id]?.grade ?? null })) };
    },
  },
  'marks.save': {
    roles: ['admin', 'teacher'],
    async run(ctx, { exam_id, class_id, subject_id, entries }) {
      const exam = must(await ctx.store.get('exams', exam_id), 'Exam');
      const cls = must(await ctx.store.get('classes', class_id), 'Class');
      const subject = must(await ctx.store.get('subjects', subject_id), 'Subject');
      if (exam.status === 'Published' && ctx.user.role !== 'admin') throw new AppError(409, 'Results for this exam are published. Ask an administrator to make corrections.');
      const valid = new Set((await all(ctx, 'students', { class_id })).map(s => s.id));
      return ctx.store.tx(async s => {
        const cur = Object.fromEntries((await s.list('marks', { filter: { exam_id, class_id, subject_id }, limit: 1_000_000 })).rows.map(m => [m.student_id, m]));
        let saved = 0;
        const fresh: Row[] = [];
        for (const e of entries ?? []) {
          if (e.marks === null || e.marks === '' || e.marks === undefined) continue;
          const m = Number(e.marks);
          if (!valid.has(e.student_id)) throw new AppError(422, 'A student on this sheet is not in the class');
          if (!Number.isFinite(m) || m < 0 || m > exam.max_marks) throw new AppError(422, `Marks must be between 0 and ${exam.max_marks}`);
          const grade = gradeFor((m / exam.max_marks) * 100);
          if (cur[e.student_id]) { if (cur[e.student_id].marks !== m) { await s.update('marks', cur[e.student_id].id, { marks: m, grade }); saved++; } }
          else { fresh.push({ id: `mk_${exam_id}_${e.student_id}_${subject_id}`, exam_id, student_id: e.student_id, class_id, subject_id, marks: m, max_marks: exam.max_marks, grade, remarks: null }); saved++; }
        }
        if (fresh.length) await s.bulkCreate('marks', fresh);
        await audit({ ...ctx, store: s }, 'action', 'marks', exam_id, `Saved ${subject.name} marks for ${cls.name}, ${exam.name} (${saved} changed)`);
        return { saved };
      });
    },
  },
  'report.card': {
    roles: ['admin', 'teacher', 'student', 'parent'],
    async run(ctx, { student_id, exam_id }) {
      assertStudent(ctx, student_id);
      const student = must(await ctx.store.get('students', student_id), 'Student');
      const exam = must(await ctx.store.get('exams', exam_id), 'Exam');
      if (exam.status !== 'Published' && (ctx.user.role === 'student' || ctx.user.role === 'parent')) throw new AppError(409, 'Results for this exam have not been published yet');
      const cls = await ctx.store.get('classes', student.class_id);
      const subjects = byId(await all(ctx, 'subjects'));
      const classMarks = await all(ctx, 'marks', { exam_id, class_id: student.class_id });
      const totals: Record<string, number> = {};
      const bySubject: Record<string, number[]> = {};
      for (const m of classMarks) { totals[m.student_id] = (totals[m.student_id] ?? 0) + m.marks; (bySubject[m.subject_id] ??= []).push(m.marks); }
      const mine = classMarks.filter(m => m.student_id === student_id).sort((a, b) => (subjects[a.subject_id]?.name < subjects[b.subject_id]?.name ? -1 : 1));
      const got = sum(mine, m => m.marks), max = sum(mine, m => m.max_marks);
      const passPct = Number((await all(ctx, 'settings', { key: 'pass_percentage' }))[0]?.value ?? 33);
      const att = await all(ctx, 'attendance', { student_id });
      const teacher = cls?.class_teacher_id ? await ctx.store.get('staff', cls.class_teacher_id) : null;
      return {
        student: { id: student.id, name: student.name, admission_no: student.admission_no, roll_no: student.roll_no, dob: student.dob }, class_name: cls?.name, class_teacher: teacher?.name ?? null,
        exam: { id: exam.id, name: exam.name, term: exam.term, status: exam.status },
        subjects: mine.map(m => ({ subject: subjects[m.subject_id]?.name, marks: m.marks, max_marks: m.max_marks, grade: m.grade, highest: Math.max(...bySubject[m.subject_id]), average: Math.round(sum(bySubject[m.subject_id].map(x => ({ id: '', x })), r => r.x) / bySubject[m.subject_id].length * 10) / 10, pass: (m.marks / m.max_marks) * 100 >= passPct })),
        total: got, max, pct: pct(got, max), grade: max ? gradeFor((got / max) * 100) : '—',
        rank: mine.length ? Object.values(totals).filter(t => t > got).length + 1 : null, classSize: Object.keys(totals).length,
        result: !mine.length ? 'No marks entered' : mine.every(m => (m.marks / m.max_marks) * 100 >= passPct) ? 'Pass' : 'Needs improvement',
        attendance: { present: att.filter(a => presentish(a.status)).length, days: att.length, pct: pct(att.filter(a => presentish(a.status)).length, att.length) },
      };
    },
  },

  // ───────────── Student 360 ─────────────
  'student.profile': {
    roles: ['admin', 'teacher', 'accountant', 'student', 'parent'],
    async run(ctx, { id }) {
      assertStudent(ctx, id);
      const student = must(await ctx.store.get('students', id), 'Student');
      const card = await childCard(ctx, id);
      const showMoney = ctx.user.role !== 'teacher';
      const att = await all(ctx, 'attendance', { student_id: id }, '-date');
      return {
        ...card, student,
        guardian: student.guardian_id ? await ctx.store.get('guardians', student.guardian_id) : null,
        route: student.transport_route_id ? await ctx.store.get('transport_routes', student.transport_route_id) : null,
        hostel: student.hostel_room_id ? await ctx.store.get('hostel_rooms', student.hostel_room_id) : null,
        attendanceLog: att.slice(0, 30).map(a => ({ date: a.date, status: a.status })),
        attendanceCounts: Object.fromEntries(ATTENDANCE.map(s => [s, att.filter(a => a.status === s).length])),
        invoices: showMoney ? await all(ctx, 'invoices', { student_id: id }, '-issue_date') : [],
        payments: showMoney ? await all(ctx, 'payments', { student_id: id }, '-paid_on') : [],
      };
    },
  },

  // ───────────── Fees ─────────────
  'fees.generate': {
    roles: ['admin', 'accountant'],
    async run(ctx, { term, due_date, class_id }) {
      if (!term) throw new AppError(422, 'Choose a term');
      if (!due_date || due_date < ctx.today) throw new AppError(422, 'Choose a due date that is today or later');
      const classes = byId(await all(ctx, 'classes'));
      const students = await all(ctx, 'students', class_id ? { class_id, status: 'Active' } : { status: 'Active' });
      const heads = await all(ctx, 'fee_structures');
      const routes = byId(await all(ctx, 'transport_routes'));
      const rooms = byId(await all(ctx, 'hostel_rooms'));
      const year = (await all(ctx, 'academic_years', { is_current: true }))[0]?.name ?? '';
      const title = `${term} fees ${year}`.trim();
      const done = new Set((await all(ctx, 'invoices', { term, title })).map(i => i.student_id));
      const num = await nextNumber(ctx, 'invoices', 'invoice_no', `INV-${yy(ctx.today)}`);
      const rows: Row[] = [];
      for (const s of students) {
        if (done.has(s.id)) continue;
        const g = classes[s.class_id]?.grade ?? 0;
        const lines = heads.filter(f => g >= f.grade_from && g <= f.grade_to && (f.frequency === 'Per term' || (f.frequency === 'Annual' && term === 'Term 1'))).map(f => ({ name: f.name, amount: f.amount }));
        if (s.transport_route_id && routes[s.transport_route_id]) lines.push({ name: 'Transport fee', amount: routes[s.transport_route_id].fee });
        if (s.hostel_room_id && rooms[s.hostel_room_id]) lines.push({ name: 'Hostel fee', amount: rooms[s.hostel_room_id].fee });
        const amount = lines.reduce((a, l) => a + l.amount, 0);
        if (!amount) continue;
        const n = num(rows.length);
        rows.push({ id: `inv_${n}`, invoice_no: n, student_id: s.id, title, term, issue_date: ctx.today, due_date, amount, discount: 0, paid: 0, status: 'Unpaid', lines });
      }
      if (rows.length) await ctx.store.bulkCreate('invoices', rows);
      await audit(ctx, 'action', 'invoices', '', `Generated ${rows.length} ${term} invoices${class_id ? ` for ${classes[class_id]?.name}` : ''}`);
      return { created: rows.length, skipped: students.length - rows.length, total: sum(rows, r => r.amount) };
    },
  },
  'fees.collect': {
    roles: ['admin', 'accountant'],
    async run(ctx, { invoice_id, amount, method, reference, paid_on }) {
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new AppError(422, 'Enter the amount received');
      if (!['UPI', 'Cash', 'Card', 'Bank transfer', 'Cheque'].includes(method)) throw new AppError(422, 'Choose a payment method');
      return ctx.store.tx(async s => {
        const inv = must(await s.get('invoices', invoice_id), 'Invoice');
        const bal = balance(inv);
        if (bal <= 0) throw new AppError(409, 'This invoice is already paid in full');
        if (amt > bal) throw new AppError(422, `Amount is more than the balance of ${bal}`);
        const num = await nextNumber({ ...ctx, store: s }, 'payments', 'receipt_no', `RCP-${yy(ctx.today)}`);
        const paid = inv.paid + amt;
        const receipt = await s.create('payments', { receipt_no: num(0), invoice_id, student_id: inv.student_id, amount: amt, method, paid_on: paid_on && paid_on <= ctx.today ? paid_on : ctx.today, reference: reference || null, received_by: ctx.user.name });
        const invoice = await s.update('invoices', invoice_id, { paid, status: paid >= inv.amount - (inv.discount ?? 0) ? 'Paid' : 'Partial' });
        await audit({ ...ctx, store: s }, 'action', 'payments', receipt.id, `Receipt ${receipt.receipt_no}: ${amt} received against ${inv.invoice_no} by ${method}`);
        return { receipt, invoice };
      });
    },
  },
  'fees.summary': {
    roles: ['admin', 'accountant'],
    async run(ctx) {
      const invoices = await all(ctx, 'invoices');
      const students = byId(await all(ctx, 'students'));
      const classes = await all(ctx, 'classes', {}, 'grade');
      const byClass: Record<string, { billed: number; paid: number }> = {};
      for (const i of invoices) { const c = (byClass[students[i.student_id]?.class_id] ??= { billed: 0, paid: 0 }); c.billed += i.amount - (i.discount ?? 0); c.paid += i.paid; }
      const byTerm: Record<string, { billed: number; paid: number; count: number; unpaid: number }> = {};
      for (const i of invoices) { const t = (byTerm[i.term ?? 'Other'] ??= { billed: 0, paid: 0, count: 0, unpaid: 0 }); t.billed += i.amount - (i.discount ?? 0); t.paid += i.paid; t.count++; if (balance(i) > 0) t.unpaid++; }
      return {
        billed: sum(invoices, i => i.amount - (i.discount ?? 0)), collected: sum(invoices, i => i.paid), outstanding: sum(invoices, balance),
        overdue: sum(invoices.filter(i => i.due_date < ctx.today), balance), overdueCount: invoices.filter(i => i.due_date < ctx.today && balance(i) > 0).length,
        byClass: classes.map(c => ({ id: c.id, name: c.name, billed: byClass[c.id]?.billed ?? 0, paid: byClass[c.id]?.paid ?? 0 })),
        byTerm: Object.entries(byTerm).map(([term, v]) => ({ term, ...v })).sort((a, b) => (a.term < b.term ? -1 : 1)),
      };
    },
  },

  // ───────────── Payroll ─────────────
  'payroll.run': {
    roles: ['admin', 'accountant'],
    async run(ctx, { month }) {
      if (!/^\d{4}-\d{2}$/.test(month ?? '')) throw new AppError(422, 'Choose a month');
      if (month > ctx.today.slice(0, 7)) throw new AppError(422, 'Payroll cannot be prepared for a future month');
      const staff = await all(ctx, 'staff', { status: { in: ['Active', 'On leave'] } });
      const done = new Set((await all(ctx, 'payroll', { month })).map(p => p.staff_id));
      const leaves = await all(ctx, 'leave_requests', { type: 'Unpaid', status: 'Approved', from_date: { gte: month + '-01', lte: month + '-31' } });
      const rows = staff.filter(s => !done.has(s.id) && s.salary_basic > 0).map(s => {
        const allowances = Math.round(s.salary_basic * 0.3);
        const lop = Math.round((s.salary_basic / 30) * sum(leaves.filter(l => l.staff_id === s.id), l => l.days));
        const deductions = Math.round(s.salary_basic * 0.12) + 200 + lop;
        return { id: `pr_${s.id}_${month}`, staff_id: s.id, month, basic: s.salary_basic, allowances, deductions, net: s.salary_basic + allowances - deductions, status: 'Draft', paid_on: null };
      });
      if (rows.length) await ctx.store.bulkCreate('payroll', rows);
      await audit(ctx, 'action', 'payroll', month, `Prepared ${rows.length} payslips for ${month}`);
      return { created: rows.length, total: sum(rows as any, r => r.net) };
    },
  },
  'payroll.pay': {
    roles: ['admin', 'accountant'],
    async run(ctx, { month }) {
      return ctx.store.tx(async s => {
        const drafts = (await s.list('payroll', { filter: { month, status: 'Draft' }, limit: 1_000_000 })).rows;
        if (!drafts.length) throw new AppError(409, `There are no draft payslips for ${month}`);
        for (const p of drafts) await s.update('payroll', p.id, { status: 'Paid', paid_on: ctx.today });
        const total = sum(drafts, p => p.net);
        await s.create('expenses', { date: ctx.today, category: 'Salaries', description: `Staff salaries for ${month}`, vendor: `${drafts.length} staff`, amount: total, status: 'Paid' });
        await audit({ ...ctx, store: s }, 'action', 'payroll', month, `Released ${drafts.length} salaries for ${month}`);
        return { paid: drafts.length, total };
      });
    },
  },

  // ───────────── Library ─────────────
  'library.issue': {
    roles: ['admin', 'teacher'],
    async run(ctx, { book_id, student_id }) {
      const settings = Object.fromEntries((await all(ctx, 'settings')).map(s => [s.key, s.value]));
      return ctx.store.tx(async s => {
        const book = must(await s.get('books', book_id), 'Book');
        const student = must(await s.get('students', student_id), 'Student');
        if (book.available <= 0) throw new AppError(409, `No copies of "${book.title}" are on the shelf`);
        const open = (await s.list('book_loans', { filter: { student_id, status: 'Issued' }, limit: 100 })).rows;
        if (open.some(l => l.book_id === book_id)) throw new AppError(409, `${student.name} already has this book`);
        if (open.length >= 3) throw new AppError(409, `${student.name} already has 3 books. Return one first.`);
        const loan = await s.create('book_loans', { book_id, student_id, issued_on: ctx.today, due_on: addDays(ctx.today, Number(settings.library_loan_days ?? 14)), returned_on: null, fine: 0, status: 'Issued' });
        await s.update('books', book_id, { available: book.available - 1 });
        return loan;
      });
    },
  },
  'library.return': {
    roles: ['admin', 'teacher'],
    async run(ctx, { loan_id }) {
      const settings = Object.fromEntries((await all(ctx, 'settings')).map(s => [s.key, s.value]));
      return ctx.store.tx(async s => {
        const loan = must(await s.get('book_loans', loan_id), 'Loan');
        if (loan.status === 'Returned') throw new AppError(409, 'This book has already been returned');
        const late = Math.max(0, Math.round((Date.parse(ctx.today) - Date.parse(loan.due_on)) / 864e5));
        const fine = late * Number(settings.library_fine_per_day ?? 2);
        const book = await s.get('books', loan.book_id);
        if (book) await s.update('books', book.id, { available: Math.min(book.copies, book.available + 1) });
        return { loan: await s.update('book_loans', loan_id, { status: 'Returned', returned_on: ctx.today, fine }), late, fine };
      });
    },
  },

  // ───────────── People workflows ─────────────
  'admissions.enroll': {
    roles: ['admin'],
    async run(ctx, { id, class_id }) {
      return ctx.store.tx(async s => {
        const app = must(await s.get('admissions', id), 'Application');
        if (app.status === 'Enrolled') throw new AppError(409, 'This applicant is already enrolled');
        const cls = must(await s.get('classes', class_id), 'Class');
        if (cls.grade !== app.grade_applied) throw new AppError(422, `${cls.name} is not a Grade ${app.grade_applied} class`);
        const strength = (await s.list('students', { filter: { class_id, status: 'Active' }, limit: 1 })).total;
        if (strength >= cls.capacity) throw new AppError(409, `${cls.name} is full (${cls.capacity} seats)`);
        const total = (await s.list('students', { limit: 1 })).total;
        const guardian = await s.create('guardians', { name: app.guardian_name, relation: 'Guardian', phone: app.phone, email: app.email, occupation: null, address: null });
        const student = await s.create('students', {
          admission_no: `MPS${yy(ctx.today)}${String(total + 1).padStart(4, '0')}`, name: app.applicant_name, class_id, roll_no: strength + 1, gender: app.gender, dob: app.dob,
          guardian_id: guardian.id, phone: app.phone, address: null, admission_date: ctx.today, transport_route_id: null, hostel_room_id: null, status: 'Active',
        });
        await s.update('admissions', id, { status: 'Enrolled' });
        await audit({ ...ctx, store: s }, 'action', 'students', student.id, `Enrolled ${student.name} in ${cls.name} (${student.admission_no})`);
        return student;
      });
    },
  },
  'leave.decide': {
    roles: ['admin'],
    async run(ctx, { id, status }) {
      if (!['Approved', 'Rejected'].includes(status)) throw new AppError(422, 'Choose approve or reject');
      const req = must(await ctx.store.get('leave_requests', id), 'Leave request');
      if (req.status !== 'Pending') throw new AppError(409, `This request was already ${req.status.toLowerCase()}`);
      const row = await ctx.store.update('leave_requests', id, { status, decided_by: ctx.user.name });
      await audit(ctx, 'action', 'leave_requests', id, `${status} ${req.days}-day ${req.type.toLowerCase()} leave`);
      return row;
    },
  },
  'messages.read': {
    roles: ['admin', 'teacher', 'accountant', 'student', 'parent'],
    async run(ctx, { id }) {
      const m = must(await ctx.store.get('messages', id), 'Message');
      if (m.to_user_id !== ctx.user.id) return m;
      return ctx.store.update('messages', id, { is_read: true });
    },
  },

  // ───────────── Reports ─────────────
  'reports.overview': {
    roles: staffRoles,
    async run(ctx, { exam_id }) {
      const classes = await all(ctx, 'classes', {}, 'grade');
      const students = await all(ctx, 'students', { status: 'Active' });
      const strength = Array.from({ length: 12 }, (_, i) => {
        const ids = new Set(classes.filter(c => c.grade === i + 1).map(c => c.id));
        const inGrade = students.filter(s => ids.has(s.class_id));
        return { grade: i + 1, girls: inGrade.filter(s => s.gender === 'Female').length, boys: inGrade.filter(s => s.gender !== 'Female').length };
      });
      const att = await all(ctx, 'attendance', { date: { gte: addDays(ctx.today, -35) } });
      const attBy: Record<string, { p: number; n: number }> = {};
      for (const a of att) { const c = (attBy[a.class_id] ??= { p: 0, n: 0 }); c.n++; if (presentish(a.status)) c.p++; }
      const exams = (await all(ctx, 'exams', { status: 'Published' }, '-start_date'));
      const exam = exams.find(e => e.id === exam_id) ?? exams[0];
      let results: any[] = [], grades: Record<string, number> = {}, subjectAvg: any[] = [];
      if (exam) {
        const marks = await all(ctx, 'marks', { exam_id: exam.id });
        const subjects = byId(await all(ctx, 'subjects'));
        const perStudent: Record<string, { got: number; max: number; cls: string; fail: boolean }> = {};
        const perSubject: Record<string, { got: number; max: number }> = {};
        for (const m of marks) {
          const s = (perStudent[m.student_id] ??= { got: 0, max: 0, cls: m.class_id, fail: false });
          s.got += m.marks; s.max += m.max_marks; if ((m.marks / m.max_marks) * 100 < 33) s.fail = true;
          const j = (perSubject[m.subject_id] ??= { got: 0, max: 0 }); j.got += m.marks; j.max += m.max_marks;
        }
        const list = Object.values(perStudent);
        for (const s of list) { const g = gradeFor((s.got / s.max) * 100); grades[g] = (grades[g] ?? 0) + 1; }
        results = classes.map(c => { const l = list.filter(s => s.cls === c.id); return { id: c.id, name: c.name, avg: pct(sum(l as any, s => s.got), sum(l as any, s => s.max)), pass: pct(l.filter(s => !s.fail).length, l.length), students: l.length }; }).filter(r => r.students);
        subjectAvg = Object.entries(perSubject).map(([id, v]) => ({ subject: subjects[id]?.name, avg: pct(v.got, v.max) })).sort((a, b) => b.avg - a.avg);
      }
      const money = ctx.user.role !== 'teacher';
      const months = lastMonths(ctx.today, 6);
      const payments = money ? await all(ctx, 'payments', { paid_on: { gte: months[0] + '-01' } }) : [];
      const expenses = money ? await all(ctx, 'expenses', { date: { gte: months[0] + '-01' } }) : [];
      const cat: Record<string, number> = {};
      for (const e of expenses) cat[e.category] = (cat[e.category] ?? 0) + e.amount;
      return {
        strength, exams: exams.map(e => ({ id: e.id, label: e.name })), exam: exam ? { id: exam.id, name: exam.name } : null,
        attendanceByClass: classes.map(c => ({ id: c.id, name: c.name, pct: pct(attBy[c.id]?.p ?? 0, attBy[c.id]?.n ?? 0) })),
        results, grades: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D', 'E'].map(g => ({ grade: g, count: grades[g] ?? 0 })), subjectAvg,
        finance: money ? { byMonth: months.map(m => ({ month: m, collected: sum(payments.filter(p => p.paid_on.startsWith(m)), p => p.amount), spent: sum(expenses.filter(e => e.date.startsWith(m)), e => e.amount) })),
          byCategory: Object.entries(cat).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount) } : null,
      };
    },
  },
};

export async function runAction(ctx: Ctx, name: string, params: any): Promise<any> {
  const a = ACTIONS[name];
  if (!a) throw new AppError(404, `Unknown operation "${name}"`);
  if (!a.roles.includes(ctx.user.role)) throw new AppError(403, 'Your role cannot do this');
  return a.run(ctx, params ?? {});
}

// End-to-end checks against the real Express app with the in-memory store.
process.env.DB ??= 'memory';
process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../shared/seed';

let base = '', stop = () => {};
const tokens: Record<string, string> = {};

async function call(role: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(role ? { authorization: `Bearer ${tokens[role]}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() as any };
}

before(async () => {
  const { createApp } = await import('../src/app');
  const { openStore } = await import('../src/db/setup');
  const server = createApp((await openStore()).store).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  stop = () => server.close();
  for (const a of DEMO_ACCOUNTS) {
    const r = await call(null, 'POST', '/auth/login', { email: a.email, password: DEMO_PASSWORD });
    assert.equal(r.status, 200, `login ${a.role}`);
    tokens[a.role] = r.body.token;
  }
});
after(() => stop());

test('rejects bad credentials and missing tokens', async () => {
  assert.equal((await call(null, 'POST', '/auth/login', { email: DEMO_ACCOUNTS[0].email, password: 'wrong' })).status, 401);
  assert.equal((await call(null, 'GET', '/students')).status, 401);
});

test('role-wise sign-in rejects an account used under the wrong role', async () => {
  const [admin, teacher] = DEMO_ACCOUNTS;
  assert.equal((await call(null, 'POST', '/auth/login', { email: teacher.email, password: DEMO_PASSWORD, role: 'teacher' })).status, 200);
  const wrong = await call(null, 'POST', '/auth/login', { email: teacher.email, password: DEMO_PASSWORD, role: 'admin' });
  assert.equal(wrong.status, 403);
  assert.ok(!wrong.body.token);
  assert.equal((await call(null, 'POST', '/auth/login', { email: admin.email, password: 'wrong', role: 'teacher' })).status, 401);
});

test('every role gets a dashboard', async () => {
  for (const a of DEMO_ACCOUNTS) assert.equal((await call(a.role, 'POST', '/actions/dashboard', {})).status, 200, a.role);
});

test('students and parents only see their own records', async () => {
  const s = await call('student', 'GET', '/students');
  assert.equal(s.body.total, 1);
  const p = await call('parent', 'GET', '/students');
  assert.equal(p.body.total, 2);
  const inv = await call('parent', 'GET', '/invoices?limit=100');
  const ids = new Set(p.body.rows.map((r: any) => r.id));
  assert.ok(inv.body.rows.length > 0 && inv.body.rows.every((r: any) => ids.has(r.student_id)));
  const all = await call('admin', 'GET', '/students?limit=1');
  const other = (await call('admin', 'GET', `/students?limit=5`)).body.rows.find((r: any) => !ids.has(r.id));
  assert.ok(all.body.total > 300);
  assert.equal((await call('parent', 'GET', `/students/${other.id}`)).status, 404);
  assert.equal((await call('parent', 'POST', '/actions/student.profile', { id: other.id })).status, 404);
});

test('role permissions are enforced', async () => {
  assert.equal((await call('teacher', 'GET', '/invoices')).status, 403);
  assert.equal((await call('student', 'POST', '/students', { name: 'x' })).status, 403);
  assert.equal((await call('accountant', 'POST', '/actions/attendance.mark', {})).status, 403);
  assert.equal((await call('teacher', 'GET', '/users')).status, 403);
  const users = await call('admin', 'GET', '/users');
  assert.ok(users.body.rows.every((u: any) => !('password_hash' in u)));
});

test('validation reports field errors', async () => {
  const r = await call('admin', 'POST', '/staff', { name: '', department: 'Nope' });
  assert.equal(r.status, 422);
  assert.ok(r.body.error.details.name && r.body.error.details.department);
});

test('fee collection updates the invoice and refuses overpayment', async () => {
  const inv = (await call('accountant', 'GET', `/invoices?filter=${encodeURIComponent(JSON.stringify({ status: 'Unpaid' }))}&limit=1`)).body.rows[0];
  const half = Math.floor(inv.amount / 2);
  const r1 = await call('accountant', 'POST', '/actions/fees.collect', { invoice_id: inv.id, amount: half, method: 'UPI' });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.invoice.status, 'Partial');
  assert.equal((await call('accountant', 'POST', '/actions/fees.collect', { invoice_id: inv.id, amount: inv.amount, method: 'UPI' })).status, 422);
  const r2 = await call('accountant', 'POST', '/actions/fees.collect', { invoice_id: inv.id, amount: inv.amount - inv.discount - half, method: 'Cash' });
  assert.equal(r2.body.invoice.status, 'Paid');
  assert.notEqual(r1.body.receipt.receipt_no, r2.body.receipt.receipt_no);
});

test('attendance, marks, payroll and library workflows', async () => {
  const today = (await call('admin', 'POST', '/actions/dashboard', {})).body.today;
  const sheet = await call('teacher', 'POST', '/actions/attendance.sheet', { class_id: 'cls_10A', date: today });
  const entries = sheet.body.students.map((s: any, i: number) => ({ student_id: s.student_id, status: i === 0 ? 'Absent' : 'Present' }));
  const marked = await call('teacher', 'POST', '/actions/attendance.mark', { class_id: 'cls_10A', date: today, entries });
  assert.equal(marked.body.absent, 1);
  assert.equal((await call('teacher', 'POST', '/actions/attendance.mark', { class_id: 'cls_10A', date: '2999-01-01', entries })).status, 422);

  const ms = await call('teacher', 'POST', '/actions/marks.sheet', { exam_id: 'ex_ut2', class_id: 'cls_10A', subject_id: 'sub_MAT' });
  const saved = await call('teacher', 'POST', '/actions/marks.save', { exam_id: 'ex_ut2', class_id: 'cls_10A', subject_id: 'sub_MAT', entries: ms.body.students.map((s: any) => ({ student_id: s.student_id, marks: 40 })) });
  assert.equal(saved.body.saved, ms.body.students.length);
  assert.equal((await call('teacher', 'POST', '/actions/marks.save', { exam_id: 'ex_ut2', class_id: 'cls_10A', subject_id: 'sub_MAT', entries: [{ student_id: ms.body.students[0].student_id, marks: 51 }] })).status, 422);

  const card = await call('student', 'POST', '/actions/report.card', { student_id: sheet.body.students[0].student_id, exam_id: 'ex_t1' });
  assert.ok(card.status === 200 ? card.body.subjects.length >= 5 : card.status === 404);

  const month = today.slice(0, 7);
  const run = await call('accountant', 'POST', '/actions/payroll.run', { month });
  assert.ok(run.body.created > 30);
  assert.equal((await call('accountant', 'POST', '/actions/payroll.run', { month })).body.created, 0);
  assert.equal((await call('accountant', 'POST', '/actions/payroll.pay', { month })).body.paid, run.body.created);

  const book = (await call('admin', 'GET', '/books?limit=1')).body.rows[0];
  const stu = (await call('admin', 'GET', '/students?limit=1&sort=-name')).body.rows[0];
  const loan = await call('admin', 'POST', '/actions/library.issue', { book_id: book.id, student_id: stu.id });
  assert.equal(loan.status, 200);
  assert.equal((await call('admin', 'POST', '/actions/library.issue', { book_id: book.id, student_id: stu.id })).status, 409);
  assert.equal((await call('admin', 'POST', '/actions/library.return', { loan_id: loan.body.id })).body.fine, 0);
});

test('admissions enrolment, timetable clash and audit trail', async () => {
  const app = (await call('admin', 'GET', `/admissions?filter=${encodeURIComponent(JSON.stringify({ status: 'Offered', grade_applied: 1 }))}`)).body.rows[0]
    ?? (await call('admin', 'GET', `/admissions?filter=${encodeURIComponent(JSON.stringify({ status: 'Offered' }))}`)).body.rows[0];
  const cls = (await call('admin', 'GET', `/classes?filter=${encodeURIComponent(JSON.stringify({ grade: app.grade_applied }))}`)).body.rows[0];
  const enrolled = await call('admin', 'POST', '/actions/admissions.enroll', { id: app.id, class_id: cls.id });
  assert.equal(enrolled.status, 200);
  assert.equal(enrolled.body.class_id, cls.id);

  const slots = (await call('admin', 'GET', `/timetable?filter=${encodeURIComponent(JSON.stringify({ day: 1, period: 1 }))}`)).body.rows;
  const clash = await call('admin', 'POST', '/actions/timetable.set', { class_id: slots[0].class_id, day: 1, period: 1, subject_id: slots[1].subject_id, teacher_id: slots[1].teacher_id });
  assert.equal(clash.status, 409);

  const log = await call('admin', 'GET', '/audit_logs?limit=5');
  assert.ok(log.body.total > 5);
  assert.equal((await call('admin', 'DELETE', `/audit_logs/${log.body.rows[0].id}`)).status, 403);
  assert.equal((await call('admin', 'DELETE', '/staff/stf_001')).status, 409);
});

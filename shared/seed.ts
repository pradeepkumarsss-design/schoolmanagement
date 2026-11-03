// Deterministic sample data for a mid-sized K-12 school. Dates are relative to `today`
// so the dashboards always look current.
import { gradeFor } from './resources';
import type { Row } from './types';

export const DEMO_PASSWORD = 'demo1234';
export const DEMO_ACCOUNTS = [
  { role: 'admin', email: 'principal@meridian.example', title: 'Principal (administrator)' },
  { role: 'teacher', email: 'teacher@meridian.example', title: 'Class teacher' },
  { role: 'accountant', email: 'accounts@meridian.example', title: 'Accounts officer' },
  { role: 'student', email: 'student@meridian.example', title: 'Student, Grade 10' },
  { role: 'parent', email: 'parent@meridian.example', title: 'Parent of two' },
] as const;

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const addDays = (iso: string, n: number): string => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const weekday = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDay(); // 0 = Sunday

const GIRLS = ['Aadhya', 'Ananya', 'Diya', 'Kavya', 'Meera', 'Nithya', 'Priya', 'Riya', 'Sahana', 'Tanvi', 'Varsha', 'Yamini', 'Ishita', 'Lakshmi', 'Pooja', 'Shreya', 'Divya', 'Harini', 'Janani', 'Keerthana', 'Madhumitha', 'Nandini', 'Swathi', 'Trisha', 'Fathima', 'Sara', 'Angel', 'Zoya'];
const BOYS = ['Aarav', 'Aditya', 'Arjun', 'Dhruv', 'Karthik', 'Kiran', 'Manoj', 'Naveen', 'Pranav', 'Rahul', 'Rohan', 'Sanjay', 'Surya', 'Varun', 'Vikram', 'Yash', 'Ashwin', 'Bharath', 'Gokul', 'Hari', 'Lokesh', 'Mithun', 'Nikhil', 'Vishal', 'Imran', 'Joel', 'Kabir', 'Farhan'];
const SURNAMES = ['Iyer', 'Nair', 'Reddy', 'Sharma', 'Pillai', 'Menon', 'Rao', 'Gupta', 'Krishnan', 'Subramanian', 'Verma', 'Naidu', 'Chettiar', 'Fernandes', 'Khan', 'Joseph', 'Balaji', 'Murugan', 'Sundaram', 'Rajan', 'Mehta', 'Das', 'Thomas', 'Shetty', 'Venkatesh', 'Kumar', 'Patel', 'Ahmed'];
const AREAS = ['Anna Nagar', 'Gandhi Road', 'Lake View Colony', 'Temple Street', 'Railway Colony', 'Nehru Nagar', 'Market Road', 'Hill View Layout', 'Kamaraj Salai', 'Bharathi Park'];
const JOBS = ['Engineer', 'Doctor', 'Shop owner', 'Bank officer', 'Teacher', 'Farmer', 'Civil servant', 'Accountant', 'Nurse', 'Software developer', 'Textile trader', 'Lawyer'];

export function buildSeed(today: string): Record<string, Row[]> {
  const r = rng(20260608);
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const between = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const phone = () => `9${between(4, 9)}${String(between(10000000, 99999999))}`;
  const pad = (n: number, w = 4) => String(n).padStart(w, '0');
  const [ty, tm] = today.split('-').map(Number);
  const ayStartYear = tm >= 6 ? ty : ty - 1;
  const ayName = `${ayStartYear}-${String((ayStartYear + 1) % 100).padStart(2, '0')}`;

  const db: Record<string, Row[]> = {};

  db.academic_years = [
    { id: 'ay_cur', name: ayName, start_date: `${ayStartYear}-06-08`, end_date: `${ayStartYear + 1}-04-15`, is_current: true },
    { id: 'ay_prev', name: `${ayStartYear - 1}-${String(ayStartYear % 100).padStart(2, '0')}`, start_date: `${ayStartYear - 1}-06-09`, end_date: `${ayStartYear}-04-14`, is_current: false },
  ];

  // ── Subjects
  const SUBJ: [string, string, string][] = [
    ['English', 'ENG', 'Language'], ['Tamil', 'TAM', 'Language'], ['Hindi', 'HIN', 'Language'], ['Mathematics', 'MAT', 'Core'],
    ['Environmental Studies', 'EVS', 'Core'], ['Science', 'SCI', 'Core'], ['Social Science', 'SST', 'Core'], ['Computer Science', 'CSC', 'Core'],
    ['Physics', 'PHY', 'Core'], ['Chemistry', 'CHE', 'Core'], ['Biology', 'BIO', 'Elective'], ['Art & Craft', 'ART', 'Co-curricular'], ['Physical Education', 'PED', 'Co-curricular'],
  ];
  db.subjects = SUBJ.map(([name, code, type]) => ({ id: `sub_${code}`, name, code, type }));
  const subjectsFor = (g: number) => g <= 5 ? ['ENG', 'TAM', 'MAT', 'EVS', 'ART', 'PED']
    : g <= 10 ? ['ENG', 'TAM', 'HIN', 'MAT', 'SCI', 'SST', 'CSC', 'PED']
      : ['ENG', 'MAT', 'PHY', 'CHE', g === 11 ? 'BIO' : 'CSC', 'PED'];
  const DEPT: Record<string, string> = { ENG: 'Languages', TAM: 'Languages', HIN: 'Languages', MAT: 'Mathematics', EVS: 'Science', SCI: 'Science', PHY: 'Science', CHE: 'Science', BIO: 'Science', SST: 'Social Science', CSC: 'Computer Science', ART: 'Arts & Sports', PED: 'Arts & Sports' };

  // ── Staff
  const staff: Row[] = [];
  const teachersBySubject: Record<string, string[]> = {};
  let emp = 1;
  const addStaff = (department: string, designation: string, category: string, basic: number, subj?: string) => {
    const female = r() < 0.6;
    const name = `${female ? pick(GIRLS) : pick(BOYS)} ${pick(SURNAMES)}`;
    const id = `stf_${pad(emp, 3)}`;
    staff.push({
      id, emp_no: `MPS-E${pad(emp, 3)}`, name, department, designation, category,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}${emp}@meridian.example`, phone: phone(),
      qualification: category === 'Teaching' ? pick(['M.Sc., B.Ed.', 'M.A., B.Ed.', 'B.Sc., B.Ed.', 'M.Sc., M.Ed.', 'M.A., M.Phil.']) : pick(['B.Com.', 'B.A.', 'Diploma', 'M.B.A.']),
      join_date: `${between(2009, ayStartYear)}-${pad(between(1, 12), 2)}-${pad(between(1, 28), 2)}`,
      salary_basic: basic + between(0, 8) * 1500, status: 'Active',
    });
    if (subj) (teachersBySubject[subj] ??= []).push(id);
    emp++;
    return id;
  };
  const TEACH: [string, number][] = [['ENG', 5], ['TAM', 4], ['HIN', 2], ['MAT', 6], ['EVS', 3], ['SCI', 3], ['SST', 2], ['CSC', 2], ['PHY', 1], ['CHE', 1], ['BIO', 1], ['ART', 2], ['PED', 4]];
  for (const [code, n] of TEACH) for (let i = 0; i < n; i++)
    addStaff(DEPT[code], i === 0 && n > 2 ? 'Head of department' : ['PHY', 'CHE', 'BIO'].includes(code) ? 'Post-graduate teacher' : 'Trained graduate teacher', 'Teaching', 42000, code);
  const accountsId = addStaff('Accounts', 'Accounts officer', 'Non-teaching', 38000);
  addStaff('Accounts', 'Fee counter clerk', 'Non-teaching', 24000);
  addStaff('Administration', 'Office superintendent', 'Non-teaching', 36000);
  addStaff('Administration', 'Front office executive', 'Non-teaching', 22000);
  addStaff('Library', 'Librarian', 'Non-teaching', 30000);
  addStaff('Transport', 'Transport in-charge', 'Non-teaching', 26000);
  addStaff('Administration', 'Lab assistant', 'Non-teaching', 21000);
  addStaff('Administration', 'Hostel warden', 'Non-teaching', 25000);
  staff[staff.length - 3].status = 'On leave';
  db.staff = staff;
  const staffName = (id: string) => staff.find(s => s.id === id)!.name;

  // ── Classes
  const classes: Row[] = [];
  const allTeachers = staff.filter(s => s.category === 'Teaching').map(s => s.id);
  let ci = 0;
  for (let g = 1; g <= 12; g++) for (const section of ['A', 'B']) {
    classes.push({ id: `cls_${pad(g, 2)}${section}`, name: `Grade ${g}-${section}`, grade: g, section, class_teacher_id: allTeachers[ci % allTeachers.length], room: `${g <= 5 ? 'P' : g <= 10 ? 'M' : 'S'}-${100 + ci + 1}`, capacity: 40 });
    ci++;
  }
  db.classes = classes;

  // ── Transport, hostel
  const ROUTES: [string, string][] = [['Route 1 · North', 'Bus stand, Anna Nagar, Lake View Colony'], ['Route 2 · East', 'Railway Colony, Market Road, Nehru Nagar'], ['Route 3 · South', 'Temple Street, Kamaraj Salai, Bharathi Park'], ['Route 4 · West', 'Hill View Layout, Gandhi Road'], ['Route 5 · Bypass', 'Collectorate, Ring Road Junction, New Housing Board'], ['Route 6 · Town', 'Clock Tower, Old Bazaar, Head Post Office']];
  db.transport_routes = ROUTES.map(([name, stops], i) => ({ id: `rt_${i + 1}`, name, vehicle_no: `TN 57 A${String.fromCharCode(66 + i)} ${between(1000, 9999)}`, driver: `${pick(BOYS)} ${pick(SURNAMES)}`, driver_phone: phone(), capacity: 42, stops, fee: 4500 + i * 300 }));
  db.hostel_rooms = [];
  for (const block of ['A', 'B']) for (let n = 1; n <= 6; n++) {
    const type = n <= 2 ? 'Dormitory' : n <= 4 ? 'Triple' : 'Double';
    db.hostel_rooms.push({ id: `hr_${block}${n}`, block: `${block} Block`, room_no: `${block}${100 + n}`, type, capacity: type === 'Dormitory' ? 8 : type === 'Triple' ? 3 : 2, warden: block === 'A' ? staff[staff.length - 1].name : 'Sr. Mary Joseph', fee: type === 'Dormitory' ? 22000 : type === 'Triple' ? 28000 : 34000 });
  }

  // ── Students and guardians
  const students: Row[] = [], guardians: Row[] = [];
  let sn = 1, gn = 1;
  const ability: Record<string, number> = {};
  const mkGuardian = (surname: string) => {
    const mother = r() < 0.45;
    const name = `${mother ? pick(GIRLS) : pick(BOYS)} ${surname}`;
    const id = `grd_${pad(gn++)}`;
    guardians.push({ id, name, relation: mother ? 'Mother' : 'Father', phone: phone(), email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@mail.example`, occupation: pick(JOBS), address: `${between(1, 240)}, ${pick(AREAS)}` });
    return id;
  };
  for (const c of classes) {
    const n = between(12, 15);
    for (let i = 1; i <= n; i++) {
      const female = r() < 0.5;
      const surname = pick(SURNAMES);
      const id = `stu_${pad(sn)}`;
      const yearOfBirth = ayStartYear - 5 - c.grade;
      students.push({
        id, admission_no: `MPS${String(ayStartYear - c.grade + 1).slice(2)}${pad(sn)}`, name: `${female ? pick(GIRLS) : pick(BOYS)} ${surname}`, class_id: c.id, roll_no: i,
        gender: female ? 'Female' : 'Male', dob: `${yearOfBirth - (r() < 0.5 ? 0 : 1)}-${pad(between(1, 12), 2)}-${pad(between(1, 28), 2)}`,
        guardian_id: mkGuardian(surname), phone: phone(), address: guardians[guardians.length - 1].address,
        admission_date: `${ayStartYear - Math.min(c.grade - 1, between(0, 6))}-06-${pad(between(3, 12), 2)}`,
        transport_route_id: r() < 0.42 ? `rt_${between(1, 6)}` : null,
        hostel_room_id: c.grade >= 6 && r() < 0.09 ? pick(db.hostel_rooms).id : null, status: 'Active',
      });
      ability[id] = 0.45 + r() * 0.5;
      sn++;
    }
  }
  // The demo parent has two children: one in 10-A and one in 6-B.
  const demoStudent = students.find(s => s.class_id === 'cls_10A')!;
  const demoSibling = students.find(s => s.class_id === 'cls_06B')!;
  const demoGuardian = guardians.find(g => g.id === demoStudent.guardian_id)!;
  const fam = demoGuardian.name.split(' ').pop()!;
  demoSibling.guardian_id = demoGuardian.id;
  demoSibling.name = `${demoSibling.name.split(' ')[0]} ${fam}`;
  demoStudent.name = `${demoStudent.name.split(' ')[0]} ${fam}`;
  demoSibling.address = demoStudent.address;
  ability[demoStudent.id] = 0.86; ability[demoSibling.id] = 0.71;
  db.students = students; db.guardians = guardians;
  const classOf = Object.fromEntries(classes.map(c => [c.id, c]));

  // ── Timetable: every class gets a weekly quota per subject, teachers are assigned so
  //    workloads stay balanced, and no teacher is ever double-booked.
  const weekly = (g: number): Record<string, number> => g <= 5 ? { ENG: 8, TAM: 7, MAT: 8, EVS: 8, ART: 5, PED: 6 }
    : g <= 10 ? { ENG: 6, TAM: 5, HIN: 4, MAT: 7, SCI: 7, SST: 6, CSC: 3, PED: 4 }
      : { ENG: 7, MAT: 8, PHY: 8, CHE: 8, [g === 11 ? 'BIO' : 'CSC']: 7, PED: 4 };
  const timetable: Row[] = [];
  const busy = new Set<string>();
  const load: Record<string, number> = {};
  const classSubjectTeacher: Record<string, Record<string, string>> = {};
  const left: Record<string, Record<string, number>> = {};
  for (const c of classes) {
    const map: Record<string, string> = {};
    for (const [code, n] of Object.entries(weekly(c.grade))) {
      const teacher = [...teachersBySubject[code]].sort((x, y) => (load[x] ?? 0) - (load[y] ?? 0))[0];
      load[teacher] = (load[teacher] ?? 0) + n;
      map[code] = teacher;
    }
    classSubjectTeacher[c.id] = map;
    left[c.id] = { ...weekly(c.grade) };
  }
  // A class teacher always teaches their own class.
  const taken = new Set<string>();
  for (const c of classes) {
    const own = Object.entries(classSubjectTeacher[c.id]).filter(([code]) => code !== 'PED' && code !== 'ART').map(([, id]) => id);
    c.class_teacher_id = own.find(id => !taken.has(id)) ?? own[0];
    taken.add(c.class_teacher_id);
  }
  const demoTeacherId = classes.find(c => c.id === 'cls_10A')!.class_teacher_id;
  for (let day = 1; day <= 6; day++) {
    const today_: Record<string, Record<string, number>> = {};
    for (let period = 1; period <= 7; period++) classes.forEach((c, idx) => {
      const used = (today_[c.id] ??= {});
      const options = Object.keys(left[c.id])
        .filter(code => left[c.id][code] > 0 && (used[code] ?? 0) < 2 && !busy.has(`${classSubjectTeacher[c.id][code]}|${day}|${period}`))
        // Most remaining periods first; sport and art drift to the afternoon; rotate ties by class.
        .sort((x, y) => (left[c.id][y] - (used[y] ?? 0) * 3 - (['PED', 'ART'].includes(y) && period < 5 ? 4 : 0)) - (left[c.id][x] - (used[x] ?? 0) * 3 - (['PED', 'ART'].includes(x) && period < 5 ? 4 : 0)) || ((x.charCodeAt(1) + idx + day) % 3) - 1);
      const code = options[0];
      if (!code) return;
      const teacher = classSubjectTeacher[c.id][code];
      busy.add(`${teacher}|${day}|${period}`);
      left[c.id][code]--; used[code] = (used[code] ?? 0) + 1;
      timetable.push({ id: `tt_${c.id}_${day}${period}`, class_id: c.id, day, period, subject_id: `sub_${code}`, teacher_id: teacher, room: code === 'CSC' ? 'Computer lab' : code === 'PED' ? 'Ground' : ['PHY', 'CHE', 'BIO'].includes(code) && used[code] === 2 ? 'Science lab' : c.room });
    });
  }
  db.timetable = timetable;

  // ── Attendance: the last 30 school days. A third of classes have not marked today yet.
  const attendance: Row[] = [];
  const schoolDays: string[] = [];
  for (let d = today; schoolDays.length < 30; d = addDays(d, -1)) if (weekday(d) !== 0) schoolDays.push(d);
  const chronic = new Set(students.filter(() => r() < 0.05).map(s => s.id));
  for (const date of schoolDays) for (const s of students) {
    if (date === today && classes.findIndex(c => c.id === s.class_id) % 3 === 0) continue;
    const x = r();
    const pAbsent = chronic.has(s.id) ? 0.22 : 0.035;
    const status = x < pAbsent ? 'Absent' : x < pAbsent + 0.03 ? 'Late' : x < pAbsent + 0.04 ? 'Half day' : 'Present';
    attendance.push({ id: `att_${s.id}_${date}`, student_id: s.id, class_id: s.class_id, date, status, note: null });
  }
  db.attendance = attendance;

  // ── Exams and marks
  db.exams = [
    { id: 'ex_ut1', name: 'Unit Test 1', term: 'Term 1', start_date: addDays(today, -92), end_date: addDays(today, -88), max_marks: 50, status: 'Published' },
    { id: 'ex_t1', name: 'Term 1 Examination', term: 'Term 1', start_date: addDays(today, -38), end_date: addDays(today, -29), max_marks: 100, status: 'Published' },
    { id: 'ex_ut2', name: 'Unit Test 2', term: 'Term 2', start_date: addDays(today, 16), end_date: addDays(today, 20), max_marks: 50, status: 'Scheduled' },
    { id: 'ex_t2', name: 'Term 2 Examination', term: 'Term 2', start_date: addDays(today, 64), end_date: addDays(today, 73), max_marks: 100, status: 'Scheduled' },
  ];
  const marks: Row[] = [];
  for (const ex of db.exams.filter(e => e.status === 'Published')) for (const s of students) {
    for (const code of subjectsFor(classOf[s.class_id].grade).filter(x => x !== 'PED' && x !== 'ART')) {
      const pct = Math.max(0.12, Math.min(1, ability[s.id] + (r() - 0.5) * 0.3 + (code === 'MAT' ? -0.04 : 0.02)));
      const m = Math.round(pct * ex.max_marks);
      marks.push({ id: `mk_${ex.id}_${s.id}_${code}`, exam_id: ex.id, student_id: s.id, class_id: s.class_id, subject_id: `sub_${code}`, marks: m, max_marks: ex.max_marks, grade: gradeFor((m / ex.max_marks) * 100), remarks: null });
    }
  }
  db.marks = marks;

  db.assignments = [];
  const HW = ['Worksheet', 'Chapter exercise', 'Lab record', 'Essay', 'Project chart', 'Revision test prep', 'Map work', 'Reading log'];
  classes.forEach((c, idx) => {
    const codes = subjectsFor(c.grade).filter(x => x !== 'PED' && x !== 'ART');
    for (let k = 0; k < 3; k++) {
      const code = codes[(idx + k * 2) % codes.length];
      const due = addDays(today, between(-6, 9));
      db.assignments.push({ id: `hw_${c.id}_${k}`, title: `${SUBJ.find(s => s[1] === code)![0]}: ${pick(HW)} ${between(3, 9)}`, class_id: c.id, subject_id: `sub_${code}`, teacher_id: classSubjectTeacher[c.id][code], assigned_on: addDays(due, -between(3, 6)), due_date: due, description: 'Complete in the class notebook and submit to the subject teacher before the first period on the due date.' });
    }
  });

  // ── Fees
  db.fee_structures = [
    { id: 'fs_1', name: 'Tuition fee', grade_from: 1, grade_to: 5, amount: 18000, frequency: 'Per term' },
    { id: 'fs_2', name: 'Tuition fee', grade_from: 6, grade_to: 8, amount: 24000, frequency: 'Per term' },
    { id: 'fs_3', name: 'Tuition fee', grade_from: 9, grade_to: 10, amount: 30000, frequency: 'Per term' },
    { id: 'fs_4', name: 'Tuition fee', grade_from: 11, grade_to: 12, amount: 38000, frequency: 'Per term' },
    { id: 'fs_5', name: 'Activity & sports fee', grade_from: 1, grade_to: 12, amount: 2500, frequency: 'Per term' },
    { id: 'fs_6', name: 'Laboratory fee', grade_from: 6, grade_to: 12, amount: 3000, frequency: 'Per term' },
    { id: 'fs_7', name: 'Annual development fee', grade_from: 1, grade_to: 12, amount: 6000, frequency: 'Annual' },
    { id: 'fs_8', name: 'Admission fee', grade_from: 1, grade_to: 12, amount: 10000, frequency: 'One time' },
  ];
  const invoices: Row[] = [], payments: Row[] = [];
  let invNo = 1, rcNo = 1;
  const METHODS = ['UPI', 'UPI', 'UPI', 'Bank transfer', 'Cash', 'Card', 'Cheque'];
  const termFees = (s: Row, term: string) => {
    const g = classOf[s.class_id].grade;
    const lines = db.fee_structures.filter(f => g >= f.grade_from && g <= f.grade_to && (f.frequency === 'Per term' || (f.frequency === 'Annual' && term === 'Term 1'))).map(f => ({ name: f.name, amount: f.amount }));
    if (s.transport_route_id) lines.push({ name: 'Transport fee', amount: db.transport_routes.find(t => t.id === s.transport_route_id)!.fee });
    if (s.hostel_room_id) lines.push({ name: 'Hostel fee', amount: db.hostel_rooms.find(h => h.id === s.hostel_room_id)!.fee });
    return lines;
  };
  const mkInvoices = (term: string, issue: string, due: string, pPaid: number, pPartial: number, payWindow: number) => {
    for (const s of students) {
      const lines = termFees(s, term);
      const amount = lines.reduce((a, l) => a + l.amount, 0);
      const discount = r() < 0.06 ? Math.round(amount * 0.1 / 500) * 500 : 0;
      const net = amount - discount;
      const x = s.id === demoStudent.id ? (term === 'Term 1' ? 0 : 1) : s.id === demoSibling.id ? (term === 'Term 1' ? 0 : pPaid + 0.01) : r();
      const paid = x < pPaid ? net : x < pPaid + pPartial ? Math.round(net * pick([0.4, 0.5, 0.6]) / 500) * 500 : 0;
      const id = `inv_${pad(invNo, 5)}`;
      invoices.push({ id, invoice_no: `INV-${ayStartYear % 100}-${pad(invNo, 5)}`, student_id: s.id, title: `${term} fees ${ayName}`, term, issue_date: issue, due_date: due, amount, discount, paid, status: paid <= 0 ? 'Unpaid' : paid >= net ? 'Paid' : 'Partial', lines });
      invNo++;
      if (paid > 0) {
        const paidOn = addDays(issue, between(1, payWindow));
        payments.push({ id: `pay_${pad(rcNo, 5)}`, receipt_no: `RCP-${ayStartYear % 100}-${pad(rcNo, 5)}`, invoice_id: id, student_id: s.id, amount: paid, method: pick(METHODS), paid_on: paidOn > today ? today : paidOn, reference: `TXN${between(100000000, 999999999)}`, received_by: staffName(accountsId) });
        rcNo++;
      }
    }
  };
  mkInvoices('Term 1', addDays(today, -118), addDays(today, -88), 0.9, 0.05, 75);
  mkInvoices('Term 2', addDays(today, -9), addDays(today, 12), 0.34, 0.08, 9);
  db.invoices = invoices; db.payments = payments;

  const monthOf = (offset: number) => { const d = new Date(Date.UTC(ty, tm - 1 + offset, 1)); return d.toISOString().slice(0, 7); };
  db.payroll = [];
  for (let m = -3; m <= -1; m++) for (const s of staff) {
    const allowances = Math.round(s.salary_basic * 0.3), deductions = Math.round(s.salary_basic * 0.12) + 200;
    db.payroll.push({ id: `pr_${s.id}_${monthOf(m)}`, staff_id: s.id, month: monthOf(m), basic: s.salary_basic, allowances, deductions, net: s.salary_basic + allowances - deductions, status: 'Paid', paid_on: `${monthOf(m + 1)}-01` });
  }
  const EXP: [string, string, string, number][] = [['Utilities', 'Electricity bill', 'TANGEDCO', 68000], ['Utilities', 'Water tanker supply', 'Sri Vari Water', 14500], ['Maintenance', 'Classroom repainting', 'Balaji Painters', 86000], ['Lab & supplies', 'Chemistry lab reagents', 'SciMart Traders', 31200], ['Transport', 'Diesel for buses', 'Indian Oil dealer', 92000], ['Transport', 'Bus servicing', 'Ashok Motors', 27500], ['Events', 'Sports day arrangements', 'Royal Decorators', 45000], ['Technology', 'Internet leased line', 'BSNL', 18000], ['Technology', 'Projector lamps', 'Vision Systems', 22400], ['Maintenance', 'Plumbing repairs', 'KR Hardware', 9800], ['Other', 'Printing of report cards', 'Sivakasi Offset', 16700], ['Lab & supplies', 'Library book purchase', 'Higginbothams', 38900]];
  db.expenses = [];
  for (let i = 0; i < 46; i++) {
    const [category, description, vendor, base] = EXP[i % EXP.length];
    const dt = addDays(today, i < 5 ? -(i + 1) : -between(9, 150));
    db.expenses.push({ id: `exp_${pad(i + 1, 3)}`, date: dt, category, description, vendor, amount: Math.round(base * (0.8 + r() * 0.4) / 100) * 100, status: dt > addDays(today, -8) ? pick(['Pending', 'Approved']) : 'Paid' });
  }

  for (let m = -3; m <= -1; m++)
    db.expenses.push({ id: `exp_sal_${monthOf(m)}`, date: `${monthOf(m + 1)}-01`, category: 'Salaries', description: `Staff salaries for ${monthOf(m)}`, vendor: `${staff.length} staff`, amount: db.payroll.filter(p => p.month === monthOf(m)).reduce((a, p) => a + p.net, 0), status: 'Paid' });

  // ── Library, inventory
  const BOOKS: [string, string, string][] = [['Wings of Fire', 'A. P. J. Abdul Kalam', 'Biography'], ['Malgudi Days', 'R. K. Narayan', 'Fiction'], ['Swami and Friends', 'R. K. Narayan', 'Fiction'], ['Ponniyin Selvan (Vol. 1)', 'Kalki Krishnamurthy', 'Tamil'], ['Thirukkural with commentary', 'Thiruvalluvar', 'Tamil'], ['The Discovery of India', 'Jawaharlal Nehru', 'History'], ['India After Gandhi', 'Ramachandra Guha', 'History'], ['Concepts of Physics (Vol. 1)', 'H. C. Verma', 'Science'], ['Concepts of Physics (Vol. 2)', 'H. C. Verma', 'Science'], ['Mathematics for Class 10', 'R. D. Sharma', 'Mathematics'], ['Mathematics for Class 12', 'R. S. Aggarwal', 'Mathematics'], ['A Brief History of Time', 'Stephen Hawking', 'Science'], ['The Jungle Book', 'Rudyard Kipling', 'Fiction'], ['Godan', 'Munshi Premchand', 'Hindi'], ['Madhushala', 'Harivansh Rai Bachchan', 'Hindi'], ['Oxford School Atlas', 'Oxford University Press', 'Reference'], ['Oxford English Dictionary (School)', 'Oxford University Press', 'Reference'], ['The Story of My Experiments with Truth', 'M. K. Gandhi', 'Biography'], ['Ignited Minds', 'A. P. J. Abdul Kalam', 'Biography'], ['The Blue Umbrella', 'Ruskin Bond', 'Fiction'], ['The Room on the Roof', 'Ruskin Bond', 'Fiction'], ['Panchatantra Stories', 'Vishnu Sharma', 'Fiction'], ['Organic Chemistry', 'Morrison & Boyd', 'Science'], ['Biology for Class 11', 'Trueman', 'Science'], ['Let Us C', 'Yashavant Kanetkar', 'Science'], ['Sivagamiyin Sabadham', 'Kalki Krishnamurthy', 'Tamil'], ['The Guide', 'R. K. Narayan', 'Fiction'], ['Manorama Yearbook', 'Malayala Manorama', 'Reference'], ['Vedic Mathematics', 'Bharati Krishna Tirtha', 'Mathematics'], ['Medieval India', 'Satish Chandra', 'History']];
  db.books = BOOKS.map(([title, author, category], i) => { const copies = between(2, 8); return { id: `bk_${pad(i + 1, 3)}`, title, author, category, isbn: `978-81-${between(100, 999)}-${between(1000, 9999)}-${between(0, 9)}`, shelf: `${category.slice(0, 3).toUpperCase()}-${between(1, 6)}`, copies, available: copies }; });
  db.book_loans = [];
  for (let i = 0; i < 64; i++) {
    const book = pick(db.books.filter(b => b.available > 0));
    const s = i === 0 ? demoStudent : i === 1 ? demoSibling : pick(students);
    const issued = addDays(today, -between(1, 34));
    const returned = i > 1 && r() < 0.55;
    const due = addDays(issued, 14);
    const returnedOn = returned ? addDays(issued, between(3, 18)) : null;
    const lateDays = returnedOn && returnedOn > due ? Math.round((Date.parse(returnedOn) - Date.parse(due)) / 864e5) : 0;
    db.book_loans.push({ id: `ln_${pad(i + 1, 3)}`, book_id: book.id, student_id: s.id, issued_on: issued, due_on: due, returned_on: returnedOn && returnedOn > today ? today : returnedOn, fine: lateDays * 2, status: returned ? 'Returned' : 'Issued' });
    if (!returned) book.available--;
  }
  const INV: [string, string, string, number, number, number, string][] = [['A4 copier paper', 'Stationery', 'reams', 46, 30, 265, 'Store room'], ['Whiteboard markers', 'Stationery', 'boxes', 8, 12, 180, 'Store room'], ['Chalk (dustless)', 'Stationery', 'boxes', 64, 20, 45, 'Store room'], ['Answer booklets', 'Stationery', 'bundles', 22, 25, 310, 'Exam cell'], ['Beakers 250 ml', 'Lab equipment', 'pcs', 38, 20, 95, 'Chemistry lab'], ['Bunsen burners', 'Lab equipment', 'pcs', 14, 10, 640, 'Chemistry lab'], ['Compound microscopes', 'Lab equipment', 'pcs', 12, 6, 7800, 'Biology lab'], ['Vernier calipers', 'Lab equipment', 'pcs', 9, 10, 520, 'Physics lab'], ['Footballs', 'Sports', 'pcs', 11, 6, 850, 'Sports room'], ['Cricket kits', 'Sports', 'sets', 3, 4, 6400, 'Sports room'], ['Shuttlecocks', 'Sports', 'tubes', 18, 10, 420, 'Sports room'], ['Student desks (dual)', 'Furniture', 'pcs', 24, 10, 3900, 'Godown'], ['Staff chairs', 'Furniture', 'pcs', 7, 5, 2100, 'Godown'], ['Desktop computers', 'IT', 'pcs', 42, 40, 38500, 'Computer lab'], ['Projectors', 'IT', 'pcs', 9, 4, 41000, 'AV room'], ['UPS batteries', 'IT', 'pcs', 3, 6, 9200, 'Server room'], ['Floor cleaner', 'Housekeeping', 'litres', 35, 20, 110, 'Housekeeping'], ['Hand wash refill', 'Housekeeping', 'litres', 12, 15, 160, 'Housekeeping']];
  db.inventory_items = INV.map(([name, category, unit, quantity, reorder_level, unit_cost, location], i) => ({ id: `it_${pad(i + 1, 3)}`, name, sku: `SKU-${pad(1000 + i * 7)}`, category, quantity, unit, reorder_level, location, unit_cost }));

  // ── People workflows
  const STAGES = ['Applied', 'Applied', 'Applied', 'Shortlisted', 'Shortlisted', 'Interview', 'Interview', 'Offered', 'Offered', 'Enrolled', 'Rejected'];
  db.admissions = [];
  for (let i = 0; i < 26; i++) {
    const female = r() < 0.5, surname = pick(SURNAMES), g = pick([1, 1, 1, 2, 3, 6, 6, 9, 11, 11]);
    db.admissions.push({ id: `adm_${pad(i + 1, 3)}`, applicant_name: `${female ? pick(GIRLS) : pick(BOYS)} ${surname}`, grade_applied: g, gender: female ? 'Female' : 'Male', dob: `${ayStartYear + 1 - 5 - g}-${pad(between(1, 12), 2)}-${pad(between(1, 28), 2)}`, guardian_name: `${pick(BOYS)} ${surname}`, phone: phone(), email: `${surname.toLowerCase()}${between(10, 99)}@mail.example`, previous_school: g === 1 ? 'Little Stars Kindergarten' : pick(['St. Anne\'s Matriculation School', 'Government Higher Secondary School', 'Vivekananda Vidyalaya', 'Bharathi Vidya Bhavan']), applied_on: addDays(today, -between(1, 45)), status: STAGES[i % STAGES.length], notes: null });
  }
  db.leave_requests = [];
  for (let i = 0; i < 14; i++) {
    const s = i < 2 ? staff.find(x => x.id === demoTeacherId)! : pick(staff);
    const from = addDays(today, between(-25, 12)), days = between(1, 4);
    db.leave_requests.push({ id: `lv_${pad(i + 1, 3)}`, staff_id: s.id, type: pick(['Casual', 'Casual', 'Sick', 'Earned']), from_date: from, to_date: addDays(from, days - 1), days, reason: pick(['Family function', 'Medical appointment', 'Personal work', 'Out of station', 'Child\'s school event']), status: from > addDays(today, -2) ? 'Pending' : pick(['Approved', 'Approved', 'Rejected']), decided_by: from > addDays(today, -2) ? null : 'Principal' });
  }

  // ── Communication
  db.notices = [
    ['Term 2 fee due date', `Term 2 fees are payable on or before the due date printed on the invoice. A late fee applies after that. Payments can be made by UPI, bank transfer or at the fee counter between 9:00 and 13:00.`, 'Parents', 'Important', -8],
    ['Unit Test 2 timetable published', 'Unit Test 2 will be held over five days. Portions for each subject are available with class teachers. Students must carry their identity cards.', 'Everyone', 'Important', -3],
    ['Parent-teacher meeting', 'A parent-teacher meeting for Grades 6 to 10 is scheduled this Saturday from 9:30 to 12:30. Term 1 report cards will be handed over.', 'Parents', 'Normal', -2],
    ['Staff meeting on continuous assessment', 'All teaching staff are requested to attend a meeting in the conference hall at 15:15 on Friday.', 'Staff', 'Normal', -1],
    ['Inter-house sports meet', 'Heats for athletics begin next week. House captains should submit participant lists to the Physical Education department.', 'Students', 'Normal', -5],
    ['School closed for Deepavali', 'The school will remain closed for the Deepavali holidays. Classes resume as per the calendar.', 'Everyone', 'Urgent', -1],
    ['Science exhibition registrations', 'Students of Grades 8 to 12 may register working models with their science teachers.', 'Students', 'Normal', -12],
    ['Bus Route 4 timing change', 'Route 4 will start 10 minutes earlier from Hill View Layout from Monday because of road works on Gandhi Road.', 'Everyone', 'Important', -6],
  ].map(([title, body, audience, priority, off], i) => ({ id: `nt_${i + 1}`, title, body, audience, priority, published_on: addDays(today, off as number), author: 'Principal\'s office' }));
  db.events = [
    ['Parent-teacher meeting', 'Meeting', 3, 3, 'Classrooms'], ['Unit Test 2', 'Exam', 16, 20, 'Exam halls'], ['Deepavali holidays', 'Holiday', 30, 33, ''], ['Inter-house sports meet', 'Sports', 10, 12, 'School ground'],
    ['Science exhibition', 'Academic', 24, 24, 'Auditorium'], ['Children\'s Day celebrations', 'Cultural', 37, 37, 'Auditorium'], ['Staff development workshop', 'Meeting', 8, 8, 'Conference hall'], ['Term 2 Examination', 'Exam', 64, 73, 'Exam halls'],
    ['Annual day', 'Cultural', 88, 88, 'Auditorium'], ['Gandhi Jayanti', 'Holiday', -6, -6, ''], ['Term 1 Examination', 'Exam', -38, -29, 'Exam halls'], ['Library week', 'Academic', 5, 9, 'Library'],
  ].map(([title, type, a, b, location], i) => ({ id: `ev_${i + 1}`, title, type, start_date: addDays(today, a as number), end_date: addDays(today, b as number), location, description: null }));

  // ── Users
  const teacher = staff.find(s => s.id === demoTeacherId)!;
  const accounts = staff.find(s => s.id === accountsId)!;
  const U = (id: string, name: string, email: string, role: string, links: Record<string, any> = {}) =>
    ({ id, name, email, role, staff_id: null, student_id: null, guardian_id: null, active: true, password_hash: '', last_login: null, ...links });
  db.users = [
    U('usr_admin', 'Dr. Meenakshi Raman', DEMO_ACCOUNTS[0].email, 'admin'),
    U('usr_teacher', teacher.name, DEMO_ACCOUNTS[1].email, 'teacher', { staff_id: teacher.id }),
    U('usr_accounts', accounts.name, DEMO_ACCOUNTS[2].email, 'accountant', { staff_id: accounts.id }),
    U('usr_student', demoStudent.name, DEMO_ACCOUNTS[3].email, 'student', { student_id: demoStudent.id }),
    U('usr_parent', demoGuardian.name, DEMO_ACCOUNTS[4].email, 'parent', { guardian_id: demoGuardian.id }),
  ];
  const iso = (d: number, h: number) => `${addDays(today, d)}T${pad(h, 2)}:20:00.000Z`;
  db.messages = [
    { id: 'msg_1', from_user_id: 'usr_parent', to_user_id: 'usr_teacher', subject: `Leave for ${demoStudent.name.split(' ')[0]} on Friday`, body: `Good evening. ${demoStudent.name.split(' ')[0]} has a family function on Friday and will not attend school. Kindly share any classwork to be completed.`, sent_at: iso(-1, 13), is_read: false },
    { id: 'msg_2', from_user_id: 'usr_teacher', to_user_id: 'usr_parent', subject: 'Term 1 performance', body: 'Your ward has done well in Term 1, especially in Science. Mathematics needs a little more practice with word problems.', sent_at: iso(-6, 10), is_read: true },
    { id: 'msg_3', from_user_id: 'usr_admin', to_user_id: 'usr_teacher', subject: 'Unit Test 2 question papers', body: 'Please submit question papers for your subject to the exam cell by Wednesday.', sent_at: iso(-2, 5), is_read: false },
    { id: 'msg_4', from_user_id: 'usr_accounts', to_user_id: 'usr_admin', subject: 'Term 2 collection status', body: 'Term 2 invoices have been issued to all classes. A list of Term 1 defaulters is ready for your review.', sent_at: iso(-1, 9), is_read: false },
    { id: 'msg_5', from_user_id: 'usr_teacher', to_user_id: 'usr_student', subject: 'Science exhibition', body: 'Please confirm your project title for the science exhibition by Monday.', sent_at: iso(-3, 8), is_read: false },
  ];
  db.audit_logs = [
    { id: 'aud_1', at: iso(-1, 6), user_id: 'usr_accounts', user_name: accounts.name, action: 'action', resource: 'invoices', record_id: null, summary: `Generated Term 2 invoices for ${students.length} students` },
    { id: 'aud_2', at: iso(-2, 7), user_id: 'usr_admin', user_name: 'Dr. Meenakshi Raman', action: 'update', resource: 'exams', record_id: 'ex_t1', summary: 'Edited exam "Term 1 Examination" (status)' },
  ];
  db.settings = [
    { id: 'set_1', key: 'school_name', value: 'Meridian Public School' },
    { id: 'set_2', key: 'school_address', value: '14, Kamaraj Salai, Tamil Nadu 624601' },
    { id: 'set_3', key: 'school_phone', value: '04545 240 118' },
    { id: 'set_4', key: 'affiliation', value: 'CBSE Affiliation No. 1930xxx (sample)' },
    { id: 'set_5', key: 'currency', value: 'INR' },
    { id: 'set_6', key: 'library_loan_days', value: '14' },
    { id: 'set_7', key: 'library_fine_per_day', value: '2' },
    { id: 'set_8', key: 'pass_percentage', value: '33' },
  ];
  return db;
}

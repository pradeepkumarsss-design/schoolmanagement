import type { Field, Resource, Row } from './types';

// Field helpers keep the definitions below readable.
const t = (name: string, label: string, o: Partial<Field> = {}): Field => ({ name, label, type: 'text', ...o });
const req = { required: true };
const sel = (name: string, label: string, options: string[], o: Partial<Field> = {}): Field =>
  ({ name, label, type: 'select', options, ...o });
const ref = (name: string, label: string, target: string, o: Partial<Field> = {}): Field =>
  ({ name, label, type: 'ref', ref: target, ...o });
const date = (name: string, label: string, o: Partial<Field> = {}): Field => ({ name, label, type: 'date', ...o });
const money = (name: string, label: string, o: Partial<Field> = {}): Field => ({ name, label, type: 'money', ...o });
const int = (name: string, label: string, o: Partial<Field> = {}): Field => ({ name, label, type: 'int', ...o });

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const PERIODS = [
  { n: 1, time: '08:30 – 09:15' }, { n: 2, time: '09:15 – 10:00' }, { n: 3, time: '10:15 – 11:00' },
  { n: 4, time: '11:00 – 11:45' }, { n: 5, time: '12:30 – 13:15' }, { n: 6, time: '13:15 – 14:00' },
  { n: 7, time: '14:10 – 14:55' },
];
export const ATTENDANCE = ['Present', 'Absent', 'Late', 'Half day'];
export const TERMS = ['Term 1', 'Term 2', 'Term 3'];

/** CBSE-style nine-point scale. */
export function gradeFor(pct: number): string {
  if (pct >= 91) return 'A1'; if (pct >= 81) return 'A2'; if (pct >= 71) return 'B1';
  if (pct >= 61) return 'B2'; if (pct >= 51) return 'C1'; if (pct >= 41) return 'C2';
  if (pct >= 33) return 'D'; return 'E';
}

export const RESOURCES: Resource[] = [
  // ───────────── Academics ─────────────
  {
    name: 'academic_years', label: 'Academic years', singular: 'Academic year', module: 'Academics',
    labelField: 'name', searchFields: ['name'], defaultSort: '-start_date', publicLookup: true,
    access: { teacher: 'r', accountant: 'r', student: 'r', parent: 'r' },
    fields: [t('name', 'Name', { ...req, unique: true }), date('start_date', 'Starts', req), date('end_date', 'Ends', req),
      { name: 'is_current', label: 'Current', type: 'bool', default: false }],
  },
  {
    name: 'classes', label: 'Classes', singular: 'Class', module: 'Academics',
    labelField: 'name', searchFields: ['name', 'room'], defaultSort: 'grade', publicLookup: true, audit: true,
    access: { teacher: 'r', accountant: 'r', student: 'r', parent: 'r' },
    fields: [t('name', 'Class', { ...req, unique: true }), int('grade', 'Grade', req), t('section', 'Section', req),
      ref('class_teacher_id', 'Class teacher', 'staff'), t('room', 'Room'), int('capacity', 'Capacity', { default: 40 })],
  },
  {
    name: 'subjects', label: 'Subjects', singular: 'Subject', module: 'Academics',
    labelField: 'name', searchFields: ['name', 'code'], defaultSort: 'name', publicLookup: true,
    access: { teacher: 'r', accountant: 'r', student: 'r', parent: 'r' },
    fields: [t('name', 'Subject', req), t('code', 'Code', { ...req, unique: true }),
      sel('type', 'Type', ['Core', 'Language', 'Elective', 'Co-curricular'], { default: 'Core' })],
  },
  {
    name: 'timetable', label: 'Timetable', singular: 'Period', module: 'Academics',
    labelField: (r: Row) => `${DAYS[r.day - 1]} P${r.period}`, searchFields: ['room'], defaultSort: 'day',
    access: { teacher: 'r', student: 'r', parent: 'r' }, uniqueTogether: ['class_id', 'day', 'period'],
    fields: [ref('class_id', 'Class', 'classes', req), int('day', 'Day (1 = Mon)', req), int('period', 'Period', req),
      ref('subject_id', 'Subject', 'subjects', req), ref('teacher_id', 'Teacher', 'staff'), t('room', 'Room')],
  },
  {
    name: 'attendance', label: 'Attendance', singular: 'Attendance entry', module: 'Academics',
    labelField: 'date', searchFields: [], defaultSort: '-date', studentScope: 'student_id',
    access: { teacher: 'cru', student: 'r', parent: 'r' }, uniqueTogether: ['student_id', 'date'],
    fields: [ref('student_id', 'Student', 'students', req), ref('class_id', 'Class', 'classes', req), date('date', 'Date', req),
      sel('status', 'Status', ATTENDANCE, req), t('note', 'Note')],
  },
  {
    name: 'exams', label: 'Exams', singular: 'Exam', module: 'Academics',
    labelField: 'name', searchFields: ['name'], defaultSort: '-start_date', publicLookup: true, audit: true,
    access: { teacher: 'cru', student: 'r', parent: 'r' },
    fields: [t('name', 'Exam', req), sel('term', 'Term', TERMS, req), date('start_date', 'Starts', req), date('end_date', 'Ends', req),
      int('max_marks', 'Max marks per subject', { ...req, default: 100 }),
      sel('status', 'Status', ['Scheduled', 'Ongoing', 'Marks entry', 'Published'], { default: 'Scheduled' })],
  },
  {
    name: 'marks', label: 'Marks', singular: 'Mark', module: 'Academics',
    labelField: 'marks', searchFields: [], defaultSort: '-id', studentScope: 'student_id',
    access: { teacher: 'cru', student: 'r', parent: 'r' }, uniqueTogether: ['exam_id', 'student_id', 'subject_id'],
    fields: [ref('exam_id', 'Exam', 'exams', req), ref('student_id', 'Student', 'students', req), ref('class_id', 'Class', 'classes', req),
      ref('subject_id', 'Subject', 'subjects', req), { name: 'marks', label: 'Marks', type: 'number', required: true },
      int('max_marks', 'Out of', req), t('grade', 'Grade', { readonly: true }), t('remarks', 'Remarks')],
  },
  {
    name: 'assignments', label: 'Homework', singular: 'Assignment', module: 'Academics',
    labelField: 'title', searchFields: ['title', 'description'], defaultSort: '-due_date',
    access: { teacher: 'crud', student: 'r', parent: 'r' },
    fields: [t('title', 'Title', req), ref('class_id', 'Class', 'classes', req), ref('subject_id', 'Subject', 'subjects', req),
      ref('teacher_id', 'Set by', 'staff'), date('assigned_on', 'Assigned'), date('due_date', 'Due', req),
      { name: 'description', label: 'Instructions', type: 'longtext', list: false }],
  },

  // ───────────── People ─────────────
  {
    name: 'students', label: 'Students', singular: 'Student', module: 'People',
    labelField: (r: Row) => `${r.name} (${r.admission_no})`, searchFields: ['name', 'admission_no', 'phone'], defaultSort: 'name',
    access: { teacher: 'r', accountant: 'r', student: 'r', parent: 'r' }, studentScope: 'id', audit: true,
    fields: [t('admission_no', 'Admission no.', { ...req, unique: true }), t('name', 'Full name', req), ref('class_id', 'Class', 'classes', req),
      int('roll_no', 'Roll no.'), sel('gender', 'Gender', ['Female', 'Male', 'Other'], req), date('dob', 'Date of birth', { list: false }),
      ref('guardian_id', 'Guardian', 'guardians', { list: false }), t('phone', 'Phone', { type: 'phone', list: false }),
      t('address', 'Address', { list: false }), date('admission_date', 'Admitted on', { list: false }),
      ref('transport_route_id', 'Bus route', 'transport_routes', { list: false }), ref('hostel_room_id', 'Hostel room', 'hostel_rooms', { list: false }),
      sel('status', 'Status', ['Active', 'Transferred', 'Alumni', 'Suspended'], { default: 'Active' })],
  },
  {
    name: 'guardians', label: 'Guardians', singular: 'Guardian', module: 'People',
    labelField: 'name', searchFields: ['name', 'phone', 'email'], defaultSort: 'name', audit: true,
    access: { teacher: 'r', accountant: 'r' },
    fields: [t('name', 'Name', req), sel('relation', 'Relation', ['Mother', 'Father', 'Guardian'], req), t('phone', 'Phone', { type: 'phone', required: true }),
      t('email', 'Email', { type: 'email' }), t('occupation', 'Occupation'), t('address', 'Address', { list: false })],
  },
  {
    name: 'staff', label: 'Staff', singular: 'Staff member', module: 'People',
    labelField: 'name', searchFields: ['name', 'emp_no', 'department', 'designation'], defaultSort: 'name', publicLookup: true, audit: true,
    access: { teacher: 'r', accountant: 'r' },
    fields: [t('emp_no', 'Employee no.', { ...req, unique: true }), t('name', 'Name', req),
      sel('department', 'Department', ['Languages', 'Mathematics', 'Science', 'Social Science', 'Computer Science', 'Arts & Sports', 'Administration', 'Accounts', 'Library', 'Transport'], req),
      t('designation', 'Designation', req), sel('category', 'Category', ['Teaching', 'Non-teaching'], { default: 'Teaching' }),
      t('email', 'Email', { type: 'email', list: false }), t('phone', 'Phone', { type: 'phone' }), t('qualification', 'Qualification', { list: false }),
      date('join_date', 'Joined', { list: false }), money('salary_basic', 'Basic pay / month', { list: false }),
      sel('status', 'Status', ['Active', 'On leave', 'Resigned'], { default: 'Active' })],
  },
  {
    name: 'admissions', label: 'Admission applications', singular: 'Application', module: 'People',
    labelField: 'applicant_name', searchFields: ['applicant_name', 'guardian_name', 'phone'], defaultSort: '-applied_on', audit: true,
    access: {},
    fields: [t('applicant_name', 'Applicant', req), int('grade_applied', 'Grade applied', req), sel('gender', 'Gender', ['Female', 'Male', 'Other'], req),
      date('dob', 'Date of birth', { list: false }), t('guardian_name', 'Guardian', req), t('phone', 'Phone', { type: 'phone', required: true }),
      t('email', 'Email', { type: 'email', list: false }), t('previous_school', 'Previous school', { list: false }), date('applied_on', 'Applied on', req),
      sel('status', 'Stage', ['Applied', 'Shortlisted', 'Interview', 'Offered', 'Enrolled', 'Rejected'], { default: 'Applied' }),
      { name: 'notes', label: 'Notes', type: 'longtext', list: false }],
  },
  {
    name: 'leave_requests', label: 'Leave requests', singular: 'Leave request', module: 'People',
    labelField: 'type', searchFields: ['reason'], defaultSort: '-from_date', staffScope: 'staff_id', audit: true,
    access: { teacher: 'cr', accountant: 'r' },
    fields: [ref('staff_id', 'Staff member', 'staff', req), sel('type', 'Leave type', ['Casual', 'Sick', 'Earned', 'Maternity', 'Unpaid'], req),
      date('from_date', 'From', req), date('to_date', 'To', req), int('days', 'Days', req), t('reason', 'Reason'),
      sel('status', 'Status', ['Pending', 'Approved', 'Rejected'], { default: 'Pending', readonly: true }), t('decided_by', 'Decided by', { readonly: true, list: false })],
  },

  // ───────────── Finance ─────────────
  {
    name: 'fee_structures', label: 'Fee structure', singular: 'Fee head', module: 'Finance',
    labelField: 'name', searchFields: ['name'], defaultSort: 'grade_from', audit: true,
    access: { accountant: 'crud', parent: 'r', student: 'r' },
    fields: [t('name', 'Fee head', req), int('grade_from', 'From grade', req), int('grade_to', 'To grade', req), money('amount', 'Amount', req),
      sel('frequency', 'Charged', ['Per term', 'Annual', 'One time'], { default: 'Per term' })],
  },
  {
    name: 'invoices', label: 'Fee invoices', singular: 'Invoice', module: 'Finance',
    labelField: 'invoice_no', searchFields: ['invoice_no', 'title'], defaultSort: '-issue_date', studentScope: 'student_id', audit: true,
    access: { accountant: 'crud', student: 'r', parent: 'r' },
    fields: [t('invoice_no', 'Invoice no.', { ...req, unique: true }), ref('student_id', 'Student', 'students', req), t('title', 'Description', req),
      sel('term', 'Term', TERMS), date('issue_date', 'Issued', req), date('due_date', 'Due', req), money('amount', 'Amount', req),
      money('discount', 'Discount', { default: 0, list: false }), money('paid', 'Paid', { default: 0, readonly: true }),
      sel('status', 'Status', ['Unpaid', 'Partial', 'Paid'], { default: 'Unpaid', readonly: true }),
      { name: 'lines', label: 'Lines', type: 'json', list: false, readonly: true }],
  },
  {
    name: 'payments', label: 'Receipts', singular: 'Receipt', module: 'Finance',
    labelField: 'receipt_no', searchFields: ['receipt_no', 'reference'], defaultSort: '-paid_on', studentScope: 'student_id', audit: true,
    access: { accountant: 'r', student: 'r', parent: 'r' },
    fields: [t('receipt_no', 'Receipt no.', { ...req, unique: true }), ref('invoice_id', 'Invoice', 'invoices', req), ref('student_id', 'Student', 'students', req),
      money('amount', 'Amount', req), sel('method', 'Method', ['UPI', 'Cash', 'Card', 'Bank transfer', 'Cheque'], req), date('paid_on', 'Paid on', req),
      t('reference', 'Reference'), t('received_by', 'Received by', { list: false })],
  },
  {
    name: 'expenses', label: 'Expenses', singular: 'Expense', module: 'Finance',
    labelField: 'description', searchFields: ['description', 'vendor', 'category'], defaultSort: '-date', audit: true,
    access: { accountant: 'crud' },
    fields: [date('date', 'Date', req), sel('category', 'Category', ['Salaries', 'Utilities', 'Maintenance', 'Lab & supplies', 'Transport', 'Events', 'Technology', 'Other'], req),
      t('description', 'Description', req), t('vendor', 'Vendor'), money('amount', 'Amount', req),
      sel('status', 'Status', ['Pending', 'Approved', 'Paid'], { default: 'Pending' })],
  },
  {
    name: 'payroll', label: 'Payroll', singular: 'Payslip', module: 'Finance',
    labelField: 'month', searchFields: ['month'], defaultSort: '-month', staffScope: 'staff_id', audit: true,
    access: { accountant: 'crud', teacher: 'r' }, uniqueTogether: ['staff_id', 'month'],
    fields: [ref('staff_id', 'Staff member', 'staff', req), t('month', 'Month (YYYY-MM)', req), money('basic', 'Basic', req), money('allowances', 'Allowances', { default: 0 }),
      money('deductions', 'Deductions', { default: 0 }), money('net', 'Net pay', { readonly: true }),
      sel('status', 'Status', ['Draft', 'Paid'], { default: 'Draft' }), date('paid_on', 'Paid on', { list: false })],
  },

  // ───────────── Operations ─────────────
  {
    name: 'transport_routes', label: 'Bus routes', singular: 'Bus route', module: 'Operations',
    labelField: 'name', searchFields: ['name', 'vehicle_no', 'driver', 'stops'], defaultSort: 'name', publicLookup: true, audit: true,
    access: { teacher: 'r', accountant: 'r', student: 'r', parent: 'r' },
    fields: [t('name', 'Route', req), t('vehicle_no', 'Vehicle no.', req), t('driver', 'Driver'), t('driver_phone', 'Driver phone', { type: 'phone' }),
      int('capacity', 'Seats', { default: 40 }), t('stops', 'Stops', { list: false }), money('fee', 'Fee per term')],
  },
  {
    name: 'books', label: 'Library catalogue', singular: 'Book', module: 'Operations',
    labelField: 'title', searchFields: ['title', 'author', 'isbn', 'category'], defaultSort: 'title', publicLookup: true, audit: true,
    access: { teacher: 'crud', accountant: 'r', student: 'r', parent: 'r' },
    fields: [t('title', 'Title', req), t('author', 'Author', req), t('isbn', 'ISBN'), sel('category', 'Category', ['Fiction', 'Science', 'Mathematics', 'History', 'Reference', 'Biography', 'Tamil', 'Hindi'], req),
      t('shelf', 'Shelf'), int('copies', 'Copies', { ...req, default: 1 }), int('available', 'Available', { default: 1 })],
  },
  {
    name: 'book_loans', label: 'Book loans', singular: 'Loan', module: 'Operations',
    labelField: 'issued_on', searchFields: [], defaultSort: '-issued_on', studentScope: 'student_id',
    access: { teacher: 'r', student: 'r', parent: 'r' },
    fields: [ref('book_id', 'Book', 'books', req), ref('student_id', 'Borrower', 'students', req), date('issued_on', 'Issued', req), date('due_on', 'Due', req),
      date('returned_on', 'Returned'), money('fine', 'Fine', { default: 0 }), sel('status', 'Status', ['Issued', 'Returned'], { default: 'Issued' })],
  },
  {
    name: 'hostel_rooms', label: 'Hostel rooms', singular: 'Hostel room', module: 'Operations',
    labelField: (r: Row) => `${r.block}-${r.room_no}`, searchFields: ['block', 'room_no', 'warden'], defaultSort: 'block', publicLookup: true, audit: true,
    access: { teacher: 'r', accountant: 'r' },
    fields: [t('block', 'Block', req), t('room_no', 'Room no.', req), sel('type', 'Type', ['Dormitory', 'Triple', 'Double'], req), int('capacity', 'Beds', req),
      t('warden', 'Warden'), money('fee', 'Fee per term')],
  },
  {
    name: 'inventory_items', label: 'Inventory', singular: 'Inventory item', module: 'Operations',
    labelField: 'name', searchFields: ['name', 'sku', 'category', 'location'], defaultSort: 'name', audit: true,
    access: { accountant: 'crud', teacher: 'r' },
    fields: [t('name', 'Item', req), t('sku', 'SKU', { unique: true }), sel('category', 'Category', ['Stationery', 'Lab equipment', 'Sports', 'Furniture', 'IT', 'Housekeeping'], req),
      int('quantity', 'In stock', req), t('unit', 'Unit', { default: 'pcs' }), int('reorder_level', 'Reorder at', { default: 10 }), t('location', 'Location'), money('unit_cost', 'Unit cost', { list: false })],
  },

  // ───────────── Communication ─────────────
  {
    name: 'notices', label: 'Notices', singular: 'Notice', module: 'Communication',
    labelField: 'title', searchFields: ['title', 'body'], defaultSort: '-published_on', audit: true,
    access: { teacher: 'cr', accountant: 'r', student: 'r', parent: 'r' },
    fields: [t('title', 'Title', req), sel('audience', 'Audience', ['Everyone', 'Staff', 'Students', 'Parents'], { default: 'Everyone' }),
      sel('priority', 'Priority', ['Normal', 'Important', 'Urgent'], { default: 'Normal' }), date('published_on', 'Published', req), t('author', 'Posted by', { readonly: true }),
      { name: 'body', label: 'Message', type: 'longtext', required: true, list: false }],
  },
  {
    name: 'events', label: 'Calendar', singular: 'Event', module: 'Communication',
    labelField: 'title', searchFields: ['title', 'location'], defaultSort: 'start_date',
    access: { teacher: 'cru', accountant: 'r', student: 'r', parent: 'r' },
    fields: [t('title', 'Event', req), sel('type', 'Type', ['Holiday', 'Exam', 'Meeting', 'Sports', 'Cultural', 'Academic'], req), date('start_date', 'From', req), date('end_date', 'To'),
      t('location', 'Location'), { name: 'description', label: 'Details', type: 'longtext', list: false }],
  },
  {
    name: 'messages', label: 'Messages', singular: 'Message', module: 'Communication',
    labelField: 'subject', searchFields: ['subject', 'body'], defaultSort: '-sent_at',
    access: { teacher: 'cr', accountant: 'cr', student: 'cr', parent: 'cr' },
    fields: [ref('from_user_id', 'From', 'users', { readonly: true }), ref('to_user_id', 'To', 'users', req), t('subject', 'Subject', req),
      { name: 'body', label: 'Message', type: 'longtext', required: true, list: false },
      { name: 'sent_at', label: 'Sent', type: 'datetime', readonly: true }, { name: 'is_read', label: 'Read', type: 'bool', default: false, readonly: true }],
  },

  // ───────────── System ─────────────
  {
    name: 'users', label: 'User accounts', singular: 'User', module: 'System',
    labelField: 'name', searchFields: ['name', 'email'], defaultSort: 'name', publicLookup: true, audit: true,
    access: {},
    fields: [t('name', 'Name', req), t('email', 'Email', { type: 'email', required: true, unique: true }),
      sel('role', 'Role', ['admin', 'teacher', 'accountant', 'student', 'parent'], req), ref('staff_id', 'Linked staff', 'staff', { list: false }),
      ref('student_id', 'Linked student', 'students', { list: false }), ref('guardian_id', 'Linked guardian', 'guardians', { list: false }),
      { name: 'active', label: 'Active', type: 'bool', default: true }, { name: 'password_hash', label: 'Password hash', type: 'text', hidden: true },
      { name: 'last_login', label: 'Last sign-in', type: 'datetime', readonly: true }],
  },
  {
    name: 'audit_logs', label: 'Audit trail', singular: 'Audit entry', module: 'System',
    labelField: 'summary', searchFields: ['summary', 'user_name', 'resource'], defaultSort: '-at',
    access: {},
    fields: [{ name: 'at', label: 'When', type: 'datetime' }, t('user_id', 'User id', { list: false }), t('user_name', 'User'), t('action', 'Action'), t('resource', 'Record type'),
      t('record_id', 'Record id', { list: false }), t('summary', 'Summary')],
  },
  {
    name: 'settings', label: 'Settings', singular: 'Setting', module: 'System',
    labelField: 'key', searchFields: ['key'], defaultSort: 'key', publicLookup: true,
    access: { teacher: 'r', accountant: 'r', student: 'r', parent: 'r' },
    fields: [t('key', 'Key', { ...req, unique: true }), t('value', 'Value')],
  },
];

export const RES: Record<string, Resource> = Object.fromEntries(RESOURCES.map(r => [r.name, r]));

export function labelOf(resource: string, row: Row | null | undefined): string {
  if (!row) return '—';
  const lf = RES[resource].labelField;
  return typeof lf === 'function' ? lf(row) : String(row[lf] ?? '—');
}

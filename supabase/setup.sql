-- Scholaris: create the tables in Supabase.
-- How to run: Supabase dashboard > SQL Editor > New query > paste this whole file > Run.
-- Everything runs in one transaction: if any statement fails, nothing is changed.
-- It creates a separate "scholaris" schema, so tables already in your project are untouched.

BEGIN;

CREATE SCHEMA scholaris;
SET LOCAL search_path TO scholaris;

-- ───────────── 1. Tables, keys and indexes ─────────────
-- Generated from shared/resources.ts. Do not edit by hand.

CREATE TABLE academic_years (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_current boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE classes (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  grade integer NOT NULL,
  section text NOT NULL,
  class_teacher_id text,
  room text,
  capacity integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subjects (
  id text PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  type text CHECK (type IN ('Core', 'Language', 'Elective', 'Co-curricular')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE timetable (
  id text PRIMARY KEY,
  class_id text NOT NULL,
  day integer NOT NULL,
  period integer NOT NULL,
  subject_id text NOT NULL,
  teacher_id text,
  room text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT timetable_uniq UNIQUE (class_id, day, period)
);

CREATE TABLE attendance (
  id text PRIMARY KEY,
  student_id text NOT NULL,
  class_id text NOT NULL,
  date date NOT NULL,
  status text NOT NULL CHECK (status IN ('Present', 'Absent', 'Late', 'Half day')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_uniq UNIQUE (student_id, date)
);

CREATE TABLE exams (
  id text PRIMARY KEY,
  name text NOT NULL,
  term text NOT NULL CHECK (term IN ('Term 1', 'Term 2', 'Term 3')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  max_marks integer NOT NULL,
  status text CHECK (status IN ('Scheduled', 'Ongoing', 'Marks entry', 'Published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE marks (
  id text PRIMARY KEY,
  exam_id text NOT NULL,
  student_id text NOT NULL,
  class_id text NOT NULL,
  subject_id text NOT NULL,
  marks numeric(8,2) NOT NULL,
  max_marks integer NOT NULL,
  grade text,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marks_uniq UNIQUE (exam_id, student_id, subject_id)
);

CREATE TABLE assignments (
  id text PRIMARY KEY,
  title text NOT NULL,
  class_id text NOT NULL,
  subject_id text NOT NULL,
  teacher_id text,
  assigned_on date,
  due_date date NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE students (
  id text PRIMARY KEY,
  admission_no text NOT NULL UNIQUE,
  name text NOT NULL,
  class_id text NOT NULL,
  roll_no integer,
  gender text NOT NULL CHECK (gender IN ('Female', 'Male', 'Other')),
  dob date,
  guardian_id text,
  phone text,
  address text,
  admission_date date,
  transport_route_id text,
  hostel_room_id text,
  status text CHECK (status IN ('Active', 'Transferred', 'Alumni', 'Suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE guardians (
  id text PRIMARY KEY,
  name text NOT NULL,
  relation text NOT NULL CHECK (relation IN ('Mother', 'Father', 'Guardian')),
  phone text NOT NULL,
  email text,
  occupation text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staff (
  id text PRIMARY KEY,
  emp_no text NOT NULL UNIQUE,
  name text NOT NULL,
  department text NOT NULL CHECK (department IN ('Languages', 'Mathematics', 'Science', 'Social Science', 'Computer Science', 'Arts & Sports', 'Administration', 'Accounts', 'Library', 'Transport')),
  designation text NOT NULL,
  category text CHECK (category IN ('Teaching', 'Non-teaching')),
  email text,
  phone text,
  qualification text,
  join_date date,
  salary_basic numeric(12,2) CHECK (salary_basic >= 0),
  status text CHECK (status IN ('Active', 'On leave', 'Resigned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admissions (
  id text PRIMARY KEY,
  applicant_name text NOT NULL,
  grade_applied integer NOT NULL,
  gender text NOT NULL CHECK (gender IN ('Female', 'Male', 'Other')),
  dob date,
  guardian_name text NOT NULL,
  phone text NOT NULL,
  email text,
  previous_school text,
  applied_on date NOT NULL,
  status text CHECK (status IN ('Applied', 'Shortlisted', 'Interview', 'Offered', 'Enrolled', 'Rejected')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE leave_requests (
  id text PRIMARY KEY,
  staff_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('Casual', 'Sick', 'Earned', 'Maternity', 'Unpaid')),
  from_date date NOT NULL,
  to_date date NOT NULL,
  days integer NOT NULL,
  reason text,
  status text CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  decided_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fee_structures (
  id text PRIMARY KEY,
  name text NOT NULL,
  grade_from integer NOT NULL,
  grade_to integer NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  frequency text CHECK (frequency IN ('Per term', 'Annual', 'One time')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
  id text PRIMARY KEY,
  invoice_no text NOT NULL UNIQUE,
  student_id text NOT NULL,
  title text NOT NULL,
  term text CHECK (term IN ('Term 1', 'Term 2', 'Term 3')),
  issue_date date NOT NULL,
  due_date date NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  discount numeric(12,2) CHECK (discount >= 0),
  paid numeric(12,2) CHECK (paid >= 0),
  status text CHECK (status IN ('Unpaid', 'Partial', 'Paid')),
  lines jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id text PRIMARY KEY,
  receipt_no text NOT NULL UNIQUE,
  invoice_id text NOT NULL,
  student_id text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  method text NOT NULL CHECK (method IN ('UPI', 'Cash', 'Card', 'Bank transfer', 'Cheque')),
  paid_on date NOT NULL,
  reference text,
  received_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE expenses (
  id text PRIMARY KEY,
  date date NOT NULL,
  category text NOT NULL CHECK (category IN ('Salaries', 'Utilities', 'Maintenance', 'Lab & supplies', 'Transport', 'Events', 'Technology', 'Other')),
  description text NOT NULL,
  vendor text,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  status text CHECK (status IN ('Pending', 'Approved', 'Paid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payroll (
  id text PRIMARY KEY,
  staff_id text NOT NULL,
  month text NOT NULL,
  basic numeric(12,2) NOT NULL CHECK (basic >= 0),
  allowances numeric(12,2) CHECK (allowances >= 0),
  deductions numeric(12,2) CHECK (deductions >= 0),
  net numeric(12,2) CHECK (net >= 0),
  status text CHECK (status IN ('Draft', 'Paid')),
  paid_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_uniq UNIQUE (staff_id, month)
);

CREATE TABLE transport_routes (
  id text PRIMARY KEY,
  name text NOT NULL,
  vehicle_no text NOT NULL,
  driver text,
  driver_phone text,
  capacity integer,
  stops text,
  fee numeric(12,2) CHECK (fee >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE books (
  id text PRIMARY KEY,
  title text NOT NULL,
  author text NOT NULL,
  isbn text,
  category text NOT NULL CHECK (category IN ('Fiction', 'Science', 'Mathematics', 'History', 'Reference', 'Biography', 'Tamil', 'Hindi')),
  shelf text,
  copies integer NOT NULL,
  available integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE book_loans (
  id text PRIMARY KEY,
  book_id text NOT NULL,
  student_id text NOT NULL,
  issued_on date NOT NULL,
  due_on date NOT NULL,
  returned_on date,
  fine numeric(12,2) CHECK (fine >= 0),
  status text CHECK (status IN ('Issued', 'Returned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hostel_rooms (
  id text PRIMARY KEY,
  block text NOT NULL,
  room_no text NOT NULL,
  type text NOT NULL CHECK (type IN ('Dormitory', 'Triple', 'Double')),
  capacity integer NOT NULL,
  warden text,
  fee numeric(12,2) CHECK (fee >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inventory_items (
  id text PRIMARY KEY,
  name text NOT NULL,
  sku text UNIQUE,
  category text NOT NULL CHECK (category IN ('Stationery', 'Lab equipment', 'Sports', 'Furniture', 'IT', 'Housekeeping')),
  quantity integer NOT NULL,
  unit text,
  reorder_level integer,
  location text,
  unit_cost numeric(12,2) CHECK (unit_cost >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notices (
  id text PRIMARY KEY,
  title text NOT NULL,
  audience text CHECK (audience IN ('Everyone', 'Staff', 'Students', 'Parents')),
  priority text CHECK (priority IN ('Normal', 'Important', 'Urgent')),
  published_on date NOT NULL,
  author text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id text PRIMARY KEY,
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('Holiday', 'Exam', 'Meeting', 'Sports', 'Cultural', 'Academic')),
  start_date date NOT NULL,
  end_date date,
  location text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id text PRIMARY KEY,
  from_user_id text,
  to_user_id text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  sent_at timestamptz,
  is_read boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('admin', 'teacher', 'accountant', 'student', 'parent')),
  staff_id text,
  student_id text,
  guardian_id text,
  active boolean,
  password_hash text,
  last_login timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id text PRIMARY KEY,
  at timestamptz,
  user_id text,
  user_name text,
  action text,
  resource text,
  record_id text,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  id text PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE classes ADD CONSTRAINT classes_class_teacher_id_fk FOREIGN KEY (class_teacher_id) REFERENCES staff(id) ON DELETE RESTRICT;
CREATE INDEX classes_class_teacher_id_idx ON classes (class_teacher_id);
ALTER TABLE timetable ADD CONSTRAINT timetable_class_id_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT;
CREATE INDEX timetable_class_id_idx ON timetable (class_id);
ALTER TABLE timetable ADD CONSTRAINT timetable_subject_id_fk FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT;
CREATE INDEX timetable_subject_id_idx ON timetable (subject_id);
ALTER TABLE timetable ADD CONSTRAINT timetable_teacher_id_fk FOREIGN KEY (teacher_id) REFERENCES staff(id) ON DELETE RESTRICT;
CREATE INDEX timetable_teacher_id_idx ON timetable (teacher_id);
ALTER TABLE attendance ADD CONSTRAINT attendance_student_id_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
CREATE INDEX attendance_student_id_idx ON attendance (student_id);
ALTER TABLE attendance ADD CONSTRAINT attendance_class_id_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT;
CREATE INDEX attendance_class_id_idx ON attendance (class_id);
ALTER TABLE marks ADD CONSTRAINT marks_exam_id_fk FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE RESTRICT;
CREATE INDEX marks_exam_id_idx ON marks (exam_id);
ALTER TABLE marks ADD CONSTRAINT marks_student_id_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
CREATE INDEX marks_student_id_idx ON marks (student_id);
ALTER TABLE marks ADD CONSTRAINT marks_class_id_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT;
CREATE INDEX marks_class_id_idx ON marks (class_id);
ALTER TABLE marks ADD CONSTRAINT marks_subject_id_fk FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT;
CREATE INDEX marks_subject_id_idx ON marks (subject_id);
ALTER TABLE assignments ADD CONSTRAINT assignments_class_id_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT;
CREATE INDEX assignments_class_id_idx ON assignments (class_id);
ALTER TABLE assignments ADD CONSTRAINT assignments_subject_id_fk FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT;
CREATE INDEX assignments_subject_id_idx ON assignments (subject_id);
ALTER TABLE assignments ADD CONSTRAINT assignments_teacher_id_fk FOREIGN KEY (teacher_id) REFERENCES staff(id) ON DELETE RESTRICT;
CREATE INDEX assignments_teacher_id_idx ON assignments (teacher_id);
ALTER TABLE students ADD CONSTRAINT students_class_id_fk FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT;
CREATE INDEX students_class_id_idx ON students (class_id);
ALTER TABLE students ADD CONSTRAINT students_guardian_id_fk FOREIGN KEY (guardian_id) REFERENCES guardians(id) ON DELETE RESTRICT;
CREATE INDEX students_guardian_id_idx ON students (guardian_id);
ALTER TABLE students ADD CONSTRAINT students_transport_route_id_fk FOREIGN KEY (transport_route_id) REFERENCES transport_routes(id) ON DELETE RESTRICT;
CREATE INDEX students_transport_route_id_idx ON students (transport_route_id);
ALTER TABLE students ADD CONSTRAINT students_hostel_room_id_fk FOREIGN KEY (hostel_room_id) REFERENCES hostel_rooms(id) ON DELETE RESTRICT;
CREATE INDEX students_hostel_room_id_idx ON students (hostel_room_id);
ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_staff_id_fk FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE RESTRICT;
CREATE INDEX leave_requests_staff_id_idx ON leave_requests (staff_id);
ALTER TABLE invoices ADD CONSTRAINT invoices_student_id_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
CREATE INDEX invoices_student_id_idx ON invoices (student_id);
ALTER TABLE payments ADD CONSTRAINT payments_invoice_id_fk FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT;
CREATE INDEX payments_invoice_id_idx ON payments (invoice_id);
ALTER TABLE payments ADD CONSTRAINT payments_student_id_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
CREATE INDEX payments_student_id_idx ON payments (student_id);
ALTER TABLE payroll ADD CONSTRAINT payroll_staff_id_fk FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE RESTRICT;
CREATE INDEX payroll_staff_id_idx ON payroll (staff_id);
ALTER TABLE book_loans ADD CONSTRAINT book_loans_book_id_fk FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE RESTRICT;
CREATE INDEX book_loans_book_id_idx ON book_loans (book_id);
ALTER TABLE book_loans ADD CONSTRAINT book_loans_student_id_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
CREATE INDEX book_loans_student_id_idx ON book_loans (student_id);
ALTER TABLE messages ADD CONSTRAINT messages_from_user_id_fk FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE RESTRICT;
CREATE INDEX messages_from_user_id_idx ON messages (from_user_id);
ALTER TABLE messages ADD CONSTRAINT messages_to_user_id_fk FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE RESTRICT;
CREATE INDEX messages_to_user_id_idx ON messages (to_user_id);
ALTER TABLE users ADD CONSTRAINT users_staff_id_fk FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE RESTRICT;
CREATE INDEX users_staff_id_idx ON users (staff_id);
ALTER TABLE users ADD CONSTRAINT users_student_id_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
CREATE INDEX users_student_id_idx ON users (student_id);
ALTER TABLE users ADD CONSTRAINT users_guardian_id_fk FOREIGN KEY (guardian_id) REFERENCES guardians(id) ON DELETE RESTRICT;
CREATE INDEX users_guardian_id_idx ON users (guardian_id);

CREATE INDEX attendance_date_idx ON attendance (date);
CREATE INDEX attendance_class_date_idx ON attendance (class_id, date);
CREATE INDEX invoices_due_idx ON invoices (due_date) WHERE status <> 'Paid';
CREATE INDEX payments_paid_on_idx ON payments (paid_on);
CREATE INDEX audit_logs_at_idx ON audit_logs (at DESC);
CREATE INDEX messages_inbox_idx ON messages (to_user_id, is_read);

-- ───────────── 2. Close the tables to the publishable key ─────────────
-- Lock the tables to the API server.
-- Hosted Postgres such as Supabase publishes every table in the public schema through an
-- auto-generated REST API that anyone holding the publishable key can call. Row level
-- security with no policies closes that door: the API server connects as the table owner,
-- which is not subject to these checks, and is the only way in.

ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE hostel_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text; t text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      FOREACH t IN ARRAY ARRAY['academic_years', 'classes', 'subjects', 'timetable', 'attendance', 'exams', 'marks', 'assignments', 'students', 'guardians', 'staff', 'admissions', 'leave_requests', 'fee_structures', 'invoices', 'payments', 'expenses', 'payroll', 'transport_routes', 'books', 'book_loans', 'hostel_rooms', 'inventory_items', 'notices', 'events', 'messages', 'users', 'audit_logs', 'settings'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', t, r);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- ───────────── 3. Tell the API server these steps are already done ─────────────
CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
INSERT INTO schema_migrations (name) VALUES ('001_init.sql'), ('002_lock_down_tables.sql');

-- ───────────── 4. Minimum data needed to sign in ─────────────
-- First administrator. Email: admin@school.example   Password: Scholaris@2026
-- Change the email under User accounts and the password from the profile menu after the first sign-in.
INSERT INTO users (id, name, email, role, active, password_hash)
VALUES ('usr_admin', 'School Administrator', 'admin@school.example', 'admin', true, '$2a$10$wRO8c8I8Ui9hKs9NfjHjN.Ud8ivrW26TPv7/VVeY433BvbiN8TTye');

INSERT INTO settings (id, key, value) VALUES
  ('set_1', 'school_name', 'My School'),
  ('set_2', 'school_address', ''),
  ('set_3', 'school_phone', ''),
  ('set_5', 'currency', 'INR'),
  ('set_6', 'library_loan_days', '14'),
  ('set_7', 'library_fine_per_day', '2'),
  ('set_8', 'pass_percentage', '33');

INSERT INTO academic_years (id, name, start_date, end_date, is_current)
VALUES ('ay_cur', '2026-27', '2026-06-08', '2027-04-15', true);

COMMIT;

-- Check: should list 30 tables.
SELECT count(*) AS scholaris_tables FROM information_schema.tables WHERE table_schema = 'scholaris';

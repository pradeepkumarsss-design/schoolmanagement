# Scholaris

A school management system: React front end, Express API, PostgreSQL database.

It covers academics (classes, timetable, attendance, exams, report cards, homework), people (students, guardians, staff, admissions, leave), finance (fee structure, invoices, receipts, expenses, payroll), operations (library, transport, hostel, inventory) and communication (notices, calendar, messages), with separate views for administrators, teachers, accounts staff, students and parents.

## Run it

Needs Node 20+ and PostgreSQL 14+.

```bash
npm run setup                      # install server and client packages
cp server/.env.example server/.env # then set DATABASE_URL and JWT_SECRET
npm --prefix server run seed       # create tables and load sample data
npm run dev:api                    # API on http://localhost:4000
npm run dev:web                    # app on http://localhost:5173
```

Sample accounts all use the password `demo1234`:

| Role | Email |
|---|---|
| Administrator | principal@meridian.example |
| Teacher | teacher@meridian.example |
| Accounts | accounts@meridian.example |
| Student | student@meridian.example |
| Parent | parent@meridian.example |

The API and the app always use the database in `DATABASE_URL`; there is no in-memory fallback. (`npm --prefix client run build:demo` still builds a separate browser-only demo on sample data.)

### Run as a single server

For production, or to try it without the Vite dev server, build once and let the API serve the app too:

```bash
npm run build   # React app into client/dist, API into server/dist
npm start       # API and app together on http://localhost:4000
```

Add `NODE_ENV=production` to `server/.env` and set `JWT_SECRET` to a long random value (`openssl rand -hex 32`); the server refuses to start in production with the placeholder secret. Run it under a process manager such as PM2 or a Windows service so it restarts after a crash or reboot.

## Using Supabase as the database

Supabase is hosted PostgreSQL, so the API server connects to it like any other Postgres database.

1. In the Supabase dashboard open **Connect** and copy the **Session pooler** connection string. It contains your database password.
2. Copy `server/.env.supabase.example` to `server/.env`, paste the string into `DATABASE_URL` and set `JWT_SECRET`.
3. Run `npm --prefix server run seed`. This creates the tables in a `scholaris` schema and loads the sample data. Use `npm --prefix server run migrate` instead for empty tables.
4. Start the API and the app as above.

No command line yet? Paste `supabase/setup.sql` into the Supabase SQL Editor and run it instead of step 3. It creates the same tables, plus a first administrator (`admin@school.example` / `Scholaris@2026`, change both after signing in). `supabase/remove.sql` drops everything again.

The connection is encrypted automatically for Supabase hosts. Set `DATABASE_CA_CERT` to Supabase's CA certificate file to verify the server certificate as well.

The browser never talks to Supabase directly, so the project's publishable key is not used. This is deliberate: role permissions, row scoping and the audit trail are enforced in the API server. The tables sit in their own schema, outside Supabase's auto-generated REST API, with row level security switched on and no policies, so the publishable key cannot read or change them. Keep the database password and `JWT_SECRET` in `server/.env` only.

## How it is put together

```
shared/   Record definitions, permissions, validation, business rules, sample data
server/   Express API, PostgreSQL store, migrations, tests
client/   React app (Vite + TypeScript)
```

`shared/resources.ts` is the single description of every record type: its fields, who can read or change it, and how rows are scoped to a student or staff member. Three things are generated from it:

- the database schema (`npm --prefix server run gen:schema`),
- the REST endpoints with validation and permission checks,
- the list, detail and form screens in the client.

Operations that touch several record types (marking a register, collecting a fee, running payroll, enrolling an applicant, issuing a book) live in `shared/services.ts` and are exposed as `POST /api/actions/:name`. They are written against a small `Store` interface with two implementations: PostgreSQL for the server and an in-memory one. That lets the separate demo build (`npm --prefix client run build:demo`) run the very same rules in the browser, which is how the hosted demo works.

### API

| | |
|---|---|
| `POST /api/auth/login` | email + password + role, returns a JWT; a correct password under the wrong role is refused |
| `GET /api/auth/me`, `POST /api/auth/password` | session user, change password |
| `GET /api/:resource` | list with `filter` (JSON), `search`, `sort`, `limit`, `offset` |
| `GET/POST/PATCH/DELETE /api/:resource[/:id]` | CRUD |
| `GET /api/lookup/:resource` | id + label pairs for dropdowns |
| `POST /api/actions/:name` | business operations |
| `GET /api/health` | liveness and database check |

### Security

- Passwords are hashed with bcrypt; sign-in is rate limited.
- Every request re-reads the user, so deactivating an account takes effect at once.
- Role permissions and row scoping are enforced on the server. Students see only their own records; parents only their children's; teachers only their own leave and payslips.
- Input is validated against the record definitions and all SQL is parameterised.
- Changes to key records are written to an append-only audit trail.

## Tests

```bash
npm test                               # API tests on the in-memory store
DB=postgres npm test                   # same tests on PostgreSQL (seed first)
```

## Before going live

This is a complete working base, not a hardened deployment. Things a real rollout still needs: HTTPS and a reverse proxy, database backups, password reset by email, an online payment gateway (payments are recorded manually today), SMS or email notifications, file uploads for documents and photos, and a review of fee, payroll and grading rules against your school's own policies. The sample school, people and figures are fictional.

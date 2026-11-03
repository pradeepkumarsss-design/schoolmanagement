import {
  ArrowLeft, BarChart3, Bell, BookOpen, Boxes, Bus, CalendarCheck, CalendarDays, ClipboardList, FileSpreadsheet, GraduationCap, HandCoins, History, Home, KeyRound,
  LayoutDashboard, Library, LogOut, Mail, Menu, NotebookPen, Receipt, School, Settings, ShieldCheck, Table2, UserCog, UserPlus, Users, UsersRound, Wallet, type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { can } from '../../shared/access';
import { todayIn } from '../../shared/auth';
import { RES } from '../../shared/resources';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../shared/seed';
import { ROLES, type AuthUser, type Role } from '../../shared/types';
import { api, clearLookups, http } from './api';
import { AttendancePage, ExamsPage, TimetablePage } from './pages/Academics';
import { Dashboard } from './pages/Dashboard';
import { FeesPage, PayrollPage } from './pages/Finance';
import { LibraryPage, MessagesPage, ReportsPage } from './pages/Operations';
import { AdmissionsPage, LeavePage, StudentProfile, StudentsPage } from './pages/People';
import { AppContext, Busy, Empty, ErrorNote, initials, Modal, resetSettings, ResourceTable, Spinner, useSettings, type Route } from './ui';

interface NavItem { page: string; label: string; icon: LucideIcon; group: string; show: (u: AuthUser) => boolean }
const staff = (u: AuthUser) => u.role === 'admin' || u.role === 'teacher' || u.role === 'accountant';
const family = (u: AuthUser) => u.role === 'student' || u.role === 'parent';
const r = (resource: string, label: string, icon: LucideIcon, group: string, extra: (u: AuthUser) => boolean = () => true): NavItem =>
  ({ page: `r:${resource}`, label, icon, group, show: u => can(u, resource, 'r') && extra(u) });

const NAV: NavItem[] = [
  { page: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Overview', show: () => true },
  { page: 'reports', label: 'Reports', icon: BarChart3, group: 'Overview', show: staff },
  { page: 'student', label: 'My profile', icon: GraduationCap, group: 'Overview', show: u => u.role === 'student' },
  { page: 'student', label: 'My children', icon: UsersRound, group: 'Overview', show: u => u.role === 'parent' },
  { page: 'attendance', label: 'Attendance', icon: CalendarCheck, group: 'Academics', show: u => u.role !== 'accountant' },
  { page: 'timetable', label: 'Timetable', icon: Table2, group: 'Academics', show: u => u.role !== 'accountant' },
  { page: 'exams', label: 'Exams and results', icon: FileSpreadsheet, group: 'Academics', show: u => u.role === 'admin' || u.role === 'teacher' },
  { page: 'exams', label: 'Results', icon: FileSpreadsheet, group: 'Academics', show: family },
  r('assignments', 'Homework', NotebookPen, 'Academics'),
  r('classes', 'Classes', School, 'Academics', staff),
  r('subjects', 'Subjects', BookOpen, 'Academics', u => u.role === 'admin'),
  r('students', 'Students', Users, 'People', staff),
  r('guardians', 'Guardians', UsersRound, 'People'),
  r('admissions', 'Admissions', UserPlus, 'People'),
  r('staff', 'Staff', UserCog, 'People'),
  r('leave_requests', 'Leave', ClipboardList, 'People', u => u.role !== 'accountant'),
  { page: 'fees', label: 'Fees', icon: Wallet, group: 'Finance', show: u => u.role !== 'teacher' },
  r('fee_structures', 'Fee structure', Receipt, 'Finance'),
  r('expenses', 'Expenses', HandCoins, 'Finance'),
  { page: 'payroll', label: 'Payroll', icon: Wallet, group: 'Finance', show: u => u.role === 'admin' || u.role === 'accountant' },
  { page: 'payroll', label: 'My payslips', icon: Wallet, group: 'Finance', show: u => u.role === 'teacher' },
  { page: 'library', label: 'Library', icon: Library, group: 'Operations', show: u => u.role !== 'accountant' },
  r('transport_routes', 'Transport', Bus, 'Operations'),
  r('hostel_rooms', 'Hostel', Home, 'Operations'),
  r('inventory_items', 'Inventory', Boxes, 'Operations'),
  r('notices', 'Notices', Bell, 'Communication'),
  r('events', 'Calendar', CalendarDays, 'Communication'),
  { page: 'messages', label: 'Messages', icon: Mail, group: 'Communication', show: () => true },
  r('users', 'User accounts', ShieldCheck, 'System'),
  r('audit_logs', 'Audit trail', History, 'System'),
  r('settings', 'Settings', Settings, 'System', u => u.role === 'admin'),
];
/** True when the app owns the browser tab, false when it is embedded in another page. */
const standalone = (() => { try { return window.top === window.self; } catch { return false; } })();
function replaceUrl(route: Route, i: number) {
  if (!standalone) return;
  try { history.replaceState({ i }, '', '#' + route.page.replace(':', '-')); } catch { /* not allowed here */ }
}
function titleOf(route: Route, user: AuthUser): string {
  if (route.page === 'student' && route.params?.id) return 'Student profile';
  return NAV.find(n => n.page === route.page && n.show(user))?.label ?? RES[route.page.slice(2)]?.label ?? 'Page';
}
const ROLE_LABEL: Record<string, string> = { admin: 'Administrator', teacher: 'Teacher', accountant: 'Accounts', student: 'Student', parent: 'Parent' };

const ROLE_ICON: Record<string, LucideIcon> = { admin: ShieldCheck, teacher: NotebookPen, accountant: Wallet, student: GraduationCap, parent: UsersRound };
const ROLE_HINT: Record<string, string> = {
  admin: 'Runs the whole school: every module, user accounts and the audit trail.',
  teacher: 'Marks attendance, enters marks, sets homework and applies for leave.',
  accountant: 'Issues fee invoices, records payments, tracks expenses and runs payroll.',
  student: 'Sees their own timetable, attendance, results, homework and fees.',
  parent: 'Follows each of their children: attendance, results, fees and messages.',
};

function Login({ onLogin }: { onLogin: (u: AuthUser) => void }) {
  const demo = api.mode === 'demo';
  const sample = (role: Role) => DEMO_ACCOUNTS.find(a => a.role === role)!;
  const [role, setRole] = useState<Role>('admin');
  const [email, setEmail] = useState(demo ? sample('admin').email : ''), [password, setPassword] = useState(demo ? DEMO_PASSWORD : '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pick = (r: Role) => { setRole(r); setError(''); if (demo) { setEmail(sample(r).email); setPassword(DEMO_PASSWORD); } };
  const fill = () => { setEmail(sample(role).email); setPassword(DEMO_PASSWORD); setError(''); };
  const signIn = async () => {
    setBusy(true); setError('');
    try { onLogin(await api.login(email, password, role)); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="login">
      <div className="login-board">
        <div className="brand" style={{ padding: 0 }}><div className="brand-mark">S</div><div><b>Scholaris</b><span>School management</span></div></div>
        <div className="stack">
          <h1>One register for the whole school.</h1>
          <ul>
            <li><CalendarCheck size={16} /> Attendance, timetable, exams and report cards</li>
            <li><Wallet size={16} /> Fee invoices, receipts, expenses and payroll</li>
            <li><Bus size={16} /> Library, transport, hostel and inventory</li>
            <li><UsersRound size={16} /> Separate sign-in for staff, students and parents</li>
          </ul>
        </div>
        <span className="small" style={{ color: 'var(--rail-muted)' }}>Meridian Public School is a fictional school. All names and figures are sample data.</span>
      </div>
      <div className="login-form"><form className="stack" onSubmit={e => { e.preventDefault(); signIn(); }}>
        <div><h1>Sign in</h1><p className="muted" style={{ marginTop: 6 }}>Choose how you use the school system, then enter your email and password.</p></div>
        <div className="stack tight">
          <span className="eyebrow" id="role-label">I am signing in as</span>
          <div className="roles" role="radiogroup" aria-labelledby="role-label">
            {ROLES.map(r => { const Icon = ROLE_ICON[r]; return (
              <button key={r} type="button" role="radio" aria-checked={role === r} className="role" onClick={() => pick(r)}><Icon size={18} /><span>{r === 'admin' ? 'Admin' : ROLE_LABEL[r]}</span></button>
            ); })}
          </div>
          <p className="small muted">{ROLE_HINT[role]}</p>
        </div>
        {error && <ErrorNote message={error} />}
        <div className="field"><label htmlFor="login-email">Email</label><input id="login-email" type="email" autoComplete="username" className="input" value={email} onChange={e => setEmail(e.target.value)} required /></div>
        <div className="field"><label htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" className="input" value={password} onChange={e => setPassword(e.target.value)} required /></div>
        <Busy busy={busy} className="btn primary" type="submit" style={{ height: 40 }}>Sign in as {ROLE_LABEL[role].toLowerCase()}</Busy>
        <div className="sample">
          <div className="grow"><div className="eyebrow">Sample {ROLE_LABEL[role].toLowerCase()} login</div>
            <div className="mono" style={{ marginTop: 4, overflowWrap: 'anywhere' }}>{sample(role).email}<br />{DEMO_PASSWORD}</div></div>
          <button type="button" className="btn sm" onClick={fill}>Use this</button>
        </div>
        {demo && <p className="small muted">This demo runs in your browser on sample data. Changes last until the page reloads.</p>}
      </form></div>
    </div>
  );
}

function PasswordModal({ onClose, toast }: { onClose: () => void; toast: (m: string) => void }) {
  const [current, setCurrent] = useState(''), [next, setNext] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try { await api.changePassword(current, next); toast('Password changed'); onClose(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Change password" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><Busy busy={busy} className="btn primary" onClick={save}>Change password</Busy></>}>
      <div className="stack">
        {error && <ErrorNote message={error} />}
        <div className="field"><label htmlFor="pw-current">Current password</label><input id="pw-current" type="password" autoComplete="current-password" className="input" value={current} onChange={e => setCurrent(e.target.value)} /></div>
        <div className="field"><label htmlFor="pw-next">New password (at least 8 characters)</label><input id="pw-next" type="password" autoComplete="new-password" className="input" value={next} onChange={e => setNext(e.target.value)} /></div>
      </div>
    </Modal>
  );
}

function Page({ route, user }: { route: Route; user: AuthUser }) {
  switch (route.page) {
    case 'dashboard': return <Dashboard />;
    case 'reports': return <ReportsPage />;
    case 'attendance': return <AttendancePage />;
    case 'timetable': return <TimetablePage />;
    case 'exams': return <ExamsPage />;
    case 'fees': return <FeesPage />;
    case 'payroll': return <PayrollPage />;
    case 'library': return <LibraryPage />;
    case 'messages': return <MessagesPage />;
    case 'student': return <StudentProfile />;
    case 'r:students': return <StudentsPage />;
    case 'r:admissions': return <AdmissionsPage />;
    case 'r:leave_requests': return <LeavePage />;
  }
  const resource = route.page.startsWith('r:') ? route.page.slice(2) : '';
  if (!RES[resource] || !can(user, resource, 'r')) return <Empty>This page is not available for your role.</Empty>;
  const subs: Record<string, string> = {
    audit_logs: 'Every change to key records, with who made it and when. Entries cannot be edited or deleted.',
    settings: 'School profile and rules used across the system, such as library loan days and the pass percentage.',
    users: 'Who can sign in and what they can see. Link a user to a staff, student or guardian record to scope their access.',
    inventory_items: 'Stock on hand. Items at or below the reorder level are flagged on the dashboard.',
    fee_structures: 'Fee heads by grade band. Term invoices are built from these amounts.',
  };
  return <ResourceTable resource={resource} sub={subs[resource]} />;
}

export function App() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  // Navigation history: every page change is an entry, so Back (and the browser's own
  // back and forward buttons) work from any screen.
  const [nav, setNav] = useState<{ entries: Route[]; index: number }>({ entries: [{ page: 'dashboard' }], index: 0 });
  const route = nav.entries[nav.index];
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: string }[]>([]);
  const [navOpen, setNavOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [password, setPassword] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => todayIn(), []);

  useEffect(() => { api.restore().then(setUser); }, []);
  const signOut = useCallback(() => { api.logout(); clearLookups(); resetSettings(); setUser(null); setNav({ entries: [{ page: 'dashboard' }], index: 0 }); replaceUrl({ page: 'dashboard' }, 0); setMenu(false); }, []);
  useEffect(() => { if (http) http.onExpired = () => setUser(null); }, []);

  const toast = useCallback((message: string, tone: 'ok' | 'bad' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message, tone }]);
    window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), tone === 'bad' ? 6000 : 3500);
  }, []);
  const go = useCallback((page: string, params?: Record<string, any>) => {
    setNavOpen(false);
    setNav(n => {
      const cur = n.entries[n.index];
      if (cur.page === page && JSON.stringify(cur.params ?? {}) === JSON.stringify(params ?? {})) return n;
      const entries = [...n.entries.slice(0, n.index + 1), { page, params }];
      if (standalone) { try { history.pushState({ i: entries.length - 1 }, '', '#' + page.replace(':', '-')); } catch { /* not allowed here */ } }
      return { entries, index: entries.length - 1 };
    });
  }, []);
  const back = useCallback(() => {
    // In a normal browser tab, go through the browser so its history stays in step.
    if (standalone && history.state?.i > 0) history.back();
    else setNav(n => (n.index > 0 ? { ...n, index: n.index - 1 } : n));
  }, []);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => setNav(n => { const i = Number(e.state?.i ?? 0); return n.entries[i] ? { ...n, index: i } : n; });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }); setNavOpen(false); }, [nav.index]);
  // Alt + Left Arrow goes back, as in a browser.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); back(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back]);

  if (user === undefined) return <Spinner label="Starting" />;
  if (!user) return <Login onLogin={u => { clearLookups(); setNav({ entries: [{ page: 'dashboard' }], index: 0 }); replaceUrl({ page: 'dashboard' }, 0); setUser(u); }} />;

  const items = NAV.filter(n => n.show(user));
  const groups = [...new Set(items.map(n => n.group))];
  const previous = nav.index > 0 ? titleOf(nav.entries[nav.index - 1], user) : '';
  return (
    <AppContext.Provider value={{ user, today, route, go, toast }}>
      <div className="shell">
        <button className={`scrim${navOpen ? ' open' : ''}`} aria-label="Close menu" onClick={() => setNavOpen(false)} />
        <aside className={`rail${navOpen ? ' open' : ''}`}>
          <SchoolBrand />
          <nav className="nav" aria-label="Main">
            {groups.map(g => (
              <div className="nav-group" key={g}>
                <span className="eyebrow">{g}</span>
                {items.filter(n => n.group === g).map(n => (
                  <button key={n.page + n.label} className="nav-item" aria-current={route.page === n.page ? 'page' : undefined} onClick={() => go(n.page)}><n.icon size={16} />{n.label}</button>
                ))}
              </div>
            ))}
          </nav>
          <div className="rail-foot">{api.mode === 'demo' ? 'Demo data · resets when the page reloads' : 'Connected to the school server'}</div>
        </aside>
        <div className="main" ref={mainRef}>
          <header className="topbar">
            <button className="btn ghost icon menu-btn" aria-label="Open menu" onClick={() => setNavOpen(true)}><Menu size={18} /></button>
            <button className="btn back-btn" onClick={back} disabled={nav.index === 0} title={previous ? `Back to ${previous}` : 'No earlier page'} aria-label={previous ? `Back to ${previous}` : 'Back'}>
              <ArrowLeft size={16} /><span>Back</span>
            </button>
            <span className="crumb grow">{previous && <span className="muted hide-sm">{previous} / </span>}<b>{titleOf(route, user)}</b></span>
            <span className="badge hide-sm">{ROLE_LABEL[user.role]}</span>
            <div style={{ position: 'relative' }}>
              <button className="btn ghost" onClick={() => setMenu(m => !m)} aria-haspopup="menu" aria-expanded={menu} style={{ paddingInline: 6 }}>
                <span className="avatar">{initials(user.name)}</span><span className="hide-sm">{user.name}</span>
              </button>
              {menu && (
                <div className="menu" role="menu">
                  <div style={{ padding: '6px 10px 8px' }}><b>{user.name}</b><div className="small muted">{user.email}</div></div>
                  <button role="menuitem" onClick={() => { setMenu(false); setPassword(true); }}><KeyRound size={15} /> Change password</button>
                  <button role="menuitem" onClick={signOut}><LogOut size={15} /> {api.mode === 'demo' ? 'Switch role' : 'Sign out'}</button>
                </div>
              )}
            </div>
          </header>
          <main className="content" key={route.page + JSON.stringify(route.params ?? {})}><Page route={route} user={user} /></main>
        </div>
      </div>
      <div className="toasts" role="status" aria-live="polite">{toasts.map(t => <div key={t.id} className={`toast${t.tone === 'bad' ? ' bad' : ''}`}>{t.message}</div>)}</div>
      {password && <PasswordModal onClose={() => setPassword(false)} toast={toast} />}
    </AppContext.Provider>
  );
}

function SchoolBrand() {
  const s = useSettings();
  return <div className="brand"><div className="brand-mark">S</div><div><b>Scholaris</b><span>{s.school_name ?? 'School management'}</span></div></div>;
}

import type { AuthUser, Role, Row, Store } from './types';

const ROLE_NAME: Record<Role, string> = { admin: 'an administrator', teacher: 'a teacher', accountant: 'an accounts', student: 'a student', parent: 'a parent' };
/** Shown when the credentials are right but the account belongs to a different role. */
export const roleMismatch = (role: Role) => `This is not ${ROLE_NAME[role]} account. Choose the role the school gave you and sign in again.`;

/** Resolve the session user, including which students they may see. */
export async function toAuthUser(store: Store, u: Row): Promise<AuthUser> {
  let student_ids: string[] = [];
  if (u.role === 'student' && u.student_id) student_ids = [u.student_id];
  if (u.role === 'parent' && u.guardian_id)
    student_ids = (await store.list('students', { filter: { guardian_id: u.guardian_id }, limit: 50 })).rows.map(s => s.id);
  return { id: u.id, name: u.name, email: u.email, role: u.role, staff_id: u.staff_id ?? null, student_ids };
}

/** Today's date (YYYY-MM-DD) in the school's time zone. */
export function todayIn(timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

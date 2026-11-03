import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { crudCreate, crudGet, crudList, crudRemove, crudUpdate, lookup } from '../../shared/access';
import { roleMismatch, todayIn, toAuthUser } from '../../shared/auth';
import { runAction } from '../../shared/services';
import { AppError, ROLES, type AuthUser, type Ctx, type Query, type Store } from '../../shared/types';
import { config } from './config';

declare module 'express-serve-static-core' { interface Request { ctx?: Ctx } }

const hash = (password: string) => bcrypt.hash(password, 10);
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).then(body => { if (!res.headersSent) res.json(body ?? { ok: true }); }).catch(next);

export function createApp(store: Store, ping: () => Promise<void> = async () => {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    const t = Date.now();
    res.on('finish', () => { if (req.path.startsWith('/api') && process.env.NODE_ENV !== 'test') console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - t}ms`); });
    next();
  });

  app.get('/api/health', wrap(async () => { await ping(); return { status: 'ok', db: config.db, time: new Date().toISOString() }; }));

  // ── Sign-in
  const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: { message: 'Too many sign-in attempts. Try again in a few minutes.' } } });
  app.post('/api/auth/login', loginLimiter, wrap(async req => {
    const email = String(req.body?.email ?? '').trim().toLowerCase(), password = String(req.body?.password ?? '');
    const row = (await store.list('users', { filter: { email }, limit: 1 })).rows[0];
    // Compare against a dummy hash when the user is unknown so timing does not reveal which emails exist.
    const ok = await bcrypt.compare(password, row?.password_hash || '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Zf6gH6sFQW5V1p0pYz1m2h3n4o5pq');
    if (!row || !ok || !row.active) throw new AppError(401, 'Email or password is incorrect');
    // Role-wise sign-in: checked only after the password, so it cannot be used to probe accounts.
    const role = req.body?.role;
    if (role !== undefined && role !== null && row.role !== role) throw new AppError(403, ROLES.includes(role) ? roleMismatch(role) : 'Unknown role');
    await store.update('users', row.id, { last_login: new Date().toISOString() });
    const token = jwt.sign({ sub: row.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn as any });
    return { token, user: await toAuthUser(store, row) };
  }));

  // ── Everything below needs a valid token. The user is re-read on each request so
  //    deactivating an account or changing its role takes effect immediately.
  const api = express.Router();
  api.use((req, _res, next) => {
    (async () => {
      const header = req.headers.authorization ?? '';
      if (!header.startsWith('Bearer ')) throw new AppError(401, 'Sign in to continue');
      let sub: string;
      try { sub = (jwt.verify(header.slice(7), config.jwtSecret) as any).sub; } catch { throw new AppError(401, 'Your session has expired. Sign in again.'); }
      const row = await store.get('users', sub);
      if (!row || !row.active) throw new AppError(401, 'This account is no longer active');
      const user: AuthUser = await toAuthUser(store, row);
      req.ctx = { store, user, today: todayIn(config.timeZone) };
    })().then(() => next(), next);
  });

  api.get('/auth/me', wrap(async req => ({ user: req.ctx!.user })));
  api.post('/auth/password', wrap(async req => {
    const { current, next } = req.body ?? {};
    if (typeof next !== 'string' || next.length < 8) throw new AppError(422, 'Use at least 8 characters for the new password');
    const row = await store.get('users', req.ctx!.user.id);
    if (!row || !(await bcrypt.compare(String(current ?? ''), row.password_hash))) throw new AppError(422, 'Current password is incorrect');
    await store.update('users', row.id, { password_hash: await hash(next) });
  }));

  api.get('/lookup/:resource', wrap(req => lookup(req.ctx!, req.params.resource)));
  api.post('/actions/:name', wrap(req => runAction(req.ctx!, req.params.name, req.body)));

  const parseQuery = (req: Request): Query => {
    let filter: Query['filter'];
    if (typeof req.query.filter === 'string') { try { filter = JSON.parse(req.query.filter); } catch { throw new AppError(400, 'filter must be JSON'); } }
    return { filter, search: req.query.search as string, sort: req.query.sort as string, limit: Number(req.query.limit) || undefined, offset: Number(req.query.offset) || undefined };
  };
  api.get('/:resource', wrap(req => crudList(req.ctx!, req.params.resource, parseQuery(req))));
  api.get('/:resource/:id', wrap(req => crudGet(req.ctx!, req.params.resource, req.params.id)));
  api.post('/:resource', wrap(async (req, res) => { res.status(201); return crudCreate(req.ctx!, req.params.resource, req.body ?? {}, { hash }); }));
  api.patch('/:resource/:id', wrap(req => crudUpdate(req.ctx!, req.params.resource, req.params.id, req.body ?? {}, { hash })));
  api.delete('/:resource/:id', wrap(req => crudRemove(req.ctx!, req.params.resource, req.params.id)));
  app.use('/api', api);

  // ── Serve the built client from the same origin when it is present.
  const here = dirname(fileURLToPath(import.meta.url));
  const clientDist = [join(here, '../../client/dist'), join(here, '../client/dist'), join(here, 'public')].find(d => existsSync(join(d, 'index.html')));
  if (clientDist) {
    app.use(helmet.contentSecurityPolicy({ directives: { 'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], 'font-src': ["'self'", 'https://fonts.gstatic.com'] } }));
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
  }

  app.use((_req, _res, next) => next(new AppError(404, 'Not found')));
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) return res.status(err.status).json({ error: { message: err.message, details: err.details } });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: { message: 'Request body is not valid JSON' } });
    console.error(err);
    res.status(500).json({ error: { message: 'Something went wrong on the server. The error has been logged.' } });
  });
  return app;
}

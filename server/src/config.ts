import 'dotenv/config';

const env = process.env;
const production = env.NODE_ENV === 'production';

if (production && (!env.JWT_SECRET || env.JWT_SECRET === 'change-me'))
  throw new Error('JWT_SECRET must be set to a long random value in production');

if (!/^[a-z_][a-z0-9_]*$/.test(env.DATABASE_SCHEMA ?? 'public')) throw new Error('DATABASE_SCHEMA may only contain lowercase letters, digits and underscores');

// The app runs only against the configured database (Supabase). The in-memory store is kept for the test suite.
const testing = env.NODE_ENV === 'test';
if (!testing && env.DB === 'memory')
  throw new Error('DB=memory is disabled: the app only connects to the database in DATABASE_URL. Remove DB=memory from your shell or .env.');
if (!testing && !env.DATABASE_URL)
  throw new Error('DATABASE_URL is not set. Put the Supabase "Session pooler" connection string in server/.env.');

export const config = {
  production,
  port: Number(env.PORT ?? 4000),
  db: (testing && env.DB === 'memory' ? 'memory' : 'postgres') as 'postgres' | 'memory',
  databaseUrl: env.DATABASE_URL ?? 'postgres://scholaris:scholaris@localhost:5432/scholaris',
  /** disable | require (encrypted) | verify (encrypted and certificate checked). Empty = require for Supabase hosts, else disable. */
  databaseSsl: (env.DATABASE_SSL ?? '') as '' | 'disable' | 'require' | 'verify',
  /** Path to the database CA certificate (Supabase: Database settings, "SSL configuration"). Implies verify. */
  databaseCaCert: env.DATABASE_CA_CERT ?? '',
  /** Schema that holds the tables. A dedicated schema keeps them apart from anything else in the database. */
  databaseSchema: env.DATABASE_SCHEMA ?? 'public',
  jwtSecret: env.JWT_SECRET ?? 'dev-only-secret',
  jwtExpiresIn: env.JWT_EXPIRES_IN ?? '8h',
  corsOrigin: (env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map(s => s.trim()),
  timeZone: env.SCHOOL_TZ ?? 'Asia/Kolkata',
};

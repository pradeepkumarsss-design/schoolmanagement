import { createPool, migrate, seed } from './setup';

const [cmd, flag] = process.argv.slice(2);
const pool = createPool(2);
try {
  const applied = await migrate(pool);
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Schema is up to date.');
  if (cmd === 'seed') console.log(await seed(pool, flag === '--reset'));
} finally { await pool.end(); }

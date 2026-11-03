import { createApp } from './app';
import { config } from './config';
import { openStore } from './db/setup';

const { store, close, ping } = await openStore();
const server = createApp(store, ping).listen(config.port, () =>
  console.log(`Scholaris API listening on http://localhost:${config.port} (database: ${config.db})`));

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => server.close(() => close().then(() => process.exit(0))));

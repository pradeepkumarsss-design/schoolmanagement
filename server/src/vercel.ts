// Vercel serverless entry: one function serves every /api request.
// The store is opened once per warm instance and reused between requests.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app';
import { openStore } from './db/setup';

let app: Promise<ReturnType<typeof createApp>> | undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  app ??= openStore().then(({ store, ping }) => createApp(store, ping)).catch(err => { app = undefined; throw err; });
  try { (await app)(req as any, res as any); }
  catch (err) {
    console.error(err);
    res.statusCode = 500; res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { message: 'Server failed to start. Check the environment variables on Vercel.' } }));
  }
}

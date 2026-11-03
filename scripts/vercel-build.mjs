// Builds the Vercel Build Output (https://vercel.com/docs/build-output-api):
//   .vercel/output/static             -> the React app
//   .vercel/output/functions/api.func -> the Express API as one Node function
import { execSync } from 'node:child_process';
import { cpSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const out = join(root, '.vercel/output');
const fn = join(out, 'functions/api.func');
rmSync(out, { recursive: true, force: true });

execSync('npm --prefix client run build', { stdio: 'inherit' });
cpSync(join(root, 'client/dist'), join(out, 'static'), { recursive: true });

const { build } = await import(pathToFileURL(join(root, 'server/node_modules/esbuild/lib/main.js')).href);
await build({
  entryPoints: [join(root, 'server/src/vercel.ts')],
  outfile: join(fn, 'src/index.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node20',
  external: ['pg-native'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
// setup.ts looks for migrations at ../migrations relative to the bundle.
cpSync(join(root, 'server/migrations'), join(fn, 'migrations'), { recursive: true });
writeFileSync(join(fn, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs20.x', handler: 'src/index.mjs', launcherType: 'Nodejs', maxDuration: 30 }, null, 2));

writeFileSync(join(out, 'config.json'), JSON.stringify({
  version: 3,
  routes: [
    { src: '^/api(?:/.*)?$', dest: '/api' },
    { handle: 'filesystem' },
    { src: '/.*', dest: '/index.html' },
  ],
}, null, 2));
console.log('Vercel output ready in .vercel/output');

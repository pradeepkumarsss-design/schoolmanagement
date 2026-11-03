import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build` produces the normal app that talks to the API.
// `vite build --mode demo` produces one self-contained HTML file that runs the same
// business logic in the browser against sample data (no server needed).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), ...(mode === 'demo' ? [viteSingleFile()] : [])],
    server: { port: 5173, fs: { allow: ['..'] }, proxy: { '/api': env.VITE_PROXY_TARGET ?? 'http://localhost:4000' } },
    build: { outDir: mode === 'demo' ? 'dist-demo' : 'dist', chunkSizeWarningLimit: 1500 },
  };
});

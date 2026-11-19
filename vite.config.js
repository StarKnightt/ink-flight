import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Dev-only: the page can POST a canvas PNG here so the browser check
// leaves real files in ./shots to hold next to the references.
function shotSaver() {
  return {
    name: 'ink-flight-shot-saver',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        const q = new URL(req.url, 'http://x').searchParams;
        const name = (q.get('name') || 'shot').replace(/[^a-z0-9_-]/gi, '');
        const ext = q.get('ext') === 'jpg' ? 'jpg' : 'png';
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const dir = path.resolve('shots');
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, `${name}.${ext}`), Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [shotSaver()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  server: { host: '127.0.0.1' },
});

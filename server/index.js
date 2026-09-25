import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { createStore } from './storage.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const production = process.argv.includes('--production');
const port = Number(process.env.PORT || 5173);
const store = createStore(resolve(root, process.env.TREE_WORK_FILE || 'data/tasks.txt'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
let vite;

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  try {
    // This is a local app. Reject other hosts and cross-origin writes.
    const host = request.headers.host;
    if (!host || ![`localhost:${port}`, `127.0.0.1:${port}`].includes(host)) return json(response, 403, { error: 'Only local access is supported.' });
    const url = new URL(request.url, `http://${host}`);
    if (url.pathname === '/api/tasks') {
      if (request.method === 'GET') return json(response, 200, await store.read());
      if (request.method !== 'PUT') return json(response, 405, { error: 'Method not allowed.' });
      if (request.headers.origin && request.headers.origin !== `http://${host}`) return json(response, 403, { error: 'Cross-origin writes are not allowed.' });
      if (!request.headers['content-type']?.startsWith('application/json')) return json(response, 415, { error: 'Send application/json.' });
      let body = '';
      let size = 0;
      request.setEncoding('utf8');
      for await (const chunk of request) {
        size += Buffer.byteLength(chunk);
        if (size > 2_000_000) return json(response, 413, { error: 'Task file is too large.' });
        body += chunk;
      }
      let payload;
      try { payload = JSON.parse(body); } catch { return json(response, 400, { error: 'Invalid JSON.' }); }
      if (!payload || !Array.isArray(payload.tree) || typeof payload.revision !== 'string') return json(response, 400, { error: 'Send a tree and its revision.' });
      return json(response, 200, await store.save(payload.tree, payload.revision));
    }
    if (!production) return vite.middlewares(request, response);
    const dist = resolve(root, 'dist/web');
    const path = resolve(dist, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (!path.startsWith(`${dist}${sep}`)) return json(response, 403, { error: 'Invalid path.' });
    try {
      const content = await readFile(path);
      response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
      response.end(content);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      json(response, 404, { error: 'Not found. Run npm run web:build before npm run web:start.' });
    }
  } catch (error) {
    console.error(error.message);
    json(response, error.status || 400, { error: error.message });
  }
});

if (!production) {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
}
server.listen(port, '127.0.0.1', () => console.log(`Tree Work is ready at http://127.0.0.1:${port}`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; void vite?.close(); });

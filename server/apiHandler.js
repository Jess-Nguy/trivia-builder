import fs from 'node:fs';
import { listFiles, resolveImportPath, parseCsv } from './csv.js';

// Connect-style middleware that serves the trivia API. Mounted by both the
// Vite dev server (in dev) and Express (in production) so the API lives in one
// place and runs on a single port — no proxy, no second process.
export function apiMiddleware(req, res, next) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  if (!p.startsWith('/api/')) return next();

  res.setHeader('Content-Type', 'application/json');
  const send = (code, obj) => {
    res.statusCode = code;
    res.end(JSON.stringify(obj));
  };

  try {
    if (p === '/api/health') return send(200, { ok: true });
    if (p === '/api/files') return send(200, { files: listFiles() });
    if (p.startsWith('/api/files/')) {
      const name = decodeURIComponent(p.slice('/api/files/'.length));
      const filePath = resolveImportPath(name);
      if (!filePath) return send(400, { error: 'Invalid file name.' });
      if (!fs.existsSync(filePath)) return send(404, { error: 'File not found.' });
      return send(200, { name, ...parseCsv(filePath) });
    }
    return send(404, { error: 'Not found.' });
  } catch (err) {
    return send(500, { error: `Server error: ${err.message}` });
  }
}

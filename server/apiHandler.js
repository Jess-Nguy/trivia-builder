import fs from 'node:fs';
import { listFiles, resolveImportPath, parseCsv, listAudioTracks } from './csv.js';
import {
  LibraryError,
  getLibrary,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  markSeen,
  createPlaylist,
  updatePlaylist,
  addToPlaylist,
  deletePlaylist,
  getPlaylistGame,
  importCsv,
  playlistCsv,
} from './library.js';
import { isLoopback, lanAddresses, network } from './game.js';

const MAX_BODY = 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new LibraryError(413, 'Request body too large.'));
        req.destroy();
      } else {
        chunks.push(c);
      }
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new LibraryError(400, 'Body must be JSON.'));
      }
    });
    req.on('error', reject);
  });
}

// Connect-style middleware that serves the trivia API. Mounted by both the
// Vite dev server (in dev) and Express (in production) so the API lives in one
// place and runs on a single port — no proxy, no second process.
export async function apiMiddleware(req, res, next) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  if (!p.startsWith('/api/')) return next();

  res.setHeader('Content-Type', 'application/json');
  // Phones on the LAN load the page and the game socket, never the API: it
  // returns answers and writes the question bank.
  if (!isLoopback(req.socket.remoteAddress)) {
    res.statusCode = 403;
    return res.end(JSON.stringify({ error: 'The API is only available on the host computer.' }));
  }
  const send = (code, obj) => {
    res.statusCode = code;
    res.end(JSON.stringify(obj));
  };
  const m = req.method;

  try {
    // `/api/library/<kind>/<id>[/<action>]`
    const [, , , kind, id, action] = p.startsWith('/api/library/')
      ? p.split('/').map(decodeURIComponent)
      : [];

    if (p === '/api/health') return send(200, { ok: true });
    if (p === '/api/files') return send(200, { files: listFiles() });
    if (p === '/api/lan') return send(200, { enabled: network.lanEnabled, addresses: lanAddresses() });
    if (p === '/api/background-audio') return send(200, { tracks: listAudioTracks() });
    if (p.startsWith('/api/files/')) {
      const name = decodeURIComponent(p.slice('/api/files/'.length));
      const filePath = resolveImportPath(name);
      if (!filePath) return send(400, { error: 'Invalid file name.' });
      if (!fs.existsSync(filePath)) return send(404, { error: 'File not found.' });
      return send(200, { name, ...parseCsv(filePath) });
    }

    if (p === '/api/library' && m === 'GET') return send(200, getLibrary());

    if (p === '/api/library/import' && m === 'POST') {
      const { fileName } = await readBody(req);
      const filePath = resolveImportPath(String(fileName || ''));
      if (!filePath || !fileName) return send(400, { error: 'Invalid file name.' });
      if (!fs.existsSync(filePath)) return send(404, { error: 'File not found.' });
      return send(200, importCsv(filePath, fileName));
    }

    if (p === '/api/library/seen' && m === 'POST') {
      const { ids } = await readBody(req);
      return send(200, { changed: markSeen(Array.isArray(ids) ? ids : []) });
    }

    if (kind === 'questions') {
      if (!id && m === 'POST') return send(201, createQuestion(await readBody(req)));
      if (id && m === 'PUT') return send(200, updateQuestion(id, await readBody(req)));
      if (id && m === 'DELETE') {
        deleteQuestion(id);
        return send(200, { ok: true });
      }
    }

    if (kind === 'playlists') {
      if (!id && m === 'POST') return send(201, createPlaylist(await readBody(req)));
      if (id && !action && m === 'GET') return send(200, getPlaylistGame(id));
      if (id && !action && m === 'PUT') return send(200, updatePlaylist(id, await readBody(req)));
      if (id && !action && m === 'DELETE') {
        deletePlaylist(id);
        return send(200, { ok: true });
      }
      if (id && action === 'add' && m === 'POST') {
        const { questionIds } = await readBody(req);
        return send(200, addToPlaylist(id, Array.isArray(questionIds) ? questionIds : []));
      }
      if (id && action === 'csv' && m === 'GET') {
        const { name, csv } = playlistCsv(id);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        // Strip characters that would break the header; the browser handles the rest.
        res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/["\\\r\n]/g, '')}.csv"`);
        res.statusCode = 200;
        return res.end(csv);
      }
    }

    return send(404, { error: 'Not found.' });
  } catch (err) {
    if (err instanceof LibraryError) return send(err.status, { error: err.message, problems: err.problems });
    return send(500, { error: `Server error: ${err.message}` });
  }
}

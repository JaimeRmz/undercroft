// Zero-dependency dev server: static files + mod API + guarded editor save.
// Node core modules only (per CLAUDE.md §2 tech stack rules).
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const MODS_DIR = path.join(ROOT, 'mods');
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

/** Resolve a request path safely under ROOT. Returns null if it escapes ROOT. */
function safeResolve(base, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const resolved = path.normalize(path.join(base, decoded));
  const relative = path.relative(base, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return resolved;
}

async function listModManifests() {
  const manifests = [];
  let entries = [];
  try {
    entries = await fsp.readdir(MODS_DIR, { withFileTypes: true });
  } catch {
    return manifests;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(MODS_DIR, entry.name, 'mod.json');
    try {
      const raw = await fsp.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw);
      manifest._dir = entry.name;
      manifests.push(manifest);
    } catch (err) {
      manifests.push({ _dir: entry.name, _error: `mod.json missing or invalid: ${err.message}` });
    }
  }
  return manifests;
}

/** Cheap change-detection hash: sum of mtimeMs + size over every file under mods/. */
async function hashModsDir() {
  let total = 0;
  async function walk(dir) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        try {
          const stat = await fsp.stat(full);
          total += stat.mtimeMs + stat.size;
        } catch {
          /* file vanished mid-walk; ignore */
        }
      }
    }
  }
  await walk(MODS_DIR);
  return String(Math.round(total));
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

async function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/** Lists files directly inside a mod's content subfolder (e.g. mods/core/items/). Browsers can't read directories themselves. */
async function listModFolderFiles(modDir, folder) {
  const target = safeResolve(MODS_DIR, `/${modDir}/${folder}`);
  if (!target) return [];
  try {
    const entries = await fsp.readdir(target, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** Guarded save endpoint for editor.html: only writes under mods/, only .json or .js, no traversal. */
async function handleSave(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (err) {
    return sendJson(res, 400, { error: `invalid request body: ${err.message}` });
  }
  const { path: relPath, content } = payload || {};
  if (typeof relPath !== 'string' || typeof content !== 'string') {
    return sendJson(res, 400, { error: 'request must include string "path" and "content"' });
  }
  const ext = path.extname(relPath);
  if (ext !== '.json' && ext !== '.js') {
    return sendJson(res, 400, { error: `only .json and .js files may be saved, got "${ext}"` });
  }
  const normalized = relPath.replace(/^\/+/, '');
  if (!normalized.startsWith('mods/') && !normalized.startsWith('mods\\')) {
    return sendJson(res, 400, { error: 'path must be under mods/' });
  }
  const target = safeResolve(ROOT, normalized);
  if (!target) {
    return sendJson(res, 400, { error: 'path escapes project root' });
  }
  if (ext === '.json') {
    try {
      JSON.parse(content);
    } catch (err) {
      return sendJson(res, 400, { error: `invalid JSON: ${err.message}` });
    }
  }
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, content, 'utf-8');
  return sendJson(res, 200, { ok: true, path: normalized });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/api/mods' && req.method === 'GET') {
      return sendJson(res, 200, { mods: await listModManifests() });
    }
    if (url.pathname === '/api/mods/hash' && req.method === 'GET') {
      return sendJson(res, 200, { hash: await hashModsDir() });
    }
    const listMatch = url.pathname.match(/^\/api\/mods\/([^/]+)\/list$/);
    if (listMatch && req.method === 'GET') {
      const folder = url.searchParams.get('folder') || '';
      return sendJson(res, 200, { files: await listModFolderFiles(listMatch[1], folder) });
    }
    if (url.pathname === '/api/save' && req.method === 'POST') {
      return await handleSave(req, res);
    }

    let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = safeResolve(ROOT, pathname);
    if (!filePath) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    let stat;
    try {
      stat = await fsp.stat(filePath);
    } catch {
      res.writeHead(404);
      return res.end('Not found');
    }
    if (stat.isDirectory()) {
      res.writeHead(404);
      return res.end('Not found');
    }

    const ext = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    const stream = fs.createReadStream(filePath);
    res.writeHead(200, { 'Content-Type': mime, 'Content-Length': stat.size });
    stream.pipe(res);
    stream.on('error', () => {
      res.writeHead(500);
      res.end('Internal error');
    });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  server.listen(PORT, () => {
    console.log(`Undercroft dev server running at http://localhost:${PORT}`);
  });
}

export { server, safeResolve, hashModsDir, listModManifests, listModFolderFiles };

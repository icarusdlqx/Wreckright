import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

export const PREVIEW_HEALTH_PATH = '/__wreckright_preview';
const CONTROL_FILES = new Set(['_headers', '_redirects']);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

export function parseReleaseHeaders(text) {
  const rules = [];
  let current;
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (line.startsWith('/')) {
      current = { path: line, headers: [] };
      rules.push(current);
    } else if (current !== undefined) {
      const removal = /^!\s+([\w-]+)$/u.exec(line);
      const header = /^([\w-]+):\s*(.*)$/u.exec(line);
      if (removal) current.headers.push([removal[1], null]);
      else if (header) current.headers.push([header[1], header[2]]);
      else throw new Error('Unsupported release header rule');
    } else throw new Error('Release header has no path');
  }
  return rules;
}

export function headersForPath(rules, path) {
  const headers = {};
  for (const rule of rules) {
    const matches = rule.path.endsWith('*') ? path.startsWith(rule.path.slice(0, -1)) : path === rule.path;
    if (!matches) continue;
    for (const [name, value] of rule.headers) {
      if (value === null) delete headers[name.toLowerCase()];
      else headers[name.toLowerCase()] = value;
    }
  }
  return headers;
}

function outside(root, path) {
  const result = relative(root, path);
  return result === '..' || result.startsWith(`..${sep}`) || isAbsolute(result);
}

async function buildFile(root, path, allowHeaders = false) {
  const file = await realpath(resolve(root, path));
  if (outside(root, file)) throw Object.assign(new Error('Outside release'), { code: 'EACCES' });
  const resolvedPath = relative(root, file);
  if (!(allowHeaders && resolvedPath === '_headers') &&
    resolvedPath.split(sep).some((segment) => segment.startsWith('.') || CONTROL_FILES.has(segment))) {
    throw Object.assign(new Error('Private release path'), { code: 'EACCES' });
  }
  const info = await stat(file);
  if (!info.isFile()) throw Object.assign(new Error('Not a file'), { code: 'ENOENT' });
  return file;
}

export async function inspectRelease(directory) {
  const root = await realpath(directory);
  const [index, headers] = await Promise.all([buildFile(root, 'index.html'), buildFile(root, '_headers', true)]);
  return { root, index, rules: parseReleaseHeaders(await readFile(headers, 'utf8')) };
}

/** A strict static release server: wiki navigation is a fragment, so missing assets stay missing. */
export async function startPreviewServer({ directory, ports = [5219, 5220], identity = 'wreckright-local' }) {
  if (ports.length === 0 || new Set(ports).size !== ports.length ||
    ports.some((port) => !Number.isInteger(port) || port < 0 || port > 65535)) {
    throw new Error('Preview ports must be distinct integers from 0 through 65535');
  }
  const release = await inspectRelease(directory);
  const servers = [];
  const boundPorts = [];
  const startedAt = new Date().toISOString();
  const respond = (response, status, body, headers = {}, head = false) => {
    response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers,
      'content-length': Buffer.byteLength(body) });
    response.end(head ? undefined : body);
  };
  const close = async () => {
    await Promise.all(servers.map((server) => new Promise((done) => {
      server.close(done);
      server.closeAllConnections();
    })));
  };
  const handler = async (request, response) => {
    const head = request.method === 'HEAD';
    const host = request.headers.host;
    const port = request.socket.localPort;
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
      respond(response, 421, 'Use the local preview address.'); return;
    }
    if (request.method !== 'GET' && !head) {
      respond(response, 405, 'Read-only preview.', { allow: 'GET, HEAD' }); return;
    }
    let path;
    try { path = decodeURIComponent((request.url ?? '/').split(/[?#]/u)[0]); }
    catch { respond(response, 400, 'Invalid path.', {}, head); return; }
    if (!path.startsWith('/') || path.includes('\0') || path.includes('\\')) {
      respond(response, 400, 'Invalid path.', {}, head); return;
    }
    const segments = path.split('/').filter(Boolean);
    if (segments.some((segment) => segment.startsWith('.') || CONTROL_FILES.has(segment))) {
      respond(response, 403, 'This path is not a release asset.', {}, head); return;
    }
    if (path === PREVIEW_HEALTH_PATH) {
      const bytes = await readFile(await buildFile(release.root, 'index.html'));
      respond(response, 200, JSON.stringify({ service: 'wreckright-local-preview', identity,
        ports: boundPorts, startedAt, build: createHash('sha256').update(bytes).digest('hex').slice(0, 16) }),
      { 'content-type': 'application/json; charset=utf-8' }, head); return;
    }
    if (path.endsWith('/')) path += 'index.html';
    try {
      const file = await buildFile(release.root, path.slice(1));
      const bytes = await readFile(file);
      const headers = headersForPath(release.rules, path);
      if (extname(file) === '.html') headers['cache-control'] = 'no-store';
      respond(response, 200, bytes, { ...headers, 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' }, head);
    } catch (error) {
      const forbidden = error.code === 'EACCES';
      respond(response, forbidden ? 403 : 404, forbidden ? 'This path is not a release asset.' : 'Release asset not found.', {}, head);
    }
  };
  try {
    for (const port of ports) {
      const server = createServer((request, response) => {
        void handler(request, response).catch(() => { if (!response.headersSent) respond(response, 503, 'Rebuild the local release and retry.'); else response.destroy(); });
      });
      server.requestTimeout = 10_000;
      server.headersTimeout = 10_000;
      server.keepAliveTimeout = 1_000;
      servers.push(server);
      await new Promise((ready, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', ready);
      });
      boundPorts.push(server.address().port);
    }
  } catch (error) { await close(); throw error; }
  return { ports: boundPorts, close };
}

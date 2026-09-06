import { request } from 'node:http';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { previewConfiguration, previewPlist, previewShutdownState } from '../tools/local-preview-control.mjs';
import { headersForPath, inspectRelease, parseReleaseHeaders, PREVIEW_HEALTH_PATH, startPreviewServer } from '../tools/local-preview-server.mjs';

const releaseHeaders = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');
const index = '<!doctype html><title>Local Wreckright fixture</title><script src="./assets/game.js"></script>';
let temporary: string;
let directory: string;
let server: Awaited<ReturnType<typeof startPreviewServer>>;
let port: number;

async function raw(path: string, options: { port?: number; method?: string; host?: string } = {}) {
  const selectedPort = options.port ?? port;
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((done, reject) => {
    const req = request({ hostname: '127.0.0.1', port: selectedPort, path, method: options.method ?? 'GET',
      headers: { host: options.host ?? `127.0.0.1:${selectedPort}` }, timeout: 2_000 }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => done({ status: response.statusCode!, headers: response.headers, body: Buffer.concat(chunks).toString() }));
      response.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Preview test timed out')));
    req.end();
  });
}

async function availablePort() {
  const listener = createServer();
  await new Promise<void>((done) => listener.listen(0, '127.0.0.1', done));
  const address = listener.address();
  if (address === null || typeof address === 'string') throw new Error('Missing test port');
  await new Promise<void>((done) => listener.close(() => done()));
  return address.port;
}

beforeAll(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'wreckright-preview-test-'));
  directory = join(temporary, 'release');
  await mkdir(join(directory, 'assets'), { recursive: true });
  await Promise.all([
    writeFile(join(directory, 'index.html'), index), writeFile(join(directory, '_headers'), releaseHeaders),
    writeFile(join(directory, 'assets/game.js'), 'export const release = true;'),
    writeFile(join(directory, 'assets/game.css'), 'body { color: teal; }'),
    writeFile(join(directory, 'assets/font.woff2'), 'fixture-font'),
    writeFile(join(directory, 'assets/art.webp'), 'fixture-image'),
    writeFile(join(directory, 'site.webmanifest'), '{"name":"Wreckright"}'),
    writeFile(join(temporary, 'private.txt'), 'must not be served'),
    writeFile(join(directory, '.private'), 'must not be served'),
  ]);
  await symlink(join(temporary, 'private.txt'), join(directory, 'assets/escaped.txt'));
  await symlink(join(directory, 'assets/game.js'), join(directory, 'assets/alias.js'));
  await symlink(join(directory, '.private'), join(directory, 'assets/private-alias.txt'));
  await symlink(join(directory, '_headers'), join(directory, 'assets/control-alias.txt'));
  server = await startPreviewServer({ directory, ports: [0], identity: 'test-preview' });
  port = server.ports[0]!;
});

afterAll(async () => {
  await server?.close();
  if (temporary !== undefined) await rm(temporary, { recursive: true, force: true });
});

describe('local release preview', () => {
  it('serves the same entry for root and index, including query parameters', async () => {
    expect((await raw('/')).body).toBe(index);
    expect((await raw('/index.html?review=1')).body).toBe(index);
    const head = await raw('/', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
    expect(head.headers['content-length']).toBe(String(Buffer.byteLength(index)));
    expect(head.headers['cache-control']).toBe('no-store');
  });

  it('preserves release CSP and security headers while supplying correct asset types', async () => {
    const expected = headersForPath(parseReleaseHeaders(releaseHeaders), '/assets/game.js');
    const script = await raw('/assets/game.js');
    expect(script.status).toBe(200);
    expect(script.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(script.headers['content-security-policy']).toBe(expected['content-security-policy']);
    expect(script.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(script.headers['x-content-type-options']).toBe('nosniff');
    expect(script.headers['cache-control']).toContain('immutable');
    expect((await raw('/assets/game.css')).headers['content-type']).toBe('text/css; charset=utf-8');
    expect((await raw('/assets/font.woff2')).headers['content-type']).toBe('font/woff2');
    expect((await raw('/assets/art.webp')).headers['content-type']).toBe('image/webp');
    expect((await raw('/site.webmanifest')).headers['content-type']).toBe('application/manifest+json; charset=utf-8');
  });

  it.each(['/../private.txt', '/%2e%2e/private.txt', '/assets/%2e%2e/%2e%2e/private.txt', '/.private', '/_headers', '/_redirects', '/assets/escaped.txt', '/assets/private-alias.txt', '/assets/control-alias.txt'])(
    'does not expose paths outside the published assets: %s', async (path) => {
      const response = await raw(path);
      expect(response.status).toBe(403);
      expect(response.body).not.toContain('must not be served');
    },
  );

  it.each(['/%', '/%00', '/assets%5cgame.js'])('rejects malformed paths: %s', async (path) => {
    expect((await raw(path)).status).toBe(400);
  });

  it('keeps missing assets missing and allows only read methods on loopback hosts', async () => {
    expect((await raw('/assets/missing.js')).status).toBe(404);
    expect((await raw('/unknown-route')).status).toBe(404);
    expect((await raw('/', { method: 'POST' })).status).toBe(405);
    expect((await raw('/', { host: `attacker.example:${port}` })).status).toBe(421);
    expect((await raw('/', { host: `localhost:${port}` })).status).toBe(200);
    expect((await raw('/assets/alias.js')).body).toBe('export const release = true;');
  });

  it('identifies its build without exposing project paths and reads a fresh entry after rebuilding', async () => {
    const before = JSON.parse((await raw(PREVIEW_HEALTH_PATH)).body) as Record<string, unknown>;
    expect(before).toMatchObject({ service: 'wreckright-local-preview', identity: 'test-preview', ports: [port] });
    expect(JSON.stringify(before)).not.toContain(directory);
    try {
      await writeFile(join(directory, 'index.html'), `${index}<!-- updated -->`);
      expect((await raw('/')).body).toContain('<!-- updated -->');
      expect(JSON.parse((await raw(PREVIEW_HEALTH_PATH)).body).build).not.toBe(before.build);
    } finally { await writeFile(join(directory, 'index.html'), index); }
  });

  it('does not report shutdown when a listener has unhealthy or missing build files', async () => {
    const closedPort = await availablePort();
    try {
      await rm(join(directory, 'index.html'));
      expect((await raw(PREVIEW_HEALTH_PATH)).status).toBe(503);
      expect(await previewShutdownState([port, closedPort])).toEqual({ stopped: false,
        listeners: [{ port, status: 'listening' }, { port: closedPort, status: 'closed' }] });
    } finally { await writeFile(join(directory, 'index.html'), index); }
    expect(await previewShutdownState([closedPort])).toEqual({ stopped: true, listeners: [{ port: closedPort, status: 'closed' }] });
  });

  it('serves two explicit ports from one instance', async () => {
    const ports = [await availablePort(), await availablePort()];
    const pair = await startPreviewServer({ directory, ports, identity: 'paired-preview' });
    try {
      expect(pair.ports).toEqual(ports);
      const responses = await Promise.all(ports.map((selected) => raw('/', { port: selected })));
      expect(responses.map((response) => response.body)).toEqual([index, index]);
    } finally { await pair.close(); }
  });

  it('releases its first port when the second is occupied without replacing that listener', async () => {
    const free = await availablePort();
    await expect(startPreviewServer({ directory, ports: [free, port] })).rejects.toMatchObject({ code: 'EADDRINUSE' });
    expect((await raw('/')).status).toBe(200);
    const retry = await startPreviewServer({ directory, ports: [free] });
    await retry.close();
  });

  it('requires a built entry and headers and rejects invalid or repeated ports', async () => {
    await expect(inspectRelease(temporary)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(startPreviewServer({ directory, ports: [5220, 5220] })).rejects.toThrow('distinct integers');
    await expect(startPreviewServer({ directory, ports: [-1] })).rejects.toThrow('distinct integers');
  });
});

describe('on-demand preview lifecycle configuration', () => {
  it('uses stable project ownership and keeps state outside automatic login-agent directories', () => {
    const config = previewConfiguration('/tmp/one project', '/opt/bin/node', 501);
    expect(config.ports).toEqual([5219, 5220]);
    expect(config).toEqual(previewConfiguration('/tmp/one project', '/opt/bin/node', 501));
    expect(config.identity).not.toBe(previewConfiguration('/tmp/another', '/opt/bin/node', 501).identity);
    expect(config.target).toBe(`gui/501/${config.label}`);
    expect(config.plistPath).toBe('/tmp/one project/reports/local-preview/preview.plist');
    expect(config.arguments).toEqual(['/opt/bin/node', '/tmp/one project/tools/local-preview.mjs', 'serve']);
    expect(config.plistPath).not.toContain('LaunchAgents');
  });

  it('escapes special characters as literal plist arguments rather than invoking a shell', () => {
    const plist = previewPlist(previewConfiguration('/tmp/a & <b> "c"', '/opt/node', 501));
    expect(plist).toContain('a &amp; &lt;b&gt; &quot;c&quot;');
    expect(plist).toContain('<key>SuccessfulExit</key><false/>');
    expect(plist).not.toContain('/bin/sh');
    expect(plist).not.toContain('/bin/zsh');
  });

  it('applies path-specific header removal without losing unrelated protection', () => {
    const headers = headersForPath(parseReleaseHeaders(releaseHeaders), '/wreckright.html');
    expect(headers['content-security-policy']).toBeUndefined();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headersForPath(parseReleaseHeaders(releaseHeaders), '/')['content-security-policy']).toContain("script-src 'self'");
    expect(() => parseReleaseHeaders('Content-Type: text/plain')).toThrow('no path');
  });
});

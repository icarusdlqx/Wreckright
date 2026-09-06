import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { previewConfiguration, previewPlist, previewShutdownState } from './local-preview-control.mjs';
import { inspectRelease, PREVIEW_HEALTH_PATH, startPreviewServer } from './local-preview-server.mjs';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = previewConfiguration(root, process.execPath, process.getuid?.() ?? 0);
const launchctl = (...args) => run('/bin/launchctl', args, { timeout: 8_000 });

async function registered() {
  try { await launchctl('print', config.target); return true; }
  catch { return false; }
}

async function health(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${PREVIEW_HEALTH_PATH}`, { signal: AbortSignal.timeout(700) });
    if (!response.ok) return null;
    const result = await response.json();
    return result.service === 'wreckright-local-preview' && result.identity === config.identity ? result : null;
  } catch { return null; }
}

async function snapshot() {
  return Promise.all(config.ports.map(async (port) => ({ port, health: await health(port) })));
}

function show(entries) {
  for (const { port, health: active } of entries) {
    console.log(`${active === null ? 'Stopped' : `Running (build ${active.build})`}: http://127.0.0.1:${port}/`);
  }
}

async function checkPort(port) {
  const server = createServer();
  await new Promise((ready, reject) => {
    server.once('error', (error) => reject(new Error(`Port ${port} is unavailable (${error.code}). Stop the other preview using that address, then retry. No process was replaced.`)));
    server.listen(port, '127.0.0.1', ready);
  });
  await new Promise((done) => server.close(done));
}

async function checkAvailable(port) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try { await checkPort(port); return; }
    catch (error) { if (attempt === 9) throw error; }
    await delay(100);
  }
}

async function stop() {
  if (await registered()) await launchctl('bootout', config.target);
  let shutdown;
  for (let attempt = 0; attempt < 10; attempt++) {
    shutdown = await previewShutdownState(config.ports);
    if (shutdown.stopped) {
      console.log('Local preview stopped. The build and company saves remain available.');
      return;
    }
    await delay(100);
  }
  const active = (await snapshot()).some((entry) => entry.health !== null);
  const ports = shutdown.listeners.filter((entry) => entry.status !== 'closed').map((entry) => entry.port).join(', ');
  throw new Error(`Shutdown is not confirmed: ports ${ports} remain in use or could not be checked. ${active
    ? 'A matching foreground preview is still running; stop its terminal with Ctrl+C.'
    : 'The listener could not be identified.'} No unknown or unrelated process was terminated.`);
}

async function start() {
  await inspectRelease(config.directory).catch((error) => { throw new Error(`Build the game with npm run build first. ${error.message}`); });
  const existing = await snapshot();
  const managed = await registered();
  if (existing.every((entry) => entry.health !== null) && managed) { show(existing); return; }
  if (existing.some((entry) => entry.health !== null) && !managed) {
    throw new Error('A matching foreground preview is running. Stop its terminal with Ctrl+C before starting the persistent preview.');
  }
  if (managed) await launchctl('bootout', config.target);
  for (const port of config.ports) await checkAvailable(port);
  await mkdir(config.stateDirectory, { recursive: true });
  await writeFile(config.plistPath, previewPlist(config), { mode: 0o600 });
  await launchctl('bootstrap', config.domain, config.plistPath);
  for (let attempt = 0; attempt < 30; attempt++) {
    const entries = await snapshot();
    if (entries.every((entry) => entry.health !== null)) {
      show(entries);
      console.log('This preview stays available after the task ends. Stop it with npm run preview:stop.');
      return;
    }
    await delay(200);
  }
  await launchctl('bootout', config.target).catch(() => undefined);
  throw new Error(`Preview failed to start; check ${config.stderrPath}. No login item was installed.`);
}

async function serve() {
  const server = await startPreviewServer({ directory: config.directory, ports: config.ports, identity: config.identity });
  console.log(`Serving Wreckright on ${server.ports.join(', ')} at ${new Date().toISOString()}`);
  let stopping = false;
  const finish = () => {
    if (stopping) return;
    stopping = true;
    void server.close().then(() => process.exit(0));
  };
  process.on('SIGTERM', finish);
  process.on('SIGINT', finish);
}

async function main() {
  const command = process.argv[2] ?? 'status';
  if (process.argv.length > 3) throw new Error('Preview commands take no extra arguments.');
  if (command === 'serve') { await serve(); return; }
  if (command === 'status') { show(await snapshot()); return; }
  if (command === '--help' || command === 'help') {
    console.log('Local release preview: start | status | stop | restart | serve\nPorts: 127.0.0.1:5219 and 127.0.0.1:5220. Build first with npm run build.'); return;
  }
  if (!['start', 'stop', 'restart'].includes(command)) throw new Error(`Unknown preview command: ${command}`);
  if (process.platform !== 'darwin') throw new Error('Persistent preview uses macOS launchd. Use the serve command for a foreground preview on this platform.');
  if (command === 'stop' || command === 'restart') await stop();
  if (command === 'start' || command === 'restart') await start();
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });

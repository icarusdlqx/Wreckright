import { createHash } from 'node:crypto';
import { createConnection } from 'node:net';
import { resolve } from 'node:path';

export const PREVIEW_PORTS = [5219, 5220];

async function inspectPort(port) {
  return new Promise((done) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (status) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      done({ port, status });
    };
    socket.setTimeout(300);
    socket.once('connect', () => finish('listening'));
    socket.once('timeout', () => finish('unknown'));
    socket.once('error', (error) => finish(error.code === 'ECONNREFUSED' ? 'closed' : 'unknown'));
  });
}

/** A failed HTTP health response cannot prove that its listening process has exited. */
export async function previewShutdownState(ports) {
  const listeners = await Promise.all(ports.map(inspectPort));
  return { stopped: listeners.every((entry) => entry.status === 'closed'), listeners };
}

export function previewConfiguration(projectRoot, executable, uid) {
  const root = resolve(projectRoot);
  const identity = createHash('sha256').update(root).digest('hex').slice(0, 16);
  const label = `com.wreckright.preview.${identity}`;
  const stateDirectory = resolve(root, 'reports/local-preview');
  return { root, identity, label, domain: `gui/${uid}`, target: `gui/${uid}/${label}`,
    directory: resolve(root, 'dist'), stateDirectory, ports: [...PREVIEW_PORTS],
    plistPath: resolve(stateDirectory, 'preview.plist'),
    stdoutPath: resolve(stateDirectory, 'stdout.log'), stderrPath: resolve(stateDirectory, 'stderr.log'),
    arguments: [executable, resolve(root, 'tools/local-preview.mjs'), 'serve'] };
}

const escapeXml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

export function previewPlist(config) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${escapeXml(config.label)}</string>
<key>ProgramArguments</key><array>${config.arguments.map((value) => `<string>${escapeXml(value)}</string>`).join('')}</array>
<key>WorkingDirectory</key><string>${escapeXml(config.root)}</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
<key>ThrottleInterval</key><integer>10</integer>
<key>StandardOutPath</key><string>${escapeXml(config.stdoutPath)}</string>
<key>StandardErrorPath</key><string>${escapeXml(config.stderrPath)}</string>
</dict></plist>
`;
}

import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'public', 'THIRD_PARTY_NOTICES.txt');

function sourceUrl(manifest) {
  const repository =
    typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;
  const source = repository ?? manifest.homepage;
  if (source === undefined) return 'Not declared by package';
  return source.replace(/^git\+/, '').replace(/\.git$/, '');
}

function licenseId(component) {
  const ids = (component.licenses ?? [])
    .map((entry) => entry.license?.id ?? entry.license?.name)
    .filter((entry) => entry !== undefined);
  return ids.join(' OR ') || 'NOASSERTION';
}

function licenseText(packageDirectory) {
  const names = readdirSync(packageDirectory).filter((name) => /^(?:licen[cs]e|notice)/i.test(name));
  const licenseName = names.sort()[0];
  if (licenseName === undefined) throw new Error(`no license or notice file in ${packageDirectory}`);
  return readFileSync(join(packageDirectory, licenseName), 'utf8').trim();
}

function generate() {
  const sbom = JSON.parse(
    execFileSync(process.execPath, [join(ROOT, 'tools', 'generate-sbom.mjs')], {
      cwd: ROOT,
      encoding: 'utf8',
    }),
  );
  const components = [...(sbom.components ?? [])].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
  );

  const lines = [
    'IRONLINE THIRD-PARTY NOTICES',
    '',
    'Generated from package-lock.json by npm run notices:write.',
    'Verify this checked-in file with npm run notices:check.',
    '',
    'This inventory covers the production dependency graph reported by npm. It',
    'does not license the game\'s original source, writing, visual design, or',
    'other assets. Development-only tooling is intentionally excluded.',
    '',
  ];

  for (const component of components) {
    const directory = join(ROOT, 'node_modules', ...component.name.split('/'));
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    if (manifest.version !== component.version) {
      throw new Error(
        `${component.name}: installed ${manifest.version}, lockfile SBOM reports ${component.version}`,
      );
    }
    const heading = `${component.name}@${component.version} — ${licenseId(component)}`;
    lines.push(
      '='.repeat(80),
      heading,
      `Source: ${sourceUrl(manifest)}`,
      '='.repeat(80),
      '',
      licenseText(directory),
      '',
    );
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

const output = generate();
const mode = process.argv[2];

if (mode === '--write') {
  writeFileSync(TARGET, output);
  console.log(`Wrote ${TARGET}`);
} else if (mode === '--check') {
  let current = '';
  try {
    current = readFileSync(TARGET, 'utf8');
  } catch {
    // The comparison below reports the same actionable command for a missing file.
  }
  if (current !== output) {
    console.error('Third-party notices are stale. Run npm run notices:write and review the result.');
    process.exitCode = 1;
  } else {
    console.log('Third-party notices match the production dependency graph.');
  }
} else if (mode === undefined) {
  process.stdout.write(output);
} else {
  throw new Error(`unknown option ${mode}`);
}

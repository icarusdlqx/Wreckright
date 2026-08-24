import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const raw = execFileSync(
  npm,
  [
    'sbom',
    '--package-lock-only',
    '--omit=dev',
    '--sbom-format=cyclonedx',
    '--sbom-type=application',
  ],
  { cwd: ROOT, encoding: 'utf8' },
);
const sbom = JSON.parse(raw);

function canonical(value) {
  if (Array.isArray(value)) {
    const entries = value.map(canonical);
    return entries.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonical(child)]),
  );
}

if (sbom.metadata?.component === undefined) {
  throw new Error('npm returned a CycloneDX document without an application component');
}

// Keep npm's lockfile-derived component, license, integrity, and dependency
// data while omitting optional run/tool metadata that changes across machines.
const rootComponent = { ...sbom.metadata.component, name: manifest.name };
const reproducible = canonical({
  bomFormat: sbom.bomFormat,
  specVersion: sbom.specVersion,
  version: sbom.version,
  metadata: {
    lifecycles: sbom.metadata.lifecycles,
    component: rootComponent,
  },
  components: sbom.components ?? [],
  dependencies: sbom.dependencies ?? [],
});

process.stdout.write(`${JSON.stringify(reproducible, null, 2)}\n`);

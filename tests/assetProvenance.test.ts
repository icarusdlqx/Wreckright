import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REGISTER_PATH = join(ROOT, 'docs', 'asset-provenance.json');
const MEDIA_EXTENSIONS = new Set([
  '.fbx', '.flac', '.gif', '.glb', '.gltf', '.ico', '.jpeg', '.jpg', '.mp3',
  '.obj', '.ogg', '.otf', '.png', '.svg', '.ttf', '.wav', '.webp', '.woff', '.woff2',
]);

interface AssetEntry {
  path: string;
  sha256: string;
  introducedBy?: string;
  originEvidence: string;
  clearance: string;
  name?: string;
  source?: string;
  license?: string;
  licenseFile?: string;
}

interface AssetRegister {
  version: number;
  scope: string[];
  assets: AssetEntry[];
}

function collectMedia(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...collectMedia(path));
    else if (MEDIA_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      found.push(relative(ROOT, path));
    }
  }
  return found;
}

function digest(path: string): string {
  return createHash('sha256').update(readFileSync(join(ROOT, path))).digest('hex');
}

describe('asset provenance register', () => {
  const register = JSON.parse(readFileSync(REGISTER_PATH, 'utf8')) as AssetRegister;

  it('registers every checked-in media asset in scope', () => {
    const discovered = register.scope.flatMap((directory) => collectMedia(join(ROOT, directory)));
    expect(discovered.sort()).toEqual(register.assets.map((asset) => asset.path).sort());
  });

  it.each(register.assets)('$path retains its reviewed bytes and evidence', (asset) => {
    if (asset.clearance === 'licensed-open-font') {
      expect(extname(asset.path)).toMatch(/^\.(ttf|otf|woff2?)$/);
      expect(asset.name?.trim().length).toBeGreaterThan(0);
      expect(asset.source).toMatch(/^https:\/\/raw\.githubusercontent\.com\/google\/fonts\/[^/]+\/ofl\//);
      expect(asset.license).toBe('OFL-1.1');
      expect(asset.licenseFile).toMatch(/^src\/ui\/assets\/fonts\/[\w-]+-OFL\.txt$/);
      const license = readFileSync(join(ROOT, asset.licenseFile ?? ''), 'utf8');
      expect(license).toContain('SIL OPEN FONT LICENSE Version 1.1');
      expect(license).toMatch(/Copyright/);
    } else {
      expect(asset.introducedBy).toMatch(/^[0-9a-f]{40}$/);
    }
    expect(asset.originEvidence.trim().length).toBeGreaterThan(20);
    expect(asset.clearance.trim().length).toBeGreaterThan(0);
    expect(digest(asset.path)).toBe(asset.sha256);
  });
});

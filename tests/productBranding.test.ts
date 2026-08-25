import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf8');

describe('Wreckright product branding', () => {
  it('brands both web distributions and install metadata consistently', () => {
    const index = read('index.html');
    const manifest = JSON.parse(read('public', 'manifest.webmanifest')) as {
      name: string;
      short_name: string;
      description: string;
    };
    const packageManifest = JSON.parse(read('package.json')) as { name: string };
    const packageLock = JSON.parse(read('package-lock.json')) as {
      name: string;
      packages: Record<string, { name?: string }>;
    };
    const single = read('tools', 'build-single.mjs');
    const headers = read('public', '_headers');

    expect(index).toContain('<title>WRECKRIGHT</title>');
    expect(index).toContain('name="apple-mobile-web-app-title" content="WRECKRIGHT"');
    expect(index).not.toMatch(/\b(?:IRONLINE|Ironline)\b/);
    expect(manifest).toMatchObject({
      name: 'WRECKRIGHT',
      short_name: 'WRECKRIGHT',
      description: 'No new machines. Only new owners. Command a mech company through the Great Recall.',
    });
    expect(packageManifest.name).toBe('wreckright');
    expect(packageLock.name).toBe('wreckright');
    expect(packageLock.packages['']?.name).toBe('wreckright');
    expect(single).toContain('<title>WRECKRIGHT</title>');
    expect(single).toContain("join(OUT_DIR, 'wreckright.html')");
    expect(single).not.toContain("join(OUT_DIR, 'ironline.html')");
    expect(headers).toContain('/wreckright.html');
  });

  it('uses Wreckright runtime, repository, and Worker identifiers while preserving save contracts', () => {
    const compatibilitySources = [
      read('src', 'campaign', 'storage.ts'),
      read('src', 'ui', 'store.ts'),
      read('src', 'ui', 'trainingProgress.ts'),
      read('src', 'ui', 'lance.ts'),
      read('src', 'ui', 'playtest', 'schema.ts'),
    ].join('\n');
    const wrangler = JSON.parse(read('wrangler.jsonc')) as { name: string };
    const readme = read('README.md');
    const releasing = read('docs', 'RELEASING.md');

    for (const key of [
      'ironline.campaign',
      'ironline.difficulty',
      'ironline.training',
      'ironline.lance.',
      'ironline.playtest.v1',
      'ironline.playtest/v1',
    ]) {
      expect(compatibilitySources).toContain(key);
    }
    expect(read('src', 'ui', 'engineFactory.ts')).toContain('__wreckright');
    expect(wrangler.name).toBe('wreckright');
    expect(readme).toContain('icarusdlqx/Wreckright');
    expect(releasing).toContain('Workers Builds: wreckright');
    expect(readme).toContain('non-visible compatibility contracts');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface StaticWorkerConfig {
  $schema?: string;
  assets?: { directory?: string };
  compatibility_date?: string;
  main?: string;
  name?: string;
}

function loadConfig(): StaticWorkerConfig {
  const path = resolve(process.cwd(), 'wrangler.jsonc');
  return JSON.parse(readFileSync(path, 'utf8')) as StaticWorkerConfig;
}

describe('Cloudflare static Worker configuration', () => {
  it('targets the existing Worker and production build without a script', () => {
    const config = loadConfig();

    expect(config).toEqual({
      $schema: './node_modules/wrangler/config-schema.json',
      assets: { directory: './dist' },
      compatibility_date: '2026-08-24',
      name: 'ironline',
    });
    expect(config.main).toBeUndefined();
  });
});

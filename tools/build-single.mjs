/**
 * Folds the single-bundle build into one self-contained HTML file — no external
 * requests at all — so the game can be handed over as a link or a file.
 *
 *   npm run build:single
 *
 * Writes dist-single/wreckright.html.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeNoticePayload } from './single-file-utils.mjs';

const OUT_DIR = 'dist-single';

execFileSync('npx', ['vite', 'build', '--config', 'vite.config.single.ts'], { stdio: 'inherit' });

const assets = readdirSync(join(OUT_DIR, 'assets'));
const pick = (extension) => {
  // The hosted build splits; this one must not. `inlineDynamicImports` collapses
  // it back to a single chunk, and taking the first match of several would drop
  // the rest on the floor and ship a game that boots into nothing — so insist on
  // exactly one rather than trusting the config to have held.
  const names = assets.filter((file) => file.endsWith(extension));
  const [name] = names;
  if (name === undefined) throw new Error(`no ${extension} in ${OUT_DIR}/assets`);
  if (names.length > 1) {
    throw new Error(
      `${OUT_DIR}/assets holds ${names.length} ${extension} files (${names.join(', ')}); ` +
        'the single-file build expects one. Check inlineDynamicImports.',
    );
  }
  return readFileSync(join(OUT_DIR, 'assets', name), 'utf8');
};

const notices = encodeNoticePayload(
  readFileSync(join('public', 'THIRD_PARTY_NOTICES.txt'), 'utf8'),
);

// The host wraps this in its own shell, so pin the game to the viewport rather
// than trusting a percentage height chain through ancestors we do not control.
const fill = `
html, body { height: 100%; margin: 0; overflow: hidden; background: #0d1013; }
#root { position: fixed; inset: 0; background: #0d1013; }
`;

const page = [
  // Opened from a desktop rather than served, there is no Content-Type header
  // to say what encoding this is, so the browser falls back to a legacy one and
  // every middle dot, en dash and curly quote in the game comes out as
  // mojibake. This has to sit inside the first 1024 bytes to be honoured.
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
  '<title>WRECKRIGHT</title>',
  `<style>\n${pick('.css')}\n${fill}</style>`,
  '<div id="root"></div>',
  `<script type="application/octet-stream" id="third-party-notices" data-encoding="base64">${notices}</script>`,
  `<script type="module">\n${pick('.js')}\n</script>`,
].join('\n');

const target = join(OUT_DIR, 'wreckright.html');
writeFileSync(target, page + '\n');

// Everything the Vite step left behind is now inlined above. Leaving it in
// place would double the upload and offer a second, unintended entry point
// into the same build, so the directory holds exactly the one deliverable.
for (const leftover of readdirSync(OUT_DIR)) {
  if (leftover === 'wreckright.html') continue;
  rmSync(join(OUT_DIR, leftover), { recursive: true, force: true });
}

console.log(`\n${target} — ${(page.length / 1024 / 1024).toFixed(2)} MB, no external requests`);

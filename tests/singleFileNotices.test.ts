import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { encodeNoticePayload } from '../tools/single-file-utils.mjs';

describe('single-file third-party notices', () => {
  it.each([
    '</script><script>alert(1)</script>',
    '</ScRiPt><img src=x onerror=alert(1)>',
    '</script ><script type="module">throw new Error()</script>',
    '<!-- </script> -->',
    'ordinary copyright notice — © 2026',
  ])('round-trips adversarial notice text without HTML-significant bytes', (notice) => {
    const encoded = encodeNoticePayload(notice);
    expect(encoded).not.toMatch(/[<>&'"`]/);
    expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe(notice);
  });
});

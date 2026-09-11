import { describe, expect, it } from 'vitest';
import { getWikiLibrary } from './library';
import { parseWikiHash, wikiHash } from './routes';

describe('wiki routes', () => {
  it.each(['#wiki', '#wiki/'])('opens the index from %s', (hash) => {
    expect(parseWikiHash(hash)).toEqual({ page: 'index' });
  });

  it('builds the index address and round trips every published article', () => {
    expect(wikiHash()).toBe('#wiki');
    for (const article of getWikiLibrary().values()) {
      const reference = { kind: article.kind, id: article.id };
      expect(parseWikiHash(wikiHash(reference))).toEqual({ page: 'article', reference });
    }
  });

  it.each(['', '#campaign', '#workshop', '#wikipedia', '#wikistory/the_line', 'wiki/story/the_line'])(
    'leaves non-wiki navigation alone: %s', (hash) => {
      expect(parseWikiHash(hash)).toBeNull();
    },
  );

  it.each([
    '#wiki/story', '#wiki/mech/', '#wiki/weapon/laser', '#wiki/story/the_line/',
    '#wiki/story/the_line/other', '#wiki/story/The_Line', '#wiki/story/123',
    '#wiki/story/the-line', '#wiki/story/../the_line', '#wiki/story/%',
    '#wiki/story/%E0%A4%A', '#wiki/story/%74he_line', '#wiki/story/the%2Fline',
    '#wiki/story/the_line?spoilers=1', '#wiki/story/the_line#extra', '#wiki/story/<script>',
  ])('returns a missing record without throwing for malformed wiki navigation: %s', (hash) => {
    expect(parseWikiHash(hash)).toEqual({ page: 'missing' });
  });

  it('preserves a well-formed unknown ID for the library to show a missing record', () => {
    expect(parseWikiHash('#wiki/story/not_in_this_archive')).toEqual({
      page: 'article', reference: { kind: 'story', id: 'not_in_this_archive' },
    });
  });
});

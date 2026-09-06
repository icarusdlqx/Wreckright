import type { WikiReference } from '../schema/wiki';

export type WikiRoute = { page: 'index' } | { page: 'article'; reference: WikiReference } | { page: 'missing' };
export function wikiHash(reference?: WikiReference): string {
  return reference === undefined ? '#wiki' : `#wiki/${reference.kind}/${encodeURIComponent(reference.id)}`;
}
export function parseWikiHash(hash: string): WikiRoute | null {
  if (hash === '#wiki' || hash === '#wiki/') return { page: 'index' };
  if (!hash.startsWith('#wiki/')) return null;
  const match = /^#wiki\/(story|mech)\/([a-z][a-z0-9_]*)$/.exec(hash);
  if (match === null) return { page: 'missing' };
  return { page: 'article', reference: { kind: match[1] as WikiReference['kind'], id: match[2]! } };
}

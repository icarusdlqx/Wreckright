import type { AnchorHTMLAttributes } from 'react';
import type { WikiReference } from '../../schema/wiki';
import { wikiHash } from '../../wiki/routes';

/** Native links also work in a new tab and in the downloadable offline game. */
export function WikiLink({ to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to?: WikiReference }) {
  return <a {...props} href={wikiHash(to)} />;
}

import { useEffect, useRef, useState } from 'react';
import { getWikiLibrary, isWikiDiscovered, PUBLIC_DISCOVERY, searchWiki, wikiKey, type WikiArticle as Article, type WikiDiscovery } from '../../wiki/library';
import type { WikiRoute } from '../../wiki/routes';
import { CommandMark } from '../CommandMark';
import { MachinePortrait } from '../mechbay/MachinePortrait';
import { useDialogFocus } from '../useDialogFocus';
import { factionName, WikiArticle } from './WikiArticle';
import { WikiLink } from './WikiLink';

const categories = ['world', 'history', 'factions', 'places', 'workshop'];
export function WikiScreen({ route, onClose, discovery = PUBLIC_DISCOVERY, returnFocus }: {
  route: WikiRoute; onClose: () => void; discovery?: WikiDiscovery; returnFocus?: () => HTMLElement | null;
}) {
  const root = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<'story' | 'mech'>('story');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [reveal, setReveal] = useState(false);
  const [confirmSpoilers, setConfirmSpoilers] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const copyRequest = useRef(0);
  const library = getWikiLibrary();
  const article = route.page === 'article' ? library.get(wikiKey(route.reference)) : undefined;
  const locked = article !== undefined && !reveal && !isWikiDiscovered(article, discovery);
  const routeKey = route.page === 'article' ? wikiKey(route.reference) : route.page;
  const indexScroll = useRef(0);
  const priorPage = useRef(`${routeKey}/${locked}`);
  useDialogFocus(root, close, onClose, returnFocus);
  useEffect(() => {
    content.current?.scrollTo(0, route.page === 'index' ? indexScroll.current : 0);
    // Announce page navigation while preserving the close target on initial entry.
    const page = `${routeKey}/${locked}`;
    if (priorPage.current !== page) {
      const heading = content.current?.querySelector('h1');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
      priorPage.current = page;
    }
    setCopyState('idle');
    copyRequest.current++;
    setConfirmSpoilers(false);
  }, [routeKey, locked, route.page]);
  const available = [...library.values()].filter((entry) => reveal || isWikiDiscovered(entry, discovery));
  const hidden = library.size - available.length;
  const matches = searchWiki(available.filter((entry) => entry.kind === kind &&
    (filter === 'all' || (entry.kind === 'story' ? entry.category : entry.chassis.faction) === filter)), query);
  const changeKind = (next: 'story' | 'mech'): void => { setKind(next); setFilter('all'); setQuery(''); };
  const copyLink = async (): Promise<void> => {
    const request = ++copyRequest.current;
    setCopyState('manual');
    try {
      await navigator.clipboard.writeText(window.location.href);
      if (request === copyRequest.current) setCopyState('copied');
    } catch { if (request === copyRequest.current) setCopyState('manual'); }
  };
  return <main className="wiki-shell" ref={root} role="dialog" aria-modal="true" aria-label="Tessell field archive"
    data-testid="wiki" onKeyDown={(event) => { if (event.key !== 'Tab' && event.key !== 'Escape') event.stopPropagation(); }}>
    <header className="wiki-masthead"><WikiLink className="wiki-brand"><CommandMark size={34} />
      <span>WRECKRIGHT<small>TESSELL FIELD ARCHIVE</small></span></WikiLink>
      <button type="button" ref={close} onClick={onClose} data-testid="wiki-close">Return to game <span aria-hidden="true">×</span></button>
    </header>
    <div className="wiki-scroll" ref={content} onScroll={(event) => { if (route.page === 'index') indexScroll.current = event.currentTarget.scrollTop; }}>
      <div className="wiki-toolbar"><nav aria-label="Archive location"><WikiLink>Archive</WikiLink>
        {route.page === 'index' ? null : <><span aria-hidden="true">/</span><span>{locked ? 'Undiscovered record' : article?.title ?? 'Record not found'}</span></>}
      </nav><div className="wiki-tools"><span className="wiki-spoiler-status">{reveal ? 'Campaign spoilers visible' : 'Campaign spoilers hidden'}</span>
        <button type="button" className="wiki-text-button" onClick={() => {
          if (reveal) setReveal(false); else setConfirmSpoilers(true);
        }} data-testid="wiki-spoilers">{reveal ? 'Hide spoilers' : 'Reveal spoilers…'}</button>
        {article === undefined || locked ? null : <button type="button" onClick={() => { void copyLink(); }} data-testid="wiki-copy">
          {copyState === 'copied' ? 'Link copied' : 'Copy link'}</button>}
      </div></div>
      {confirmSpoilers ? <section className="wiki-spoiler-consent" role="alert" data-testid="wiki-spoiler-consent">
        <div><h2>Read ahead in the campaign?</h2><p>This reveals later discoveries and endings in the archive. It does not change your campaign progress.</p></div>
        <button type="button" onClick={() => { setReveal(true); setConfirmSpoilers(false); }} data-testid="wiki-confirm-spoilers">Reveal all story records</button>
        <button type="button" onClick={() => setConfirmSpoilers(false)}>Keep them hidden</button>
      </section> : null}
      {copyState !== 'manual' ? null : <label className="wiki-copy-fallback">Copy this address
        <input readOnly value={window.location.href} onFocus={(event) => event.currentTarget.select()} />
      </label>}
      {route.page === 'index' ? <>
        <header className="wiki-index-heading"><span className="wiki-eyebrow">The world behind the machines</span>
          <h1>Every hull has a history.</h1><p>Explore Tessell, the Great Recall and the walkers still carrying its claims.</p>
        </header>
        <div className="wiki-browser-controls"><div className="wiki-switch" aria-label="Archive collection">
          <button type="button" aria-pressed={kind === 'story'} onClick={() => changeKind('story')} data-testid="wiki-stories">Story & world <small>{available.filter((entry) => entry.kind === 'story').length}</small></button>
          <button type="button" aria-pressed={kind === 'mech'} onClick={() => changeKind('mech')} data-testid="wiki-machines">Machines <small>{available.filter((entry) => entry.kind === 'mech').length}</small></button>
        </div><label className="wiki-search"><span>Search {kind === 'story' ? 'story & world' : 'machines'}</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={kind === 'story' ? 'Names, places, history…' : 'Name, role, faction…'} data-testid="wiki-search" />
        </label><label className="wiki-filter"><span>{kind === 'story' ? 'Subject' : 'Machine culture'}</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value)} data-testid="wiki-filter"><option value="all">All {kind === 'story' ? 'subjects' : 'cultures'}</option>
            {(kind === 'story' ? categories : ['linewrought', 'aurelian']).map((value) => <option key={value} value={value}>{kind === 'story' ? value : factionName(value)}</option>)}
          </select></label></div>
        <p className="wiki-result-count" aria-live="polite">{matches.length} {matches.length === 1 ? 'record' : 'records'}{kind === 'story' && hidden > 0 ? ` · ${hidden} campaign discoveries hidden` : ''}</p>
        {matches.length === 0 ? <div className="wiki-empty"><h2>No matching records</h2><p>Try a different name, subject or machine culture.</p>
          <button type="button" onClick={() => { setQuery(''); setFilter('all'); }}>Clear search and filters</button></div> :
          <div className={`wiki-card-grid ${kind === 'mech' ? 'wiki-machine-grid' : ''}`} data-testid="wiki-results">
            {matches.map((entry) => <ArchiveCard article={entry} key={wikiKey(entry)} />)}</div>}
      </> : article === undefined ? <div className="wiki-empty"><h1>Record not found</h1><p>This archive link does not match a current record.</p><WikiLink>Browse the archive</WikiLink></div> :
        locked ? <div className="wiki-empty" data-testid="wiki-locked"><span className="wiki-eyebrow">Campaign discovery</span><h1>This record is still undiscovered.</h1>
          <p>Keep playing to discover it with your company, or choose to read ahead.</p><button type="button" onClick={() => setConfirmSpoilers(true)}>Read ahead…</button>
          <WikiLink>Browse available records</WikiLink></div> : <WikiArticle article={article} discovery={discovery} reveal={reveal} />}
      <footer className="wiki-footer"><span>TESSELL / FIELD ARCHIVE</span><p>Machine specifications follow the current game catalogue. Narrative records describe the setting; refits decide what a machine carries into battle.</p></footer>
    </div>
  </main>;
}

function ArchiveCard({ article }: { article: Article }) {
  return <WikiLink to={article} className={`wiki-card ${article.kind === 'mech' ? `wiki-machine-card wiki-${article.chassis.faction}` : ''}`}>
    {article.kind === 'story' ? null : <div className="wiki-card-portrait"><MachinePortrait chassis={article.chassis} /></div>}
    <div className="wiki-card-copy"><span className="wiki-eyebrow">{article.kind === 'story' ? article.category : factionName(article.chassis.faction)}</span>
      <h2>{article.title}<span aria-hidden="true">↗</span></h2>
      {article.kind === 'story' ? null : <p className="wiki-machine-tag">{article.chassis.tonnage} t / {article.chassis.class} / {article.chassis.role}</p>}
      <p>{article.summary}</p></div>
  </WikiLink>;
}

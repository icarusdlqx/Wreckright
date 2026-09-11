import type { MechArticle, StoryArticle, WikiArticle as Article, WikiDiscovery } from '../../wiki/library';
import { getWikiLibrary, isWikiDiscovered, wikiKey } from '../../wiki/library';
import { getCatalog } from '../../schema/load';
import { LoadoutMap } from '../mechbay/LoadoutMap';
import { MachinePortrait } from '../mechbay/MachinePortrait';
import { WikiLink } from './WikiLink';
import { FactionLogo } from '../FactionLogo';

export const factionName = (faction: string): string => faction === 'aurelian' ? 'Aurelian Stock' : 'Linewrought';
const locationName = (location: string): string => location.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());

export function WikiArticle({ article, discovery, reveal }: { article: Article; discovery: WikiDiscovery; reveal: boolean }) {
  const related = article.related.map((reference) => getWikiLibrary().get(wikiKey(reference))!)
    .filter((entry) => reveal || isWikiDiscovered(entry, discovery));
  return <article className={`wiki-article ${article.kind === 'mech' ? `wiki-${article.chassis.faction}` : ''}`} data-testid="wiki-article">
    {article.kind === 'mech' ? <MechDossier article={article} /> : <StoryDossier article={article} />}
    {related.length === 0 ? null : <section className="wiki-related" aria-labelledby="wiki-related-title">
      <span className="wiki-eyebrow">Keep exploring</span><h2 id="wiki-related-title">Connected records</h2>
      <div className="wiki-related-grid">{related.map((entry) => <WikiLink key={wikiKey(entry)} to={entry}>
        <span>{entry.kind === 'story' ? entry.category : factionName(entry.chassis.faction)}</span>
        <strong>{entry.title} <i aria-hidden="true">↗</i></strong><p>{entry.summary}</p>
      </WikiLink>)}</div>
    </section>}
  </article>;
}

function StoryDossier({ article }: { article: StoryArticle }) {
  return <>
    <header className="wiki-article-heading">{article.faction === undefined ? null : <FactionLogo faction={article.faction} size={72} />}
      <span className="wiki-eyebrow">Tessell field archive / {article.category}</span>
      <h1 tabIndex={-1}>{article.title}</h1><p className="wiki-lede">{article.summary}</p>
    </header>
    <div className="wiki-reading">{article.sections.map((section, index) => <section key={index}>
      <h2>{section.heading}</h2>{section.body.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
    </section>)}</div>
  </>;
}

function MechDossier({ article }: { article: MechArticle }) {
  const { chassis, design } = article;
  const catalog = getCatalog();
  return <>
    <header className="wiki-mech-hero">
      <div className="wiki-mech-portrait"><MachinePortrait chassis={chassis} /><span>Standard equipment / chassis portrait</span></div>
      <div className="wiki-article-heading"><div className="wiki-faction-heading"><FactionLogo faction={chassis.faction} size={54} />
        <span className="wiki-eyebrow">Machine dossier / {factionName(chassis.faction)}</span></div>
        <h1 tabIndex={-1}>{chassis.name}</h1><p className="wiki-lede">{chassis.summary}</p>
        <dl className="wiki-facts">
          <div><dt>Class</dt><dd>{chassis.class}</dd></div><div><dt>Mass</dt><dd>{chassis.tonnage} t</dd></div>
          <div><dt>Field role</dt><dd>{chassis.role}</dd></div>
        </dl><p className="wiki-provenance">{article.provenance}</p>
      </div>
    </header>
    <div className="wiki-mech-body">
      <div className="wiki-reading"><section><h2>Service history</h2>
        {article.serviceHistory.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </section><section><h2>In the field</h2><p>{article.fieldNotes}</p></section>
        <div className="wiki-tradeoffs"><section><h3>Strengths</h3><ul>{chassis.strengths.map((text) => <li key={text}>{text}</li>)}</ul></section>
          <section><h3>Weaknesses</h3><ul>{chassis.weaknesses.map((text) => <li key={text}>{text}</li>)}</ul></section></div>
      </div>
      <aside className="wiki-fit" aria-labelledby="wiki-fit-title"><span className="wiki-eyebrow">Current game catalogue</span>
        <h2 id="wiki-fit-title">Standard fit</h2><p>Your company may refit this chassis differently.</p>
        <LoadoutMap catalog={catalog} design={design} />
        <p>{design.heatSinks} × {catalog.equipment.get(design.heatSinkId)?.name ?? 'heat sink'}</p>
        {design.equipment.length === 0 ? null : <ul>{design.equipment.map((fit, index) =>
          <li key={index}>{catalog.equipment.get(fit.equipmentId)!.name} · {locationName(fit.location)}</li>)}</ul>}
        <p className="wiki-fit-note">Weapons from either culture can fit. Match mount type, maximum weapon size, free boxes and total weight. Heat and ammunition still matter.</p>
        <WikiLink to={{ kind: 'story', id: 'the_shared_mounts' }}>Read the workshop guide ↗</WikiLink>
      </aside>
    </div>
  </>;
}

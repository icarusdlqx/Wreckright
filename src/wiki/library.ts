import type { Chassis } from '../schema/chassis';
import type { Design } from '../schema/design';
import { getCatalog, type Catalog } from '../schema/load';
import type { LoreEntry } from '../schema/lore';
import { WikiMechSchema, WikiStorySchema, type WikiMechRecord, type WikiReference, type WikiStoryRecord } from '../schema/wiki';

export interface StoryArticle {
  kind: 'story';
  id: string;
  category: WikiStoryRecord['category'];
  title: string;
  summary: string;
  sections: { heading: string; body: string[] }[];
  discovery?: Pick<LoreEntry, 'unlockNodeId' | 'knownByCampaigns'>;
  related: WikiReference[];
}
export interface MechArticle extends WikiMechRecord {
  kind: 'mech';
  title: string;
  summary: string;
  chassis: Chassis;
  design: Design;
}
export type WikiArticle = StoryArticle | MechArticle;
export interface WikiDiscovery { completedNodes: readonly string[]; campaignId?: string }
export const PUBLIC_DISCOVERY: WikiDiscovery = { completedNodes: [] };
export const wikiKey = (reference: WikiReference): string => `${reference.kind}/${reference.id}`;

/** Resolves authored narrative against the live catalogue; never enters the simulation. */
export function buildWikiLibrary(
  stories: readonly WikiStoryRecord[], mechs: readonly WikiMechRecord[], catalog: Catalog,
): ReadonlyMap<string, WikiArticle> {
  const articles = new Map<string, WikiArticle>();
  const add = (article: WikiArticle): void => {
    const key = wikiKey(article);
    if (articles.has(key)) throw new Error(`Duplicate wiki article: ${key}`);
    articles.set(key, article);
  };
  for (const story of stories) {
    const source = story.sourceLoreId === undefined ? undefined : catalog.lore.get(story.sourceLoreId);
    if (story.sourceLoreId !== undefined && source === undefined) throw new Error(`Unknown lore: ${story.sourceLoreId}`);
    add({ ...story, kind: 'story', title: source?.title ?? story.title!, summary: source?.summary ?? story.summary!,
      sections: source === undefined ? story.sections! : [{ heading: 'From the field archive', body: source.body }],
      discovery: source === undefined ? undefined : { unlockNodeId: source.unlockNodeId, knownByCampaigns: source.knownByCampaigns },
    });
  }
  for (const mech of mechs) {
    const chassis = catalog.chassis.get(mech.id);
    const design = catalog.designs.get(mech.designId);
    if (chassis === undefined || design?.chassisId !== mech.id || chassis.frame !== 'mech') {
      throw new Error(`Invalid wiki machine or stock design: ${mech.id}`);
    }
    add({ ...mech, kind: 'mech', title: chassis.name, summary: chassis.summary, chassis, design });
  }
  for (const article of articles.values()) {
    const seen = new Set<string>();
    for (const reference of article.related) {
      const key = wikiKey(reference);
      if (!articles.has(key)) throw new Error(`Unknown wiki reference: ${key} from ${wikiKey(article)}`);
      if (key === wikiKey(article) || seen.has(key)) throw new Error(`Repeated wiki reference: ${key}`);
      seen.add(key);
    }
  }
  return articles;
}

function parseRecords<T>(modules: Record<string, unknown>, parse: (value: unknown) => T & { id: string }): T[] {
  return Object.entries(modules).map(([path, raw]) => {
    const record = parse(raw);
    if (!path.endsWith(`/${record.id}.json`)) throw new Error(`Wiki filename must match its ID: ${path}`);
    return record;
  });
}
let cached: ReadonlyMap<string, WikiArticle> | undefined;
export function getWikiLibrary(): ReadonlyMap<string, WikiArticle> {
  cached ??= buildWikiLibrary(
    parseRecords(import.meta.glob('../data/wiki/story/*.json', { eager: true, import: 'default' }), (raw) => WikiStorySchema.parse(raw)),
    parseRecords(import.meta.glob('../data/wiki/mechs/*.json', { eager: true, import: 'default' }), (raw) => WikiMechSchema.parse(raw)),
    getCatalog(),
  );
  return cached;
}
export function isWikiDiscovered(article: WikiArticle, discovery: WikiDiscovery): boolean {
  if (article.kind === 'mech' || article.discovery?.unlockNodeId === undefined) return true;
  return discovery.completedNodes.includes(article.discovery.unlockNodeId) ||
    (discovery.campaignId !== undefined && article.discovery.knownByCampaigns?.includes(discovery.campaignId) === true);
}
export function searchWiki(articles: Iterable<WikiArticle>, query: string): WikiArticle[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return [...articles].filter((article) => {
    const text = (article.kind === 'story'
      ? [article.title, article.summary, article.category, ...article.sections.flatMap((section) => [section.heading, ...section.body])]
      : [article.title, article.summary, article.chassis.faction === 'aurelian' ? 'Aurelian Stock' : 'Linewrought', article.chassis.role, article.provenance,
        ...article.serviceHistory, article.fieldNotes, ...article.chassis.strengths, ...article.chassis.weaknesses]
    ).join(' ').toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

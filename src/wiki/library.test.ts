import { describe, expect, it } from 'vitest';
import { getCatalog } from '../schema/load';
import { WikiMechSchema, WikiStorySchema, type WikiMechRecord, type WikiStoryRecord } from '../schema/wiki';
import { buildWikiLibrary, getWikiLibrary, isWikiDiscovered, PUBLIC_DISCOVERY, searchWiki, wikiKey } from './library';

const catalog = getCatalog();
const stories = Object.values(import.meta.glob('../data/wiki/story/*.json', { eager: true, import: 'default' }))
  .map((raw) => WikiStorySchema.parse(raw));
const mechs = Object.values(import.meta.glob('../data/wiki/mechs/*.json', { eager: true, import: 'default' }))
  .map((raw) => WikiMechSchema.parse(raw));
const library = getWikiLibrary();
const article = (key: string) => {
  const result = library.get(key);
  if (result === undefined) throw new Error(`Missing test article: ${key}`);
  return result;
};
const original = (overrides: Partial<WikiStoryRecord> = {}): WikiStoryRecord => WikiStorySchema.parse({
  id: 'test_article', category: 'world', title: 'Test archive', summary: 'A public record.',
  sections: [{ heading: 'Account', body: ['An ordinary workshop account.'] }], related: [], ...overrides,
});
const machine = (overrides: Partial<WikiMechRecord> = {}): WikiMechRecord => WikiMechSchema.parse({
  ...mechs.find((entry) => entry.id === 'hornet_hnt2'), related: [], ...overrides,
});

const STOCK_DESIGNS = {
  bulwark_bwk3: 'bulwark_assault', cairn_crn3: 'cairn_battery', colossus_cls1: 'colossus_siege',
  falchion_fal2: 'falchion_duellist', halberd_hlb4: 'halberd_prime', hornet_hnt2: 'hornet_spotter',
  obsequy_obq3: 'obsequy_vigil', pallvault_plv1: 'pallvault_procession', prybar_pry1: 'prybar_courier',
  rampart_rmp4: 'rampart_breaker', rivet_rvt1: 'rivet_escort', sentinel_snl2: 'sentinel_brawler',
  trestle_trs1: 'trestle_battery', votive_vtv2: 'votive_picket', warden_wrd5: 'warden_lancer',
  wisp_wsp1: 'wisp_scout',
};

describe('authored wiki coverage', () => {
  it('loads every article and covers each canonical lore entry exactly once', () => {
    expect(library.size).toBe(30);
    expect(stories).toHaveLength(14);
    const wrappers = stories.filter((entry) => entry.sourceLoreId !== undefined);
    expect(wrappers).toHaveLength(11);
    expect(wrappers.map((entry) => entry.sourceLoreId).sort()).toEqual([...catalog.lore.keys()].sort());
    for (const wrapper of wrappers) expect(wrapper.id).toBe(wrapper.sourceLoreId);
  });

  it('covers all walkers, eight from each culture, without making support frames into mechs', () => {
    const walkers = [...catalog.chassis.values()].filter((chassis) => chassis.frame === 'mech');
    expect(mechs.map((entry) => entry.id).sort()).toEqual(walkers.map((chassis) => chassis.id).sort());
    expect(mechs).toHaveLength(16);
    for (const faction of ['linewrought', 'aurelian']) {
      expect(walkers.filter((chassis) => chassis.faction === faction)).toHaveLength(8);
    }
    for (const chassis of catalog.chassis.values()) {
      if (chassis.frame !== 'mech') expect(library.has(`mech/${chassis.id}`)).toBe(false);
    }
  });

  it.each(Object.entries(STOCK_DESIGNS))('resolves %s to its authored stock fit %s', (id, designId) => {
    const entry = article(`mech/${id}`);
    expect(entry.kind).toBe('mech');
    if (entry.kind !== 'mech') throw new Error('Expected a machine dossier');
    expect(entry.designId).toBe(designId);
    expect(entry.design).toBe(catalog.designs.get(designId));
    expect(entry.chassis).toBe(catalog.chassis.get(id));
    expect(entry.design.chassisId).toBe(id);
    expect(entry.title).toBe(entry.chassis.name);
    expect(entry.summary).toBe(entry.chassis.summary);
  });

  it('reads source prose and discoveries from the catalogue rather than copying a second canon', () => {
    for (const source of catalog.lore.values()) {
      const entry = article(`story/${source.id}`);
      expect(entry.kind).toBe('story');
      if (entry.kind !== 'story') throw new Error('Expected a story record');
      expect(entry.title).toBe(source.title);
      expect(entry.summary).toBe(source.summary);
      expect(entry.sections.flatMap((section) => section.body)).toEqual(source.body);
      expect(entry.discovery).toEqual({ unlockNodeId: source.unlockNodeId, knownByCampaigns: source.knownByCampaigns });
    }
  });

  it('reflects a corrected source without changing its wiki wrapper', () => {
    const source = catalog.lore.get('the_line')!;
    const corrected = { ...source, title: 'Corrected title', summary: 'Corrected archive summary.', body: ['Corrected account.'] };
    const amendedCatalog = { ...catalog, lore: new Map(catalog.lore).set(source.id, corrected) };
    const amended = buildWikiLibrary(stories, mechs, amendedCatalog).get('story/the_line');
    expect(amended).toMatchObject({ title: corrected.title, summary: corrected.summary,
      sections: [{ heading: 'From the field archive', body: corrected.body }] });
    expect(catalog.lore.get('the_line')).toBe(source);
  });

  it('keeps original world pages complete and separate from canonical wrappers', () => {
    const originals = stories.filter((entry) => entry.sourceLoreId === undefined);
    expect(originals.map((entry) => entry.id).sort()).toEqual(['a_short_chronology', 'places_on_the_line', 'tessell']);
    for (const record of originals) {
      expect(article(`story/${record.id}`)).toMatchObject({ title: record.title, summary: record.summary, sections: record.sections });
      expect(isWikiDiscovered(article(`story/${record.id}`), PUBLIC_DISCOVERY)).toBe(true);
    }
  });
});

describe('wiki authoring integrity', () => {
  it('rejects unknown canonical lore instead of silently publishing incomplete prose', () => {
    const wrapper = WikiStorySchema.parse({ id: 'test_article', category: 'history', sourceLoreId: 'absent_lore', related: [] });
    expect(() => buildWikiLibrary([wrapper], [], catalog)).toThrow('Unknown lore: absent_lore');
  });

  it('rejects duplicate story and machine IDs', () => {
    expect(() => buildWikiLibrary([original(), original()], [], catalog)).toThrow('Duplicate wiki article: story/test_article');
    expect(() => buildWikiLibrary([], [machine(), machine()], catalog)).toThrow('Duplicate wiki article: mech/hornet_hnt2');
  });

  it.each(['story', 'mech'] as const)('rejects a missing %s destination', (kind) => {
    expect(() => buildWikiLibrary([original({ related: [{ kind, id: 'absent_record' }] })], [], catalog))
      .toThrow(`Unknown wiki reference: ${kind}/absent_record`);
  });

  it('rejects self links and repeated links', () => {
    expect(() => buildWikiLibrary([original({ related: [{ kind: 'story', id: 'test_article' }] })], [], catalog))
      .toThrow('Repeated wiki reference: story/test_article');
    expect(() => buildWikiLibrary([
      original({ related: [{ kind: 'story', id: 'other_record' }, { kind: 'story', id: 'other_record' }] }),
      original({ id: 'other_record' }),
    ], [], catalog)).toThrow('Repeated wiki reference: story/other_record');
  });

  it.each([
    { id: 'absent_machine' },
    { designId: 'absent_design' },
    { designId: 'votive_picket' },
    { id: 'courser_crs1', designId: 'courser_patrol' },
    { id: 'redoubt_rdt1', designId: 'redoubt_emplacement' },
  ])('rejects an invalid chassis, mismatched design or support frame: %j', (overrides) => {
    expect(() => buildWikiLibrary([], [machine(overrides)], catalog)).toThrow('Invalid wiki machine or stock design');
  });

  it('rejects source overrides and incomplete originals at the schema boundary', () => {
    const wrapper = { id: 'the_line', category: 'history', sourceLoreId: 'the_line', related: [] };
    expect(WikiStorySchema.safeParse(wrapper).success).toBe(true);
    expect(WikiStorySchema.safeParse({ ...wrapper, title: 'A second version' }).success).toBe(false);
    const { sections: _sections, ...incomplete } = original();
    expect(WikiStorySchema.safeParse(incomplete).success).toBe(false);
    expect(WikiStorySchema.safeParse({ ...original(), sourceLoreId: 'the_line' }).success).toBe(false);
  });
});

describe('discovery and archive search', () => {
  it('keeps all four campaign discoveries hidden from a fresh public archive', () => {
    const hidden = [...library.values()].filter((entry) => !isWikiDiscovered(entry, PUBLIC_DISCOVERY));
    expect(hidden.map(wikiKey).sort()).toEqual([
      'story/the_borrowed_roots', 'story/the_custodians', 'story/the_sealed', 'story/the_two_readings',
    ]);
    expect([...library.values()].filter((entry) => entry.kind === 'mech').every((entry) => isWikiDiscovered(entry, PUBLIC_DISCOVERY))).toBe(true);
  });

  it('respects both an earned discovery and the Custodians’ existing knowledge', () => {
    const stock = article('story/the_sealed');
    expect(isWikiDiscovered(stock, { completedNodes: [], campaignId: 'aurelian_recall' })).toBe(true);
    expect(isWikiDiscovered(stock, { completedNodes: [], campaignId: 'border_dispute' })).toBe(false);
    expect(isWikiDiscovered(stock, { completedNodes: ['pass_skirmish'], campaignId: 'border_dispute' })).toBe(true);
    expect(isWikiDiscovered(stock, { completedNodes: ['militia_raid'], campaignId: 'border_dispute' })).toBe(false);
    expect(isWikiDiscovered(article('story/the_custodians'), { completedNodes: [], campaignId: 'aurelian_recall' })).toBe(false);
    expect(isWikiDiscovered(article('story/the_custodians'), { completedNodes: ['first_warrant'], campaignId: 'aurelian_recall' })).toBe(true);
  });

  it('does not reveal later findings when only an earlier finding was earned', () => {
    const discovery = { completedNodes: ['first_warrant', 'root_exchange'], campaignId: 'aurelian_recall' };
    expect(isWikiDiscovered(article('story/the_borrowed_roots'), discovery)).toBe(true);
    expect(isWikiDiscovered(article('story/the_two_readings'), discovery)).toBe(false);
    expect(isWikiDiscovered(article('story/the_two_readings'), { ...discovery, completedNodes: [...discovery.completedNodes, 'barrow_warrant'] })).toBe(true);
  });

  it('searches only available records when the archive applies its discovery filter', () => {
    const available = [...library.values()].filter((entry) => isWikiDiscovered(entry, PUBLIC_DISCOVERY));
    expect(searchWiki(library.values(), 'two readings').map(wikiKey)).toContain('story/the_two_readings');
    expect(searchWiki(available, 'two readings')).toEqual([]);
    expect(searchWiki(available, 'borrowed roots')).toEqual([]);
    const related = article('story/the_shared_mounts').related.map((ref) => article(wikiKey(ref)))
      .filter((entry) => isWikiDiscovered(entry, PUBLIC_DISCOVERY));
    expect(related.map(wikiKey)).toEqual(['story/the_refit', 'story/the_welded']);
  });

  it('matches public machine names despite retained legacy identifiers', () => {
    expect(searchWiki(library.values(), '  GADFLY  ').map(wikiKey)).toContain('mech/hornet_hnt2');
    expect(searchWiki(library.values(), 'Vesper').map(wikiKey)).toContain('mech/wisp_wsp1');
  });

  it('finds service history and requires every search term, independent of case and spacing', () => {
    const machines = [...library.values()].filter((entry) => entry.kind === 'mech');
    const matches = searchWiki(machines, '  KARST\n Reach ').map(wikiKey);
    expect(matches).toContain('mech/wisp_wsp1');
    expect(matches).toContain('mech/obsequy_obq3');
    expect(searchWiki(machines, 'Karst impossibleword')).toEqual([]);
    expect(searchWiki(library.values(), 'history calibration').map(wikiKey)).toContain('story/the_foundry_winter');
  });

  it('returns the supplied collection unchanged for a blank query and an empty result for an unknown term', () => {
    const available = [...library.values()].filter((entry) => isWikiDiscovered(entry, PUBLIC_DISCOVERY));
    expect(searchWiki(available, ' \n\t ')).toEqual(available);
    expect(searchWiki(available, 'no_such_wiki_phrase_987')).toEqual([]);
    expect(searchWiki([], 'Tessell')).toEqual([]);
  });
});

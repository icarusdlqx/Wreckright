import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { berthDesign, defaultLance, factionLance, lanceFaction } from './lance';

const MISSION = 'skirmish_ridge';

function factions(berths: ReturnType<typeof defaultLance>): Set<string> {
  const seen = new Set<string>();
  for (const berth of berths) {
    const design = berthDesign(catalog, berth);
    const chassis = design === null ? undefined : catalog.chassis.get(design.chassisId);
    if (chassis !== undefined) seen.add(chassis.faction);
  }
  return seen;
}

describe('company machines', () => {
  it('reads the authored lance honestly, mixed cultures and all', () => {
    const authored = defaultLance(catalog, MISSION);
    const verdict = lanceFaction(catalog, authored);
    const cultures = factions(authored);
    expect(verdict).toBe(cultures.size > 1 ? 'mixed' : [...cultures][0]);
  });

  it('refills every berth with one culture, keeping the pilots', () => {
    for (const faction of ['linewrought', 'aurelian'] as const) {
      const authored = defaultLance(catalog, MISSION);
      const refit = factionLance(catalog, MISSION, faction);

      expect(refit).toHaveLength(authored.length);
      expect(factions(refit)).toEqual(new Set([faction]));
      expect(refit.map((berth) => berth.pilotId)).toEqual(
        authored.map((berth) => berth.pilotId),
      );
      expect(lanceFaction(catalog, refit)).toBe(faction);
    }
  });

  it('keeps every berth in its weight class where the culture stocks it', () => {
    const authored = defaultLance(catalog, MISSION);
    const refit = factionLance(catalog, MISSION, 'aurelian');
    for (let index = 0; index < authored.length; index += 1) {
      const wanted = catalog.chassis.get(
        berthDesign(catalog, authored[index]!)!.chassisId,
      )!.class;
      const got = catalog.chassis.get(
        berthDesign(catalog, refit[index]!)!.chassisId,
      )!.class;
      expect(got, `berth ${index}`).toBe(wanted);
    }
  });

  it('varies machines when a class offers more than one design', () => {
    const refit = factionLance(catalog, MISSION, 'linewrought');
    const ids = refit.map((berth) => berth.designId);
    // The authored lance carries two machines of one class; the refit should
    // not hand both berths the same design when the culture stocks two.
    expect(new Set(ids).size).toBeGreaterThan(1);
  });
});

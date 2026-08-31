import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import type { MechLocation } from '../../schema/common';
import { chassisBlueprint, type Blueprint, type BlueprintPart } from '../blueprint';
import {
  AURELIAN_SIGNATURE_IDS,
  LINE_SIGNATURE_IDS,
  SIGNATURE_CHASSIS_IDS,
} from './details';

const HULLS = [...catalog.chassis.values()];
const SIGNATURE_IDS = new Set<string>(SIGNATURE_CHASSIS_IDS);

const DETAIL_BUDGETS: Record<string, { surface: number; hero: number }> = {
  hornet_hnt2: { surface: 4, hero: 6 },
  drover_dvr2: { surface: 4, hero: 6 },
  bulwark_bwk3: { surface: 4, hero: 6 },
  colossus_cls1: { surface: 4, hero: 6 },
  votive_vtv2: { surface: 4, hero: 6 },
  sentinel_snl2: { surface: 4, hero: 6 },
  halberd_hlb4: { surface: 4, hero: 6 },
  pallvault_plv1: { surface: 4, hero: 8 },
};

// These signatures predate inspection geometry, so any change points back to
// load-bearing plans rather than merely accepting a new mesh count.
const STRUCTURAL_DIGESTS: Record<string, string> = {
  bulwark_bwk3: '42d94f524489315e8fc06e4f771c869b0cbdb97a77b034996576156d2867a408',
  cairn_crn3: 'f7c8aa5c5397c559cf22478bf9c7e4e3969a22736c10bd406218f314b2188e11',
  colossus_cls1: 'c802de39623e6e52d489a909b316be45c3a06e99a469dcc8bf27e6d1c3e86058',
  courser_crs1: '6d9749a0372967fa3f9edeff60abfc8be5de15cfe4e9cbfbc881e7d3c30bc223',
  drover_dvr2: 'a9410a92262b4741841f0d9735b21515935c4c94e10922f104004dac7398d45e',
  falchion_fal2: '28f816d4e5c200ec30ab3761fb527fc836eeb31be8a35ab3dd4e89cadd8b4aa1',
  halberd_hlb4: '47d5be6e9dc35e872b4f178976efcd54f287b3bd1ef9b8abeacf6bbb371a54ef',
  hornet_hnt2: '5550f3fbf588bc8565b83ce279f50b181c8f8463fefe06990b53d0a005de3b44',
  obsequy_obq3: 'c4250a8f6b835c07dc66561fd434c1a4c510c5f5422cbe0ae5772ad0bda1990f',
  pallvault_plv1: '47821259c2745b4cc646855f17deee204d33a56dad2d5afdefe7416c650c1082',
  rampart_rmp4: 'df75e2df70c334436f6b2004493c949849ed659b99201337b5f3bf28a1b09ddf',
  redoubt_rdt1: 'd5dddb7afdcab5479a3897793ecc67047bea92b838eda97243f94e7ef58c1e96',
  sentinel_snl2: '1b1cfc7884e3df300e75e3c1363d5e8a80a8aabb3b1e706b6884de8aa4e4817c',
  votive_vtv2: '597f0ad9455fa926a0cb68f477f6d1b8ee9afb2531a774bc67bf7a94f1d29e66',
  warden_wrd5: '777ea38998dd527f1798beace0c958933184c9c53be27b03bea645f2fe08814b',
  wisp_wsp1: '942fb6b7c9d368d7ea39bf56c6303e4500e25baba9cd3b872dfc947e048fdbe2',
};

const MIRRORED_LOCATION: Partial<Record<MechLocation, MechLocation>> = {
  left_arm: 'right_arm',
  right_arm: 'left_arm',
  left_torso: 'right_torso',
  right_torso: 'left_torso',
  left_leg: 'right_leg',
  right_leg: 'left_leg',
};

function planFor(id: string): Blueprint {
  const chassis = catalog.chassis.get(id);
  if (chassis === undefined) throw new Error(`unknown chassis ${id}`);
  return chassisBlueprint(chassis.silhouette, chassis.traits, chassis.hardpoints, id);
}

function structuralDigest(plan: Blueprint): string {
  const structural = {
    ...plan,
    parts: plan.parts.filter((part) => part.detail === 'structure'),
  };
  return createHash('sha256').update(JSON.stringify(canonical(structural))).digest('hex');
}

function canonical(value: unknown): unknown {
  // Libm implementations may differ by an ulp for derived joint lengths.
  // Stable key ordering and ten-decimal rounding keep this structural lock portable.
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return value;
    return Object.is(value, -0) ? 0 : Number(value.toFixed(10));
  }
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record).sort().map((key) => [key, canonical(record[key])]),
    );
  }
  return value;
}

function cleanZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function detailKey(part: BlueprintPart, mirrored = false): string {
  const location = mirrored && part.location !== null
    ? (MIRRORED_LOCATION[part.location] ?? part.location)
    : part.location;
  const at = mirrored
    ? [part.at[0], part.at[1], cleanZero(-part.at[2])]
    : part.at.map(cleanZero);
  return JSON.stringify([
    location,
    part.shape,
    at,
    part.size,
    part.tone,
    part.detail,
    part.tilt ?? null,
    part.fixed ?? false,
    part.profile ?? null,
    part.transverse ?? null,
  ]);
}

describe('signature chassis detail', () => {
  it('spends the inspection budget on exactly eight signature chassis', () => {
    expect(SIGNATURE_CHASSIS_IDS).toHaveLength(8);
    expect(new Set(SIGNATURE_CHASSIS_IDS).size).toBe(8);

    for (const id of SIGNATURE_CHASSIS_IDS) {
      const details = planFor(id).parts.filter((part) => part.detail !== 'structure');
      const budget = DETAIL_BUDGETS[id];
      expect(budget, id).toBeDefined();
      expect(details.filter((part) => part.detail === 'surface'), id).toHaveLength(budget?.surface ?? 0);
      expect(details.filter((part) => part.detail === 'hero'), id).toHaveLength(budget?.hero ?? 0);
    }
  });

  it('leaves the deferred eight chassis at structural detail only', () => {
    const deferred = HULLS.filter((chassis) => !SIGNATURE_IDS.has(chassis.id));
    expect(deferred).toHaveLength(8);
    for (const chassis of deferred) {
      expect(planFor(chassis.id).parts.every((part) => part.detail === 'structure'), chassis.id)
        .toBe(true);
    }
  });

  it('does not move a structural part, joint, hardpoint or height', () => {
    expect(HULLS).toHaveLength(Object.keys(STRUCTURAL_DIGESTS).length);
    for (const chassis of HULLS) {
      expect(structuralDigest(planFor(chassis.id)), chassis.id)
        .toBe(STRUCTURAL_DIGESTS[chassis.id]);
    }
  });

  it('keeps every Aurelian detail sealed and bilaterally symmetric', () => {
    for (const id of AURELIAN_SIGNATURE_IDS) {
      const details = planFor(id).parts.filter((part) => part.detail !== 'structure');
      const direct = details.map((part) => detailKey(part)).sort();
      const mirrored = details.map((part) => detailKey(part, true)).sort();
      expect(mirrored, id).toEqual(direct);
      expect(details.every((part) => part.shape === 'box'), id).toBe(true);
    }
  });

  it('keeps every Linewrought battlefield package visibly asymmetric', () => {
    for (const id of LINE_SIGNATURE_IDS) {
      const surface = planFor(id).parts.filter((part) => part.detail === 'surface');
      const direct = surface.map((part) => detailKey(part)).sort();
      const mirrored = surface.map((part) => detailKey(part, true)).sort();
      expect(mirrored, id).not.toEqual(direct);
    }
  });

  it('keeps battlefield culture cues out of team-painted tones', () => {
    for (const id of SIGNATURE_CHASSIS_IDS) {
      const surface = planFor(id).parts.filter((part) => part.detail === 'surface');
      expect(surface.every((part) => part.tone !== 'trim' && part.tone !== 'deep'), id)
        .toBe(true);
    }
  });

  it('keeps inspection pieces outside walking pivots', () => {
    for (const chassis of HULLS.filter((entry) => entry.frame === 'mech')) {
      const details = planFor(chassis.id).parts.filter((part) => part.detail !== 'structure');
      expect(details.every((part) => part.joint === undefined), chassis.id).toBe(true);
      expect(details.every(
        (part) => part.location !== 'left_leg' && part.location !== 'right_leg',
      ), chassis.id).toBe(true);
    }
  });
});

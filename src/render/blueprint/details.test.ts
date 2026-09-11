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

// Ground vehicles are deliberately outside the walker reconstruction.
const GROUND_STRUCTURAL_DIGESTS: Record<string, string> = {
  courser_crs1: '6d9749a0372967fa3f9edeff60abfc8be5de15cfe4e9cbfbc881e7d3c30bc223',
  drover_dvr2: 'a9410a92262b4741841f0d9735b21515935c4c94e10922f104004dac7398d45e',
  redoubt_rdt1: 'd5dddb7afdcab5479a3897793ecc67047bea92b838eda97243f94e7ef58c1e96',
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
  it('gives every walker a bounded inspection package, retaining the Drover package', () => {
    const walkers = HULLS.filter((chassis) => chassis.frame === 'mech');
    expect(walkers).toHaveLength(16);
    expect(new Set(SIGNATURE_CHASSIS_IDS).size).toBe(17);
    for (const id of SIGNATURE_CHASSIS_IDS) {
      const details = planFor(id).parts.filter((part) => part.detail !== 'structure');
      expect(details.filter((part) => part.detail === 'surface'), id).toHaveLength(4);
      expect(details.filter((part) => part.detail === 'hero'), id).toHaveLength(6);
    }
  });

  it('keeps undecorated ground machines at structural detail only', () => {
    const deferred = HULLS.filter((chassis) => !SIGNATURE_IDS.has(chassis.id));
    expect(deferred.map((chassis) => chassis.id).sort()).toEqual(['courser_crs1', 'redoubt_rdt1']);
    for (const chassis of deferred) {
      expect(planFor(chassis.id).parts.every((part) => part.detail === 'structure'), chassis.id).toBe(true);
    }
  });

  it('leaves every ground vehicle part, pivot, hardpoint and height unchanged', () => {
    const ground = HULLS.filter((chassis) => chassis.frame !== 'mech');
    expect(ground).toHaveLength(3);
    for (const chassis of ground) {
      expect(structuralDigest(planFor(chassis.id)), chassis.id).toBe(GROUND_STRUCTURAL_DIGESTS[chassis.id]);
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

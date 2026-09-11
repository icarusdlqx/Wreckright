import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { LOCATIONS } from '../../schema/common';
import { chassisBlueprint } from '../blueprint';
import { WALKER_PLANS } from './plans-walkers';
import { profileSection } from './connections';
import type { BlueprintPart } from './types';

function profileIsConvex(piece: BlueprintPart): boolean {
  const points = piece.profile;
  if (points === undefined) return true;
  if (points.length < 3) return false;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    if (a === undefined || b === undefined) return false;
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (Math.abs(area) < 1e-10) return false;
  // The renderer accepts both windings; convexity requires one consistent interior side.
  const winding = Math.sign(area);
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    if (a === undefined || b === undefined) return false;
    for (const c of points) {
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cross * winding < -1e-10) return false;
    }
  }
  return true;
}

describe('Ironwork and Monolith reconstruction', () => {
  it('joins the Gadfly roof beam directly to both raked brace tips', () => {
    const chassis = catalog.chassis.get('hornet_hnt2')!;
    const plan = chassisBlueprint(chassis.silhouette, chassis.traits, chassis.hardpoints, chassis.id);
    const braces = plan.parts.filter((piece) => piece.location === 'centre_torso' && piece.shape === 'limb');
    const beam = plan.parts.filter((piece) => piece.location === 'centre_torso' && piece.shape === 'box'
      && piece.tone === 'deep').sort((a, b) => b.at[1] - a.at[1])[0]!;
    expect(braces).toHaveLength(2);
    for (const brace of braces) {
      const tip = [brace.at[0] - Math.sin(brace.tilt ?? 0) * brace.size[1] / 2,
        brace.at[1] + Math.cos(brace.tilt ?? 0) * brace.size[1] / 2, brace.at[2]];
      for (const axis of [0, 1, 2] as const) {
        expect(Math.abs(tip[axis]! - beam.at[axis])).toBeLessThan(beam.size[axis] / 2);
      }
    }
  });

  it('attaches inspection fittings to their own authored structural surfaces', () => {
    for (const chassis of catalog.chassis.values()) {
      if (chassis.frame !== 'mech') continue;
      const plan = chassisBlueprint(chassis.silhouette, chassis.traits, chassis.hardpoints, chassis.id);
      for (const fitting of plan.parts.filter((piece) => piece.detail !== 'structure')) {
        const carriers = plan.parts.filter((piece) => piece.detail === 'structure' && piece.location === fitting.location);
        const contact = carriers.some((carrier) => {
          const axis = fitting.shape === 'cylinder' ? 1 : 0;
          const other = axis === 0 ? 1 : 0;
          if (Math.abs(fitting.at[axis] - carrier.at[axis]) >= carrier.size[axis] * 0.45) return false;
          const surface = profileSection(carrier, axis, fitting.at[axis])[1];
          return Math.abs(fitting.at[other] - surface) <= fitting.size[other] / 2 + 0.005
            && Math.abs(fitting.at[2] - carrier.at[2]) < carrier.size[2] * 0.45;
        });
        expect(contact, `${chassis.id}.${fitting.location}.${fitting.detail}`).toBe(true);
      }
    }
  });

  it('gives each sealed shoulder a solid connection to the central body', () => {
    for (const chassis of catalog.chassis.values()) {
      if (chassis.frame !== 'mech' || chassis.faction !== 'aurelian') continue;
      const plan = chassisBlueprint(chassis.silhouette, chassis.traits, chassis.hardpoints, chassis.id);
      for (const location of ['left_torso', 'right_torso'] as const) {
        const carrier = plan.parts.find((piece) => piece.location === location && piece.profile !== undefined)!;
        const collar = plan.parts.find((piece) => piece.location === location && piece.tone === 'deep' && piece.detail === 'structure');
        expect(collar, `${chassis.id}.${location}`).toBeDefined();
        if (collar === undefined) continue;
        expect(Math.abs(collar.at[2]) - collar.size[2] / 2).toBeLessThan(0);
        expect(Math.abs(carrier.at[2] - collar.at[2])).toBeLessThan(collar.size[2] / 2);
      }
    }
  });

  it('owns all sixteen walkers without claiming any ground vehicle', () => {
    const walkers = [...catalog.chassis.values()].filter((chassis) => chassis.frame === 'mech');
    expect(Object.keys(WALKER_PLANS).sort()).toEqual(walkers.map((chassis) => chassis.id).sort());
    expect(walkers.filter((chassis) => chassis.faction === 'linewrought')).toHaveLength(8);
    expect(walkers.filter((chassis) => chassis.faction === 'aurelian')).toHaveLength(8);
  });

  it('keeps primary plates convex and all dimensions finite and positive', () => {
    for (const chassis of catalog.chassis.values()) {
      if (chassis.frame !== 'mech') continue;
      const plan = chassisBlueprint(chassis.silhouette, chassis.traits, chassis.hardpoints, chassis.id);
      for (const piece of plan.parts) {
        expect(piece.at.every(Number.isFinite), chassis.id).toBe(true);
        expect(piece.size.every((size) => Number.isFinite(size) && size > 0), chassis.id).toBe(true);
        expect(profileIsConvex(piece), `${chassis.id}.${piece.location}`).toBe(true);
      }
    }
  });

  it('keeps every wired mount on the forward side of its visible location', () => {
    for (const chassis of catalog.chassis.values()) {
      if (chassis.frame !== 'mech') continue;
      const plan = chassisBlueprint(chassis.silhouette, chassis.traits, chassis.hardpoints, chassis.id);
      for (const location of LOCATIONS) {
        const fit = chassis.hardpoints[location];
        if (fit.ballistic + fit.energy + fit.missile === 0) continue;
        const anchor = plan.hardpoints[location];
        expect(anchor?.every(Number.isFinite), `${chassis.id}.${location}`).toBe(true);
        const carrier = plan.parts.filter((piece) => piece.location === location && piece.detail === 'structure');
        expect(carrier.length, `${chassis.id}.${location}`).toBeGreaterThan(0);
        const centre = carrier.reduce((total, piece) => total + piece.at[0], 0) / carrier.length;
        expect(anchor?.[0] ?? -Infinity, `${chassis.id}.${location}`).toBeGreaterThan(centre);
      }
    }
  });

  it('keeps primary soles at ground level and the two joint chains separate', () => {
    for (const chassis of catalog.chassis.values()) {
      if (chassis.frame !== 'mech') continue;
      const plan = chassisBlueprint(chassis.silhouette, chassis.traits, chassis.hardpoints, chassis.id);
      for (const location of ['left_leg', 'right_leg'] as const) {
        const pieces = plan.parts.filter((piece) => piece.location === location);
        expect(new Set(pieces.map((piece) => piece.at[2])).size, `${chassis.id}.${location}`).toBe(1);
        const sole = pieces.find((piece) => piece.joint === 'ankle' && piece.profile !== undefined);
        expect(sole, `${chassis.id}.${location}`).toBeDefined();
        if (sole === undefined || sole.profile === undefined) continue;
        const minimum = Math.min(...sole.profile.map((point) => sole.at[1] + point[1] * sole.size[1]));
        expect(minimum, `${chassis.id}.${location}`).toBeCloseTo(0);
      }
    }
  });
});

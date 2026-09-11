import type { MechLocation } from '../schema/common';
import type { LocationSnapshot } from './store';

export type DamageTone = 'sound' | 'damaged' | 'critical' | 'destroyed';
export type ArmourFace = 'front' | 'rear';
export const LOCATION_SHORT: Record<MechLocation, string> = {
  head: 'HD', centre_torso: 'CT', left_torso: 'LT', right_torso: 'RT',
  left_arm: 'LA', right_arm: 'RA', left_leg: 'LL', right_leg: 'RL',
};
export const LOCATION_NAME: Record<MechLocation, string> = {
  head: 'Head', centre_torso: 'Centre torso', left_torso: 'Left torso', right_torso: 'Right torso',
  left_arm: 'Left arm', right_arm: 'Right arm', left_leg: 'Left leg', right_leg: 'Right leg',
};
export const DAMAGE_LABEL: Record<DamageTone, string> = {
  sound: 'Sound', damaged: 'Damaged', critical: 'Critical', destroyed: 'Destroyed',
};
export const DAMAGE_MARK: Record<DamageTone, string> = {
  sound: '·', damaged: '−', critical: '!', destroyed: '×',
};

function fraction(value: number, maximum: number): number {
  return maximum <= 0 ? 0 : Math.max(0, Math.min(1, value / maximum));
}
function tone(value: number): Exclude<DamageTone, 'destroyed'> {
  return value > 2 / 3 ? 'sound' : value > 1 / 3 ? 'damaged' : 'critical';
}

/** Armour loss exposes a live section; it is not the same as losing its structure. */
export function sectionDamage(state: LocationSnapshot, face: ArmourFace) {
  const destroyed = state.destroyed || (state.internalMax > 0 && state.internal <= 0);
  const rear = face === 'rear' && state.hasRearArmourFace;
  const armour = rear ? state.rearArmour : state.armour;
  const armourMax = rear ? state.rearArmourMax : state.armourMax;
  return {
    destroyed,
    armour: destroyed ? 0 : Math.max(0, armour), armourMax,
    internal: destroyed ? 0 : Math.max(0, state.internal), internalMax: state.internalMax,
    armourTone: destroyed ? 'destroyed' as const : tone(fraction(armour, armourMax)),
    internalTone: destroyed ? 'destroyed' as const : tone(fraction(state.internal, state.internalMax)),
    exposed: !destroyed && armour <= 0,
  };
}

export function sectionDescription(location: MechLocation, state: LocationSnapshot, face: ArmourFace): string {
  const view = sectionDamage(state, face);
  if (view.destroyed) return `${LOCATION_NAME[location]} — destroyed`;
  const rear = state.hasRearArmourFace ? `, rear ${Math.ceil(state.rearArmour)}/${state.rearArmourMax}` : '';
  return `${LOCATION_NAME[location]} — ${view.exposed ? 'exposed' : DAMAGE_LABEL[view.armourTone].toLowerCase()}, armour ${Math.ceil(state.armour)}/${state.armourMax}${rear}, structure ${Math.ceil(state.internal)}/${state.internalMax}`;
}

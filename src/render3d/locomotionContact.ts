import { Vector3 } from 'three';
import type { Faction } from '../schema/faction';
import type { MechEntity, Vec2 } from '../sim/types';
import type { AnimationState } from './locomotionState';
import type { MechModel } from './mechModel';

export interface FootfallContact {
  height: number;
  terrain: string;
  landing: boolean;
  tonnage: number;
  faction: Faction;
}

export type FootfallCallback = (at: Vec2, tonnage: number, faction: Faction, contact?: FootfallContact) => void;

export interface ContactCueState {
  at: Vec2;
  detail: FootfallContact;
  planted: [boolean, boolean];
  ready: boolean;
}

const SOLE = new Vector3();

export function createContactCueState(): ContactCueState {
  return { at: { x: 0, y: 0 }, detail: { height: 0, terrain: 'open', landing: false, tonnage: 0, faction: 'linewrought' },
    planted: [true, true], ready: false };
}

/** A touchdown is a support transition, not an arbitrary crossing of the shared gait clock. */
export function emitFootContacts(entity: MechEntity, model: MechModel, state: AnimationState,
  terrainAt: (at: Vec2) => string, heightAt: (x: number, y: number) => number,
  callback: FootfallCallback | null, travelling: boolean, landing = false): void {
  const cue = state.contactCue;
  for (let index = 0; index < model.legs.length; index += 1) {
    const leg = model.legs[index];
    const pose = state.poses[index];
    if (leg === undefined || pose === undefined || index > 1) continue;
    const touchdown = landing || (cue.ready && !cue.planted[index] && pose.planted && travelling && state.amp > 0.35);
    cue.planted[index] = pose.planted;
    if (!touchdown || leg.destroyed || callback === null || leg.sole.userData.authored !== true) continue;
    leg.sole.getWorldPosition(SOLE);
    cue.at.x = SOLE.x;
    cue.at.y = SOLE.z;
    cue.detail.height = Math.max(heightAt(SOLE.x, SOLE.z), SOLE.y);
    cue.detail.terrain = terrainAt(cue.at);
    cue.detail.landing = landing;
    cue.detail.tonnage = entity.tonnage;
    cue.detail.faction = model.faction;
    callback(cue.at, entity.tonnage, model.faction, cue.detail);
  }
  cue.ready = true;
}

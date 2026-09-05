import { MeshStandardMaterial } from 'three';
import type { Tone } from '../render/blueprint';
import type { WeaponType } from '../schema/weapon';
import type { Faction } from '../schema/faction';
import { mix } from '../render/palette';
import { GraphicStandardMaterial } from './graphicMaterials';

export type MechMaterials = Record<Tone, MeshStandardMaterial>;

const TONES: readonly Tone[] = ['plate', 'deep', 'trim', 'glass', 'accent'];

const DEFAULT_BODY_COLOUR = 0xe3b569;

/** Warm field paint and cool ceramic shells identify construction, not teams. */
const CHASSIS_BODY_COLOURS: Readonly<Record<string, number>> = {
  bulwark_bwk3: 0xe4d6ba,
  cairn_crn3: 0xdccaab,
  colossus_cls1: 0xe7d9bf,
  courser_crs1: 0xe8c898,
  drover_dvr2: 0xdd9c5d,
  falchion_fal2: 0xe3e3d7,
  halberd_hlb4: 0xeeeada,
  hornet_hnt2: 0xe8d9b7,
  rampart_rmp4: 0xddc8a7,
  redoubt_rdt1: 0xe5c17e,
  sentinel_snl2: 0xebe8db,
  warden_wrd5: 0xe0e3d9,
  wisp_wsp1: 0xe7ebe2,
  votive_vtv2: 0xf0ead9,
  obsequy_obq3: 0xe1e3db,
  pallvault_plv1: 0xece7d7,
  prybar_pry1: 0xe5d8c1,
  rivet_rvt1: 0xe2cfb2,
  trestle_trs1: 0xdbc9ae,
};

const IRONWORK_IDS: ReadonlySet<string> = new Set([
  'hornet_hnt2', 'prybar_pry1', 'rivet_rvt1', 'trestle_trs1',
  'cairn_crn3', 'bulwark_bwk3', 'rampart_rmp4', 'colossus_cls1',
]);

const INDUSTRIAL_FINISHES: readonly number[] = [
  0xe3b569,
  0xdba36a,
  0xe8cc97,
  0xce8752,
];

const WEAPON_ACCENTS: Record<WeaponType, number> = {
  energy: 0x78cce8,
  ballistic: 0xc4cbd0,
  missile: 0xd9855f,
};

function finishIndex(identity: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % INDUSTRIAL_FINISHES.length;
}

export function chassisBodyColour(identity: string | null, faction: Faction = 'linewrought'): number {
  const fallback = faction === 'aurelian' ? 0xe0e4d5 : DEFAULT_BODY_COLOUR;
  if (identity === null) return fallback;
  const known = CHASSIS_BODY_COLOURS[identity];
  if (known !== undefined) return known;
  const fieldFinish = INDUSTRIAL_FINISHES[finishIndex(identity)] ?? DEFAULT_BODY_COLOUR;
  return faction === 'aurelian' ? mix(0xd3e4dc, fieldFinish, 0.12) : fieldFinish;
}

function material(
  colour: number,
  roughness: number,
  metalness: number,
  emissive = 0x000000,
  emissiveIntensity = 0,
): MeshStandardMaterial {
  return new GraphicStandardMaterial({
    color: colour,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
    flatShading: true,
  });
}

export function createMechMaterials(
  identity: string | null,
  team: number,
  destroyed: boolean,
  faction: Faction = 'linewrought',
): MechMaterials {
  if (destroyed) {
    return {
      plate: material(0x2b2b2d, 0.82, 0.18),
      deep: material(0x181a1c, 0.76, 0.52),
      trim: material(0x50494a, 0.78, 0.14),
      glass: material(0x242a2e, 0.64, 0.08),
      accent: material(0x3a3a3c, 0.72, 0.3),
    };
  }

  const body = chassisBodyColour(identity, faction);
  const sealed = faction === 'aurelian';
  const ironwork = identity !== null && IRONWORK_IDS.has(identity);
  return {
    plate: material(body, sealed ? 0.72 : 0.82, 0.04),
    deep: material(mix(sealed ? 0x203744 : 0x384547, team, 0.16), 0.66, 0.32),
    trim: material(team, 0.76, 0.06),
    glass: material(0xa9e7e1, 0.2, 0.04, 0x277a85, 1.4),
    accent: material(sealed ? 0x3d7877 : ironwork ? 0xc3763f : mix(body, 0xffefc8, 0.8), 0.78, 0.08),
  };
}

/** Damage darkens existing plate batches; it does not add geometry or passes. */
export function createDamageWearMaterials(
  source: MechMaterials,
  tier: 1 | 2,
): MechMaterials {
  const worn = {} as MechMaterials;
  const shade = tier === 1 ? 0.72 : 0.42;
  for (const tone of TONES) {
    const copy = source[tone].clone();
    copy.color.multiplyScalar(shade);
    copy.emissive.multiplyScalar(tier === 1 ? 0.45 : 0.12);
    copy.emissiveIntensity *= tier === 1 ? 0.55 : 0.18;
    copy.roughness = Math.min(1, copy.roughness + (tier === 1 ? 0.12 : 0.24));
    copy.metalness *= tier === 1 ? 0.82 : 0.58;
    worn[tone] = copy;
  }
  return worn;
}

/** Weapon housings remain readable against painted armour under coloured light. */
export function createWeaponMaterial(type: WeaponType): MeshStandardMaterial {
  return material(mix(0x374c54, WEAPON_ACCENTS[type], 0.3), 0.58, 0.38);
}

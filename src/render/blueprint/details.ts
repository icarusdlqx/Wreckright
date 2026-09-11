import { aurelianSignatureDetails } from './details-aurelian';
import { lineSignatureDetails } from './details-line';
import type { BlueprintPart, Bones } from './types';

export const LINE_SIGNATURE_IDS = [
  'hornet_hnt2', 'prybar_pry1', 'rivet_rvt1', 'trestle_trs1',
  'cairn_crn3', 'bulwark_bwk3', 'rampart_rmp4', 'colossus_cls1',
  'drover_dvr2',
] as const;

export const AURELIAN_SIGNATURE_IDS = [
  'wisp_wsp1', 'votive_vtv2', 'sentinel_snl2', 'falchion_fal2',
  'warden_wrd5', 'halberd_hlb4', 'obsequy_obq3', 'pallvault_plv1',
] as const;

export const SIGNATURE_CHASSIS_IDS = [
  ...LINE_SIGNATURE_IDS,
  ...AURELIAN_SIGNATURE_IDS,
] as const;

export function signatureDetails(identity: string | null, b: Bones): BlueprintPart[] {
  if (identity === null) return [];
  return lineSignatureDetails(identity, b) ?? aurelianSignatureDetails(identity, b) ?? [];
}

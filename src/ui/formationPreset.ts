import { FORMATION_PRESET_IDS, type FormationPreset } from '../sim/formation';

export type { FormationPreset } from '../sim/formation';

const LABELS: Record<FormationPreset, string> = {
  auto: 'Auto',
  line: 'Line',
  column: 'Column',
  wedge: 'Wedge',
  box: 'Box',
};

export const FORMATION_PRESETS = FORMATION_PRESET_IDS.map((id) => ({ id, label: LABELS[id] }));

export function isFormationPreset(value: string): value is FormationPreset {
  return (FORMATION_PRESET_IDS as readonly string[]).includes(value);
}

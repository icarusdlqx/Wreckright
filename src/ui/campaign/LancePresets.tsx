import { useState } from 'react';
import type { Catalog } from '../../schema/load';
import type { CampaignState } from '../../campaign/types';
import { autoFillDeployment, loadLancePreset, saveLancePreset } from '../../campaign/lancePresets';

interface Props {
  catalog: Catalog;
  state: CampaignState;
  missionId: string;
  mutate: (change: (draft: CampaignState) => void, message?: string) => void;
}

export function LancePresets({ catalog, state, missionId, mutate }: Props) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');
  const [status, setStatus] = useState('');
  const presetName = state.lancePresets.some((preset) => preset.name === selected)
    ? selected : state.lancePresets[0]?.name ?? '';
  return <section className="lance-presets" aria-label="Lance presets">
    <div><strong>Your lance</strong><small>Choose seats below, or fill available berths within the mission allowance.</small>
      <button type="button" data-testid="manifest-autofill" onClick={() => {
        mutate((draft) => autoFillDeployment(catalog, draft, missionId));
        setStatus('Available pilots and machines put aboard within the mission allowance.');
      }}>Autofill</button>
    </div>
    <div><label>Preset name<input value={name} maxLength={40} data-testid="lance-preset-name"
      onChange={(event) => setName(event.target.value)} placeholder="e.g. Fast patrol" /></label>
      <button type="button" data-testid="lance-preset-save" onClick={() => {
        mutate((draft) => setStatus(saveLancePreset(catalog, draft, missionId, name)));
      }}>Save lance</button>
    </div>
    {state.lancePresets.length === 0 ? null : <div><label>Saved lances<select value={presetName}
      data-testid="lance-preset-picker" onChange={(event) => setSelected(event.target.value)}>
      {state.lancePresets.map((preset) => <option key={preset.name}>{preset.name}</option>)}
    </select></label>
      <button type="button" data-testid="lance-preset-load" onClick={() => {
        mutate((draft) => loadLancePreset(draft, presetName));
        setStatus(`Loaded ${presetName}. Check crew readiness and this mission’s allowance.`);
      }}>Load</button>
      <button type="button" data-testid="lance-preset-remove" onClick={() => {
        mutate((draft) => { draft.lancePresets = draft.lancePresets.filter((preset) => preset.name !== presetName); });
        setStatus(`Removed preset ${presetName}. Your current lance is unchanged.`);
      }}>Remove preset</button>
    </div>}
    <p role="status" data-testid="lance-preset-status">{status}</p>
  </section>;
}

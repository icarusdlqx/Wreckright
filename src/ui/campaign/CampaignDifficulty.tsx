import { getCatalog } from '../../schema/load';
import { difficultyChoices } from '../battleSetupState';

export function CampaignDifficulty({ value, onChange }: {
  value: string;
  onChange: (difficulty: string) => void;
}) {
  const choices = difficultyChoices(getCatalog().rules.difficulty);
  const selected = choices.find((choice) => choice.id === value);
  return (
    <label className="campaign-difficulty">
      Campaign difficulty
      <select value={value} onChange={(event) => onChange(event.target.value)}
        data-testid="campaign-difficulty-picker">
        {choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
      </select>
      <small>{selected?.description}</small>
      <small>Fixed for this campaign. Every contract uses this setting.</small>
    </label>
  );
}

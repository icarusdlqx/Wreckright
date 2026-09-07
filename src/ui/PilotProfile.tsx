import { getCatalog } from '../schema/load';
import type { RateablePilot } from './PilotStats';
import { PilotPortrait } from './PilotPortrait';
import { pilotPersonality, type VoicedPilot } from './pilotPersonality';

const DOMAINS = [
  { key: 'gunnery', label: 'Gunnery', strength: 'accurate fire', weakness: 'less reliable fire' },
  { key: 'piloting', label: 'Piloting', strength: 'steady footing and reactor control', weakness: 'more vulnerable to knockdown and shutdown' },
  { key: 'sensors', label: 'Sensors', strength: 'longer detection and sight range', weakness: 'shorter detection and sight range' },
] as const;

export function PilotAssessment({ pilot }: { pilot: RateablePilot }) {
  const ranked = [...DOMAINS].sort((a, b) => pilot[b.key] - pilot[a.key]);
  const best = ranked[0]!;
  const weakest = ranked[ranked.length - 1]!;
  const balanced = pilot[best.key] === pilot[weakest.key];
  return <div className="pilot-assessment">
    <p className="pilot-strength"><strong>Strength: </strong>{balanced ? 'Balanced fundamentals' : `${best.label} ${pilot[best.key]}/5 · ${best.strength}`}</p>
    <p><strong>Watch: </strong>{balanced ? 'No specialist skill advantage; use their traits' : `${weakest.label} ${pilot[weakest.key]}/5 · ${weakest.weakness}`}</p>
  </div>;
}

export function PilotProfile({ pilot }: {
  pilot: RateablePilot & { id: string; templateId?: string; name: string; bio: string };
}) {
  const authored = getCatalog().pilots.get(pilot.templateId ?? pilot.id);
  return <div className="pilot-person">
    <PilotPortrait pilot={pilot} />
    <div>
      <h4 className="pilot-name">{pilot.name}</h4>
      <p className="pilot-bio">{pilot.bio || authored?.bio}</p>
      <PilotPersonalityNote pilot={pilot} />
      <PilotAssessment pilot={pilot} />
    </div>
  </div>;
}

export function PilotPersonalityNote({ pilot }: { pilot: VoicedPilot }) {
  const personality = pilotPersonality(getCatalog(), pilot);
  if (personality === undefined) return null;
  return <p className="pilot-personality" data-testid={`pilot-personality-${pilot.templateId ?? pilot.id}`}>
    <strong>Temperament · {personality.label}</strong>
    <span>{personality.description}</span>
  </p>;
}

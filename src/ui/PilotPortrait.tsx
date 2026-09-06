import { getCatalog } from '../schema/load';
import type { Pilot } from '../schema/pilot';
import './pilotPortrait.css';

type Appearance = NonNullable<Pilot['portrait']>;
const FALLBACK: Appearance = {
  skin: '#c68d67', hair: '#252c30', jacket: '#394c52', accent: '#ed9d5c',
  style: 'crop', face: 'angular', detail: 'earpiece',
};

const HAIR: Record<Appearance['style'], string> = {
  crop: 'M33 52L32 35 42 25 67 24 80 35 78 49 69 35 48 37 40 48Z',
  sweep: 'M31 56L28 35 39 22 64 20 80 31 82 50 72 39 70 31 50 42 38 43Z',
  braid: 'M31 58L29 34 43 23 65 22 80 34 78 69 84 92 76 104 70 76 71 37 45 36 38 58Z',
  shaved: 'M34 42L38 30 50 25 65 27 74 34 77 44 68 36 49 33Z',
  curls: 'M30 56L25 45 29 39 25 32 34 29 36 22 45 24 51 18 58 24 68 20 73 28 82 29 80 37 85 43 78 55 71 40 62 41 56 36 48 42 39 40Z',
  bob: 'M28 74L27 39 35 25 57 21 74 27 82 40 81 77 69 79 73 42 62 35 38 44 39 76Z',
};
const FACES: Record<Appearance['face'], string> = {
  angular: 'M35 41L48 31 66 32 76 45 73 70 64 83 51 85 38 72Z',
  broad: 'M32 42L45 31 65 31 79 44 76 71 64 84 48 83 35 70Z',
  oval: 'M36 41Q55 24 74 42L73 65Q70 84 57 87Q40 82 37 67Z',
};

/** Authored cut-paper portraits use the same construction palette as the machines. */
export function PilotPortrait({ pilot, compact = false }: {
  pilot: { id: string; name: string; templateId?: string };
  compact?: boolean;
}) {
  const appearance = getCatalog().pilots.get(pilot.templateId ?? pilot.id)?.portrait ?? FALLBACK;
  const { skin, hair, jacket, accent, style, face, detail } = appearance;
  return (
    <svg className={`pilot-portrait${compact ? ' is-compact' : ''}`} viewBox="0 0 112 136"
      role="img" aria-label={`Portrait of ${pilot.name}`} data-testid={`portrait-${pilot.templateId ?? pilot.id}`}>
      <rect width="112" height="136" rx="8" fill="#182c32" />
      <path d="M0 105L83 0H112V136H0Z" fill={accent} opacity=".22" />
      <path d="M8 13H34M8 13V38M104 98V123H82" fill="none" stroke={accent} opacity=".6" />
      <path d="M9 136L14 108 36 94 77 94 100 110 105 136Z" fill={jacket} />
      <path d="M46 74H67L69 101 56 110 42 100Z" fill={skin} />
      <path d="M46 77L67 78 66 89 47 93Z" fill="#14272e" opacity=".24" />
      <path d={FACES[face]} fill={skin} />
      <path d="M58 36L70 41 72 66 64 77 58 78Z" fill="#fff2dc" opacity=".16" />
      <path d={HAIR[style]} fill={hair} />
      <path d="M39 50L49 48M61 48L70 51" stroke={hair} strokeWidth="3" strokeLinecap="round" />
      <path d="M42 55H47M63 55H68" stroke="#17282d" strokeWidth="3" strokeLinecap="round" />
      <path d="M56 53L52 65 58 66" fill="none" stroke="#14272e" opacity=".35" strokeWidth="2" />
      <path d="M48 74L56 76 64 73" fill="none" stroke="#583e39" strokeWidth="2" />
      {detail === 'scar' ? <path d="M67 49L61 67" stroke="#eac2a5" strokeWidth="2" /> : null}
      {detail === 'beard' ? <path d="M37 64L46 71 56 72 66 69 74 62 71 76 61 86 50 85 40 75Z" fill={hair} opacity=".85" /> : null}
      {detail === 'freckles' ? <path d="M40 61H42M46 63H48M63 62H65M68 61H70" stroke="#795b44" /> : null}
      {detail === 'visor' ? <><path d="M35 49L75 49 72 62H60L56 55 52 62H38Z" fill="#163943" opacity=".85" /><path d="M39 52H51M61 52H71" stroke={accent} strokeWidth="2" /></> : null}
      {detail === 'earpiece' ? <><rect x="31" y="48" width="8" height="18" rx="3" fill="#21373d" /><path d="M34 64L40 76 49 78" fill="none" stroke={accent} strokeWidth="2" /></> : null}
      <path d="M35 94L49 107 45 119 26 101M77 94L62 107 66 119 88 102" fill="#101f27" />
      <path d="M56 110V136" stroke="#adc4c3" opacity=".45" strokeWidth="2" />
      <path d="M19 115H36V123H19Z" fill={accent} /><path d="M22 117L29 117" stroke="#182c32" strokeWidth="2" />
      <path d="M75 114H91M75 119H86" stroke="#e9dcc3" opacity=".65" strokeWidth="2" />
      <path d="M0 132H112" stroke={accent} strokeWidth="8" />
    </svg>
  );
}

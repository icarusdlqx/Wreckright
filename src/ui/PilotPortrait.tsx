import { getCatalog } from '../schema/load';
import type { PilotAppearance } from '../schema/pilotAppearance';
import { PortraitFace, PortraitHair } from './portraits/portraitFeatures';
import { PortraitAccessories, PortraitUniform } from './portraits/portraitKit';
import './pilotPortrait.css';

const FALLBACK: PilotAppearance = {
  skin: '#c68d67', hair: '#252c30', jacket: '#394c52', accent: '#ed9d5c',
  style: 'crop', face: 'angular', detail: 'earpiece', expression: 'calm',
  kit: 'workcoat', accessory: 'none', age: 'mature',
};

type PilotSpecialty = 'gunnery' | 'piloting' | 'sensors' | 'balanced';

function specialtyFor(pilot: { gunnery: number; piloting: number; sensors: number } | undefined): PilotSpecialty {
  if (pilot === undefined) return 'balanced';
  const values = [pilot.gunnery, pilot.piloting, pilot.sensors];
  const best = Math.max(...values);
  if (values.filter((value) => value === best).length > 1) return 'balanced';
  return best === pilot.gunnery ? 'gunnery' : best === pilot.piloting ? 'piloting' : 'sensors';
}

function PortraitFieldMark({ specialty, accent }: { specialty: PilotSpecialty; accent: string }) {
  if (specialty === 'gunnery') return <g className="pilot-field-mark" fill="none" stroke={accent}>
    <circle cx="26" cy="42" r="10" /><path d="M26 25V33M26 51V59M9 42H17M35 42H43" />
  </g>;
  if (specialty === 'piloting') return <g className="pilot-field-mark" fill="none" stroke={accent}>
    <path d="M13 54L26 41 39 54M13 41L26 28 39 41" />
  </g>;
  if (specialty === 'sensors') return <g className="pilot-field-mark" fill="none" stroke={accent}>
    <path d="M13 52Q26 38 39 52M17 43Q26 34 35 43M22 35Q26 31 30 35" /><circle cx="26" cy="56" r="2" fill={accent} />
  </g>;
  return <g className="pilot-field-mark" fill="none" stroke={accent}>
    <path d="M26 28L39 42 26 56 13 42Z" /><circle cx="26" cy="42" r="3" fill={accent} />
  </g>;
}

/** Vector portraits keep both the radio thumbnail and full crew dossier sharp. */
export function PilotPortrait({ pilot, compact = false }: {
  pilot: { id: string; name: string; templateId?: string };
  compact?: boolean;
}) {
  const authored = getCatalog().pilots.get(pilot.templateId ?? pilot.id);
  const appearance = authored?.portrait ?? FALLBACK;
  const { skin, accent, expression } = appearance;
  const specialty = specialtyFor(authored);
  const tilt = expression === 'wry' ? -4 : expression === 'curious' ? 3 : expression === 'grin' ? -2 : 0;
  return <svg className={`pilot-portrait${compact ? ' is-compact' : ''}`} viewBox="0 0 160 200"
    role="img" aria-label={`Portrait of ${pilot.name}`} data-testid={`portrait-${pilot.templateId ?? pilot.id}`}
    data-expression={expression} data-kit={appearance.kit} data-specialty={specialty}>
    <title>{authored === undefined ? pilot.name : `${pilot.name} · ${authored.personality?.label ?? 'Company pilot'} · ${specialty}`}</title>
    <defs>
      <linearGradient id={`portrait-wash-${pilot.templateId ?? pilot.id}`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#1c4650" /><stop offset=".62" stopColor="#102e37" /><stop offset="1" stopColor="#071d26" />
      </linearGradient>
      <clipPath id={`portrait-clip-${pilot.templateId ?? pilot.id}`}><rect width="160" height="200" rx="10" /></clipPath>
    </defs>
    <g clipPath={`url(#portrait-clip-${pilot.templateId ?? pilot.id})`}>
    <rect width="160" height="200" rx="10" fill={`url(#portrait-wash-${pilot.templateId ?? pilot.id})`} />
    <path d="M25 200L106 0H160V200Z" fill={accent} opacity=".24" />
    <path d="M0 144L160 90V154L0 192Z" fill="#071d26" opacity=".38" />
    <path d="M-10 32L170 1M-10 48L170 17M-10 182L170 151" stroke="#d8e8dc" strokeWidth="1" opacity=".06" />
    <PortraitFieldMark specialty={specialty} accent={accent} />
    <circle cx="80" cy="82" r="64" fill="none" stroke={accent} opacity=".18" strokeWidth="1.5" />
    <path d="M12 14H35M12 14V36M148 164V185H126" fill="none" stroke={accent} strokeWidth="2" opacity=".6" />
    <path d="M64 109H96L103 151 80 167 57 151Z" fill={skin} />
    <path d="M64 114L98 116 95 132 65 144Z" fill="#472e2b" opacity=".3" />
    <PortraitUniform appearance={appearance} />
    <g transform={`rotate(${tilt} 80 120)`}>
      <PortraitFace appearance={appearance} />
      <PortraitHair appearance={appearance} />
      <PortraitAccessories appearance={appearance} />
    </g>
    <path d="M0 196H160" stroke={accent} strokeWidth="8" />
    <path d="M13 190H29M34 190H39" stroke="#e3dbc7" strokeWidth="2" opacity=".72" />
    <path d="M119 189H146" stroke="#e3dbc7" strokeWidth="2" opacity=".32" />
    </g>
  </svg>;
}

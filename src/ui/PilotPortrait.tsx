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

/** Vector portraits keep both the radio thumbnail and full crew dossier sharp. */
export function PilotPortrait({ pilot, compact = false }: {
  pilot: { id: string; name: string; templateId?: string };
  compact?: boolean;
}) {
  const appearance = getCatalog().pilots.get(pilot.templateId ?? pilot.id)?.portrait ?? FALLBACK;
  const { skin, accent, expression } = appearance;
  const tilt = expression === 'wry' ? -4 : expression === 'curious' ? 3 : expression === 'grin' ? -2 : 0;
  return <svg className={`pilot-portrait${compact ? ' is-compact' : ''}`} viewBox="0 0 160 200"
    role="img" aria-label={`Portrait of ${pilot.name}`} data-testid={`portrait-${pilot.templateId ?? pilot.id}`}
    data-expression={expression} data-kit={appearance.kit}>
    <rect width="160" height="200" rx="10" fill="#143039" />
    <path d="M25 200L106 0H160V200Z" fill={accent} opacity=".2" />
    <path d="M0 144L160 90V154L0 192Z" fill="#071d26" opacity=".3" />
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
    <path d="M13 191H29M34 191H39" stroke="#e3dbc7" strokeWidth="2" opacity=".55" />
  </svg>;
}

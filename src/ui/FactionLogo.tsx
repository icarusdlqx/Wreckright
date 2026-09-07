import type { Faction } from '../schema/faction';
import './factionLogo.css';

export const factionLabel = (faction: Faction): string => faction === 'aurelian' ? 'Aurelian Stock' : 'Linewrought';

/** Two workshop stamps: a bolted crossing and a precisely divided monolith. */
export function FactionLogo({ faction, size = 40, decorative = false }: {
  faction: Faction; size?: number; decorative?: boolean;
}) {
  return <svg className={`faction-logo faction-logo-${faction}`} width={size} height={size} viewBox="0 0 64 64"
    role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : `${factionLabel(faction)} insignia`}
    aria-hidden={decorative || undefined} focusable="false" data-faction-logo={faction}>
    {faction === 'linewrought' ? <>
      <path d="M7 9 52 5 59 17 56 54 13 59 5 45Z" fill="var(--faction-ink)" />
      <path d="m17 18 8-1 2 28-8 1Z M38 16l8-1 2 28-8 1Z M22 34l18-16 5 6-18 16Z" fill="var(--faction-paper)" />
      <path d="m25 37 14-2 1 7-14 2Z" fill="var(--faction-accent)" />
      {[[12, 16], [50, 12], [13, 50], [49, 49]].map(([x, y], index) =>
        <circle key={index} cx={x} cy={y} r="2" fill="var(--faction-accent)" />)}
    </> : <>
      <path d="M32 3 56 17v30L32 61 8 47V17Z" fill="var(--faction-ink)" />
      <path d="M32 9 51 20v24L32 55 13 44V20Z" fill="none" stroke="var(--faction-accent)" strokeWidth="1.5" />
      <path d="M29 17h6v28h-6Z M20 25h5v20h-5Z M39 25h5v20h-5Z" fill="var(--faction-paper)" />
      <path d="M17 49h30M32 12v2" stroke="var(--faction-accent)" strokeWidth="2" />
    </>}
  </svg>;
}

import type { Chassis } from '../../schema/chassis';
import './machineDossier.css';

const portraits = import.meta.glob('../../assets/machines/*.webp', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;

export function machinePortraitSource(chassisId: string): string | undefined {
  return portraits[`../../assets/machines/${chassisId}.webp`];
}

/** Static identification art avoids opening a WebGL context for every roster card. */
export function MachinePortrait({ chassis }: { chassis: Chassis }) {
  return <img className="machine-portrait" src={machinePortraitSource(chassis.id)}
    alt={`${chassis.name} chassis portrait`} width={320} height={360}
    data-faction={chassis.faction} loading="lazy" decoding="async"
    title="Chassis portrait · standard equipment · field plate" />;
}

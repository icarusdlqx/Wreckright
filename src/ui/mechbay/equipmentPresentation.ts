import type { Equipment } from '../../schema/equipment';
import type { Catalog } from '../../schema/load';

function number(value: number, places = 2): string {
  return value.toFixed(places).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function increase(factor: number): string {
  return `${number((factor - 1) * 100)}%`;
}

function reduction(factor: number): string {
  return `${number((1 - factor) * 100)}%`;
}

/** Player-facing effects derived from the same equipment stats the simulation consumes. */
export function equipmentEffectLines(catalog: Catalog, equipment: Equipment): readonly string[] {
  const stats = equipment.stats;
  const effects: string[] = [];
  // Do not advertise authored fields the runtime does not currently consume
  // (for example ECM radius or per-item jump cooldown) as working mechanics.

  if (stats.sensor_range_factor !== undefined) {
    effects.push(
      `Extends sensor detection range by ${increase(stats.sensor_range_factor)}; sensors classify contacts but do not grant line of sight.`,
    );
  }
  if (stats.sight_range_factor !== undefined) {
    effects.push(`Extends optical line of sight by ${increase(stats.sight_range_factor)}.`);
  }
  if (stats.signature_factor !== undefined) {
    effects.push(stats.signature_factor <= 1
      ? `Cuts electronic signature by ${reduction(stats.signature_factor)}.`
      : `Increases electronic signature by ${increase(stats.signature_factor)}.`);
  }
  if (stats.ams_missile_factor !== undefined) {
    effects.push(`Cuts incoming missile hit chance by ${reduction(stats.ams_missile_factor)}.`);
  }
  if ((stats.ammo_blast_containment ?? 0) > 0) {
    effects.push('Contains ammunition explosions in the fitted location.');
  }
  if (stats.dissipation !== undefined) {
    const perSecond = stats.dissipation * catalog.rules.heat.dissipationPerSinkPerSecond;
    effects.push(`Dissipates ${number(perSecond)} heat per second for each installed sink.`);
  }
  if (stats.incoming_accuracy_factor !== undefined) {
    effects.push(`Cuts incoming weapon hit chance by ${reduction(stats.incoming_accuracy_factor)}.`);
  }
  if (stats.jump_distance !== undefined) {
    const heat = stats.heat_per_jump ?? 0;
    effects.push(
      `Each fitted jet adds ${number(stats.jump_distance)}m of jump reach and ${number(heat)} heat to a jump.`,
    );
  }
  if (stats.designator_range !== undefined) {
    const duration = stats.designator_seconds ?? 0;
    const accuracy = increase(catalog.rules.combat.tagFactor);
    effects.push(
      `Paints a visible target within ${number(stats.designator_range)}m; the mark lasts ${number(duration)}s and improves allied hit chance by ${accuracy}.`,
    );
  }
  if (stats.accuracy_factor !== undefined) {
    effects.push(`Improves this machine's weapon hit chance by ${increase(stats.accuracy_factor)}.`);
  }

  return effects.length > 0 ? effects : ['No simulated effect is currently listed.'];
}

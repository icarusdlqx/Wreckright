import type { MechModel } from './mechModel';
import { triggerPowerShudder } from './machineCulture';
import { setStartupPowered, synchronizeStartupPowered } from './startupLights';

export function presentMachinePowerEvent(
  model: MechModel | undefined,
  event: 'shutdown' | 'restart',
  reducedMotion: boolean,
): void {
  if (model === undefined) return;
  if (model.startup !== null) setStartupPowered(model, event === 'restart');
  if (model.faction === 'linewrought' && !reducedMotion) {
    triggerPowerShudder(model.hullRecoil, model.culture, event);
  }
}

/** Hidden machines retain only their current steady state, never event history. */
export function synchronizeMachinePower(model: MechModel, powered: boolean): void {
  if (model.startup !== null) synchronizeStartupPowered(model, powered);
}

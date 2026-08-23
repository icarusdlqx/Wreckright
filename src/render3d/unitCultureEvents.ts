import type { MechModel } from './mechModel';
import { triggerPowerShudder } from './machineCulture';
import { setStartupPowered, synchronizeStartupPowered } from './startupLights';

export function presentMachinePowerEvent(
  model: MechModel | undefined,
  event: 'shutdown' | 'restart',
  reducedMotion: boolean,
): void {
  if (model?.faction === 'aurelian') {
    setStartupPowered(model, event === 'restart');
  } else if (model?.faction === 'linewrought' && !reducedMotion) {
    triggerPowerShudder(model.hullRecoil, model.culture, event);
  }
}

/** Hidden machines retain only their current steady state, never event history. */
export function synchronizeMachinePower(model: MechModel, powered: boolean): void {
  if (model.faction === 'aurelian') synchronizeStartupPowered(model, powered);
}

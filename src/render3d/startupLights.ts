import type { Mesh } from 'three';
import { activeStartupLights, type MachineCultureProfile } from './machineCulture';

export interface StartupLightRig {
  lights: Mesh[];
  /** Destroyed systems leave corresponding channels permanently dark. */
  enabled: boolean[];
  /** Heavily worn channels stay lit but stutter; absent means every lamp is steady. */
  flicker?: boolean[];
  elapsed: number;
  running: boolean;
}

/** Two unrelated periods make a stutter that never settles into a rhythm. */
export function lampFlickerLit(elapsed: number, index: number): boolean {
  return Math.sin(elapsed * 23 + index * 1.7) * Math.sin(elapsed * 7.3 + index) > -0.3;
}

interface StartupModel {
  culture: Readonly<MachineCultureProfile>;
  startup: StartupLightRig | null;
}

export function advanceStartupSequence(
  model: StartupModel,
  deltaSeconds: number,
  reducedMotion: boolean,
): void {
  const startup = model.startup;
  if (startup === null || !startup.running) return;
  startup.elapsed += Math.max(0, deltaSeconds);
  let enabledTotal = 0;
  for (const enabled of startup.enabled) if (enabled) enabledTotal += 1;
  const active = activeStartupLights(
    model.culture,
    startup.elapsed,
    enabledTotal,
    reducedMotion,
  );
  let enabledIndex = 0;
  for (let index = 0; index < startup.lights.length; index += 1) {
    const light = startup.lights[index];
    if (light === undefined) continue;
    const enabled = startup.enabled[index] === true;
    const steady = reducedMotion || startup.flicker?.[index] !== true ||
      lampFlickerLit(startup.elapsed, index);
    light.visible = enabled && enabledIndex < active && steady;
    if (enabled) enabledIndex += 1;
  }
}

export function setStartupPowered(model: StartupModel, powered: boolean): void {
  const startup = model.startup;
  if (startup === null) return;
  startup.elapsed = 0;
  startup.running = powered;
  for (const light of startup.lights) light.visible = false;
}

/** Applies current power without replaying a transient reveal/restart sequence. */
export function synchronizeStartupPowered(model: StartupModel, powered: boolean): void {
  const startup = model.startup;
  if (startup === null) return;
  startup.elapsed = 0;
  startup.running = false;
  for (let index = 0; index < startup.lights.length; index += 1) {
    const light = startup.lights[index];
    if (light !== undefined) light.visible = powered && startup.enabled[index] === true;
  }
}

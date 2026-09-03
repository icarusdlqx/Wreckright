import type { HeatTier } from './audioCues';
import type { AmbientBus } from './audioGraph';

export interface ReactorStressHandle {
  setTier(tier: HeatTier): void;
  stop(): void;
}

/** The loop is allocated once per battle; below this tier it idles at silence. */
export const REACTOR_STRESS_MIN_TIER: HeatTier = 2;
export const REACTOR_STRESS_SOURCE_COUNT = 3;

const TIER_LEVEL: Readonly<Record<HeatTier, number>> = { 0: 0, 1: 0, 2: 0.055, 3: 0.1 };
const TIER_WHINE_HZ: Readonly<Record<HeatTier, number>> = { 0: 150, 1: 150, 2: 185, 3: 250 };
const TIER_HISS_HZ: Readonly<Record<HeatTier, number>> = { 0: 700, 1: 700, 2: 1_100, 3: 1_900 };
const TIER_THROB_HZ: Readonly<Record<HeatTier, number>> = { 0: 2.5, 1: 2.5, 2: 3.5, 3: 6.5 };
const FOLLOW_SECONDS = 0.3;

/**
 * A reactor running past its headroom. The selected machine carries it, so the
 * player hears the strain of the unit they are about to command.
 */
export function startReactorStress(bus: AmbientBus): ReactorStressHandle {
  const now = bus.context.currentTime;
  const level = bus.context.createGain();
  level.gain.value = 0;
  level.connect(bus.master);

  const throbGate = bus.context.createGain();
  throbGate.gain.value = 0.6;
  throbGate.connect(level);
  const throb = bus.context.createOscillator();
  throb.type = 'sine';
  throb.frequency.value = TIER_THROB_HZ[0];
  const throbDepth = bus.context.createGain();
  throbDepth.gain.value = 0.4;
  throb.connect(throbDepth).connect(throbGate.gain);

  const hiss = bus.context.createBufferSource();
  hiss.buffer = bus.noise;
  hiss.loop = true;
  const hissBand = bus.context.createBiquadFilter();
  hissBand.type = 'bandpass';
  hissBand.frequency.value = TIER_HISS_HZ[0];
  hissBand.Q.value = 1.4;
  const hissLevel = bus.context.createGain();
  hissLevel.gain.value = 0.7;
  hiss.connect(hissBand).connect(hissLevel).connect(throbGate);

  const whine = bus.context.createOscillator();
  whine.type = 'sawtooth';
  whine.frequency.value = TIER_WHINE_HZ[0];
  const whineSoften = bus.context.createBiquadFilter();
  whineSoften.type = 'lowpass';
  whineSoften.frequency.value = 900;
  const whineLevel = bus.context.createGain();
  whineLevel.gain.value = 0.35;
  whine.connect(whineSoften).connect(whineLevel).connect(throbGate);

  const sources: AudioScheduledSourceNode[] = [throb, hiss, whine];
  hiss.start(now, bus.random() * 0.5);
  throb.start(now);
  whine.start(now);

  let stopped = false;
  let applied: HeatTier = 0;
  return {
    setTier: (tier: HeatTier): void => {
      if (stopped || tier === applied) return;
      applied = tier;
      const at = bus.context.currentTime;
      level.gain.setTargetAtTime(TIER_LEVEL[tier], at, FOLLOW_SECONDS);
      whine.frequency.setTargetAtTime(TIER_WHINE_HZ[tier], at, FOLLOW_SECONDS);
      hissBand.frequency.setTargetAtTime(TIER_HISS_HZ[tier], at, FOLLOW_SECONDS);
      throb.frequency.setTargetAtTime(TIER_THROB_HZ[tier], at, FOLLOW_SECONDS);
    },
    stop: (): void => {
      if (stopped) return;
      stopped = true;
      const at = bus.context.currentTime;
      level.gain.setTargetAtTime(0, at, 0.05);
      for (const source of sources) {
        try {
          source.stop(at + 0.4);
        } catch {
          // A closed context has already ended every source.
        }
      }
    },
  };
}

import type { AmbientBus } from './audioGraph';

export interface AmbientHandle {
  stop(): void;
}

interface AmbientProfile {
  /** Where the wind's top end sits. Low is warm and distant, high is ice. */
  windHz: number;
  /** How often a gust leans on the bed, in cycles per second. */
  gustHz: number;
  /** A standing machine tone, for ground that is itself running. */
  droneHz: number | null;
  /** Trim against the shared ambient level. */
  level: number;
}

export interface LocationSoundProfile {
  family: 'workshop' | 'tender' | 'archive';
  machineHz: number;
  pulseHz: number;
  voice: OscillatorType;
}

/** Loud enough to end the silence, quiet enough never to fight a weapon. */
const AMBIENT_LEVEL = 0.055;

const AMBIENT_PROFILES: Readonly<Record<string, AmbientProfile>> = {
  overcast_day: { windHz: 480, gustHz: 0.07, droneHz: null, level: 1 },
  hard_noon: { windHz: 720, gustHz: 0.05, droneHz: null, level: 0.8 },
  moonlit_night: { windHz: 300, gustHz: 0.04, droneHz: null, level: 0.75 },
  ash_dusk: { windHz: 420, gustHz: 0.08, droneHz: 46, level: 1.1 },
  cold_rime: { windHz: 1200, gustHz: 0.1, droneHz: null, level: 0.9 },
  dust_storm: { windHz: 950, gustHz: 0.14, droneHz: null, level: 1.3 },
  rain: { windHz: 2000, gustHz: 0.03, droneHz: null, level: 0.8 },
  dawn: { windHz: 260, gustHz: 0.035, droneHz: null, level: 0.65 },
  industrial_smog: { windHz: 340, gustHz: 0.03, droneHz: 82, level: 0.9 },
};

const LOCATION_PROFILES: Readonly<Record<string, LocationSoundProfile>> = {
  line_workshop_belt: { family: 'workshop', machineHz: 64, pulseHz: 0.72, voice: 'square' },
  line_recovery_cut: { family: 'workshop', machineHz: 48, pulseHz: 0.36, voice: 'triangle' },
  aurelian_landing_apron: { family: 'tender', machineHz: 118, pulseHz: 1.4, voice: 'sine' },
  aurelian_service_terraces: { family: 'tender', machineHz: 142, pulseHz: 0.92, voice: 'sine' },
  aurelian_civic_exchange: { family: 'tender', machineHz: 105, pulseHz: 1.08, voice: 'sine' },
  barrow_archive: { family: 'archive', machineHz: 74, pulseHz: 0.5, voice: 'triangle' },
};

export function locationSoundProfile(mapId: string | undefined): LocationSoundProfile | null {
  return mapId === undefined ? null : LOCATION_PROFILES[mapId] ?? null;
}

/** Builds the battlefield's standing sound and returns its entire lifetime. */
export function startAmbient(bus: AmbientBus, atmosphereId: string, mapId?: string): AmbientHandle {
  const profile = AMBIENT_PROFILES[atmosphereId] ?? AMBIENT_PROFILES['overcast_day'];
  if (profile === undefined) return { stop: () => undefined };

  const level = bus.context.createGain();
  level.gain.value = 0;
  level.connect(bus.master);
  level.gain.setTargetAtTime(AMBIENT_LEVEL * profile.level, bus.context.currentTime, 2);

  const sources: AudioScheduledSourceNode[] = [];
  const wind = bus.context.createBufferSource();
  wind.buffer = bus.noise;
  wind.loop = true;
  const band = bus.context.createBiquadFilter();
  band.type = 'lowpass';
  band.frequency.value = profile.windHz;
  band.Q.value = 0.4;

  const sway = bus.context.createGain();
  sway.gain.value = 0.55;
  const gust = bus.context.createOscillator();
  gust.type = 'sine';
  gust.frequency.value = profile.gustHz * (0.9 + bus.random() * 0.2);
  const depth = bus.context.createGain();
  depth.gain.value = 0.3;
  gust.connect(depth).connect(sway.gain);
  wind.connect(band).connect(sway).connect(level);
  wind.start();
  gust.start();
  sources.push(wind, gust);

  if (profile.droneHz !== null) {
    const drone = bus.context.createOscillator();
    drone.type = 'triangle';
    drone.frequency.value = profile.droneHz;
    const droneLevel = bus.context.createGain();
    droneLevel.gain.value = 0.16;
    drone.connect(droneLevel).connect(level);
    drone.start();
    sources.push(drone);
  }

  const location = locationSoundProfile(mapId);
  if (location !== null) {
    const machine = bus.context.createOscillator();
    machine.type = location.voice;
    machine.frequency.value = location.machineHz;
    const machineLevel = bus.context.createGain();
    machineLevel.gain.value = location.family === 'workshop' ? 0.095 : 0.06;
    const pulse = bus.context.createOscillator();
    pulse.type = 'sine';
    pulse.frequency.value = location.pulseHz;
    const pulseDepth = bus.context.createGain();
    pulseDepth.gain.value = location.family === 'tender' ? 0.022 : 0.04;
    pulse.connect(pulseDepth).connect(machineLevel.gain);
    machine.connect(machineLevel).connect(level);
    machine.start();
    pulse.start();
    sources.push(machine, pulse);
  }

  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      const now = bus.context.currentTime;
      level.gain.setTargetAtTime(0, now, 0.15);
      for (const source of sources) {
        try {
          source.stop(now + 0.7);
        } catch {
          // A closed context has already done the same work.
        }
      }
    },
  };
}

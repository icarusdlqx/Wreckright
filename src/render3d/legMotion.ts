export interface LegPose {
  hip: number;
  knee: number;
  ankle: number;
  planted: boolean;
}

const HALF_CYCLE = Math.PI;
const FULL_CYCLE = Math.PI * 2;

/** The stance half moves at one rate so the foot can hold while the hull passes over it. */
export function writeStridePose(
  out: LegPose,
  phase: number,
  swing: number,
  kneeLift: number,
  bodyLean: number,
): void {
  const cycle = positiveModulo(phase, FULL_CYCLE);
  if (cycle < HALF_CYCLE) {
    const progress = cycle / HALF_CYCLE;
    out.hip = Math.asin(Math.sin(swing) * (1 - progress * 2));
    out.knee = 0;
    out.planted = true;
  } else {
    const progress = (cycle - HALF_CYCLE) / HALF_CYCLE;
    out.hip = -Math.cos(progress * Math.PI) * swing;
    out.knee = -Math.sin(progress * Math.PI) * kneeLift;
    out.planted = false;
  }
  out.ankle = ankleCounterRotation(out.hip, out.knee, bodyLean);
}

/** Opposite sides must reverse their stance arc around the same hull yaw. */
export function writeTurnPose(
  out: LegPose,
  phase: number,
  swing: number,
  kneeLift: number,
  side: -1 | 1,
  direction: -1 | 1,
): void {
  writeStridePose(out, phase, swing, kneeLift, 0);
  if (side * direction > 0) out.hip = -out.hip;
  out.ankle = ankleCounterRotation(out.hip, out.knee, 0);
}

export function writeJumpPose(
  out: LegPose,
  progress: number,
  tuck: number,
  side: number,
): void {
  const lift = Math.sin(clamp(progress, 0, 1) * Math.PI) * tuck;
  out.hip = lift * (0.1 + side * 0.025);
  out.knee = -lift;
  out.ankle = ankleCounterRotation(out.hip, out.knee, 0);
  out.planted = false;
}

/** A failed actuator drags through a short arc while the surviving leg carries the hull. */
export function writeLimpPose(
  out: LegPose,
  phase: number,
  swing: number,
  kneeLift: number,
): void {
  const cycle = positiveModulo(phase, FULL_CYCLE);
  const drag = Math.sin(cycle);
  const hitch = Math.max(0, -Math.cos(cycle));
  out.hip = -0.1 + drag * swing * 0.22;
  out.knee = -0.24 - hitch * kneeLift * 0.34;
  out.ankle = ankleCounterRotation(out.hip, out.knee, 0);
  out.planted = false;
}

/** One smooth brace serves both full and reduced-motion stumble reads. */
export function writeStumblePose(out: LegPose, lost: boolean, envelope: number): void {
  out.hip = (lost ? -0.15 : 0.06) * envelope;
  out.knee = (lost ? -0.7 : -0.2) * envelope;
  out.ankle = ankleCounterRotation(out.hip, out.knee, 0);
  out.planted = !lost;
}

export function resetLegPose(out: LegPose): void {
  out.hip = 0;
  out.knee = 0;
  out.ankle = 0;
  out.planted = true;
}

export function ankleCounterRotation(hip: number, knee: number, bodyLean: number): number {
  return -(hip + knee + bodyLean);
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

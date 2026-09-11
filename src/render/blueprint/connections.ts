import { part } from './parts';
import type { BlueprintPart } from './types';

/** Intersect the authored, unrotated side profile rather than guessing from its box. */
export function profileSection(piece: BlueprintPart, axis: 0 | 1, coordinate: number): [number, number] {
  const other = axis === 0 ? 1 : 0;
  const profile = piece.profile ?? [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const local = (coordinate - piece.at[axis]) / piece.size[axis];
  const crossings: number[] = [];
  for (let index = 0; index < profile.length; index += 1) {
    const a = profile[index]!;
    const b = profile[(index + 1) % profile.length]!;
    if (local < Math.min(a[axis]!, b[axis]!) || local > Math.max(a[axis]!, b[axis]!)) continue;
    const span = b[axis]! - a[axis]!;
    if (Math.abs(span) < 1e-8) {
      crossings.push(a[other]!, b[other]!);
    } else {
      crossings.push(a[other]! + (b[other]! - a[other]!) * (local - a[axis]!) / span);
    }
  }
  if (crossings.length === 0) throw new Error('Fitting lies outside its authored carrier profile');
  return [piece.at[other] + Math.min(...crossings) * piece.size[other],
    piece.at[other] + Math.max(...crossings) * piece.size[other]];
}

/** A pod retains its own damage owner while its collar reaches inside the central frame. */
export function shoulderConnection(parts: BlueprintPart[], shoulder: BlueprintPart): void {
  const body = parts.find((piece) => piece.location === 'centre_torso' && piece.detail === 'structure');
  if (body === undefined) return;
  const bodySection = profileSection(body, 0, shoulder.at[0]);
  const podSection = profileSection(shoulder, 0, shoulder.at[0]);
  const bottom = Math.max(bodySection[0], podSection[0]);
  const top = Math.min(bodySection[1], podSection[1]);
  // High artillery pods already have an authored overhead bridge; do not fill its open bay.
  if (top - bottom < 0.04) return;
  parts.push(part(shoulder.location, 'box', [shoulder.at[0], (bottom + top) / 2, shoulder.at[2] / 2],
    [Math.min(body.size[0], shoulder.size[0]) * 0.42, Math.min((top - bottom) * 0.72, shoulder.size[1] * 0.4),
      Math.abs(shoulder.at[2]) + shoulder.size[2] * 0.3], 'deep'));
}

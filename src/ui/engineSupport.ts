import { headingBetween, type SupportCallId } from '../sim/support';
import { isOperational, type Vec2, type World } from '../sim/types';
import { supportRadius } from './supportOptions';

export interface SupportAim {
  call: SupportCallId;
  at: Vec2;
  to: Vec2;
}

export interface SupportRunPreview {
  at: Vec2;
  heading: number;
  length: number;
  width: number;
}

/**
 * A short drag lays the run-in; anything shorter than a tile means the player
 * clicked, and the strike then runs from the lance's centre through the point.
 */
export function supportHeading(world: World, at: Vec2, to: Vec2): number {
  const drag = Math.hypot(to.x - at.x, to.y - at.y);
  if (drag >= world.terrain.tileSize) return headingBetween(at, to);

  const team = world.playerTeam ?? 0;
  let x = 0;
  let y = 0;
  let count = 0;
  for (const entity of world.entities) {
    if (entity.team !== team || !isOperational(entity)) continue;
    x += entity.pos.x;
    y += entity.pos.y;
    count += 1;
  }
  if (count === 0) return 0;
  return headingBetween({ x: x / count, y: y / count }, at);
}

export function supportRunPreview(
  world: World,
  aim: SupportAim | null,
  cursorWorld: Vec2 | null,
  call: SupportCallId | null,
): SupportRunPreview | null {
  const at = aim?.at ?? cursorWorld;
  if ((aim?.call ?? call) !== 'air_strike' || at === null) return null;
  const config = world.rules.support.air_strike;
  return {
    at,
    heading: supportHeading(world, at, aim?.to ?? at),
    length: config.length,
    width: config.width,
  };
}

export function supportAreaPreview(
  world: World,
  cursorWorld: Vec2 | null,
  call: SupportCallId | null,
): { at: Vec2; radius: number } | null {
  if (cursorWorld === null) return null;
  const radius = supportRadius(world.rules.support, call);
  return radius === null ? null : { at: cursorWorld, radius };
}

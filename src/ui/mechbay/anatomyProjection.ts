import { chassisBlueprint, type BlueprintPart } from '../../render/blueprint';
import { geometryForBlueprintPart } from '../../render3d/mechGeometry';
import type { Chassis } from '../../schema/chassis';

export interface AnatomyPoint { x: number; y: number }
export interface AnatomyPiece {
  points: AnatomyPoint[];
  tone: BlueprintPart['tone'];
  location: BlueprintPart['location'];
}
export interface AnatomyProjection { pieces: AnatomyPiece[]; viewBox: string }

/** The fitting diagram looks toward the nose: the machine's right is on our left. */
export function projectAnatomyPart(part: BlueprintPart, torsoY: number): AnatomyPiece {
  const geometry = geometryForBlueprintPart(part, 1);
  try {
    const vertices = geometry.getAttribute('position');
    const rotation = part.tilt ?? 0;
    const running = part.location === 'left_leg' || part.location === 'right_leg';
    const lift = part.location === null || part.fixed === true || running ? 0 : torsoY;
    const points: AnatomyPoint[] = [];
    for (let index = 0; index < vertices.count; index += 1) {
      const y = vertices.getX(index) * Math.sin(rotation) + vertices.getY(index) * Math.cos(rotation);
      points.push({ x: -(vertices.getZ(index) + part.at[2]), y: -(y + part.at[1] + lift) });
    }
    return { points: convexOutline(points), tone: part.tone, location: part.location };
  } finally {
    // This SVG uses the actual hull geometry without owning a renderer or retaining buffers.
    geometry.dispose();
  }
}

/** Structural outlines preserve each hull's open frame, shoulders and stance. */
export function projectChassisAnatomy(chassis: Chassis): AnatomyProjection {
  const plan = chassisBlueprint(chassis.silhouette, chassis.traits, chassis.hardpoints, chassis.id);
  const pieces = plan.parts.filter(part => part.detail === 'structure')
    .sort((a, b) => a.at[0] - b.at[0])
    .map(part => projectAnatomyPart(part, plan.torsoY));
  const points = pieces.flatMap(piece => piece.points);
  const minX = Math.min(...points.map(point => point.x));
  const maxX = Math.max(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxY = Math.max(...points.map(point => point.y));
  const padding = Math.max(maxX - minX, maxY - minY) * 0.04;
  return { pieces, viewBox: `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}` };
}

function convexOutline(input: AnatomyPoint[]): AnatomyPoint[] {
  const points = [...new Map(input.map(point => [`${point.x},${point.y}`, point])).values()]
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (points.length < 3) return points;
  const cross = (a: AnatomyPoint, b: AnatomyPoint, c: AnatomyPoint) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (ordered: AnatomyPoint[]) => {
    const result: AnatomyPoint[] = [];
    for (const point of ordered) {
      while (result.length >= 2 && cross(result[result.length - 2]!, result[result.length - 1]!, point) <= 0) result.pop();
      result.push(point);
    }
    return result.slice(0, -1);
  };
  return [...half(points), ...half([...points].reverse())];
}

import { z } from 'zod';
import { IdSchema, NameSchema } from './common';

export const MapLandmarkSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  kind: z.enum(['relay', 'silos', 'gantry', 'spire']),
  column: z.number().int().nonnegative(),
  row: z.number().int().nonnegative(),
});
export type MapLandmark = z.infer<typeof MapLandmarkSchema>;

/** Landmarks name existing terrain; they never create new cover or blocked space. */
export function validateMapLandmarks(map: {
  width: number; height: number; legend: Record<string, string>; tiles: string[];
  landmarks?: MapLandmark[];
}, ctx: z.RefinementCtx): void {
  const ids = new Set<string>();
  const tiles = new Set<number>();
  for (const [index, landmark] of (map.landmarks ?? []).entries()) {
    const tile = landmark.row * map.width + landmark.column;
    const terrain = map.legend[map.tiles[landmark.row]?.[landmark.column] ?? ''];
    const expected = landmark.kind === 'spire' ? 'impassable' : 'building';
    if (landmark.column >= map.width || landmark.row >= map.height) {
      ctx.addIssue({ code: 'custom', path: ['landmarks', index], message: 'landmark must be inside the map' });
    } else if (terrain !== expected) {
      ctx.addIssue({ code: 'custom', path: ['landmarks', index], message: `${landmark.kind} landmark requires an existing ${expected} tile` });
    }
    if (ids.has(landmark.id) || tiles.has(tile)) {
      ctx.addIssue({ code: 'custom', path: ['landmarks', index], message: 'landmark ids and occupied tiles must be unique' });
    }
    ids.add(landmark.id);
    tiles.add(tile);
  }
}

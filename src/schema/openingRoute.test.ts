import { describe, expect, it } from 'vitest';
import openingRoutes from '../data/opening_routes.json';
import { OpeningRoutesSchema } from './openingRoute';

describe('opening route narrative schema', () => {
  it('loads the authored routes without simulation configuration', () => {
    expect(OpeningRoutesSchema.safeParse(openingRoutes).success).toBe(true);
    const changed = structuredClone(openingRoutes);
    Object.assign(changed[0] ?? {}, { dropTonnage: 1 });
    expect(OpeningRoutesSchema.safeParse(changed).success).toBe(false);
  });

  it('rejects duplicate campaign routes and repeated opening contracts', () => {
    expect(OpeningRoutesSchema.safeParse([...openingRoutes, openingRoutes[0]]).success).toBe(false);
    const changed = structuredClone(openingRoutes);
    const route = changed[0];
    if (route?.steps[0] === undefined || route.steps[1] === undefined) throw new Error('missing authored fixture');
    route.steps[1].nodeId = route.steps[0].nodeId;
    expect(OpeningRoutesSchema.safeParse(changed).success).toBe(false);
  });
});

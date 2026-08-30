import { describe, expect, it } from 'vitest';
import {
  commanderPointFromClient,
  commanderPoints,
  supportLanePoints,
} from './commanderViewGeometry';

describe('Commander view geometry', () => {
  it('accounts for letterboxing while mapping screen points to the battlefield', () => {
    const bounds = { left: 100, top: 50, width: 800, height: 600 };
    const map = { width: 1_000, height: 500 };
    expect(commanderPointFromClient({ x: 100, y: 150 }, bounds, map)).toEqual({ x: 0, y: 0 });
    expect(commanderPointFromClient({ x: 500, y: 350 }, bounds, map)).toEqual({ x: 500, y: 250 });
    expect(commanderPointFromClient({ x: 900, y: 550 }, bounds, map)).toEqual({
      x: 1_000,
      y: 500,
    });
  });

  it('serializes paths and directional support footprints without hidden state', () => {
    expect(commanderPoints([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toBe('1,2 3,4');
    expect(supportLanePoints({ x: 50, y: 50 }, { x: 60, y: 50 }, 40, 20)).toBe(
      '30,40 70,40 70,60 30,60',
    );
  });
});

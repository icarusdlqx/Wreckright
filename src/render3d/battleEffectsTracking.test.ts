import { Color, Scene, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BattleEffects } from './battleEffects';
import { TacticalCamera } from './camera';

describe('live projectile presentation', () => {
  it('tracks only the visible interpolated target pose', () => {
    let locatable = false;
    const displayed = vi.fn(() => ({ x: 140, y: 90 }));
    const authoritative = vi.fn(() => ({ x: 260, y: 180 }));
    const feedback = new BattleEffects(
      new Scene(),
      new Color(0x1a2024),
      new TacticalCamera(false),
      () => 6,
      displayed,
      () => false,
      {
        anchorOf: () => false,
        canLocate: () => locatable,
        currentPositionOf: authoritative,
      },
    );
    const resolve = (
      feedback as unknown as { resolveLiveEndpoint: (id: number, out: Vector3) => boolean }
    ).resolveLiveEndpoint;
    const endpoint = new Vector3();

    expect(resolve(2, endpoint)).toBe(false);
    expect(displayed).not.toHaveBeenCalled();
    expect(authoritative).not.toHaveBeenCalled();

    locatable = true;
    expect(resolve(2, endpoint)).toBe(true);
    expect(endpoint.toArray()).toEqual([140, 20, 90]);
    expect(displayed).toHaveBeenCalledWith(2);
    expect(authoritative).not.toHaveBeenCalled();
    feedback.destroy();
  });
});

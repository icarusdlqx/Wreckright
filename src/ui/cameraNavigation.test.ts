import { afterEach, describe, expect, it, vi } from 'vitest';
import { playerWorld } from '../../tests/support';
import {
  arrowPanDelta,
  centreOnSelection,
  edgePanDelta,
  followSelection,
  followingSelection,
  keyPanDelta,
  readEdgeScroll,
  resetFollowSelection,
  selectedCentre,
  setFollowSelection,
  subscribeFollowSelection,
  toggleFollowSelection,
  type CameraNavigationEngine,
} from './cameraNavigation';

function harness(ids: number[]): {
  engine: CameraNavigationEngine;
  centreOn: ReturnType<typeof vi.fn>;
} {
  const world = playerWorld('camera-selection');
  const centreOn = vi.fn();
  return {
    engine: {
      world,
      renderer: { camera: { centreOn } },
      selectedEntities: () => ids,
    },
    centreOn,
  };
}

describe('camera selection navigation', () => {
  it.each([
    ['ArrowLeft', { x: 12, y: 0 }],
    ['ArrowRight', { x: -12, y: 0 }],
    ['ArrowUp', { x: 0, y: -12 }],
    ['ArrowDown', { x: 0, y: 12 }],
  ] as const)('maps %s to the drag-space pan that moves the view the same way', (key, expected) => {
    expect(arrowPanDelta(new Set([key]), 12)).toEqual(expected);
  });

  it('cancels opposing arrow keys without adding camera drift', () => {
    expect(
      arrowPanDelta(
        new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']),
        12,
      ),
    ).toEqual({ x: 0, y: 0 });
  });

  it('centres on the operational selection rather than the whole lance', () => {
    const { engine, centreOn } = harness([1, 2]);
    const [first, second] = engine.world.entities;
    if (first === undefined || second === undefined) throw new Error('missing selection');
    first.pos = { x: 120, y: 240 };
    second.pos = { x: 360, y: 480 };

    expect(selectedCentre(engine)).toEqual({ x: 240, y: 360 });
    expect(centreOnSelection(engine)).toBe(true);
    expect(centreOn).toHaveBeenCalledWith({ x: 240, y: 360 });
  });

  it('does nothing when no operational selection remains', () => {
    const { engine, centreOn } = harness([]);
    expect(centreOnSelection(engine)).toBe(false);
    expect(centreOn).not.toHaveBeenCalled();
  });
});

describe('pan keys', () => {
  it('lets WASD pan the same way as the arrows', () => {
    expect(keyPanDelta(new Set(['KeyD']), 12)).toEqual(keyPanDelta(new Set(['ArrowRight']), 12));
    expect(keyPanDelta(new Set(['KeyW']), 12)).toEqual(keyPanDelta(new Set(['ArrowUp']), 12));
  });

  it('only pans on A and S once they have been held, since a tap is an order', () => {
    const tapped = (): boolean => false;
    expect(keyPanDelta(new Set(['KeyA', 'KeyS']), 12, tapped)).toEqual({ x: 0, y: 0 });
    expect(keyPanDelta(new Set(['KeyW']), 12, tapped)).toEqual({ x: 0, y: -12 });
    expect(keyPanDelta(new Set(['KeyA']), 12)).toEqual({ x: 12, y: 0 });
  });

  it('never doubles the pace when a key and its arrow are both held', () => {
    expect(keyPanDelta(new Set(['KeyD', 'ArrowRight']), 12)).toEqual({ x: -12, y: 0 });
  });
});

describe('edge scrolling', () => {
  const viewport = { width: 800, height: 600 };

  it('pans toward the edge the pointer rests against', () => {
    expect(edgePanDelta({ x: 5, y: 300 }, viewport, 10)).toEqual({ x: 10, y: 0 });
    expect(edgePanDelta({ x: 795, y: 595 }, viewport, 10)).toEqual({ x: -10, y: 10 });
    expect(edgePanDelta({ x: 400, y: 300 }, viewport, 10)).toEqual({ x: 0, y: 0 });
    expect(edgePanDelta(null, viewport, 10)).toEqual({ x: 0, y: 0 });
  });

  it('is off unless the preference says otherwise', () => {
    expect(readEdgeScroll()).toBe(false);
  });
});

describe('following the selection', () => {
  afterEach(() => resetFollowSelection());

  it('keeps the camera on the selection each frame while on', () => {
    const { engine, centreOn } = harness([1]);
    const [first] = engine.world.entities;
    if (first === undefined) throw new Error('missing selection');
    first.pos = { x: 50, y: 60 };

    expect(followSelection(engine)).toBe(false);
    expect(toggleFollowSelection()).toBe(true);
    expect(followSelection(engine)).toBe(true);
    expect(centreOn).toHaveBeenCalledWith({ x: 50, y: 60 });
  });

  it('is released by a pan and tells its subscribers', () => {
    const heard = vi.fn();
    const unsubscribe = subscribeFollowSelection(heard);
    setFollowSelection(true);
    setFollowSelection(false);
    expect(heard).toHaveBeenCalledTimes(2);
    expect(followingSelection()).toBe(false);
    unsubscribe();
  });
});

import { Color, Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { testWorld } from '../../tests/support';
import { BattleEffects } from './battleEffects';
import { TacticalCamera } from './camera';
import { TracerLayer } from './tracers';
import { BattlefieldWear } from './battlefieldWear';

describe('salvage-readable terminal effects', () => {
  it('keeps cockpit loss local while torso and ammunition breaches create burning wrecks', () => {
    const burst = vi.spyOn(TracerLayer.prototype, 'burst').mockImplementation(() => undefined);
    const steam = vi.spyOn(TracerLayer.prototype, 'ventSteam').mockImplementation(() => undefined);
    const wreck = vi.spyOn(BattlefieldWear.prototype, 'wreck').mockImplementation(() => undefined);
    const feedback = new BattleEffects(new Scene(), new Color(0x1a2024), new TacticalCamera(false),
      () => 0, () => ({ x: 100, y: 100 }), () => false);
    try {
      const world = testWorld('terminal-readability');
      feedback.consume(world, [{ type: 'mech_destroyed', tick: 1, entityId: 2, method: 'head' }]);
      expect(burst.mock.calls.map(call => call[2])).toEqual(['critical']);
      expect(steam).toHaveBeenCalledTimes(1);
      expect(wreck).not.toHaveBeenCalled();
      burst.mockClear();
      for (const method of ['centre_torso', 'ammo_explosion'] as const) {
        feedback.consume(world, [{ type: 'mech_destroyed', tick: 2, entityId: 2, method }]);
      }
      expect(burst.mock.calls.map(call => call[2])).toEqual(['terminal', 'terminal']);
      expect(wreck).toHaveBeenCalledTimes(2);
    } finally { feedback.destroy(); vi.restoreAllMocks(); }
  });
});

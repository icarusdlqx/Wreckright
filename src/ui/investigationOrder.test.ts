import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { issueMove, updatePlayerControl } from '../sim/orders';
import { prepareInvestigation } from './investigationOrder';

describe('sensor-contact investigation', () => {
  it('clears hidden attack A so promoted contact B can be acquired during attack-move', () => {
    const world = playerWorld('investigate-promoted-contact');
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    const mech = world.entities.find((entity) => entity.team === vision.team);
    const enemies = world.entities.filter((entity) => entity.team !== vision.team);
    const hiddenA = enemies[0];
    const promotedB = enemies[1];
    if (mech === undefined || hiddenA === undefined || promotedB === undefined) {
      throw new Error('missing test combatants');
    }
    vision.visible.clear();
    mech.pos = { x: 180, y: 180 };
    hiddenA.pos = { x: 700, y: 700 };
    promotedB.pos = { x: 230, y: 180 };
    mech.orders.attack = { targetId: hiddenA.id, calledShot: 'left_arm' };
    mech.targetId = null;
    mech.calledShot = null;

    prepareInvestigation(mech);
    expect(issueMove(world, mech, { ...promotedB.pos }, false, { engage: true })).toBe(true);
    expect(mech.orders.attack).toBeNull();

    vision.visible.add(promotedB.id);
    const teamVision = world.visions.get(mech.team);
    teamVision?.visible.clear();
    teamVision?.visible.add(promotedB.id);
    updatePlayerControl(world, mech);

    expect(mech.targetId).toBe(promotedB.id);
    expect(mech.calledShot).toBeNull();
  });
});

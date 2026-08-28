import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import type { WeaponMountSpec } from '../schema/design';
import { toResult, createWorld, stepWorld } from '../sim/world';
import { setWeaponMode } from '../sim/weaponModes';
import { acceptContract, startCampaign } from './campaign';
import { prepareDeployment, type Deployment } from './deployment';
import { deserialiseCampaign, serialiseCampaign } from './save';
import { SAVE_VERSION } from './saveSchema';
import type { CampaignState, MechRecord } from './types';

const CAMPAIGN_ID = 'border_dispute';
const CONTRACT_ID = 'militia_raid';
const FIXED_TICKS = 2_400;

function lbxMech(state: CampaignState, modeId?: string): MechRecord {
  const mech = state.mechs.find((entry) => entry.design.id === 'bulwark_assault');
  if (mech === undefined) throw new Error('campaign has no Bulwark fixture');

  const mount = mech.design.mounts.find((entry) => entry.weaponId === 'ac5');
  const ammo = mech.design.ammo.find((entry) => entry.weaponId === 'ac5');
  if (mount === undefined || ammo === undefined) throw new Error('campaign has no AC/5 fixture');
  mount.weaponId = 'lbx_ac10';
  ammo.weaponId = 'lbx_ac10';
  if (modeId === undefined) delete (mount as WeaponMountSpec).modeId;
  else mount.modeId = modeId;
  return mech;
}

function signFirstContract(state: CampaignState): void {
  const signed = acceptContract(catalog, state, CONTRACT_ID, 'standard');
  if (!signed.ok) throw new Error(signed.reason ?? 'contract fixture did not sign');
}

function restoredState(state: CampaignState): CampaignState {
  const restored = deserialiseCampaign(serialiseCampaign(state), catalog);
  if (restored.state === null) throw new Error(restored.error ?? 'campaign fixture did not load');
  return restored.state;
}

function replay(deployment: Deployment) {
  const world = createWorld(catalog, {
    seed: deployment.seed,
    missionId: deployment.missionId,
    playerTeam: deployment.playerTeam,
    playerLance: deployment.entries,
    playerController: 'tactical',
    maxTicks: FIXED_TICKS,
  });
  const shooter = world.entities.find(
    (entity) => entity.team === deployment.playerTeam &&
      entity.weapons.some((mount) => mount.weaponId === 'lbx_ac10'),
  );
  const mount = shooter?.weapons.find((entry) => entry.weaponId === 'lbx_ac10');
  const weapon = catalog.weapons.get('lbx_ac10');
  if (mount === undefined || weapon === undefined) throw new Error('battle has no LB-X fixture');
  if (mount.modeId !== 'slug') throw new Error('saved mode did not reach the battle');

  const switches = new Map<number, string>([
    [40, 'cluster'],
    [80, 'slug'],
  ]);
  while (!world.finished && world.tick < FIXED_TICKS) {
    const modeId = switches.get(world.tick + 1);
    if (modeId !== undefined && !setWeaponMode(weapon, mount, modeId)) {
      throw new Error(`mode switch failed at tick ${world.tick + 1}`);
    }
    stepWorld(world, FIXED_TICKS);
    world.events.length = 0;
  }

  return {
    battle: toResult(world, deployment.seed, FIXED_TICKS),
    rng: world.rng.save(),
    finalModeId: mount.modeId,
  };
}

describe('campaign fire-mode persistence', () => {
  it('defaults a legacy LB-X mount to Cluster without changing the save version', () => {
    const state = startCampaign(catalog, CAMPAIGN_ID, 'legacy-fire-mode');
    const mech = lbxMech(state);
    const text = serialiseCampaign(state);
    const header = JSON.parse(text) as { version?: unknown };

    expect(SAVE_VERSION).toBe(1);
    expect(header.version).toBe(1);

    const restored = restoredState(state);
    const design = restored.mechs.find((entry) => entry.id === mech.id)?.design;
    const pilot = catalog.pilots.get('dorn_hess');
    if (design === undefined || pilot === undefined) throw new Error('legacy fixture did not load');
    const world = createWorld(catalog, {
      seed: 'legacy-fire-mode:battle',
      missionId: 'training_ground',
      playerTeam: 0,
      playerLance: [{ design, pilot }],
    });
    const mount = world.entities
      .find((entity) => entity.team === 0)
      ?.weapons.find((entry) => entry.weaponId === 'lbx_ac10');

    expect(mount?.modeId).toBe('cluster');
  });

  it('round-trips Slug into identical fixed-seed, fixed-tick switch replays', () => {
    const state = startCampaign(catalog, CAMPAIGN_ID, 'saved-fire-mode');
    lbxMech(state, 'slug');
    signFirstContract(state);

    const before = prepareDeployment(catalog, structuredClone(state));
    const after = prepareDeployment(catalog, restoredState(state));
    expect({
      seed: after.seed,
      missionId: after.missionId,
      playerTeam: after.playerTeam,
      entries: after.entries,
    }).toEqual({
      seed: before.seed,
      missionId: before.missionId,
      playerTeam: before.playerTeam,
      entries: before.entries,
    });

    const first = replay(before);
    const second = replay(after);
    expect(first.finalModeId).toBe('slug');
    expect(second).toEqual(first);
  });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { investigateSensorIfPresent } from './training-flow.mjs';

async function fixture(run, { clickResult = 'investigate', touch = false } = {}) {
  const priorHook = globalThis.__wreckright;
  const priorDocument = globalThis.document;
  const calls = [];
  const checks = [];
  const pilot = { dead: false, ejected: false };
  const ally = { id: 1, team: 0, orders: { move: null, attack: null }, targetId: null };
  const target = { id: 5, team: 1, destroyed: false, withdrawn: false, pilot };
  const world = { tick: 91, playerTeam: 0, entities: [ally, target],
    vision: { visible: new Set(), detected: new Set([5]) },
    zones: [{ id: 'range_gate', owner: null }], triggers: [{ id: 'range_open', fired: 0 }] };
  const state = { paused: true, selection: [1], contacts: [{ id: 5, current: true }], enemies: [] };
  const nodes = new Map([['sensor-contact-5', { getClientRects: () => [{}] }]]);
  const promote = ({ id = 5, publish = true, card = true } = {}) => {
    world.vision.visible.add(id);
    nodes.delete('sensor-contact-5');
    if (publish) state.enemies = [{ id, alive: true }];
    if (card) nodes.set(`hostile-${id}`, { getClientRects: () => [{}] });
  };
  const control = {
    async waitFor(options) { calls.push(['visible', options]); },
    async getAttribute(_name, options) { calls.push(['label', options]); return 'Sensor contact. Current returns guide indirect missiles.'; },
    async innerText(options) { calls.push(['text', options]); return 'Sensor return / investigate'; },
    async click(options) { await activate('click', options); },
    async tap(options) { await activate('tap', options); },
  };
  const activate = async (action, options) => {
    calls.push([action, options]);
    if (clickResult === 'investigate') ally.orders.move = { engage: true };
    else if (clickResult === 'promotion') { promote(); throw new Error('sensor detached during click'); }
    else if (clickResult === 'unknown') { nodes.clear(); throw new Error('sensor detached without replacement'); }
    else if (clickResult === 'wrong-id') { promote({ id: 6 }); throw new Error('another contact is visible'); }
    else if (clickResult === 'unpublished') { promote({ publish: false }); throw new Error('missing published optical snapshot'); }
    else if (clickResult === 'missing-card') { promote({ card: false }); throw new Error('missing optical control'); }
    else if (clickResult === 'broken-order') promote();
  };
  globalThis.__wreckright = { world, useGame: { getState: () => state } };
  globalThis.document = { querySelector: (selector) => nodes.get(selector.match(/data-testid="([^"]+)"/)?.[1]) ?? null };
  const page = {
    locator(selector) {
      if (selector.includes('mobile-tab-')) return { tap: async () => { calls.push([selector]); } };
      assert.equal(selector, '[data-testid="sensor-contact-5"]');
      return control;
    },
    evaluate: async (fn, arg) => fn(arg),
    async waitForFunction(fn, arg, options) {
      calls.push(['condition', options]);
      if (!fn(arg)) throw new Error('condition did not become true');
    },
  };
  const investigate = () => investigateSensorIfPresent({ page, sensorId: 5, prefix: '', touch,
    check: (name, passed, detail) => checks.push({ name, passed, detail }) });
  try { await run({ investigate, calls, checks, world, state, nodes }); }
  finally {
    if (priorHook === undefined) delete globalThis.__wreckright;
    else globalThis.__wreckright = priorHook;
    if (priorDocument === undefined) delete globalThis.document;
    else globalThis.document = priorDocument;
  }
}

for (const touch of [false, true]) {
  test(`sensor investigation keeps the actual ${touch ? 'tap' : 'click'} and exact order assertion`, async () => {
    await fixture(async ({ investigate, calls, checks }) => {
      assert.equal(await investigate(), true);
      assert.deepEqual(calls.filter(([name]) => name === 'click' || name === 'tap'),
        [[touch ? 'tap' : 'click', { timeout: 30_000 }]]);
      assert.deepEqual(calls.filter(([name]) => ['visible', 'label', 'text'].includes(name)), [
        ['visible', { state: 'visible', timeout: 30_000 }],
        ['label', { timeout: 30_000 }], ['text', { timeout: 30_000 }],
      ]);
      assert.equal(checks.length, 1);
      assert.equal(checks[0].passed, true);
      assert.match(checks[0].name, /direct-fire trainer investigates/);
    }, { touch });
  });
}

test('a detached sensor is accepted only after the same live target is published as an optical control', async () => {
  await fixture(async ({ investigate, calls, checks }) => {
    assert.equal(await investigate(), false);
    assert.equal(calls.filter(([name]) => name === 'click').length, 1);
    assert.deepEqual(calls.filter(([name]) => name === 'condition'),
      [['condition', { timeout: 2_000 }]]);
    assert.equal(checks.length, 1);
    assert.match(checks[0].name, /same live optical contact/);
    assert.deepEqual(JSON.parse(checks[0].detail), {
      id: 5, tick: 91, paused: true, alive: true, worldOptical: true, detected: true,
      publishedOptical: true, sensorCurrent: true, opticalCard: true, sensorCard: false,
      gateOwner: null, revealFired: 0,
    });
  }, { clickResult: 'promotion' });
});

for (const clickResult of ['unknown', 'wrong-id', 'unpublished', 'missing-card']) {
  test(`a ${clickResult} disappearance stays a failure with diagnostic state`, async () => {
    await fixture(async ({ investigate, calls, checks }) => {
      await assert.rejects(investigate, /failed without a confirmed optical promotion: .*"id":5/);
      assert.equal(calls.filter(([name]) => name === 'click').length, 1);
      const publicationWaits = calls.filter(([name]) => name === 'condition');
      assert.deepEqual(publicationWaits, ['unpublished', 'missing-card'].includes(clickResult)
        ? [['condition', { timeout: 2_000 }]] : []);
      assert.equal(checks.length, 0);
    }, { clickResult });
  });
}

test('optical promotion after a successful click cannot excuse a broken investigation handler', async () => {
  await fixture(async ({ investigate, checks }) => {
    await assert.rejects(investigate, /condition did not become true/);
    assert.equal(checks.length, 0);
  }, { clickResult: 'broken-order' });
});

/** Isolated real render-path capture. Root runs this against an existing Vite server; never opens an app. */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = new URL(process.env.BASE_URL ?? 'http://127.0.0.1:5183/');
const SHOT_DIR = resolve(process.env.SHOT_DIR ?? 'reports/combat-motion-review');
const executable = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
if (!['http:', 'https:'].includes(BASE_URL.protocol)) throw new Error('BASE_URL must be a Vite HTTP URL');
if (process.env.CHROMIUM_PATH && !existsSync(executable)) throw new Error(`Missing CHROMIUM_PATH: ${executable}`);
const SETTINGS = Object.freeze({ width: 1000, height: 720, span: 150, target: [0, 27, 0],
  direction: [1, .85, 1], delta: 1 / 30, background: 0xf3f0e7, ground: 0xdfe4d6 });

async function bounded(promise, label, milliseconds) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds}ms`)), milliseconds);
  })]); } finally { clearTimeout(timer); }
}

async function install({ base, settings }) {
  const source = (path) => new URL(path, base).href;
  const transformed = await (await fetch(source('src/ui/mechbay/MechPreviewRenderer.ts'))).text();
  const threePath = transformed.match(/from\s+["']([^"']*three(?:\.js|\.module\.js)[^"']*)["']/)?.[1];
  if (!threePath) throw new Error('BASE_URL must serve source through Vite');
  const [THREE, { getCatalog }, { createWorld }, { createMech }, { UnitViews }, { Locomotion },
    { BattleEffects }, { TacticalCamera }, { projectileFlightSeconds }, resources] = await Promise.all([
    import(new URL(threePath, source('src/ui/mechbay/MechPreviewRenderer.ts')).href),
    import(source('src/schema/load.ts')), import(source('src/sim/world.ts')), import(source('src/sim/entity.ts')),
    import(source('src/render3d/unitViews.ts')), import(source('src/render3d/locomotion.ts')),
    import(source('src/render3d/battleEffects.ts')), import(source('src/render3d/camera.ts')),
    import(source('src/render3d/battleEventPresentation.ts')), import(source('src/render3d/sceneResources.ts')),
  ]);
  const catalog = getCatalog();
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: true });
  resources.configureRenderer(renderer, false, 1); renderer.setSize(settings.width, settings.height, false);
  renderer.toneMappingExposure = 1; document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(settings.background);
  const sun = new THREE.DirectionalLight(0xffffff, 3.1); sun.position.set(80, 140, 120); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 1, far: 500 });
  sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -.0002;
  const rim = new THREE.DirectionalLight(0x78b8ff, 1.15); rim.position.set(-90, 60, -90);
  scene.add(new THREE.HemisphereLight(0xc8e8ff, 0x182028, 2.2), sun, rim);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(450, 450), new THREE.MeshStandardMaterial({ color: settings.ground, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.08; ground.receiveShadow = true; scene.add(ground);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(450, 450), new THREE.MeshStandardMaterial({ color: 0x629c9b, roughness: .58 }));
  water.rotation.x = -Math.PI / 2; water.position.y = -.07; water.visible = false; scene.add(water);
  const aspect = settings.width / settings.height;
  const camera = new THREE.OrthographicCamera(-settings.span * aspect / 2, settings.span * aspect / 2, settings.span / 2, -settings.span / 2, 1, 700);
  const target = new THREE.Vector3(...settings.target);
  camera.position.copy(new THREE.Vector3(...settings.direction).normalize().multiplyScalar(260).add(target));
  camera.lookAt(target); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  let world, units, effects, locomotion, subject, selected, elapsed = 0, walking = false, terrain = 'open', flight = 0, shot;
  let lowFx = false, reduced = false, contextLost = false, contacts = [], phaseResources, contactFacing = false;
  const vent = new THREE.Vector3();
  renderer.domElement.addEventListener('webglcontextlost', () => { contextLost = true; });

  function resourceCounts() {
    const geometries = new Set(), materials = new Set(); let objects = 0;
    scene.traverse((node) => { objects += 1; if (!node.isMesh) return; geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material); });
    return { objects, geometries: geometries.size, materials: materials.size };
  }
  function reset({ id, duel = false, low = false, reduce = false, groundType = 'open', faceContact = false }) {
    effects?.destroy(); units?.dispose();
    selected = catalog.chassis.get(id);
    const design = [...catalog.designs.values()].find((entry) => entry.chassisId === id);
    if (!selected || !design) throw new Error(`Missing real chassis/design ${id}`);
    world = createWorld(catalog, { missionId: 'skirmish_ridge', seed: 'motion-review' });
    const pilotId = catalog.pilots.keys().next().value;
    contactFacing = faceContact;
    subject = createMech(catalog, catalog.rules, { id: 1, team: 0, designId: design.id, pilotId,
      spawn: { x: duel ? (faceContact ? 38 : -38) : 0, y: 0 }, facingDegrees: faceContact ? 180 : 0 });
    world.entities = [subject];
    if (duel) world.entities.push(createMech(catalog, catalog.rules, { id: 2, team: 1,
      designId: selected.faction === 'aurelian' ? 'bulwark_assault' : 'sentinel_brawler', pilotId,
      spawn: { x: faceContact ? -38 : 38, y: 0 }, facingDegrees: faceContact ? 0 : 180 }));
    lowFx = low; reduced = reduce; terrain = groundType; elapsed = 0; walking = false; contacts = []; shot = null;
    water.visible = terrain === 'water'; ground.visible = !water.visible; renderer.shadowMap.enabled = !lowFx;
    units = new UnitViews(scene, () => 0, reduced);
    const feedbackCamera = new TacticalCamera(reduced);
    effects = new BattleEffects(scene, new THREE.Color(settings.background), feedbackCamera, () => 0,
      (unitId) => units.positionOf(unitId), (unitId, weaponId, out, breech) => units.fireMount(unitId, weaponId, out, breech),
      { anchorOf: (unitId, location, out) => units.locationOf(unitId, location, out), canLocate: (unitId) => units.canLocate(unitId),
        contactOf: (unitId, location, bearing, out) => units.contactOf(unitId, location, bearing, out),
        currentPositionOf: (unitId) => units.currentPositionOf(unitId) });
    effects.setPresentationMode(lowFx);
    locomotion = new Locomotion(() => 0, () => terrain, effects, reduced);
    locomotion.onFootfall = (at, tonnage, faction, contact) => {
      contacts.push({ at: { ...at }, tonnage, faction, time: elapsed, ...(contact ?? {}) });
      if (contact) effects.footfall(at, contact);
    };
    units.setRenderQuality(470, lowFx); pose(0);
    phaseResources = resourceCounts();
    return inspect();
  }
  function pose(dt) {
    if (contextLost) throw new Error('Motion fixture lost its WebGL context');
    effects.advance(dt); units.snapshot(world); units.interpolate(world, 1);
    units.beginFrame(dt); locomotion.beginFrame(dt); effects.beginFrame(dt);
    for (const entity of world.entities) {
      const view = units.present(world, entity); if (!view) continue;
      const lift = entity.jump ? Math.sin(Math.PI * entity.jump.elapsed / entity.jump.duration) * 25 : 0;
      const at = units.at(entity); const submerged = locomotion.place(entity, view.model, at, lift, dt);
      view.model.root.updateMatrixWorld(true); units.markPlaced(entity.id, at); units.placeShadow(entity, at, lift, submerged);
    }
    units.finishFrame(); effects.finishFrame(dt); scene.updateMatrixWorld(true);
  }
  function advance(seconds, stopAtContact = false) {
    const startContacts = contacts.length;
    const frames = Math.max(1, Math.ceil(seconds / settings.delta));
    for (let frame = 0; frame < frames; frame += 1) {
      const dt = Math.min(settings.delta, seconds - frame * settings.delta);
      if (dt <= 0) break;
      if (walking) subject.pos.x += units.viewFor(world, subject).model.strideLength / 18 * dt / settings.delta;
      elapsed += dt; world.tick += 1;
      if (subject.jump) { subject.jump.elapsed = Math.min(subject.jump.duration, subject.jump.elapsed + dt);
        if (subject.jump.elapsed >= subject.jump.duration) { subject.jump = null; subject.motion = 'stationary'; } }
      pose(dt);
      if (stopAtContact && contacts.length > startContacts) break;
    }
    renderer.render(scene, camera);
    return { ...inspect(), ...(stopAtContact ? { waitedForContact: true, contactObserved: contacts.length > startContacts } : {}) };
  }
  function walk() {
    const distance = units.viewFor(world, subject).model.strideLength * 70 / 18;
    subject.pos.x = -distance / 2; subject.motion = 'walk'; subject.intendedMotion = 'walk'; pose(0);
    walking = true; return advance(.4);
  }
  function fire(family) {
    if (world.entities.length !== 2) throw new Error('Discharge requires the duel fixture');
    const mount = subject.weapons.find((entry) => catalog.weapons.get(entry.weaponId)?.type === family);
    if (!mount) throw new Error(`${subject.designId} has no authored ${family} mount`);
    const weapon = catalog.weapons.get(mount.weaponId);
    shot = { type: 'weapon_fired', tick: world.tick, shooterId: 1, targetId: 2, weaponId: weapon.id };
    flight = projectileFlightSeconds(world, shot, weapon) ?? 0;
    units.consumeEvents(world, [shot]); effects.consume(world, [shot]);
    if (flight === 0) hit();
    return advance(Math.min(.0667, flight || .0333));
  }
  function hit() {
    const weapon = catalog.weapons.get(shot.weaponId);
    const event = { type: 'projectile_hit', tick: world.tick, shooterId: 1, targetId: 2,
      weaponId: weapon.id, location: 'centre_torso', damage: weapon.damage, arc: 'front' };
    units.consumeEvents(world, [event]); effects.consume(world, [event]);
  }
  function impact() {
    if (flight > 0) { advance(Math.max(0, flight - elapsed)); hit(); }
    return advance(.05);
  }
  function heat() {
    subject.heat = subject.heatCapacity * .95; subject.facing = Math.PI;
    pose(settings.delta);
    for (let index = 0; index < 2; index += 1) if (units.ventOf(subject.id, vent, index)) effects.spawnVentSteam(vent);
    return advance(.15);
  }
  function damage(location) {
    subject.locations[location].destroyed = true; subject.locations[location].armour = 0; subject.locations[location].internal = 0;
    for (const mount of subject.weapons) if (mount.location === location) mount.destroyed = true;
    const event = { type: 'location_destroyed', tick: world.tick, entityId: subject.id, shooterId: 2, location };
    units.consumeEvents(world, [event]); effects.consume(world, [event]);
    if (location.endsWith('_leg')) locomotion.triggerLegLoss(subject.id, location);
    return advance(.05);
  }
  function terminal() {
    locomotion.authorizeTerminalFall(subject.id);
    subject.destroyed = true; subject.locations.centre_torso.destroyed = true;
    const event = { type: 'mech_destroyed', tick: world.tick, entityId: subject.id, method: 'centre_torso' };
    units.consumeEvents(world, [event]); effects.consume(world, [event]);
    const view = units.viewFor(world, subject); view.model.terminalFallAxis = { pitch: 1, roll: 0 };
    return advance(.05);
  }
  function jump() {
    subject.jump = { from: { ...subject.pos }, to: { ...subject.pos }, elapsed: 0, duration: 1 };
    subject.motion = 'jump'; return advance(.1);
  }
  function boundsOf(root) {
    const box = new THREE.Box3();
    root.traverseVisible((node) => { if (!node.isMesh) return;
      if (node.isInstancedMesh) node.computeBoundingBox(); else if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      const local = node.isInstancedMesh ? node.boundingBox : node.geometry.boundingBox;
      if (local) box.union(local.clone().applyMatrix4(node.matrixWorld)); });
    return box;
  }
  function effectBatches() {
    return ['shot-burst', 'shot-contact-flare', 'shot-blast-lobes', 'shot-smoke', 'shot-missile', 'shot-beam', 'wreck-smoke'].map((name) => {
      const mesh = scene.getObjectByName(name), instances = []; let active = 0;
      if (mesh?.isInstancedMesh) for (let index = 0; index < mesh.count; index += 1) {
        const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix);
        const scale = new THREE.Vector3().setFromMatrixScale(matrix);
        if (scale.lengthSq() === 0) continue;
        active += 1;
        if (instances.length < 16) instances.push({ at: new THREE.Vector3().setFromMatrixPosition(matrix).toArray(), scale: scale.toArray() });
      }
      return { name, active, visible: mesh?.visible, depthTest: mesh?.material?.depthTest, instances };
    });
  }
  function inspect() {
    scene.updateMatrixWorld(true); const model = units.viewFor(world, subject).model;
    const bounds = new THREE.Box3();
    for (const actor of world.entities) bounds.union(boundsOf(units.viewFor(world, actor).model.root));
    const corners = [];
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z).project(camera));
    const clipping = corners.some((at) => Math.abs(at.x) > .98 || Math.abs(at.y) > .98 || Math.abs(at.z) > 1);
    const current = resourceCounts(); const stable = JSON.stringify(current) === JSON.stringify(phaseResources);
    return { chassisId: selected.id, name: selected.name, faction: selected.faction, designId: subject.designId,
      elapsed, lowFx, reducedMotion: reduced, terrain, contactFacing, clipping, worldBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
      rootPosition: model.root.position.toArray(), rootRotation: model.root.rotation.toArray(), torsoPosition: model.torso.position.toArray(),
      feet: model.legs.map((leg) => ({ location: leg.location, destroyed: leg.destroyed,
        sole: leg.sole.getWorldPosition(new THREE.Vector3()).toArray(), hip: leg.hip.rotation.toArray(), knee: leg.knee.rotation.toArray(), ankle: leg.ankle.rotation.toArray() })),
      armPivots: model.articulation.arms.map((arm) => ({ location: arm.location, rotation: arm.pivot.rotation.toArray() })),
      weapons: model.weapons.map((rig) => ({ weaponId: rig.weaponId, kick: rig.kick, slide: rig.slide.position.toArray(), muzzle: rig.muzzle.getWorldPosition(new THREE.Vector3()).toArray() })),
      vents: model.services.vents.map((outlet) => outlet.getWorldPosition(new THREE.Vector3()).toArray()),
      heatEmission: model.services.heatMaterial?.emissiveIntensity ?? 0, contacts: [...contacts], resources: current,
      effectBatches: effectBatches(), detachedParts: scene.children.filter((node) => node.name === 'detached-part-slot' && node.visible)
        .map((node) => ({ position: node.position.toArray(), parts: node.children.length })),
      stableAgainstPhaseStart: stable, gpu: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures } };
  }
  function dispose() { effects?.destroy(); units?.dispose(); resources.disposeObjectResources(scene); resources.disposeRenderer(renderer); renderer.domElement.remove(); scene.clear(); }
  globalThis.__motionReview = { reset, advance, walk, fire, impact, heat, damage, terminal, jump, inspect, dispose };
  return { models: ['bulwark_bwk3', 'sentinel_snl2', 'hornet_hnt2'].map((id) => ({ id, name: catalog.chassis.get(id)?.name })),
    note: 'Scripted presentation states through real UnitViews/buildMechModel, Locomotion and BattleEffects. No simulation advancement, audio, saved state or UI.' };
}

function escape(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function sheet(records) {
  const groups = [...new Set(records.map((record) => record.chassisId))];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wreckright / motion review</title><style>*{box-sizing:border-box}body{margin:0;background:#f3f0e7;color:#193744;font:14px/1.5 system-ui,sans-serif}main{max-width:1800px;margin:auto;padding:24px}h1,h2{margin-bottom:8px}p{max-width:1100px}a{color:#286c65}.frames{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:0;border:1px solid #c7cfc0;background:#fffdf7}img{display:block;width:100%;height:auto}figcaption{padding:10px}small{display:block;color:#52665e}.warn{color:#9b442d}:focus-visible{outline:3px solid #b75e35;outline-offset:3px}@media(max-width:900px){.frames{grid-template-columns:1fr 1fr}}@media(max-width:550px){.frames{grid-template-columns:1fr}}</style></head><body><main><h1>Wreckright / motion &amp; combat review</h1><p>Actual authored machines through UnitViews/buildMechModel, Locomotion and BattleEffects, sampled at fixed presentation times. Camera, lighting and scale stay fixed. Walking uses a scripted path; firing uses authored mounts and projectile timing; damage and heat are controlled fixture states. This is visual evidence, not a campaign or balance test. No app, saves or audio are started.</p><p>Each capture links to its full resolution. Inspect joints, sole contact, equipment recoil, vent anchoring and the terminal fall sequence. Clipping and resource counts are recorded without imposing aesthetic pass criteria. <a href="review.json">Complete diagnostics</a></p>${groups.map((id) => `<section><h2>${escape(records.find((entry) => entry.chassisId === id)?.name ?? id)}</h2><div class="frames">${records.filter((record) => record.chassisId === id).map((record) => `<figure><a href="${record.file}"><img loading="lazy" src="${record.file}" alt="${escape(record.label)}"></a><figcaption><strong>${escape(record.label)}</strong><small>${record.elapsed.toFixed(3)}s · ${escape(record.faction)} · ${record.lowFx ? 'Low FX' : 'normal FX'}${record.reducedMotion ? ' · reduced motion' : ''}</small>${record.clipping ? '<b class="warn">Model reaches frame edge — see bounds</b>' : ''}</figcaption></figure>`).join('')}</div></section>`).join('')}</main></body></html>`;
}

await mkdir(SHOT_DIR, { recursive: true });
const captures = [], errors = []; let metadata = null;
const started = Date.now();
const browser = await chromium.launch({ headless: true, timeout: 15_000, executablePath: existsSync(executable) ? executable : undefined,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const stop = setTimeout(() => { errors.push('Fixture exceeded the two-minute wall-clock budget'); process.exitCode = 1; void browser.close(); }, Math.max(1, 120_000 - (Date.now() - started)));
try {
  const context = await browser.newContext({ viewport: { width: SETTINGS.width, height: SETTINGS.height }, deviceScaleFactor: 1, reducedMotion: 'no-preference', serviceWorkers: 'block' });
  context.setDefaultTimeout(8_000); context.setDefaultNavigationTimeout(20_000);
  await context.route('**/*', (route) => new URL(route.request().url()).origin === BASE_URL.origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const fixtureUrl = new URL('__combat_motion_review__', BASE_URL).href;
  await page.route(fixtureUrl, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><style>html,body{margin:0;overflow:hidden}canvas{display:block}</style><title>Headless motion fixture</title></head><body></body></html>' }));
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
  metadata = await bounded(page.evaluate(install, { base: BASE_URL.href, settings: SETTINGS }), 'Fixture setup', 25_000);
  const invoke = (method, args = []) => bounded(page.evaluate(({ method, args }) => globalThis.__motionReview[method](...args), { method, args }), method, 5_000);
  async function capture(label, record) {
    if (record.contactObserved === false) label += ' (no touchdown within window)';
    const file = `${String(captures.length + 1).padStart(2, '0')}-${record.chassisId}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
    await page.locator('canvas').screenshot({ path: resolve(SHOT_DIR, file), timeout: 8_000 });
    captures.push({ ...record, file, label }); process.stdout.write(`${captures.length}: ${record.name} / ${label}\n`);
  }
  for (const id of ['bulwark_bwk3', 'sentinel_snl2']) {
    await invoke('reset', [{ id }]); await capture('Standing / neutral', await invoke('advance', [.1]));
    await capture('Walking / stride loading', await invoke('walk'));
    await capture('Walking / next sole contact', await invoke('advance', [.9, true]));
    await capture('Walking / opposite sole contact', await invoke('advance', [.9, true]));
    for (const family of ['ballistic', 'energy', 'missile']) {
      await invoke('reset', [{ id, duel: true }]);
      await capture(`${family} / discharge`, await invoke('fire', [family]));
      await capture(`${family} / contact`, await invoke('impact'));
    }
    await invoke('reset', [{ id }]);
    await capture('Heat / rear vents', await invoke('heat'));
    await capture('Heat / steam rise', await invoke('advance', [.25]));
    await invoke('reset', [{ id }]);
    await capture('Damage / left arm lost', await invoke('damage', ['left_arm']));
    await capture('Damage / left leg lost and settling', await invoke('damage', ['left_leg']));
    await invoke('reset', [{ id }]);
    await capture('Terminal / 0.05 seconds', await invoke('terminal'));
    await capture('Terminal / 0.25 seconds', await invoke('advance', [.2]));
    await capture('Terminal / 0.65 seconds', await invoke('advance', [.4]));
    await capture('Terminal / settled', await invoke('advance', [1]));
    await invoke('reset', [{ id, duel: true, low: true }]);
    await capture('Low FX / essential impact', await invoke('fire', ['energy']));
    await invoke('reset', [{ id, reduce: true }]);
    await capture('Reduced motion / settled terminal', await invoke('terminal'));
  }
  await invoke('reset', [{ id: 'hornet_hnt2' }]);
  await capture('Jump / lift and nozzle burn', await invoke('jump'));
  await capture('Jump / braking plume', await invoke('advance', [.73]));
  await capture('Jump / sole landing contact', await invoke('advance', [.2]));
  await invoke('reset', [{ id: 'hornet_hnt2', groundType: 'water' }]);
  await invoke('walk'); await capture('Water / sole ripple contact', await invoke('advance', [.9, true]));
  // Retain the original 44 frame names. These views expose the struck side and
  // later cue development without changing lighting, scale or camera direction.
  for (const id of ['bulwark_bwk3', 'sentinel_snl2']) {
    for (const family of ['ballistic', 'energy', 'missile']) {
      await invoke('reset', [{ id, duel: true, faceContact: true }]); await invoke('fire', [family]);
      await capture(`${family} / facing contact`, await invoke('impact'));
      await capture(`${family} / facing contact residual`, await invoke('advance', [.15]));
    }
    await invoke('reset', [{ id }]); await invoke('damage', ['left_arm']);
    await capture('Damage / arm shed clear', await invoke('advance', [.85]));
    await invoke('damage', ['left_leg']); await capture('Damage / leg settled clear', await invoke('advance', [.85]));
    await invoke('reset', [{ id }]); await invoke('walk'); await invoke('advance', [.9, true]);
    await capture('Walking / dust after sole contact', await invoke('advance', [.15]));
    await invoke('reset', [{ id, duel: true, faceContact: true, low: true }]); await invoke('fire', ['energy']);
    await capture('Low FX / facing essential contact', await invoke('impact'));
  }
  await invoke('reset', [{ id: 'hornet_hnt2', groundType: 'water' }]);
  await invoke('walk'); await invoke('advance', [.9, true]);
  await capture('Water / ripple spreading from sole', await invoke('advance', [.18]));
  await invoke('dispose');
  if (errors.length) throw new Error(`${errors.length} browser/render errors; inspect review.json`);
} catch (error) { errors.push(String(error)); process.exitCode = 1; }
finally {
  clearTimeout(stop); await browser.close();
  await writeFile(resolve(SHOT_DIR, 'review.json'), JSON.stringify({ baseUrl: BASE_URL.href, settings: SETTINGS, metadata,
    captures, errors, clippingFrames: captures.filter((entry) => entry.clipping).map((entry) => entry.file) }, null, 2));
  await writeFile(resolve(SHOT_DIR, 'index.html'), sheet(captures));
  if (errors.length) process.stderr.write(`${errors.join('\n')}\n`);
  process.stdout.write(`Motion review: ${resolve(SHOT_DIR, 'index.html')}\n`);
}

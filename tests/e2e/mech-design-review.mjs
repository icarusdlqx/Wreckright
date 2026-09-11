/**
 * Real model review against an already-running Vite server. No app boot, sim,
 * profile reuse, headed mode or server process. Run this file against both roots:
 * BASE_URL=http://127.0.0.1:5183 SHOT_DIR=reports/mechs-before node tests/e2e/mech-design-review.mjs
 * Camera/light constants must remain identical between baseline and after runs.
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = new URL(process.env.BASE_URL ?? 'http://127.0.0.1:5183/');
const SHOT_DIR = resolve(process.env.SHOT_DIR ?? 'reports/mech-design-review');
const executable = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
if (!['http:', 'https:'].includes(BASE_URL.protocol)) throw new Error('BASE_URL must be a Vite HTTP URL');
if (process.env.CHROMIUM_PATH && !existsSync(executable)) throw new Error(`Missing CHROMIUM_PATH: ${executable}`);
const SETTINGS = Object.freeze({ width: 960, height: 800, tacticalSpan: 140, detailSpan: 90,
  target: [0, 30, 0], normal: [1, 0.62, 1], elevated: [1, Math.SQRT2, 1], rear: [-1, 0.62, -1],
  teamColour: 0x88b7ba, background: 0xf3f0e7, ground: 0xe5e4d6 });

async function bounded(promise, label, milliseconds) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds}ms`)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

// The source seam is intentional: a static production build cannot provide it.
async function installFixture({ base, settings }) {
  const source = (path) => new URL(path, base).href;
  const response = await fetch(source('src/ui/mechbay/MechPreviewRenderer.ts'));
  if (!response.ok) throw new Error('BASE_URL must serve Wreckright source through Vite');
  const transformed = await response.text();
  // Use Vite's exact Three module URL so factory and renderer share constructors.
  const threePath = transformed.match(/from\s+["']([^"']*three(?:\.js|\.module\.js)[^"']*)["']/)?.[1];
  if (!threePath) throw new Error('Could not resolve Three from the Vite-transformed preview renderer');
  const [THREE, { getCatalog }, factory, quality, startup] = await Promise.all([
    import(new URL(threePath, source('src/ui/mechbay/MechPreviewRenderer.ts')).href),
    import(source('src/schema/load.ts')), import(source('src/render3d/mechModel.ts')),
    import(source('src/render3d/renderQuality.ts')), import(source('src/render3d/startupLights.ts')),
  ]);
  const catalog = getCatalog();
  const designs = [...catalog.designs.values()].sort((a, b) => a.id.localeCompare(b.id));
  const roster = [...catalog.chassis.values()].filter((chassis) => chassis.frame === 'mech')
    .sort((a, b) => a.faction.localeCompare(b.faction) || a.tonnage - b.tonnage || a.id.localeCompare(b.id))
    .map((chassis) => {
      const design = designs.find((entry) => entry.chassisId === chassis.id);
      if (!design) throw new Error(`No authored design for ${chassis.id}`);
      return { id: chassis.id, name: chassis.name, faction: chassis.faction, tons: chassis.tonnage,
        class: chassis.class, designId: design.id, designName: design.name, mounts: design.mounts.length };
    });
  if (!roster.length) throw new Error('No frame=mech chassis found');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(settings.background);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(settings.width, settings.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.body.appendChild(renderer.domElement);
  const hemisphere = new THREE.HemisphereLight(0xc8e8ff, 0x182028, 2.2);
  const sun = new THREE.DirectionalLight(0xffffff, 3.1);
  sun.position.set(80, 140, 120); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -100, right: 100, top: 100, bottom: -100, near: 1, far: 400 });
  sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0002;
  const rim = new THREE.DirectionalLight(0x78b8ff, 1.15); rim.position.set(-90, 60, -90);
  scene.add(hemisphere, sun, rim);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(350, 350), new THREE.MeshStandardMaterial({
    color: settings.ground, roughness: 1, metalness: 0,
  }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.08; ground.receiveShadow = true;
  scene.add(ground);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 600);
  const silhouetteMaterial = new THREE.MeshBasicMaterial({ color: 0x193744 });
  let model = null;
  let lostContext = false;
  renderer.domElement.addEventListener('webglcontextlost', () => { lostContext = true; });

  function visibleBounds(root) {
    const box = new THREE.Box3();
    root.traverseVisible((node) => {
      if (!node.isMesh) return;
      if (node.isInstancedMesh) node.computeBoundingBox();
      else if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      const local = node.isInstancedMesh ? node.boundingBox : node.geometry.boundingBox;
      if (local) box.union(local.clone().applyMatrix4(node.matrixWorld));
    });
    return box;
  }
  function inspect() {
    const bounds = visibleBounds(model.root);
    const points = [];
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) points.push(new THREE.Vector3(x, y, z).project(camera));
    }
    const projected = { left: Math.min(...points.map((p) => p.x)), right: Math.max(...points.map((p) => p.x)),
      bottom: Math.min(...points.map((p) => p.y)), top: Math.max(...points.map((p) => p.y)),
      near: Math.min(...points.map((p) => p.z)), far: Math.max(...points.map((p) => p.z)) };
    const detailCounts = { structure: 0, surface: 0, hero: 0 };
    model.root.traverseVisible((node) => {
      if (node.isMesh) detailCounts[node.userData.blueprintDetail ?? 'structure'] += 1;
    });
    return { projected, fits: projected.left > -0.98 && projected.right < 0.98 && projected.bottom > -0.98
      && projected.top < 0.98 && projected.near > -1 && projected.far < 1,
      worldBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, detailCounts,
      feet: model.legs.map((leg) => {
        const foot = visibleBounds(leg.ankle);
        return { location: leg.location, destroyed: leg.destroyed, tier: leg.damageTier,
          ankle: leg.ankle.getWorldPosition(new THREE.Vector3()).toArray(),
          minimumY: foot.isEmpty() ? null : foot.min.y };
      }),
      powerChannels: model.startup?.lights.map((light, index) => ({
        name: light.name, enabled: model.startup.enabled[index], visible: light.visible,
      })) ?? [],
      render: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures } };
  }
  async function show({ id, mode, angle = 'normal', damage = null, empty = false }) {
    if (lostContext) throw new Error('Review WebGL context lost');
    if (model) { scene.remove(model.root); factory.disposeModel(model.root); model = null; }
    const entry = roster.find((candidate) => candidate.id === id);
    if (!entry) throw new Error(`Unknown review chassis: ${id}`);
    const chassis = catalog.chassis.get(id), design = catalog.designs.get(entry.designId);
    const lost = new Set(damage === 'arm' ? ['left_arm'] : damage === 'leg' ? ['left_leg'] : damage === 'head' ? ['head'] : []);
    const wear = damage ? { centre_torso: 2, left_torso: 1, left_arm: 2, left_leg: damage === 'leg' ? 2 : 1 } : {};
    const mounts = empty ? [] : design.mounts.map((mount) => {
      const weapon = catalog.weapons.get(mount.weaponId);
      if (!weapon) throw new Error(`Missing weapon: ${mount.weaponId}`);
      return { weaponId: weapon.id, location: mount.location, type: weapon.type, tonnage: weapon.tonnage,
        projectiles: weapon.projectiles, recoil: weapon.recoil, visual: weapon.visual, destroyed: lost.has(mount.location) };
    });
    const options = mode === 'detail' ? quality.HERO_MECH_RENDER : {
      geometry: 'tactical', detail: mode === 'structure' || mode === 'silhouette' ? 'structure' : 'surface',
    };
    model = factory.buildMechModel(chassis.silhouette, chassis.traits, chassis.tonnage, settings.teamColour,
      false, mounts, lost, chassis.hardpoints, chassis.id, wear, chassis.faction, options);
    startup.setStartupPowered(model, true); startup.advanceStartupSequence(model, 0, true);
    scene.add(model.root); scene.updateMatrixWorld(true);
    const span = mode === 'detail' ? settings.detailSpan : settings.tacticalSpan;
    const aspect = settings.width / settings.height;
    Object.assign(camera, { left: -span * aspect / 2, right: span * aspect / 2, top: span / 2, bottom: -span / 2 });
    const target = new THREE.Vector3(...settings.target);
    camera.position.copy(new THREE.Vector3(...settings[angle]).normalize().multiplyScalar(220).add(target));
    camera.lookAt(target); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    renderer.shadowMap.enabled = mode !== 'structure' && mode !== 'silhouette';
    scene.overrideMaterial = mode === 'silhouette' ? silhouetteMaterial : null;
    ground.visible = mode !== 'silhouette';
    renderer.render(scene, camera);
    // A single bounded settle, never an animation loop or a simulated game tick.
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    renderer.render(scene, camera);
    if (lostContext) throw new Error('Review WebGL context lost');
    return { ...entry, mode, angle, damage, wear, lost: [...lost], empty, cameraSpan: span, ...inspect() };
  }
  function dispose() {
    if (model) factory.disposeModel(model.root);
    ground.geometry.dispose(); ground.material.dispose(); sun.shadow.dispose();
    silhouetteMaterial.dispose();
    renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); scene.clear();
  }
  globalThis.__mechReview = { roster, show, dispose };
  return roster;
}

function escape(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function contactSheet(records, roster) {
  const categories = [['normal', 'Normal tactical angle'], ['elevated', 'Elevated tactical angle'],
    ['structure', 'Structure only · Low FX'], ['silhouette', 'Monochrome silhouettes'], ['diagnostics', 'Mounts, detail & static damage']];
  const factions = ['linewrought', 'aurelian', ...new Set(roster.map((entry) => entry.faction))]
    .filter((faction, index, all) => all.indexOf(faction) === index && roster.some((entry) => entry.faction === faction));
  const sections = categories.map(([id, label]) => `<section data-view="${id}"><h2>${label}</h2><div class="factions">${factions.map((faction) =>
    `<div><h3>${faction === 'aurelian' ? 'Aurelian Stock' : escape(faction[0].toUpperCase() + faction.slice(1))}</h3><div class="cards">${records.filter((record) => record.category === id && record.faction === faction)
      .map((record) => `<figure><a href="${record.file}"><img src="${record.file}" loading="lazy" alt="${escape(record.name)}: ${escape(record.label)}"></a><figcaption><strong>${escape(record.name)} · ${record.tons}t</strong><span>${escape(record.label)}</span><small>${escape(record.designId)}${record.empty ? ' · mounts removed for silhouette inspection' : ''}</small>${record.fits ? '' : '<b class="warning">FRAME CLIPS MODEL — inspect JSON bounds</b>'}</figcaption></figure>`).join('')}</div></div>`).join('')}</div></section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wreckright · real model review</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f3f0e7;color:#193744;font:15px/1.5 system-ui,sans-serif}main{max-width:1800px;margin:auto;padding:26px}h1{margin:0 0 10px}h2{margin-top:28px}p{max-width:1120px}a{color:#286c65}select{font:inherit;padding:10px;min-height:44px;max-width:100%}.factions{display:grid;grid-template-columns:1fr 1fr;gap:22px}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}figure{margin:0;background:#fffdf7;border:1px solid #c7cfc0}img{display:block;width:100%;height:auto}figcaption{padding:10px}figcaption span,figcaption small{display:block}small{overflow-wrap:anywhere;color:#52665e}.warning{color:#993e28}[hidden]{display:none!important}:focus-visible{outline:3px solid #aa4d2c;outline-offset:3px}@media(max-width:800px){main{padding:16px}.cards{grid-template-columns:1fr}}@media(max-width:520px){.factions{grid-template-columns:1fr}}
    </style></head><body><main><h1>Wreckright / Real model review</h1><p>${roster.length} authored mech chassis. Real <code>buildMechModel</code> output, one renderer and the same team tint, lights, ground and camera constants. Tactical frames use a ${SETTINGS.tacticalSpan}m vertical span; detail frames use ${SETTINGS.detailSpan}m. Models are never resized to fill their cards. Click any capture for its full resolution.</p><p>Structure-only captures disable shadows and use tactical geometry without surface/hero parts. Damage captures are static factory states, not locomotion or fall validation. Empty-mount views are inspection variants of the named authored design. The JSON records framing bounds, feet, power channels and render counts.</p><p><a href="review.json">Capture metadata</a> · <label for="view">View </label><select id="view">${categories.map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select></p>${sections}</main><script>const select=document.getElementById('view');function show(){document.querySelectorAll('[data-view]').forEach(section=>{section.hidden=section.dataset.view!==select.value;});}select.addEventListener('change',show);show();</script></body></html>`;
}

await mkdir(SHOT_DIR, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: existsSync(executable) ? executable : undefined,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const records = [], errors = [];
let roster = [];
try {
  const context = await browser.newContext({ viewport: { width: SETTINGS.width, height: SETTINGS.height },
    deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
  context.setDefaultTimeout(15_000); context.setDefaultNavigationTimeout(30_000);
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.origin === BASE_URL.origin ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const fixtureUrl = new URL('__mech_design_review__', BASE_URL).href;
  await page.route(fixtureUrl, (route) => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Headless model fixture</title><style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head><body></body></html>' }));
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
  roster = await bounded(page.evaluate(installFixture, { base: BASE_URL.href, settings: SETTINGS }), 'Fixture setup', 30_000);
  const captureDeadline = Date.now() + 180_000;
  async function capture(entry, config, category, label, suffix) {
    if (Date.now() > captureDeadline) throw new Error('Capture sequence exceeded three minutes');
    const record = await bounded(page.evaluate((input) => globalThis.__mechReview.show(input),
      { id: entry.id, ...config }), `Render ${entry.id}/${suffix}`, 10_000);
    const file = `${entry.faction}-${entry.id}-${suffix}.png`;
    await page.locator('canvas').screenshot({ path: resolve(SHOT_DIR, file), timeout: 15_000 });
    records.push({ ...record, file, category, label });
    process.stdout.write(`${records.length}: ${entry.name} / ${label}${record.fits ? '' : ' [CLIPPED]'}\n`);
  }
  for (const entry of roster) {
    await capture(entry, { mode: 'surface' }, 'normal', 'Loaded · normal tactical', 'normal');
    await capture(entry, { mode: 'surface', angle: 'elevated' }, 'elevated', 'Loaded · elevated tactical', 'elevated');
    await capture(entry, { mode: 'structure' }, 'structure', 'Loaded · structure only / Low FX', 'structure');
    await capture(entry, { mode: 'silhouette' }, 'silhouette', 'Loaded · monochrome silhouette', 'silhouette');
  }
  for (const id of ['hornet_hnt2', 'sentinel_snl2']) {
    const entry = roster.find((candidate) => candidate.id === id);
    if (!entry) throw new Error(`Missing required representative ${id}`);
    for (const angle of ['normal', 'rear']) for (const empty of [false, true]) {
      const label = `${empty ? 'Empty mounts' : 'Loaded'} · hero ${angle === 'normal' ? 'front' : 'rear'} quarter`;
      await capture(entry, { mode: 'detail', angle, empty }, 'diagnostics', label, `detail-${angle}-${empty ? 'empty' : 'loaded'}`);
    }
    for (const damage of ['arm', 'leg', 'head']) {
      await capture(entry, { mode: 'detail', damage }, 'diagnostics',
        `${damage === 'head' ? 'Head disabled' : `Left ${damage} lost`} + wear · factory state`, `damage-${damage}`);
    }
  }
  await bounded(page.evaluate(() => globalThis.__mechReview.dispose()), 'Fixture disposal', 5_000);
  const clipped = records.filter((record) => !record.fits);
  const structureFailures = records.filter((record) => record.category === 'structure'
    && (record.detailCounts.surface > 0 || record.detailCounts.hero > 0));
  if (errors.length || clipped.length || structureFailures.length) {
    throw new Error(`Review failed: ${errors.length} browser errors, ${clipped.length} clipped frames, ${structureFailures.length} structure-LOD violations`);
  }
  process.stdout.write(`Captured ${records.length} real-model views from ${roster.length} chassis.\n`);
} catch (error) {
  errors.push(String(error)); process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(resolve(SHOT_DIR, 'review.json'), JSON.stringify({ baseUrl: BASE_URL.href, settings: SETTINGS,
    roster, captures: records, errors, note: 'Static model review; no simulation, audio or gait acceptance.' }, null, 2));
  await writeFile(resolve(SHOT_DIR, 'index.html'), contactSheet(records, roster));
  if (errors.length) process.stderr.write(`${errors.join('\n')}\n`);
  process.stdout.write(`Review: ${resolve(SHOT_DIR, 'index.html')}\n`);
}

/** Render catalogue portraits from the actual battlefield models, using one disposable headless context. */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = new URL(process.env.BASE_URL ?? 'http://127.0.0.1:5217/');
const output = resolve('src/assets/machines');
const executable = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: existsSync(executable) ? executable : undefined,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--no-sandbox'],
});
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 320, height: 360 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  const fixture = new URL('__portrait_capture__', base).href;
  await page.route(fixture, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><link rel="icon" href="data:,"></head><body></body></html>' }));
  await page.goto(fixture, { waitUntil: 'load' });
  const records = await page.evaluate(async (sourceBase) => {
    const source = path => new URL(path, sourceBase).href;
    const transformed = await (await fetch(source('src/ui/mechbay/MechPreviewRenderer.ts'))).text();
    const threePath = transformed.match(/from\s+["']([^"']*three(?:\.js|\.module\.js)[^"']*)["']/)?.[1];
    if (!threePath) throw new Error('Could not locate the shared Three module');
    const [THREE, { getCatalog }, factory, quality, startup] = await Promise.all([
      import(new URL(threePath, source('src/ui/mechbay/MechPreviewRenderer.ts')).href),
      import(source('src/schema/load.ts')), import(source('src/render3d/mechModel.ts')),
      import(source('src/render3d/renderQuality.ts')), import(source('src/render3d/startupLights.ts')),
    ]);
    const catalog = getCatalog();
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    renderer.setSize(320, 360); renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    scene.add(new THREE.HemisphereLight(0xc8e8ff, 0x182028, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 3.1); key.position.set(5, 9, 7); scene.add(key);
    const rim = new THREE.DirectionalLight(0x78b8ff, 1.15); rim.position.set(-6, 3, -5); scene.add(rim);
    const records = [];
    try {
      for (const chassis of catalog.chassis.values()) {
        const design = [...catalog.designs.values()].find(entry => entry.chassisId === chassis.id);
        if (!design) throw new Error(`No portrait design for ${chassis.id}`);
        const mounts = design.mounts.map(mount => {
          const weapon = catalog.weapons.get(mount.weaponId);
          return { weaponId: weapon.id, location: mount.location, type: weapon.type, tonnage: weapon.tonnage,
            projectiles: weapon.projectiles, recoil: weapon.recoil, visual: weapon.visual };
        });
        const model = factory.buildMechModel(chassis.silhouette, chassis.traits, chassis.tonnage, 0x88b7ba,
          false, mounts, new Set(), chassis.hardpoints, chassis.id, {}, chassis.faction, quality.HERO_MECH_RENDER);
        try {
          startup.setStartupPowered(model, true); startup.advanceStartupSequence(model, 0, true);
          scene.add(model.root); scene.updateMatrixWorld(true);
          const bounds = new THREE.Box3().setFromObject(model.root);
          const centre = bounds.getCenter(new THREE.Vector3());
          camera.position.copy(new THREE.Vector3(1, 0.55, 1).normalize().multiplyScalar(300).add(centre));
          camera.lookAt(centre); camera.updateMatrixWorld(true);
          const corners = [];
          for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) {
            for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
          }
          const extentX = Math.max(...corners.map(point => Math.abs(point.x)));
          const extentY = Math.max(...corners.map(point => Math.abs(point.y)));
          const halfY = Math.max(extentY, extentX * 360 / 320) * 1.08;
          Object.assign(camera, { top: halfY, bottom: -halfY, left: -halfY * 320 / 360, right: halfY * 320 / 360 });
          camera.updateProjectionMatrix();
          scene.background = new THREE.Color(chassis.faction === 'aurelian' ? 0xdde8e2 : 0xf1ddc5);
          renderer.render(scene, camera);
          records.push({ id: chassis.id, designId: design.id, width: 320, height: 360,
            image: renderer.domElement.toDataURL('image/webp', 0.9),
            bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } });
        } finally { scene.remove(model.root); factory.disposeModel(model.root); }
      }
    } finally { renderer.dispose(); renderer.forceContextLoss(); scene.clear(); }
    return records;
  }, base.href);
  for (const record of records) {
    const { image, ...metadata } = record;
    await writeFile(resolve(output, `${record.id}.webp`), Buffer.from(image.split(',')[1], 'base64'));
    process.stdout.write(`Portrait: ${metadata.id}\n`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(resolve(output, 'provenance.json'), JSON.stringify({ note: 'Original battlefield models, standard equipment; portraits are identification art, not a live loadout preview.', portraits: records.map(({ image: _image, ...record }) => record) }, null, 2));
} finally { await browser.close(); }

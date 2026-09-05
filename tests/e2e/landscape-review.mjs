/** Background-only map review. BASE_URL points to Vite; BASELINE=1 omits the new surroundings. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:5217/';
const directory = resolve(process.env.SHOT_DIR ?? 'reports/landscape-review');
const baseline = process.env.BASELINE === '1';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(20_000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/__landscape_review', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0"></body></html>' }));
  await page.goto(new URL('__landscape_review', base).href);
  await page.evaluate(async ({ base, baseline }) => {
    const source = (path) => new URL(path, base).href;
    const module = source('src/render3d/atmosphere.ts');
    const transformed = await (await fetch(module)).text();
    const path = transformed.match(/from\s+["']([^"']*three(?:\.js|\.module\.js)[^"']*)["']/)?.[1];
    if (!path) throw new Error('No transformed Three import');
    const [THREE, { getCatalog }, { createTerrainGrid }, { buildTerrain }, { PropLayer }, atmosphere, resources] = await Promise.all([
      import(new URL(path, module).href), import(source('src/schema/load.ts')),
      import(source('src/sim/terrain.ts')), import(source('src/render3d/terrain.ts')),
      import(source('src/render3d/props.ts')), import(module), import(source('src/render3d/sceneResources.ts')),
    ]);
    const landscapeModule = baseline ? null : await import(source('src/render3d/battlefieldLandscape.ts'));
    const catalog = getCatalog();
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: true });
    resources.configureRenderer(renderer, false, 1);
    renderer.setSize(1280, 800);
    document.body.appendChild(renderer.domElement);
    let scene = null;
    const clear = () => { if (scene) { resources.disposeObjectResources(scene); scene.clear(); scene = null; } };
    globalThis.__landscapeReview = {
      async show(mapId, low = false) {
        clear();
        const map = catalog.maps.get(mapId);
        const grid = createTerrainGrid(map, catalog.rules.terrain);
        const width = grid.width * grid.tileSize, depth = grid.height * grid.tileSize;
        const span = Math.max(width, depth);
        scene = new THREE.Scene();
        const midpoint = new THREE.Vector3(width / 2, 0, depth / 2);
        const target = new THREE.Object3D(); target.position.copy(midpoint); scene.add(target);
        const rig = atmosphere.buildAtmosphereRig(catalog.atmospheres.get(map.atmosphereId), target, midpoint, span);
        renderer.toneMappingExposure = rig.exposure;
        resources.configureRenderer(renderer, low, 1);
        scene.background = rig.sky;
        scene.add(rig.sun, rig.fill, rig.hemisphere);
        const terrain = buildTerrain(grid, map, rig.tint);
        terrain.setLowFx(low); terrain.setTime(0); scene.add(terrain.mesh);
        const props = new PropLayer(grid, map, terrain.heightAt, rig.tint);
        // Authoring overview only: no units, objectives, campaign state or live intel exist here.
        props.update(null); scene.add(props.group);
        if (landscapeModule) {
          const landscape = landscapeModule.buildBattlefieldLandscape(grid, map, terrain.heightAt, rig);
          landscape.setLowFx(low); scene.add(landscape.group);
        } else {
          const floor = new THREE.Mesh(new THREE.PlaneGeometry(width * 9, depth * 9),
            new THREE.MeshBasicMaterial({ color: atmosphere.surroundColour(rig) }));
          floor.rotation.x = -Math.PI / 2; floor.position.set(width / 2, -3, depth / 2); scene.add(floor);
        }
        const camera = new THREE.OrthographicCamera(-span * 1.088, span * 1.088, span * .68, -span * .68, 1, span * 8);
        const aim = new THREE.Vector3(width / 2, 35, depth * .59);
        camera.position.copy(aim).add(new THREE.Vector3(-.55, .94, -1).normalize().multiplyScalar(span * 3));
        camera.lookAt(aim); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        return { mapId, name: map.name, low, stats: resources.rendererStats(renderer.info) };
      },
      dispose() { clear(); resources.disposeRenderer(renderer); },
    };
  }, { base, baseline });
  const records = [];
  for (const mapId of ['ridge_pass', 'foundry_district', 'blackglass_quarry', 'cutbank_exchange', 'shale_steps', 'causeway']) {
    const entry = await page.evaluate((id) => globalThis.__landscapeReview.show(id), mapId);
    await page.locator('canvas').screenshot({ path: resolve(directory, `${mapId}.png`) });
    records.push(entry);
    console.log(`${entry.name}: ${entry.stats.calls} draws / ${entry.stats.triangles} triangles`);
  }
  await page.evaluate(() => globalThis.__landscapeReview.dispose());
  await writeFile(resolve(directory, 'review.json'), `${JSON.stringify({ base, baseline, records, errors }, null, 2)}\n`);
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }

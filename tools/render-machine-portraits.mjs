/** Render stylised field plates from the actual battlefield models, using one disposable headless context. */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = new URL(process.env.BASE_URL ?? 'http://127.0.0.1:5217/');
const output = resolve(process.env.OUTPUT_DIR ?? 'src/assets/machines');
const executable = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: existsSync(executable) ? executable : undefined,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--no-sandbox'],
});
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 640, height: 720 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
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
    const width = 640, height = 720;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    renderer.setSize(width, height); renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    scene.add(new THREE.HemisphereLight(0xc8e8ff, 0x182028, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 3.1); key.position.set(5, 9, 7); scene.add(key);
    const rim = new THREE.DirectionalLight(0x78b8ff, 1.15); rim.position.set(-6, 3, -5); scene.add(rim);
    const plate = document.createElement('canvas');
    plate.width = width; plate.height = height;
    const graphic = plate.getContext('2d');
    if (!graphic) throw new Error('Could not create portrait compositor');
    const drawBackdrop = (faction, serial) => {
      graphic.clearRect(0, 0, width, height);
      const linewrought = faction === 'linewrought';
      graphic.fillStyle = linewrought ? '#ead3b6' : '#dce8e3';
      graphic.fillRect(0, 0, width, height);
      graphic.fillStyle = linewrought ? '#143a42' : '#102f3c';
      graphic.globalAlpha = linewrought ? 0.11 : 0.08;
      graphic.beginPath();
      if (linewrought) {
        graphic.moveTo(-40, 106); graphic.lineTo(262, -20); graphic.lineTo(410, -20);
        graphic.lineTo(92, 720); graphic.lineTo(-40, 720);
      } else {
        graphic.moveTo(420, -20); graphic.lineTo(680, -20); graphic.lineTo(680, 720);
        graphic.lineTo(518, 720); graphic.lineTo(338, 242);
      }
      graphic.closePath(); graphic.fill(); graphic.globalAlpha = 1;

      graphic.strokeStyle = linewrought ? '#a25d32' : '#347e80';
      graphic.lineWidth = linewrought ? 5 : 3;
      graphic.globalAlpha = 0.24;
      for (let ring = 0; ring < 4; ring += 1) {
        graphic.beginPath();
        const inset = 44 + ring * 34;
        if (linewrought) {
          const notch = (serial * 17 + ring * 23) % 41;
          graphic.moveTo(inset + notch, 660 - ring * 19);
          graphic.bezierCurveTo(30 + ring * 9, 470 - ring * 20, 118 + notch, 178 + ring * 16, 320, 82 + ring * 28);
          graphic.bezierCurveTo(492, 40 + ring * 31, 606 - ring * 12, 214, 594 - ring * 18, 386);
        } else {
          graphic.arc(510, 172, 108 + ring * 48, Math.PI * 0.42, Math.PI * 1.48);
        }
        graphic.stroke();
      }
      graphic.globalAlpha = 1;
      graphic.fillStyle = linewrought ? '#d75c2e' : '#087982';
      if (linewrought) {
        graphic.fillRect(0, 486, 13, 112);
        graphic.fillRect(25, 602, 70, 8);
      } else {
        graphic.fillRect(614, 70, 8, 138);
        graphic.fillRect(570, 70, 52, 8);
      }
      graphic.strokeStyle = linewrought ? '#9c633f' : '#5a8f8b';
      graphic.globalAlpha = 0.32; graphic.lineWidth = 1;
      for (let y = 28; y < height; y += 24) {
        const offset = (serial * 11 + y) % 37;
        graphic.beginPath(); graphic.moveTo(offset, y); graphic.lineTo(offset + (linewrought ? 68 : 34), y); graphic.stroke();
      }
      graphic.globalAlpha = 1;
    };
    const drawPlateFinish = (faction, serial) => {
      const linewrought = faction === 'linewrought';
      const wash = graphic.createLinearGradient(0, 0, width, height);
      wash.addColorStop(0, 'rgba(255,255,255,.16)'); wash.addColorStop(.55, 'rgba(255,255,255,0)');
      wash.addColorStop(1, linewrought ? 'rgba(96,45,22,.13)' : 'rgba(11,53,65,.12)');
      graphic.fillStyle = wash; graphic.fillRect(0, 0, width, height);
      graphic.strokeStyle = linewrought ? '#bb7044' : '#3a7475'; graphic.lineWidth = 4;
      graphic.strokeRect(11, 11, width - 22, height - 22);
      graphic.strokeStyle = '#163942'; graphic.lineWidth = 2; graphic.globalAlpha = .72;
      graphic.beginPath();
      if (linewrought) {
        graphic.moveTo(28, 78); graphic.lineTo(28, 28); graphic.lineTo(112, 28);
        graphic.moveTo(528, 692); graphic.lineTo(612, 692); graphic.lineTo(612, 642);
      } else {
        graphic.moveTo(28, 58); graphic.lineTo(28, 28); graphic.lineTo(76, 28);
        graphic.moveTo(564, 692); graphic.lineTo(612, 692); graphic.lineTo(612, 662);
      }
      graphic.stroke(); graphic.globalAlpha = 1;
      graphic.fillStyle = linewrought ? '#d75c2e' : '#087982';
      for (let bar = 0; bar < 3; bar += 1) graphic.fillRect(30 + bar * 24, 674, 15 + ((serial + bar) % 3) * 4, 5);
    };
    const records = [];
    try {
      let serial = 0;
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
          const side = chassis.faction === 'aurelian' ? -1 : 1;
          camera.position.copy(new THREE.Vector3(side, 0.55, 1).normalize().multiplyScalar(300).add(centre));
          camera.lookAt(centre); camera.updateMatrixWorld(true);
          const corners = [];
          for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) {
            for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
          }
          const extentX = Math.max(...corners.map(point => Math.abs(point.x)));
          const extentY = Math.max(...corners.map(point => Math.abs(point.y)));
          const halfY = Math.max(extentY, extentX * height / width) * 1.035;
          Object.assign(camera, { top: halfY, bottom: -halfY, left: -halfY * width / height, right: halfY * width / height });
          camera.updateProjectionMatrix();
          renderer.render(scene, camera);
          drawBackdrop(chassis.faction, serial);
          graphic.save(); graphic.filter = 'blur(16px)'; graphic.fillStyle = 'rgba(7,28,34,.26)';
          graphic.beginPath(); graphic.ellipse(width * .51, height * .80, width * .27, height * .055, 0, 0, Math.PI * 2); graphic.fill(); graphic.restore();
          graphic.drawImage(renderer.domElement, 0, 0, width, height);
          drawPlateFinish(chassis.faction, serial);
          records.push({ id: chassis.id, designId: design.id, width, height,
            mounts: design.mounts.map(({ weaponId, location }) => ({ weaponId, location })),
            image: plate.toDataURL('image/webp', 0.92),
            bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } });
          serial += 1;
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
  await writeFile(resolve(output, 'provenance.json'), JSON.stringify({ visualVersion: 2, note: 'Original battlefield models and standard equipment, composited into faction field plates; portraits are identification art, not a live loadout preview.', portraits: records.map(({ image: _image, ...record }) => record) }, null, 2));
} finally { await browser.close(); }

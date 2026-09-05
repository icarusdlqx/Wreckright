import { Box3, Object3D, OrthographicCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { buildAtmosphereRig } from '../../render3d/atmosphere';
import { buildBattlefieldLandscape } from '../../render3d/battlefieldLandscape';
import { buildTerrain } from '../../render3d/terrain';
import { configureRenderer, disposeObjectResources, disposeRenderer } from '../../render3d/sceneResources';
import { createTerrainGrid } from '../../sim/terrain';
import type { MissionPreviewData } from './missionPreviewData';

const images = new Map<string, string>();
const WIDTH = 1200;
const HEIGHT = 650;

/** One off-screen frame, then release the context. The UI only retains the resulting image. */
export function missionTerrainImage(data: MissionPreviewData): string {
  const key = JSON.stringify([data.map, data.atmosphere]);
  const cached = images.get(key);
  if (cached !== undefined) return cached;
  const scene = new Scene();
  let renderer: WebGLRenderer | null = null;
  try {
    renderer = new WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    configureRenderer(renderer, true, 1);
    renderer.setSize(WIDTH, HEIGHT);
    const grid = createTerrainGrid(data.map, data.terrain);
    const span = Math.max(grid.width, grid.height) * grid.tileSize;
    const midpoint = new Vector3(grid.width * grid.tileSize / 2, 0, grid.height * grid.tileSize / 2);
    const target = new Object3D();
    target.position.copy(midpoint);
    scene.add(target);
    const rig = buildAtmosphereRig(data.atmosphere, target, midpoint, span);
    rig.sun.castShadow = false;
    scene.add(rig.sun, rig.fill, rig.hemisphere);
    scene.background = rig.sky;
    renderer.toneMappingExposure = rig.exposure;
    const terrain = buildTerrain(grid, data.map, rig.tint);
    scene.add(terrain.mesh);
    const landscape = buildBattlefieldLandscape(grid, data.map, terrain.heightAt, rig);
    scene.add(landscape.group);
    terrain.setTime(0);
    const bounds = new Box3().setFromObject(terrain.mesh);
    const landmark = landscape.group.getObjectByName('landscape-ledges-and-landmark');
    if (landmark !== undefined) bounds.union(new Box3().setFromObject(landmark));
    const centre = bounds.getCenter(new Vector3());
    const camera = new OrthographicCamera(-1, 1, 1, -1, 1, span * 8);
    camera.position.copy(centre).add(new Vector3(-0.55, 0.94, -1).normalize().multiplyScalar(span * 3));
    camera.lookAt(centre);
    camera.updateMatrixWorld();
    const projected = new Box3();
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) projected.expandByPoint(new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
    }
    const aspect = WIDTH / HEIGHT;
    const halfHeight = Math.max((projected.max.y - projected.min.y) / 2, (projected.max.x - projected.min.x) / (2 * aspect)) * 1.08;
    camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
    camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    images.set(key, url);
    if (images.size > 3) images.delete(images.keys().next().value ?? '');
    return url;
  } finally {
    disposeObjectResources(scene);
    if (renderer !== null) disposeRenderer(renderer);
  }
}

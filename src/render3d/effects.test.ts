import { describe, expect, it, vi } from 'vitest';
import {
  Color,
  Matrix4,
  Vector3,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
} from 'three';
import { JetLayer, ScarLayer, SmokeLayer } from './effects';

const INSTANCE = new Matrix4();

function visibleInstances(mesh: InstancedMesh): number {
  let visible = 0;
  for (let slot = 0; slot < mesh.count; slot += 1) {
    mesh.getMatrixAt(slot, INSTANCE);
    if (INSTANCE.getMaxScaleOnAxis() > 0.001) visible += 1;
  }
  return visible;
}

/** How many plumes are actually lit right now. */
function burning(jets: JetLayer): number {
  return jets.group.children.filter((child) => child.visible).length;
}

/** The opacity of the first lit plume, which is the throttle made visible. */
function brightest(jets: JetLayer): number {
  for (const child of jets.group.children) {
    if (!child.visible) continue;
    return ((child as Mesh).material as MeshBasicMaterial).opacity;
  }
  return 0;
}

function flameHeight(jets: JetLayer): number {
  return jets.group.children.find((child) => child.visible)?.scale.y ?? 0;
}

describe('jet exhaust', () => {
  it('lights only the nozzles asked for, and puts the rest out', () => {
    const jets = new JetLayer();
    expect(burning(jets)).toBe(0);

    jets.begin();
    jets.plume(0, new Vector3(10, 20, 30), 1, 0);
    jets.plume(1, new Vector3(14, 20, 30), 1, 0);
    jets.commit();
    expect(burning(jets)).toBe(2);

    // The mech landed: nobody lit anything this frame, so nothing burns.
    jets.begin();
    jets.commit();
    expect(burning(jets)).toBe(0);
  });

  it('burns brighter at full throttle, and not at all at idle', () => {
    const jets = new JetLayer();

    jets.begin();
    jets.plume(0, new Vector3(), 1, 0);
    jets.commit();
    const full = brightest(jets);

    jets.begin();
    jets.plume(0, new Vector3(), 0.3, 0);
    jets.commit();
    const easing = brightest(jets);

    expect(full).toBeGreaterThan(easing);
    expect(easing).toBeGreaterThan(0);

    // Below the floor the jet is off rather than invisibly on, so a mech
    // coasting over the top of its arc is not paying for a draw.
    jets.begin();
    jets.plume(0, new Vector3(), 0.01, 0);
    jets.commit();
    expect(burning(jets)).toBe(0);
  });

  it('never allocates past its slot budget, however many mechs jump', () => {
    const jets = new JetLayer(4);
    const before = jets.group.children.length;

    jets.begin();
    for (let key = 0; key < 50; key += 1) jets.plume(key, new Vector3(), 1, 0);
    jets.commit();

    expect(jets.group.children.length).toBe(before);
    expect(burning(jets)).toBeLessThanOrEqual(4);
  });

  it('bounds low FX exhaust to one nozzle per unit', () => {
    const jets = new JetLayer(8);

    jets.begin();
    for (let key = 10; key < 14; key += 1) jets.plume(key, new Vector3(), 1, 0);
    jets.commit();
    expect(burning(jets)).toBe(4);

    jets.setPresentationMode(true, false);
    jets.begin();
    for (let key = 10; key < 14; key += 1) jets.plume(key, new Vector3(), 1, 0);
    jets.commit();
    expect(burning(jets)).toBe(2);
  });

  it('removes exhaust flicker under reduced motion', () => {
    const jets = new JetLayer();

    jets.setPresentationMode(false, false);
    jets.begin();
    jets.plume(0, new Vector3(), 1, 0);
    jets.commit();
    const movingStart = flameHeight(jets);
    jets.begin();
    jets.plume(0, new Vector3(), 1, 0.025);
    jets.commit();
    expect(flameHeight(jets)).not.toBeCloseTo(movingStart);

    jets.setPresentationMode(false, true);
    jets.begin();
    jets.plume(0, new Vector3(), 1, 0);
    jets.commit();
    const stillStart = flameHeight(jets);
    jets.begin();
    jets.plume(0, new Vector3(), 1, 0.025);
    jets.commit();
    expect(flameHeight(jets)).toBe(stillStart);
  });
});

describe('wreck smoke', () => {
  it('draws nothing until something is wrecked', () => {
    const smoke = new SmokeLayer(new Color(0x161c1f));
    expect(smoke.mesh.count).toBe(0);
    expect(smoke.activeColumns).toBe(0);
  });

  it('thins a fresh column through its minute-long lifetime', () => {
    const smoke = new SmokeLayer(new Color(0x161c1f));
    smoke.start({ x: 100, y: 100 }, 0, 7);
    const fresh = visibleInstances(smoke.mesh);
    expect(fresh).toBeGreaterThan(0);
    expect(smoke.activeColumns).toBe(1);

    smoke.update(30);
    const midway = visibleInstances(smoke.mesh);
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(fresh);

    smoke.update(29);
    expect(visibleInstances(smoke.mesh)).toBeGreaterThan(0);
    const matrixVersion = smoke.mesh.instanceMatrix.version;
    const colourVersion = smoke.mesh.instanceColor?.version;
    smoke.update(1);
    expect(smoke.activeColumns).toBe(0);
    expect(smoke.mesh.count).toBe(0);
    expect(visibleInstances(smoke.mesh)).toBe(0);
    expect(smoke.mesh.instanceMatrix.version).toBe(matrixVersion);
    expect(smoke.mesh.instanceColor?.version).toBe(colourVersion);

    smoke.update(60);
    expect(smoke.mesh.instanceMatrix.version).toBe(matrixVersion);
    expect(smoke.mesh.instanceColor?.version).toBe(colourVersion);
  });

  it('deduplicates wreck events and reuses expired slots', () => {
    const smoke = new SmokeLayer(new Color(0x161c1f), { x: 0, y: 0 }, 2);
    const matrix = smoke.mesh.instanceMatrix;
    const colours = smoke.mesh.instanceColor;

    smoke.start({ x: 10, y: 20 }, 0, 1);
    smoke.update(30);
    const thinned = visibleInstances(smoke.mesh);
    smoke.start({ x: 900, y: 900 }, 0, 1);
    expect(smoke.activeColumns).toBe(1);
    expect(visibleInstances(smoke.mesh)).toBe(thinned);

    smoke.start({ x: 30, y: 40 }, 0, 2);
    expect(smoke.activeColumns).toBe(2);
    smoke.update(60);
    expect(smoke.activeColumns).toBe(0);

    smoke.start({ x: 50, y: 60 }, 0, 3);
    expect(smoke.activeColumns).toBe(1);
    expect(visibleInstances(smoke.mesh)).toBeGreaterThan(0);
    expect(smoke.mesh.count).toBeLessThanOrEqual(smoke.mesh.instanceMatrix.count);
    expect(smoke.mesh.instanceMatrix).toBe(matrix);
    expect(smoke.mesh.instanceColor).toBe(colours);
  });
});

describe('impact scars', () => {
  it('accumulates marks up to its budget and then reuses the oldest', () => {
    const scars = new ScarLayer(8, 2);
    expect(scars.mesh.count).toBe(0);

    for (let shot = 0; shot < 5; shot += 1) scars.mark({ x: shot * 10, y: 0 }, 0, 4, 1);
    expect(scars.scarCount).toBe(5);

    // Far past the budget: the ground keeps telling the story, at a fixed cost.
    for (let shot = 0; shot < 500; shot += 1) scars.mark({ x: shot, y: 0 }, 0, 4, 0);
    expect(scars.scarCount).toBe(8);
    expect(scars.craterCount).toBe(0);
    expect(scars.mesh.count).toBe(8);
  });

  it('keeps craters in reserved slots through ordinary impact churn', () => {
    const scars = new ScarLayer(3, 2);
    scars.crater({ x: 1_000, y: 2_000 }, 4, 18);
    scars.crater({ x: 3_000, y: 4_000 }, 6, 20);
    const first = new Matrix4();
    const second = new Matrix4();
    const firstColour = new Color();
    const secondColour = new Color();
    scars.mesh.getMatrixAt(3, first);
    scars.mesh.getMatrixAt(4, second);
    scars.mesh.getColorAt(3, firstColour);
    scars.mesh.getColorAt(4, secondColour);

    for (let shot = 0; shot < 5_000; shot += 1) {
      scars.mark({ x: shot, y: -shot }, shot % 7, 3, shot % 2);
    }

    const afterFirst = new Matrix4();
    const afterSecond = new Matrix4();
    const afterFirstColour = new Color();
    const afterSecondColour = new Color();
    scars.mesh.getMatrixAt(3, afterFirst);
    scars.mesh.getMatrixAt(4, afterSecond);
    scars.mesh.getColorAt(3, afterFirstColour);
    scars.mesh.getColorAt(4, afterSecondColour);
    expect(afterFirst.equals(first)).toBe(true);
    expect(afterSecond.equals(second)).toBe(true);
    expect(afterFirstColour.equals(firstColour)).toBe(true);
    expect(afterSecondColour.equals(secondColour)).toBe(true);
    expect(scars.scarCount).toBe(3);
    expect(scars.craterCount).toBe(2);
  });
});

describe('fixed instance attributes', () => {
  it('preallocates colour buffers and reuses colour scratch during events', () => {
    const smoke = new SmokeLayer(new Color(0x161c1f));
    const scars = new ScarLayer(4, 2);
    expect(smoke.mesh.instanceColor).not.toBeNull();
    expect(scars.mesh.instanceColor).not.toBeNull();
    const clone = vi.spyOn(Color.prototype, 'clone');
    const smokeMatrix = smoke.mesh.instanceMatrix;
    const smokeMatrixBuffer = smokeMatrix.array;
    const smokeColours = smoke.mesh.instanceColor;
    const smokeColourBuffer = smokeColours?.array;
    const scarMatrix = scars.mesh.instanceMatrix;
    const scarMatrixBuffer = scarMatrix.array;
    const scarColours = scars.mesh.instanceColor;
    const scarColourBuffer = scarColours?.array;

    for (let event = 0; event < 2_000; event += 1) {
      smoke.start({ x: event, y: -event }, 0, event);
      smoke.update(1 / 60);
      scars.mark({ x: event, y: -event }, 0, 4, 0.5);
      scars.crater({ x: -event, y: event }, 0, 12);
    }

    expect(clone).not.toHaveBeenCalled();
    expect(smoke.mesh.instanceMatrix).toBe(smokeMatrix);
    expect(smoke.mesh.instanceMatrix.array).toBe(smokeMatrixBuffer);
    expect(smoke.mesh.instanceColor).toBe(smokeColours);
    expect(smoke.mesh.instanceColor?.array).toBe(smokeColourBuffer);
    expect(scars.mesh.instanceMatrix).toBe(scarMatrix);
    expect(scars.mesh.instanceMatrix.array).toBe(scarMatrixBuffer);
    expect(scars.mesh.instanceColor).toBe(scarColours);
    expect(scars.mesh.instanceColor?.array).toBe(scarColourBuffer);
    smoke.dispose();
    scars.dispose();
  });
});

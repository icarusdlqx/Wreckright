import { describe, expect, it } from 'vitest';
import { TacticalCamera } from '../render3d/camera';
import type { Engine } from './engine';
import { showTrainingGate, trainingGateAnchor } from './trainingCamera';

describe('range gate camera framing', () => {
  it('keeps a portrait gate above the open coach and below the pause control', () => {
    const viewport = { width: 390, height: 844 };
    const coach = { left: 8, right: 268, top: 410, bottom: 578 };
    const anchor = trainingGateAnchor(viewport, coach, 96);
    expect(anchor.x).toBe(195);
    expect(anchor.y).toBeGreaterThan(120);
    expect(anchor.y).toBeLessThan(coach.top - 24);
  });

  it('leaves the center alone when the landscape coach is beside the gate', () => {
    expect(trainingGateAnchor({ width: 844, height: 390 },
      { left: 8, right: 258, top: 86, bottom: 256 }, 96)).toEqual({ x: 422, y: 195 });
    expect(trainingGateAnchor({ width: 1440, height: 900 }, null, 0))
      .toEqual({ x: 720, y: 450 });
  });

  it('frames the real camera and preserves the ground point used for a move order', () => {
    const camera = new TacticalCamera(true);
    camera.setBounds(1024, 1024);
    const viewport = { width: 390, height: 844 };
    const gate = { id: 'range_gate', x: 492, y: 708 };
    const coach = { left: 8, right: 268, top: 410, bottom: 578 };
    const app = {
      querySelector: (selector: string) => ({
        getBoundingClientRect: () => selector === '.mobile-training' ? coach : { bottom: 52 },
      }),
    };
    const engine = {
      world: { zones: [gate] },
      renderer: { camera, viewport, groundMesh: null, terrain: { heightAt: () => 0 },
        canvas: { closest: () => app, getBoundingClientRect: () => ({ left: 0, top: 0 }) } },
    } as unknown as Engine;

    showTrainingGate(engine);

    const screen = camera.worldToScreen(gate, viewport);
    expect(screen.y).toBeGreaterThan(120);
    expect(screen.y).toBeLessThan(coach.top - 24);
    const orderPoint = camera.screenToWorld(screen, viewport);
    expect(orderPoint.x).toBeCloseTo(gate.x, 3);
    expect(orderPoint.y).toBeCloseTo(gate.y, 3);
  });
});

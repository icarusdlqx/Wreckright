import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { TERRAIN_COLOURS, teamColour } from '../render/palette';
import { tileExplored, tileVisible } from '../sim/sensors';
import type { Vec2 } from '../sim/types';
import type { Engine } from './engine';
import {
  createMinimapPulseLedger,
  minimapBlips,
  minimapKeyboardTarget,
  minimapPointFromClient,
  minimapPulseAppearance,
  minimapViewportFootprint,
  minimapZones,
  updateMinimapContactPulses,
  type MinimapMapSize,
} from './minimapPresentation';

export {
  createMinimapPulseLedger,
  minimapBlips,
  minimapKeyboardTarget,
  minimapPointFromClient,
  minimapPulseAppearance,
  minimapViewportFootprint,
  minimapZones,
  updateMinimapContactPulses,
} from './minimapPresentation';
export type {
  MinimapBlip,
  MinimapContactPulse,
  MinimapMapSize,
  MinimapPulseAppearance,
  MinimapPulseLedger,
  MinimapRect,
  MinimapZoneView,
} from './minimapPresentation';

function cssColour(colour: number): string {
  return `#${colour.toString(16).padStart(6, '0')}`;
}

function mapSizeOf(engine: Engine): MinimapMapSize {
  const terrain = engine.world.terrain;
  return {
    width: terrain.width * terrain.tileSize,
    height: terrain.height * terrain.tileSize,
  };
}

/**
 * The whole battlefield in a corner of the screen: terrain, fog, every
 * machine the player can see, owned zones, new-contact pings, and the true
 * ground footprint of the field camera.
 *
 * Drawn 1 pixel per tile into offscreen buffers and scaled up with smoothing
 * off, so a refresh keeps the original two drawImage calls.
 */
export function Minimap({ engine }: { engine: Engine | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activePointer = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (engine === null) return;
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const screen = canvas.getContext('2d');
    if (screen === null) return;

    const terrain = engine.world.terrain;
    const columns = terrain.width;
    const rows = terrain.height;

    // The ground never changes; paint it once, from the authored map because
    // the simulation grid keeps terrain effects, not terrain names.
    const map = engine.renderer.mapData;
    const base = document.createElement('canvas');
    base.width = columns;
    base.height = rows;
    const baseInk = base.getContext('2d');
    if (baseInk === null) return;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const id = map.legend[map.tiles[row]?.[column] ?? ''] ?? 'open';
        const colour = TERRAIN_COLOURS[id] ?? 0x3c4a33;
        baseInk.fillStyle = cssColour(colour);
        baseInk.fillRect(column, row, 1, 1);
      }
    }

    const fog = document.createElement('canvas');
    fog.width = columns;
    fog.height = rows;
    const fogInk = fog.getContext('2d');
    if (fogInk === null) return;

    const pulseLedger = createMinimapPulseLedger();
    let running = true;
    let frame = 0;
    let last = 0;

    const draw = (now: number): void => {
      if (!running) return;
      frame = requestAnimationFrame(draw);
      // 10Hz is plenty for a map the size of a matchbox.
      if (now - last < 100) return;
      last = now;

      const world = engine.world;
      const view = engine.renderer.camera;
      const width = canvas.width;
      const height = canvas.height;
      const mapSize = mapSizeOf(engine);
      const scaleX = width / mapSize.width;
      const scaleY = height / mapSize.height;

      screen.imageSmoothingEnabled = false;
      screen.drawImage(base, 0, 0, width, height);

      // Fog: unexplored ground is night, explored-but-dark ground is dusk.
      fogInk.clearRect(0, 0, columns, rows);
      if (world.vision !== null) {
        for (let row = 0; row < rows; row += 1) {
          for (let column = 0; column < columns; column += 1) {
            const cell = row * columns + column;
            if (tileVisible(world.vision, cell)) continue;
            fogInk.fillStyle = tileExplored(world.vision, cell)
              ? 'rgba(5, 8, 12, 0.55)'
              : 'rgba(5, 8, 12, 0.92)';
            fogInk.fillRect(column, row, 1, 1);
          }
        }
      }
      screen.drawImage(fog, 0, 0, width, height);

      // Ownership is public objective state. Capture progress is deliberately
      // absent because it can disclose an unseen machine standing in a zone.
      screen.save();
      for (const zone of minimapZones(world)) {
        screen.beginPath();
        screen.ellipse(
          zone.position.x * scaleX,
          zone.position.y * scaleY,
          zone.radius * scaleX,
          zone.radius * scaleY,
          0,
          0,
          Math.PI * 2,
        );
        if (zone.owner === null) {
          screen.strokeStyle = 'rgba(215, 226, 234, 0.32)';
          screen.lineWidth = 1;
          screen.stroke();
          continue;
        }
        screen.fillStyle = cssColour(teamColour(zone.owner));
        screen.globalAlpha = 0.18;
        screen.fill();
        screen.globalAlpha = 0.68;
        screen.strokeStyle = cssColour(teamColour(zone.owner));
        screen.lineWidth = 1;
        screen.stroke();
        screen.globalAlpha = 1;
      }
      screen.restore();

      const blips = minimapBlips(world);
      updateMinimapContactPulses(pulseLedger, blips, now);
      // Machines need optical contact. Electronic returns are hollow coarse tracks.
      for (const blip of blips) {
        const x = blip.position.x * scaleX;
        const y = blip.position.y * scaleY;
        if (blip.kind === 'sensor' || blip.kind === 'memory') {
          screen.strokeStyle = blip.kind === 'sensor' ? '#ffc15c' : 'rgba(255, 193, 92, 0.38)';
          screen.lineWidth = 1;
          screen.beginPath();
          screen.moveTo(x, y - 3);
          screen.lineTo(x + 3, y);
          screen.lineTo(x, y + 3);
          screen.lineTo(x - 3, y);
          screen.closePath();
          screen.stroke();
          continue;
        }
        screen.fillStyle = cssColour(teamColour(blip.team));
        screen.fillRect(x - 2, y - 2, 4, 4);
      }

      for (const pulse of pulseLedger.pulses) {
        const appearance = minimapPulseAppearance(pulse, now, view.reducedMotion);
        if (appearance === null) continue;
        screen.strokeStyle = `rgba(255, 193, 92, ${appearance.alpha})`;
        screen.lineWidth = 1.5;
        screen.beginPath();
        screen.arc(
          pulse.position.x * scaleX,
          pulse.position.y * scaleY,
          appearance.radius,
          0,
          Math.PI * 2,
        );
        screen.stroke();
      }

      // The fixed camera has a perspective ground trapezoid, not an honest
      // axis-aligned box. Project its real screen corners onto the ground.
      const viewport = engine.renderer.viewport;
      const footprint = minimapViewportFootprint(
        (point, size) => view.screenToWorld(point, size),
        viewport,
        mapSize,
        { width, height },
      );
      if (footprint.length === 4) {
        const first = footprint[0];
        if (first !== undefined) {
          screen.strokeStyle = 'rgba(214, 226, 234, 0.88)';
          screen.lineWidth = 1;
          screen.beginPath();
          screen.moveTo(first.x, first.y);
          for (const point of footprint.slice(1)) screen.lineTo(point.x, point.y);
          screen.closePath();
          screen.stroke();
        }
      }
    };
    frame = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      const pointerId = activePointer.current;
      if (pointerId !== null && canvas.hasPointerCapture(pointerId)) {
        canvas.releasePointerCapture(pointerId);
      }
      activePointer.current = null;
    };
  }, [engine]);

  const centreAt = (canvas: HTMLCanvasElement, client: Vec2): void => {
    if (engine === null) return;
    const point = minimapPointFromClient(client, canvas.getBoundingClientRect(), mapSizeOf(engine));
    if (point === null) return;
    engine.renderer.camera.skipDropIn();
    engine.renderer.camera.centreOn(point);
  };

  const finishPointer = (canvas: HTMLCanvasElement, pointerId: number, release: boolean): void => {
    if (activePointer.current !== pointerId) return;
    activePointer.current = null;
    setDragging(false);
    if (release && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  };

  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (engine === null || event.button !== 0 || !event.isPrimary || activePointer.current !== null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const canvas = event.currentTarget;
    canvas.focus({ preventScroll: true });
    activePointer.current = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    setDragging(true);
    centreAt(canvas, { x: event.clientX, y: event.clientY });
  };

  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (activePointer.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    centreAt(event.currentTarget, { x: event.clientX, y: event.clientY });
  };

  const pointerUp = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (activePointer.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    centreAt(event.currentTarget, { x: event.clientX, y: event.clientY });
    finishPointer(event.currentTarget, event.pointerId, true);
  };

  const pointerCancel = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (activePointer.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    finishPointer(event.currentTarget, event.pointerId, true);
  };

  const keyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>): void => {
    // Let focus leave naturally without the field-level Tab shortcut cycling a unit.
    if (event.key === 'Tab') {
      event.stopPropagation();
      return;
    }
    if (engine === null) return;
    const terrain = engine.world.terrain;
    const target = minimapKeyboardTarget(
      engine.renderer.camera.target,
      event.key,
      terrain.tileSize,
      mapSizeOf(engine),
    );
    if (target === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    engine.renderer.camera.skipDropIn();
    engine.renderer.camera.centreOn(target);
  };

  const keyUp = (event: ReactKeyboardEvent<HTMLCanvasElement>): void => {
    if (!event.key.startsWith('Arrow')) return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <canvas
      ref={canvasRef}
      className={`minimap${dragging ? ' dragging' : ''}`}
      width={160}
      height={160}
      role="application"
      tabIndex={0}
      aria-label="Battlefield minimap. Click or drag to move the field camera; arrow keys move by two map tiles."
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
      onKeyDown={keyDown}
      onKeyUp={keyUp}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerCancel}
      onLostPointerCapture={(event) => finishPointer(event.currentTarget, event.pointerId, false)}
      data-testid="minimap"
    />
  );
}

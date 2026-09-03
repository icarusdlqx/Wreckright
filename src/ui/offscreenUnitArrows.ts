import { teamColour } from '../render/palette';
import { canPresentEntity } from '../render3d/visibilityPresentation';
import { isOperational, type MechEntity, type World } from '../sim/types';

const DEFAULT_CAPACITY = 12;
const MAX_CAPACITY = 24;
const EDGE_INSET = 22;

interface ScreenBody {
  x: number;
  y: number;
  radius: number;
}

interface ArrowViewport {
  width: number;
  height: number;
}

export interface EdgePlacement {
  x: number;
  y: number;
  degrees: number;
}

type ArrowDocument = Pick<Document, 'createElement'>;

/** Where on the edge of the view an arrow for something in this direction sits. */
export function edgeArrowPlacement(
  bearing: { x: number; y: number },
  viewport: ArrowViewport,
  inset = EDGE_INSET,
): EdgePlacement {
  const centreX = viewport.width / 2;
  const centreY = viewport.height / 2;
  const halfWidth = Math.max(0, centreX - Math.min(inset, centreX));
  const halfHeight = Math.max(0, centreY - Math.min(inset, centreY));
  const scaleX = bearing.x === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(bearing.x);
  const scaleY = bearing.y === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(bearing.y);
  const scale = Math.min(scaleX, scaleY);
  const finite = Number.isFinite(scale) ? scale : 0;
  return {
    x: centreX + bearing.x * finite,
    y: centreY + bearing.y * finite,
    degrees: (Math.atan2(bearing.y, bearing.x) * 180) / Math.PI,
  };
}

function cssColour(colour: number): string {
  return `#${colour.toString(16).padStart(6, '0')}`;
}

/**
 * Small arrows on the edge of the view for the player's own machines and the
 * hostiles they can see, so a lance that has walked off screen — or a contact
 * that has — is still somewhere rather than nowhere. A fixed pool of nodes,
 * updated in place each frame; friendlies are placed first when it runs out.
 */
export class OffscreenUnitArrows {
  private readonly root: HTMLElement;
  private readonly slots: HTMLElement[] = [];
  private readonly bearing = { x: 0, y: 0 };
  private shown = 0;

  constructor(
    host: HTMLElement,
    private readonly bodyOf: (entity: MechEntity) => ScreenBody,
    private readonly directionOf: (entity: MechEntity, out: { x: number; y: number }) => void,
    private readonly viewportOf: () => ArrowViewport,
    capacity = DEFAULT_CAPACITY,
    dom: ArrowDocument = document,
  ) {
    const count = Math.max(1, Math.min(MAX_CAPACITY, Math.trunc(capacity)));
    this.root = dom.createElement('div');
    this.root.className = 'offscreen-unit-arrows';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.style.cssText =
      'position:absolute;inset:0;z-index:53;overflow:hidden;pointer-events:none;contain:strict;';
    for (let index = 0; index < count; index += 1) {
      const element = dom.createElement('span');
      element.className = 'offscreen-unit-arrow';
      element.hidden = true;
      element.style.cssText =
        'position:absolute;width:0;height:0;border-top:6px solid transparent;' +
        'border-bottom:6px solid transparent;border-left:11px solid currentColor;' +
        'opacity:0.85;filter:drop-shadow(0 0 2px rgba(0,0,0,0.8));will-change:transform;';
      this.root.appendChild(element);
      this.slots.push(element);
    }
    host.appendChild(this.root);
  }

  get activeCount(): number {
    return this.shown;
  }

  update(world: World, visible = true): void {
    this.root.hidden = !visible;
    this.shown = 0;
    if (!visible) {
      this.hideRest();
      return;
    }
    const playerTeam = world.playerTeam ?? 0;
    const viewport = this.viewportOf();
    // Two passes so hostiles never crowd the player's own machines out.
    for (const entity of world.entities) {
      if (entity.team === playerTeam) this.consider(world, entity, viewport);
    }
    for (const entity of world.entities) {
      if (entity.team !== playerTeam) this.consider(world, entity, viewport);
    }
    this.hideRest();
  }

  destroy(): void {
    this.root.remove();
  }

  private consider(world: World, entity: MechEntity, viewport: ArrowViewport): void {
    if (this.shown >= this.slots.length || !isOperational(entity)) return;
    if (!canPresentEntity(world, entity.id)) return;
    const body = this.bodyOf(entity);
    if (!this.offScreen(body, viewport)) return;
    this.directionOf(entity, this.bearing);
    const placement = edgeArrowPlacement(this.bearing, viewport);
    const element = this.slots[this.shown];
    if (element === undefined) return;
    this.shown += 1;
    element.hidden = false;
    element.style.left = `${placement.x.toFixed(1)}px`;
    element.style.top = `${placement.y.toFixed(1)}px`;
    element.style.color = cssColour(teamColour(entity.team));
    element.style.transform = `translate(-50%, -50%) rotate(${placement.degrees.toFixed(1)}deg)`;
  }

  private offScreen(body: ScreenBody, viewport: ArrowViewport): boolean {
    return (
      body.x + body.radius < 0 ||
      body.x - body.radius > viewport.width ||
      body.y + body.radius < 0 ||
      body.y - body.radius > viewport.height
    );
  }

  private hideRest(): void {
    for (let index = this.shown; index < this.slots.length; index += 1) {
      const element = this.slots[index];
      if (element !== undefined) element.hidden = true;
    }
  }
}

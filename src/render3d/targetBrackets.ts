import { visiblePriorityTargets } from '../render/priorityTargets';
import { findEntity, type EntityId, type MechEntity, type World } from '../sim/types';
import './targetBrackets.css';

interface ScreenBody { x: number; y: number; radius: number }

/** Screen-space corners remain thin at every zoom and do not cover the target. */
export class TargetBrackets {
  private readonly root: HTMLElement;
  private readonly markers = new Map<EntityId, HTMLElement>();

  constructor(host: HTMLElement, private readonly dom: Pick<Document, 'createElement'> = document) {
    this.root = dom.createElement('div');
    this.root.className = 'field-target-brackets';
    this.root.setAttribute('aria-hidden', 'true');
    host.appendChild(this.root);
  }

  draw(world: World, selection: ReadonlySet<EntityId>, screenBody: (entity: MechEntity) => ScreenBody,
    width: number, height: number): void {
    const drawn = new Set<EntityId>();
    for (const [id, focus] of visiblePriorityTargets(world, selection)) {
      const entity = findEntity(world, id);
      if (entity === null) continue;
      const body = screenBody(entity);
      if (!Number.isFinite(body.x) || !Number.isFinite(body.y) || !Number.isFinite(body.radius) ||
        body.x < 0 || body.x > width || body.y < 0 || body.y > height) continue;
      drawn.add(id);
      let marker = this.markers.get(id);
      if (marker === undefined) {
        marker = this.dom.createElement('div');
        marker.setAttribute('data-entity-id', String(id));
        for (let corner = 0; corner < 4; corner += 1) marker.appendChild(this.dom.createElement('i'));
        this.root.appendChild(marker);
        this.markers.set(id, marker);
      }
      const size = Math.max(36, Math.min(144, body.radius * 2 + 14));
      marker.className = `field-target-bracket field-target-bracket--${focus}`;
      marker.setAttribute('data-focus', focus);
      marker.style.width = `${Math.round(size)}px`;
      marker.style.height = `${Math.round(size)}px`;
      marker.style.transform = `translate(${Math.round(body.x - size / 2)}px, ${Math.round(body.y - size / 2)}px)`;
    }
    // Recompute on every rendered frame, including paused orders and lost sight.
    for (const [id, marker] of this.markers) {
      if (drawn.has(id)) continue;
      marker.remove(); this.markers.delete(id);
    }
  }

  destroy(): void { this.markers.clear(); this.root.remove(); }
}

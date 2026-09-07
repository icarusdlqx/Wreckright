import { isOperational, type MechEntity, type World } from '../sim/types';
import { unitIntegrity } from '../render/unitIntegrity';
import { canPresentEntity } from './visibilityPresentation';
import './unitHealthBars.css';
export { unitIntegrity } from '../render/unitIntegrity';

export function showsUnitHealth(world: World, entity: MechEntity): boolean {
  return world.catalog.chassis.get(entity.chassisId)?.frame === 'mech' &&
    isOperational(entity) && canPresentEntity(world, entity.id);
}

interface HealthBar { element: HTMLElement; fill: HTMLElement }
interface ScreenBody { x: number; y: number; radius: number }

/** A small anchored readout; no names, numbers, animations or pointer interception. */
export class UnitHealthBars {
  private readonly root: HTMLElement;
  private readonly bars = new Map<number, HealthBar>();

  constructor(host: HTMLElement, private readonly dom: Pick<Document, 'createElement'> = document) {
    this.root = dom.createElement('div');
    this.root.className = 'unit-health-bars';
    // Equivalent exact values are already available in the accessible lance/contacts UI.
    this.root.setAttribute('aria-hidden', 'true');
    host.appendChild(this.root);
  }

  draw(world: World, selection: ReadonlySet<number>, hovered: number | null,
    screenBody: (entity: MechEntity) => ScreenBody, width: number, height: number): void {
    const visible = new Set<number>();
    for (const entity of world.entities) {
      if (!showsUnitHealth(world, entity)) continue;
      const body = screenBody(entity);
      const y = body.y - body.radius - 9;
      if (!Number.isFinite(body.x) || !Number.isFinite(y) || body.x < 20 ||
        body.x > width - 20 || y < 4 || y > height - 4) continue;
      visible.add(entity.id);
      let bar = this.bars.get(entity.id);
      if (bar === undefined) {
        const element = this.dom.createElement('div');
        const fill = this.dom.createElement('span');
        element.setAttribute('data-entity-id', String(entity.id));
        element.appendChild(fill); this.root.appendChild(element);
        bar = { element, fill }; this.bars.set(entity.id, bar);
      }
      const friendly = entity.team === (world.playerTeam ?? 0);
      const selected = selection.has(entity.id) || hovered === entity.id;
      bar.element.className = `unit-health-bar unit-health-${friendly ? 'friendly' : 'hostile'}${selected ? ' unit-health-focused' : ''}`;
      bar.element.style.transform = `translate(${Math.round(body.x)}px, ${Math.round(y)}px)`;
      bar.fill.style.transform = `scaleX(${unitIntegrity(entity)})`;
    }
    // Remove exact health and position as soon as optics are lost, even while paused.
    for (const [id, bar] of this.bars) {
      if (visible.has(id)) continue;
      bar.element.remove(); this.bars.delete(id);
    }
  }

  destroy(): void { this.bars.clear(); this.root.remove(); }
}

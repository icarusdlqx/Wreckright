import { Object3D } from 'three';
import { ImpactShapeBatches } from './impactShapeBatches';

interface DestructionBurst {
  start: number; x: number; y: number; z: number; scale: number;
  life: number; motion: number; kind: string; floor: number;
}
const INSTANCE = new Object3D();

/** Hot breach, cold plates and ground pressure separate the instant of loss from the wreck. */
export function writeDestructionBurst(shapes: ImpactShapeBatches, slot: DestructionBurst, spent: number): void {
  const terminal = slot.kind === 'terminal';
  const blast = slot.kind !== 'critical';
  const travel = spent * slot.motion;
  const fade = 1 - spent;
  if (blast) {
    for (let index = 0; index < 4; index += 1) {
      const angle = index * 2.399963;
      const delay = index * .045;
      const age = Math.max(0, spent - delay) * slot.motion;
      const spread = slot.scale * age * (terminal ? 8 : 4);
      INSTANCE.position.set(slot.x + Math.cos(angle) * spread,
        slot.y + travel * slot.scale * (4 + index * 2), slot.z + Math.sin(angle) * spread);
      INSTANCE.rotation.set(.2 * index, .8 * index, .1);
      const size = slot.scale * (terminal ? 2.8 : 1.8) * (1 + age * 2.1);
      INSTANCE.scale.set(size, size * (.75 + index * .08), size);
      INSTANCE.updateMatrix();
      const colour = index === 0 && spent < .18 ? 0xffeac0 : index % 2 === 0 ? 0xfda557 : 0xe96331;
      shapes.write(shapes.blast, slot.start + index, INSTANCE.matrix, colour, fade * fade * .75);
    }
    INSTANCE.position.set(slot.x, slot.floor + .3, slot.z);
    INSTANCE.rotation.set(-Math.PI / 2, 0, 0);
    INSTANCE.scale.setScalar(slot.scale * (2 + travel * (terminal ? 22 : 12)));
    INSTANCE.updateMatrix();
    shapes.write(shapes.flare, slot.start + 1, INSTANCE.matrix, 0xd8c0a1, fade * fade * .26);
  }
  for (let index = 0; index < 6; index += 1) {
    const angle = index * 2.399963 + slot.start * .31;
    const speed = slot.scale * (10 + index * 2.6);
    const t = slot.life * travel;
    const floor = slot.floor + .3;
    const y = Math.max(floor, slot.y + (8 + index % 3 * 3) * t - 17 * t * t);
    INSTANCE.position.set(slot.x + Math.cos(angle) * speed * travel, y,
      slot.z + Math.sin(angle) * speed * travel);
    INSTANCE.rotation.set(travel * (3 + index), angle + travel * 2, travel * (index % 2 ? -5 : 4));
    const shrink = Math.min(1, fade * 5);
    const size = slot.scale * (.55 + index % 3 * .18) * shrink;
    INSTANCE.scale.set(size * 1.5, size * .22, size * (index % 2 ? .75 : 1.2));
    INSTANCE.updateMatrix();
    shapes.write(shapes.plates, slot.start + index, INSTANCE.matrix,
      index % 3 === 0 ? 0xbebbb0 : index % 3 === 1 ? 0x586164 : 0x3b4143, .72 + fade * .28);
  }
}

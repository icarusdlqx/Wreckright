import { getCatalog } from '../schema/load';
import type { ContactSnapshot, UnitSnapshot } from './store';
import './contacts.css';

function opticalHealth(enemy: UnitSnapshot): number {
  const locations = Object.values(enemy.locations);
  const remaining = locations.reduce(
    (total, part) => total + part.armour + part.rearArmour + part.internal,
    0,
  );
  const intact = locations.reduce(
    (total, part) => total + part.armourMax + part.rearArmourMax + part.internalMax,
    0,
  );
  return intact === 0 ? 0 : remaining / intact;
}

function approximateRange(contact: ContactSnapshot): string {
  const range = contact.approximateRange === null ? 'range unknown' : `~${contact.approximateRange}m`;
  return contact.current ? range : `last known ${range}`;
}

export function investigationPoint(contact: ContactSnapshot): ContactSnapshot['position'] {
  return { x: contact.position.x, y: contact.position.y };
}

export function selectedTargetIds(
  units: readonly Pick<UnitSnapshot, 'id' | 'targetId'>[],
  selection: readonly number[],
): Set<number> {
  const selected = new Set(selection);
  return new Set(
    units.flatMap((unit) =>
      selected.has(unit.id) && unit.targetId !== null ? [unit.targetId] : [],
    ),
  );
}

/** Optical contacts target directly; electronic returns guide indirect fire or investigation. */
export function HostileBar({
  enemies,
  contacts,
  targetIds,
  hasSelection,
  onTarget,
  onContact,
}: {
  enemies: readonly UnitSnapshot[];
  contacts: readonly ContactSnapshot[];
  targetIds: ReadonlySet<number>;
  hasSelection: boolean;
  onTarget: (id: number) => void;
  onContact: (contact: ContactSnapshot) => void;
}) {
  const standing = enemies.filter((enemy) => enemy.alive);
  const count = standing.length + contacts.length;
  const indirectAccuracy = Math.round(
    getCatalog().rules.support.sensor_probe.indirectAccuracyFactor * 100,
  );

  return (
    <section className="hostiles" aria-label="Battlefield contacts" data-testid="hostile-bar">
      <span className="hostiles-label">{count === 0 ? 'No contacts' : `Contacts ${count}`}</span>
      {standing.map((enemy) => {
        const health = opticalHealth(enemy);
        const range = enemy.rangeToLance === null ? 'range unknown' : `${Math.round(enemy.rangeToLance)}m`;
        return (
          <button
            key={`optical-${enemy.id}`}
            type="button"
            className={`hostile ${targetIds.has(enemy.id) ? 'targeted' : ''}`}
            disabled={!hasSelection}
            title={hasSelection
              ? `Target ${enemy.identity}`
              : 'Select one of your mechs first, then choose an optical contact'}
            aria-label={`Optical contact: ${enemy.identity}, ${range}. ${hasSelection ? 'Target contact' : 'Select a friendly mech before targeting'}.`}
            onClick={() => onTarget(enemy.id)}
            data-testid={`hostile-${enemy.id}`}
          >
            <span className="hostile-name">{enemy.identity}</span>
            <span className="hostile-range">
              {enemy.rangeToLance === null ? '—' : `${Math.round(enemy.rangeToLance)}m`}
            </span>
            <span className="hostile-health" aria-hidden="true">
              <span style={{ width: `${Math.round(health * 100)}%` }} />
            </span>
          </button>
        );
      })}
      {contacts.map((contact) => {
        const range = approximateRange(contact);
        const guidance = contact.current
          ? `Current returns guide indirect missiles at ${indirectAccuracy}% of sighted accuracy; other mechs investigate.`
          : 'Frozen last-known returns cannot guide fire; investigate the coarse area.';
        return (
          <button
            key={`sensor-${contact.id}`}
            type="button"
            className="hostile sensor-contact"
            disabled={!hasSelection}
            title={hasSelection
              ? guidance
              : 'Select a friendly mech before investigating this return'}
            aria-label={`Sensor contact: ${contact.label}, ${range}. ${guidance}`}
            onClick={() => onContact(contact)}
            data-testid={`sensor-contact-${contact.id}`}
          >
            <span className="sensor-contact-glyph" aria-hidden="true">◇</span>
            <span className="hostile-name">{contact.label}</span>
            <span className="hostile-range">{range}</span>
            <span className="sensor-contact-note">
              {contact.current ? `Sensor return · indirect ${indirectAccuracy}% of sighted / investigate` : 'Frozen last known · investigate track'}
            </span>
          </button>
        );
      })}
    </section>
  );
}

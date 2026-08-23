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

/** Optical contacts target; electronic returns can only send the lance to a coarse point. */
export function HostileBar({
  enemies,
  contacts,
  targetIds,
  hasSelection,
  onTarget,
  onInvestigate,
}: {
  enemies: readonly UnitSnapshot[];
  contacts: readonly ContactSnapshot[];
  targetIds: ReadonlySet<number>;
  hasSelection: boolean;
  onTarget: (id: number) => void;
  onInvestigate: (at: ContactSnapshot['position']) => void;
}) {
  const standing = enemies.filter((enemy) => enemy.alive);
  const count = standing.length + contacts.length;

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
              ? `Target ${enemy.name}`
              : 'Select one of your mechs first, then choose an optical contact'}
            aria-label={`Optical contact: ${enemy.name}, ${range}. ${hasSelection ? 'Target contact' : 'Select a friendly mech before targeting'}.`}
            onClick={() => onTarget(enemy.id)}
            data-testid={`hostile-${enemy.id}`}
          >
            <span className="hostile-name">{enemy.name}</span>
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
        return (
          <button
            key={`sensor-${contact.id}`}
            type="button"
            className="hostile sensor-contact"
            disabled={!hasSelection}
            title={hasSelection
              ? 'Attack-move to the reported area; the return itself cannot be targeted'
              : 'Select a friendly mech before investigating this return'}
            aria-label={`Investigate sensor contact: ${contact.label}, ${range}. This is not a firing solution.`}
            onClick={() => onInvestigate(investigationPoint(contact))}
            data-testid={`sensor-contact-${contact.id}`}
          >
            <span className="sensor-contact-glyph" aria-hidden="true">◇</span>
            <span className="hostile-name">{contact.label}</span>
            <span className="hostile-range">{range}</span>
            <span className="sensor-contact-note">
              {contact.current ? 'Sensor return' : 'Frozen last known'} · investigate track
            </span>
          </button>
        );
      })}
    </section>
  );
}

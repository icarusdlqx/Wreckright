import type { DragEvent } from 'react';
import type { Faction } from '../../schema/faction';
import type { Catalog } from '../../schema/load';
import type { Weapon } from '../../schema/weapon';
import { foreignComponentPresentation } from './machineCulturePresentation';
import { WeaponGlyph } from './WeaponGlyph';
import {
  factionPresentation,
  formatWeaponNumber,
  weaponCategory,
  weaponCategoryLabel,
  weaponMetrics,
} from './weaponPresentation';

export interface WeaponCardProps {
  catalog: Catalog;
  weapon: Weapon;
  mountedWeapons?: readonly Weapon[];
  chassisFaction?: Faction;
  stock?: number;
  selected?: boolean;
  inspected?: boolean;
  unavailableReason?: string | null;
  className?: string;
  testId?: string;
  onPick?: (weapon: Weapon) => void;
  /** Fits the gun without asking the player to choose a bay. */
  onAutoFit?: (weapon: Weapon) => void;
  onInspect?: (weapon: Weapon) => void;
  onHover?: (hovered: boolean) => void;
  onWeaponDragStart?: (weapon: Weapon, event: DragEvent<HTMLButtonElement>) => void;
}

export function WeaponCard({
  catalog,
  weapon,
  chassisFaction,
  stock,
  selected = false,
  inspected = false,
  unavailableReason = null,
  className = '',
  testId,
  onPick,
  onAutoFit,
  onInspect,
  onHover,
  onWeaponDragStart,
}: WeaponCardProps) {
  const category = weaponCategory(catalog, weapon);
  const faction = factionPresentation(weapon.faction);
  const foreign =
    chassisFaction === undefined
      ? null
      : foreignComponentPresentation(weapon.faction, chassisFaction);
  const exhausted = stock !== undefined && stock <= 0;
  const unavailable = exhausted || unavailableReason !== null;
  const reason = unavailableReason ?? (exhausted ? `No ${weapon.name} left in stores.` : null);
  const fitLabel = unavailable ? "Doesn't fit" : 'Fit';
  const fitDetail = reason ?? 'Ready to place.';
  const statusId = `weapon-card-${weapon.id}-fit`;
  const detailId = `weapon-card-${weapon.id}-fit-detail`;
  const metrics = weaponMetrics(weapon);
  const classes = [
    'weapon-card',
    'weapon-card--compact',
    faction.className,
    selected ? 'is-selected' : '',
    inspected ? 'is-inspected' : '',
    unavailable ? 'is-unavailable' : '',
    foreign ? 'is-foreign' : '',
    className,
  ].filter(Boolean);

  return (
    <article
      className={classes.join(' ')}
      data-testid={`weapon-card-${weapon.id}`}
      data-weapon-category={category}
      data-faction={weapon.faction}
      data-fit={unavailable ? 'false' : 'true'}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      <button
        type="button"
        className="weapon-card__pick"
        data-testid={testId}
        draggable={!unavailable}
        aria-pressed={selected}
        aria-current={inspected ? 'true' : undefined}
        aria-disabled={unavailable || undefined}
        aria-controls="bay-shelf-inspector"
        aria-describedby={`${statusId} ${detailId}`}
        aria-label={`${weapon.name}, ${faction.label}, ${weaponCategoryLabel(category)}, ${fitLabel}`}
        title={reason ?? undefined}
        onFocus={() => {
          onInspect?.(weapon);
          onHover?.(true);
        }}
        onBlur={() => onHover?.(false)}
        onClick={() => {
          onInspect?.(weapon);
          if (!unavailable) onPick?.(weapon);
        }}
        onDragStart={(event) => {
          if (unavailable) {
            event.preventDefault();
            return;
          }
          onInspect?.(weapon);
          event.dataTransfer.setData(
            'application/wreckright',
            JSON.stringify({ kind: 'weapon', id: weapon.id }),
          );
          event.dataTransfer.effectAllowed = 'copy';
          onWeaponDragStart?.(weapon, event);
        }}
      >
        <span className="weapon-card__heading">
          <WeaponGlyph catalog={catalog} weapon={weapon} />
          <span className="weapon-card__identity">
            <strong>{weapon.name}</strong>
            <span className="weapon-card__category">
              {weaponCategoryLabel(category)} · {faction.label}
            </span>
            {foreign === null ? null : (
              <span className="weapon-card__foreign-badge" title={foreign.note}>
                {foreign.badge}
              </span>
            )}
          </span>
          {stock === undefined ? null : (
            <span className="weapon-card__stock">×{Math.max(0, stock)}</span>
          )}
        </span>

        <span className="weapon-card__quick-stats" aria-label="Weapon summary">
          <span>
            {formatWeaponNumber(weapon.tonnage)}t · {weapon.slots} slot
            {weapon.slots === 1 ? '' : 's'}
          </span>
          <span>{formatWeaponNumber(metrics.damage)}/s damage</span>
          <span>{formatWeaponNumber(metrics.reach)}m reach</span>
          <span>{formatWeaponNumber(metrics.heat)}/s heat</span>
        </span>
        <span className={`weapon-card__fit ${unavailable ? 'is-blocked' : 'is-fit'}`}>
          <strong id={statusId}>{fitLabel}</strong>
          <span id={detailId}>{fitDetail}</span>
        </span>
      </button>
      {unavailable || onAutoFit === undefined ? null : (
        <button
          type="button"
          className="weapon-card__autofit"
          data-testid={testId === undefined ? undefined : `autofit-${testId}`}
          aria-label={`Fit ${weapon.name} in the best location`}
          onClick={() => onAutoFit(weapon)}
        >
          Fit it for me
        </button>
      )}
    </article>
  );
}

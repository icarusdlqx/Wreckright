import { useEffect, useMemo, useState } from 'react';
import type { Chassis } from '../../schema/chassis';
import type { MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import {
  ammoShelfWeapons,
  remainingInventory,
  type BayInventory,
} from './bayFit';
import { Dossier, type Inspected } from './Dossier';
import type { DropPayload } from './LocationCard';
import { mountedWeaponProfiles as resolveMountedWeaponProfiles } from './rangeDamageChartModel';
import { shelfFit, swapFit, type SwapRequest } from './shelfFit';
import { ShelfItem } from './ShelfItem';
import { ShelfToolbar } from './ShelfToolbar';
import {
  shelfSearchMatches,
  weaponMatchesShelfFilters,
  type WeaponCategoryFilter,
} from './shelfFilter';
import { WeaponCard } from './WeaponCard';
import { WEAPON_CATEGORIES, weaponCatalogMedians, weaponCategory } from './weaponPresentation';
import './storeShelf.css';

export type Shelf = 'weapons' | 'ammo' | 'equipment';

interface Props {
  catalog: Catalog;
  chassis: Chassis;
  design: Design;
  inventory: BayInventory;
  shelf: Shelf;
  showAll: boolean;
  selectedLocation: MechLocation | null;
  armed: DropPayload | null;
  inspected: Inspected | null;
  /** While set, the weapons tab lists replacements for one fitted gun. */
  swap?: SwapRequest | null;
  onShelfChange: (shelf: Shelf) => void;
  onShowAllChange: (show: boolean) => void;
  onClearLocation: () => void;
  onInspect: (payload: DropPayload) => void;
  onArm: (payload: DropPayload) => void;
  onAutoFit: (payload: DropPayload) => void;
  onHoverWeapon: (weaponId: string | null) => void;
  onSwapPick?: (weaponId: string) => void;
  onCancelSwap?: () => void;
}

export function StoreShelf({
  catalog,
  chassis,
  design,
  inventory,
  shelf,
  showAll,
  selectedLocation,
  armed,
  inspected,
  swap = null,
  onShelfChange,
  onShowAllChange,
  onClearLocation,
  onInspect,
  onArm,
  onAutoFit,
  onHoverWeapon,
  onSwapPick,
  onCancelSwap,
}: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<WeaponCategoryFilter>('all');
  useEffect(() => {
    setQuery('');
    setCategory('all');
  }, [chassis.id]);

  const remaining = useMemo(() => remainingInventory(inventory, design), [inventory, design]);
  const medians = useMemo(() => weaponCatalogMedians(catalog), [catalog]);
  const mountedWeaponProfiles = useMemo(
    () => resolveMountedWeaponProfiles(catalog, design.mounts),
    [catalog, design],
  );
  const mountedWeapons = useMemo(
    () => mountedWeaponProfiles.map(({ weapon }) => weapon),
    [mountedWeaponProfiles],
  );
  const mountedWeaponIds = useMemo(
    () => new Set(mountedWeapons.map((weapon) => weapon.id)),
    [mountedWeapons],
  );
  const knownWeapons = useMemo(
    () =>
      [...catalog.weapons.values()].filter(
        (weapon) => inventory === undefined || inventory.weapon.has(weapon.id),
      ),
    [catalog, inventory],
  );
  const weaponRows = useMemo(
    () =>
      knownWeapons.map((weapon) => ({
        weapon,
        fit: swap === null
          ? shelfFit(catalog, design, { kind: 'weapon', id: weapon.id }, inventory, selectedLocation)
          : swapFit(catalog, design, swap, weapon.id, inventory),
      })),
    [catalog, design, inventory, knownWeapons, selectedLocation, swap],
  );
  // A swap lists only guns that could take the mount; the one already in it is not a swap.
  const availableWeaponRows = weaponRows.filter(
    ({ weapon, fit }) =>
      swap === null
        ? showAll || fit.ok || (selectedLocation === null && mountedWeaponIds.has(weapon.id))
        : weapon.id !== swap.weaponId && (showAll || fit.ok),
  );
  const categoryOrder = new Map(WEAPON_CATEGORIES.map((entry, index) => [entry.id, index]));
  const visibleWeaponRows = availableWeaponRows
    .filter(({ weapon }) => weaponMatchesShelfFilters(catalog, weapon, query, category))
    .sort(
      (left, right) =>
        (categoryOrder.get(weaponCategory(catalog, left.weapon)) ?? 0) -
        (categoryOrder.get(weaponCategory(catalog, right.weapon)) ?? 0),
    );
  const categories = WEAPON_CATEGORIES.filter((entry) =>
    knownWeapons.some((weapon) => weaponCategory(catalog, weapon) === entry.id),
  );
  const ammoRows = ammoShelfWeapons(catalog, design)
    .map((weapon) => ({
      weapon,
      fit: shelfFit(
        catalog,
        design,
        { kind: 'ammo', id: weapon.id },
        inventory,
        selectedLocation,
      ),
    }))
    .filter(({ fit }) => showAll || fit.ok)
    .filter(({ weapon }) =>
      shelfSearchMatches(query, weapon.name, weapon.type, `${weapon.ammoPerTon ?? 0} rounds`));
  const knownGear = [...catalog.equipment.values()].filter(
    (entry) =>
      entry.category !== 'heat_sink'
      && (inventory === undefined || inventory.equipment.has(entry.id)),
  );
  const gearRows = knownGear
    .map((equipment) => ({
      equipment,
      fit: shelfFit(
        catalog,
        design,
        { kind: 'equipment', id: equipment.id },
        inventory,
        selectedLocation,
      ),
    }))
    .filter(({ fit }) => showAll || fit.ok)
    .filter(({ equipment }) =>
      shelfSearchMatches(query, equipment.name, equipment.category, equipment.faction));
  const selectedName = selectedLocation?.replaceAll('_', ' ') ?? null;
  const swapLabel = swap === null
    ? null
    : `${catalog.weapons.get(swap.weaponId)?.name ?? swap.weaponId} in ${swap.location.replaceAll('_', ' ')}`;
  const expectedKind = shelf === 'weapons' ? 'weapon' : shelf === 'ammo' ? 'ammo' : 'equipment';
  const matchingInspected = inspected?.kind === expectedKind ? inspected : null;
  const defaultInspected: Inspected | null =
    shelf === 'weapons'
      ? visibleWeaponRows[0] === undefined
        ? null
        : { kind: 'weapon', id: visibleWeaponRows[0].weapon.id }
      : shelf === 'ammo'
        ? ammoRows[0] === undefined
          ? null
          : { kind: 'ammo', id: ammoRows[0].weapon.id }
        : gearRows[0] === undefined
          ? null
          : { kind: 'equipment', id: gearRows[0].equipment.id };
  const inspector = matchingInspected ?? defaultInspected;
  const inspectorFit = inspector?.kind === 'weapon'
    ? (weaponRows.find(({ weapon }) => weapon.id === inspector.id)?.fit ?? null)
    : inspector?.kind === 'ammo'
      ? (ammoRows.find(({ weapon }) => weapon.id === inspector.id)?.fit ?? null)
      : inspector?.kind === 'equipment'
        ? (gearRows.find(({ equipment }) => equipment.id === inspector.id)?.fit ?? null)
        : null;
  const resultLabel =
    shelf === 'weapons'
      ? `${visibleWeaponRows.length} of ${knownWeapons.length} weapons · ${swap === null ? (showAll ? 'all fit states' : 'fits only') : 'swap candidates'}`
      : shelf === 'ammo'
        ? `${ammoRows.length} of ${ammoShelfWeapons(catalog, design).length} ammo bins · ${showAll ? 'all fit states' : 'fits only'}`
        : `${gearRows.length} of ${knownGear.length} gear items · ${showAll ? 'all fit states' : 'fits only'}`;

  return (
    <section className="bay-side bay-catalog" data-testid="bay-shelf">
      <ShelfToolbar
        faction={chassis.faction}
        shelf={shelf}
        query={query}
        category={category}
        categories={categories}
        showAll={showAll}
        selectedName={selectedName}
        swapLabel={swapLabel}
        resultLabel={resultLabel}
        onShelfChange={onShelfChange}
        onQueryChange={setQuery}
        onCategoryChange={setCategory}
        onShowAllChange={onShowAllChange}
        onClearLocation={onClearLocation}
        onCancelSwap={onCancelSwap}
      />

      <Dossier
        catalog={catalog}
        inspected={inspector}
        heatSinkId={design.heatSinkId}
        mountedWeapons={mountedWeapons}
        mountedWeaponProfiles={mountedWeaponProfiles}
        chassisFaction={chassis.faction}
        fit={inspectorFit}
      />

      <div
        id="bay-shelf-results"
        className="bay-stocks"
        data-testid="bay-stocks"
        role="tabpanel"
        aria-labelledby={`shelf-tab-${shelf}`}
      >
        {shelf === 'weapons' ? (
          visibleWeaponRows.length === 0 ? (
            <p className="bay-shelf-empty">
              No weapons match these filters. Clear the search or include Doesn't fit.
            </p>
          ) : (
            <ul className="weapon-catalog-list">
              {visibleWeaponRows.map(({ weapon, fit }) => (
                <li key={weapon.id}>
                  <WeaponCard
                    catalog={catalog}
                    weapon={weapon}
                    medians={medians}
                    chassisFaction={chassis.faction}
                    stock={remaining?.weapon.get(weapon.id)}
                    selected={armed?.kind === 'weapon' && armed.id === weapon.id}
                    inspected={inspector?.kind === 'weapon' && inspector.id === weapon.id}
                    unavailableReason={fit.ok ? null : fit.reason}
                    testId={`stock-weapon-${weapon.id}`}
                    onInspect={() => onInspect({ kind: 'weapon', id: weapon.id })}
                    onPick={() => swap === null
                      ? onArm({ kind: 'weapon', id: weapon.id })
                      : onSwapPick?.(weapon.id)}
                    onAutoFit={swap === null
                      ? () => onAutoFit({ kind: 'weapon', id: weapon.id })
                      : undefined}
                    onHover={(hovered) => onHoverWeapon(hovered ? weapon.id : null)}
                  />
                </li>
              ))}
            </ul>
          )
        ) : null}

        {shelf === 'ammo' ? (
          <ul className="bay-simple-stocks">
            {ammoRows.map(({ weapon, fit }) => (
              <ShelfItem
                key={weapon.id}
                payload={{ kind: 'ammo', id: weapon.id }}
                label={`${weapon.name} ammunition`}
                detail={`1 ton · ${weapon.ammoPerTon ?? 0} rounds`}
                fit={fit}
                armed={armed?.kind === 'ammo' && armed.id === weapon.id}
                inspected={inspector?.kind === 'ammo' && inspector.id === weapon.id}
                onInspect={onInspect}
                onArm={onArm}
                onAutoFit={onAutoFit}
              />
            ))}
          </ul>
        ) : null}

        {shelf === 'equipment' ? (
          <ul className="bay-simple-stocks">
            {gearRows.map(({ equipment: entry, fit }) => (
              <ShelfItem
                key={entry.id}
                payload={{ kind: 'equipment', id: entry.id }}
                label={entry.name}
                detail={`${entry.tonnage}t · ${entry.slots} slot${entry.slots === 1 ? '' : 's'}`}
                stock={remaining?.equipment.get(entry.id)}
                fit={fit}
                armed={armed?.kind === 'equipment' && armed.id === entry.id}
                inspected={inspector?.kind === 'equipment' && inspector.id === entry.id}
                onInspect={onInspect}
                onArm={onArm}
                onAutoFit={onAutoFit}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

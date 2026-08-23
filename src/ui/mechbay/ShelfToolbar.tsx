import type { KeyboardEvent } from 'react';
import type { Faction } from '../../schema/faction';
import { MachineCultureBadge } from './MachineCultureBadge';
import type { Shelf } from './StoreShelf';
import type { WeaponCategoryFilter } from './shelfFilter';
import type { WeaponCategory } from './weaponPresentation';

const TABS: readonly { id: Shelf; label: string }[] = [
  { id: 'weapons', label: 'Weapons' },
  { id: 'ammo', label: 'Ammo' },
  { id: 'equipment', label: 'Gear' },
];

export function ShelfToolbar({
  faction,
  shelf,
  query,
  category,
  categories,
  showAll,
  selectedName,
  resultLabel,
  onShelfChange,
  onQueryChange,
  onCategoryChange,
  onShowAllChange,
  onClearLocation,
}: {
  faction: Faction;
  shelf: Shelf;
  query: string;
  category: WeaponCategoryFilter;
  categories: readonly { id: WeaponCategory; label: string }[];
  showAll: boolean;
  selectedName: string | null;
  resultLabel: string;
  onShelfChange: (shelf: Shelf) => void;
  onQueryChange: (query: string) => void;
  onCategoryChange: (category: WeaponCategoryFilter) => void;
  onShowAllChange: (show: boolean) => void;
  onClearLocation: () => void;
}) {
  const searchNoun = shelf === 'weapons' ? 'weapons' : shelf === 'ammo' ? 'ammo bins' : 'gear';
  const activate = (next: Shelf) => {
    onQueryChange('');
    onCategoryChange('all');
    onShelfChange(next);
  };
  const moveTabFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]',
    );
    buttons?.[next]?.focus();
    const nextShelf = TABS[next];
    if (nextShelf !== undefined) activate(nextShelf.id);
  };
  return (
    <div className="bay-shelf-head">
      <div className="bay-shelf-tabs" role="tablist" aria-label="Mechbay catalog">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            id={`shelf-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={shelf === tab.id}
            aria-controls="bay-shelf-results"
            tabIndex={shelf === tab.id ? 0 : -1}
            className={shelf === tab.id ? 'active' : ''}
            onClick={() => activate(tab.id)}
            onKeyDown={(event) => moveTabFocus(event, index)}
            data-testid={`shelf-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <MachineCultureBadge
        faction={faction}
        compact
        showFitGuide
        testId="machine-culture-shelf"
      />

      {selectedName === null ? null : (
        <div className="bay-location-filter" data-testid="bay-location-filter">
          <span>Fitting {selectedName}</span>
          <button type="button" onClick={onClearLocation}>Clear filter</button>
        </div>
      )}

      <div className="bay-catalog-toolbar">
        <label className="bay-catalog-search">
          <span>Find</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={`Search ${searchNoun}`}
            data-testid="shelf-search"
          />
        </label>

        {shelf !== 'weapons' ? null : (
          <label className="bay-catalog-family">
            <span>Family</span>
            <select
              value={category}
              onChange={(event) => onCategoryChange(event.target.value as WeaponCategoryFilter)}
              data-testid="shelf-family"
            >
              <option value="all">All families</option>
              {categories.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <label className="bay-show-all">
        <input
          type="checkbox"
          checked={showAll}
          onChange={(event) => onShowAllChange(event.target.checked)}
          data-testid="shelf-show-all"
        />
        Include Doesn't fit
      </label>

      <p className="bay-catalog-count" role="status" aria-live="polite">
        {resultLabel}
      </p>
    </div>
  );
}

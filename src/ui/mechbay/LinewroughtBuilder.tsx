import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import { useDialogFocus } from '../useDialogFocus';
import {
  createLinewroughtDraft,
  defaultLinewroughtName,
  linewroughtRecipes,
  listLinewroughtFrames,
  type LinewroughtBuilderMode,
} from './linewroughtBuilderModel';
import './linewroughtBuilder.css';

export interface LinewroughtBuilderProps {
  readonly catalog: Catalog;
  readonly initialChassisId?: string;
  readonly onCancel: () => void;
  readonly onCreate: (design: Design) => void;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function LinewroughtBuilder({
  catalog,
  initialChassisId,
  onCancel,
  onCreate,
}: LinewroughtBuilderProps) {
  const titleId = useId();
  const explanationId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(dialogRef, closeRef, onCancel);
  const frames = useMemo(() => listLinewroughtFrames(catalog), [catalog]);
  const initialFrame = frames.find((entry) => entry.chassis.id === initialChassisId) ?? frames[0];
  const [chassisId, setChassisId] = useState(initialFrame?.chassis.id ?? '');
  const [mode, setMode] = useState<LinewroughtBuilderMode>('bare');
  const [name, setName] = useState(
    initialFrame === undefined ? '' : defaultLinewroughtName(initialFrame.chassis),
  );
  const selectedFrame = frames.find((entry) => entry.chassis.id === chassisId) ?? frames[0];
  const recipes = selectedFrame === undefined
    ? []
    : linewroughtRecipes(catalog, selectedFrame.chassis.id);
  const [recipeId, setRecipeId] = useState(
    initialFrame === undefined
      ? ''
      : linewroughtRecipes(catalog, initialFrame.chassis.id)[0]?.id ?? '',
  );

  const selectFrame = (nextChassisId: string): void => {
    const nextFrame = frames.find((entry) => entry.chassis.id === nextChassisId);
    if (nextFrame === undefined) return;
    setChassisId(nextFrame.chassis.id);
    setName(defaultLinewroughtName(nextFrame.chassis));
    setRecipeId(linewroughtRecipes(catalog, nextFrame.chassis.id)[0]?.id ?? '');
  };

  const selectMode = (nextMode: LinewroughtBuilderMode): void => {
    setMode(nextMode);
    if (nextMode === 'recipe' && recipeId === '') setRecipeId(recipes[0]?.id ?? '');
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (selectedFrame === undefined || name.trim() === '') return;
    onCreate(createLinewroughtDraft(catalog, {
      chassisId: selectedFrame.chassis.id,
      mode,
      name,
      recipeId: mode === 'recipe' ? recipeId : undefined,
    }));
  };

  return (
    <div className="linewrought-builder__backdrop" data-testid="linewrought-builder-backdrop">
      <section
        ref={dialogRef}
        className="linewrought-builder"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={explanationId}
        data-testid="linewrought-builder"
      >
        <header className="linewrought-builder__header">
          <div>
            <p className="linewrought-builder__eyebrow">Linewrought construction</p>
            <h2 id={titleId}>Start a shopbuilt mech</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onCancel}
            aria-label="Close Linewrought builder"
          >
            Close
          </button>
        </header>

        <p id={explanationId} className="linewrought-builder__explanation">
          Choose a salvaged mech frame, then build what the grade shop can change. The frame,
          engine, hardpoint locations, and hardpoint sizes stay fixed; weapons, ammunition,
          equipment, cooling, and armour are yours to refit in the bay.
        </p>

        {selectedFrame === undefined ? (
          <div className="linewrought-builder__empty" role="status">
            No Linewrought mech frames are available in this catalog.
          </div>
        ) : (
          <form onSubmit={submit}>
            <fieldset className="linewrought-builder__frames">
              <legend>1. Pick a salvaged frame</legend>
              <div className="linewrought-builder__frame-grid">
                {frames.map((frame) => {
                  const selected = frame.chassis.id === selectedFrame.chassis.id;
                  return (
                    <label
                      key={frame.chassis.id}
                      className={`linewrought-frame${selected ? ' is-selected' : ''}`}
                      data-testid={`linewrought-frame-${frame.chassis.id}`}
                    >
                      <input
                        type="radio"
                        name="linewrought-frame"
                        value={frame.chassis.id}
                        checked={selected}
                        onChange={() => selectFrame(frame.chassis.id)}
                      />
                      <span className="linewrought-frame__heading">
                        <strong>{frame.chassis.name}</strong>
                        <span>{frame.chassis.class} · {frame.tonnage}t</span>
                      </span>
                      <span className="linewrought-frame__summary">{frame.chassis.summary}</span>
                      <span className="linewrought-frame__numbers">
                        <span><b>{frame.walkSpeed.toFixed(0)}</b> m/s</span>
                        <span><b>{frame.totalSlots}</b> slots</span>
                        <span><b>{frame.activeArmourCapacity}</b> armour max</span>
                        <span><b>{frame.chassis.jumpCapable ? 'Jump-ready' : 'Grounded'}</b> frame</span>
                      </span>
                      <span className="linewrought-frame__hardpoints" aria-label="Hardpoint capacity">
                        {frame.hardpoints.map((hardpoint) => (
                          <span key={hardpoint.type}>
                            {capitalise(hardpoint.type)} {hardpoint.count}
                            {hardpoint.maximumSize === null ? ' · none' : ` · size ${hardpoint.maximumSize} max`}
                          </span>
                        ))}
                      </span>
                      <span className="linewrought-frame__comparison is-strength">
                        <b>Strong suit</b>{frame.strongSuit}
                      </span>
                      <span className="linewrought-frame__comparison is-tradeoff">
                        <b>Tradeoff</b>{frame.tradeoff}
                      </span>
                      {frame.traits.length === 0 ? null : (
                        <span className="linewrought-frame__traits" aria-label="Fixed frame traits">
                          {frame.traits.map((trait) => (
                            <span key={trait.id} title={trait.note}>{trait.label}</span>
                          ))}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="linewrought-builder__modes">
              <legend>2. Choose a starting point</legend>
              <label className={mode === 'bare' ? 'is-selected' : undefined}>
                <input
                  type="radio"
                  name="linewrought-mode"
                  value="bare"
                  checked={mode === 'bare'}
                  onChange={() => selectMode('bare')}
                />
                <span>
                  <strong>Bare gantry</strong>
                  Start with the frame's internal cooling and empty fittings. You choose every part.
                </span>
              </label>
              <label className={mode === 'recipe' ? 'is-selected' : undefined}>
                <input
                  type="radio"
                  name="linewrought-mode"
                  value="recipe"
                  checked={mode === 'recipe'}
                  disabled={recipes.length === 0}
                  onChange={() => selectMode('recipe')}
                />
                <span>
                  <strong>Workshop recipe</strong>
                  Copy a proven authored loadout on this frame, then change it in the bay.
                </span>
              </label>
            </fieldset>

            <div className="linewrought-builder__finish">
              {mode === 'recipe' ? (
                <label>
                  Workshop recipe
                  <select
                    value={recipeId}
                    onChange={(event) => setRecipeId(event.target.value)}
                    required
                    data-testid="linewrought-recipe"
                  >
                    {recipes.map((recipe) => (
                      <option key={recipe.id} value={recipe.id}>{recipe.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label>
                New machine name
                <input
                  type="text"
                  value={name}
                  maxLength={64}
                  required
                  onChange={(event) => setName(event.target.value)}
                  data-testid="linewrought-name"
                />
              </label>
            </div>

            <p className="linewrought-builder__boundary" role="note">
              This builds on an authored salvage frame. It does not create new chassis geometry,
              engines, or hardpoint locations.
            </p>

            <footer className="linewrought-builder__actions">
              <button type="button" onClick={onCancel}>Cancel</button>
              <button
                type="submit"
                className="is-primary"
                disabled={name.trim() === '' || (mode === 'recipe' && recipeId === '')}
                data-testid="linewrought-create"
              >
                Create shopbuilt draft
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}

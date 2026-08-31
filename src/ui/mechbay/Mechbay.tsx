import { useMemo, useRef, useState } from 'react';
import type { AudioDirector } from '../audio';
import type { MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import { validateDesign } from '../../schema/designValidation';
import type { RefitAvailability } from '../../campaign/refitQuote';
import { getCatalog } from '../../schema/load';
import { computeHeatProfile, computeLoadout } from '../../sim/loadout';
import { setName } from './editor';
import { BayChrome, type BayStatus } from './BayChrome';
import {
  BayWorkspacePanel,
  BayWorkspaceTabs,
  type BayWorkspaceTab,
} from './BayWorkspaceTabs';
import { BuildReview } from './BuildReview';
import { BuildCompare } from './BuildCompare';
import { CoolingBank } from './CoolingBank';
import { ArmourWorkbench } from './ArmourWorkbench';
import {
  beginDesignHistory,
  finishDesignTransaction,
  previewDesign,
  pushDesign,
  redoDesign,
  undoDesign,
} from './designHistory';
import {
  bestAmmoLocation,
  bestLocationFor,
  compatibleFrom,
  fitByLocation,
} from './autoFit';
import { evaluateEdit, type EditEvaluation, type EditIntent } from './editPreview';
import { LoadoutGrid } from './LoadoutGrid';
import { MECH_LOCATION_NAMES, type DropPayload } from './LocationCard';
import { MachinePanel } from './MachinePanel';
import { evaluateDrop } from './mechbayEdits';
import { StoreShelf, type Shelf } from './StoreShelf';
import { useArmedPlacementFocus } from './useArmedPlacementFocus';
import './mechbayWorkspaceLayout.css';
import './quietBay.css';
import { useMechbayScore } from './useMechbayScore';
import { useMechbayPersistence } from './useMechbayPersistence';
import { useQuietBay } from './useQuietBay';

const catalog = getCatalog();
export interface BayCommission {
  title: string;
  design: Design;
  cancelLabel?: string;
  /** Omitted for the unlimited skirmish workshop. */
  inventory?: RefitAvailability;
  onCommit: (design: Design) => { ok: boolean; reason: string | null };
  onCancel: () => void;
}
export function Mechbay({
  onExit,
  commission,
  battleAudio,
  onBattleMuted,
}: {
  onExit: () => void;
  commission?: BayCommission;
  battleAudio?: AudioDirector;
  onBattleMuted?: (muted: boolean) => void;
}) {
  const initial = commission?.design ?? catalog.designs.get('sentinel_brawler');
  if (initial === undefined) throw new Error('missing default mechbay design');

  const [history, setHistory] = useState(() => beginDesignHistory(initial));
  const design = history.present;
  const [status, setStatus] = useState<BayStatus | null>(null);
  const [shelf, setShelf] = useState<Shelf>('weapons');
  const [inspected, setInspected] = useState<DropPayload | null>(null);
  const [armed, setArmed] = useState<DropPayload | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<MechLocation | null>(null);
  const [hoveredLocation, setHoveredLocation] = useState<MechLocation | null>(null);
  const [workspace, setWorkspace] = useState<BayWorkspaceTab>('loadout');
  const quietBay = useQuietBay(armed);
  const bayRef = useRef<HTMLDivElement>(null);

  const replace = (next: Design): void => {
    setSelectedLocation(null);
    setHoveredLocation(null);
    setArmed(null);
    quietBay.clearDrag();
    setInspected(null);
    setShowAll(false);
    setWorkspace('loadout');
    quietBay.resetSnap();
    setHistory(beginDesignHistory(next));
    setStatus(null);
  };
  const persistence = useMechbayPersistence({
    catalog,
    design,
    commission,
    onReplace: replace,
    onStatus: setStatus,
  });

  const chassis = catalog.chassis.get(design.chassisId);
  const score = useMechbayScore(chassis?.faction ?? null, battleAudio, onBattleMuted);
  const loadout = useMemo(() => computeLoadout(catalog, design), [design]);
  const heat = useMemo(() => computeHeatProfile(catalog, design), [design]);
  const report = useMemo(() => validateDesign(catalog, design), [design]);
  const saveable = report.valid;
  const inventory = commission?.inventory;
  const targeting = quietBay.targeting;
  // One pass over the eight locations serves both jobs: which to highlight, and
  // what to tell the player about the ones that refused.
  const locationFits = useMemo(
    () => fitByLocation(catalog, design, targeting, inventory),
    [design, targeting, inventory],
  );
  const compatible = useMemo(() => new Set(compatibleFrom(locationFits)), [locationFits]);

  useArmedPlacementFocus({
    armed,
    bayRef,
    compatibleLocations: compatible,
    selectedLocation,
  });

  if (chassis === undefined) return <div className="bay">unknown chassis {design.chassisId}</div>;

  const commitDraft = (next: Design): void => {
    if (next.chassisId !== design.chassisId) {
      setSelectedLocation(null);
      setHoveredLocation(null);
      setArmed(null);
      quietBay.clearDrag();
      setInspected(null);
      setShowAll(false);
    }
    setHistory((current) => pushDesign(current, next));
    setStatus(null);
  };

  const previewDraft = (transaction: string, next: Design): void => {
    setHistory((current) => previewDesign(current, transaction, next));
    setStatus(null);
  };
  const navigateHistory = (direction: 'undo' | 'redo'): void => {
    setHistory((current) => direction === 'undo' ? undoDesign(current) : redoDesign(current));
    setArmed(null);
    setStatus({ tone: 'ok', text: direction === 'undo' ? 'Last fit undone.' : 'Fit restored.' });
  };

  const acceptEvaluation = (
    evaluation: EditEvaluation,
    location: MechLocation | null = null,
  ): boolean => {
    if (evaluation.status === 'blocked') {
      if (location !== null) setSelectedLocation(location);
      setStatus({
        tone: 'error',
        text: evaluation.reasons[0]?.message ?? 'That change cannot be made.',
      });
      return false;
    }

    if (evaluation.status === 'needs_ammo') {
      const { weaponId, locations } = evaluation.continuation;
      const weaponName = catalog.weapons.get(weaponId)?.name ?? weaponId;
      // A gun with no feed is not a decision, it is a chore. Stow the first ton
      // somewhere survivable and say where it went; moving or removing it is
      // still one click, and the player never meets an illegal build they did
      // not ask for.
      const berth = bestAmmoLocation(catalog, evaluation.nextDesign, locations);
      const stowed =
        berth === null
          ? null
          : evaluateEdit(
              catalog,
              evaluation.nextDesign,
              { type: 'add_ammo', weaponId, location: berth },
              inventory,
            );

      if (berth !== null && stowed?.status === 'applied') {
        commitDraft(stowed.nextDesign);
        if (location !== null) setSelectedLocation(location);
        setArmed(null);
        setStatus({
          tone: 'ok',
          text: `${weaponName} fitted — one ton of ammunition stowed in the ${MECH_LOCATION_NAMES[berth].toLowerCase()}.`,
        });
        return true;
      }

      // No berth would take it automatically; fall back to letting the player place it.
      commitDraft(evaluation.nextDesign);
      const payload: DropPayload = { kind: 'ammo', id: weaponId };
      setSelectedLocation(null);
      setShelf('ammo');
      setInspected(payload);
      setArmed(payload);
      setStatus({ tone: 'ok', text: evaluation.reasons[0]?.message ?? 'Choose an ammunition bin.' });
      return true;
    }

    commitDraft(evaluation.nextDesign);

    if (location !== null) setSelectedLocation(location);
    setArmed(null);
    setStatus(null);
    return true;
  };

  const applyIntent = (intent: EditIntent): boolean =>
    acceptEvaluation(evaluateEdit(catalog, design, intent, inventory));

  const onDrop = (payload: DropPayload, location: MechLocation): void => {
    const accepted = acceptEvaluation(
      evaluateDrop(catalog, design, payload, location, inventory),
      location,
    );
    quietBay.clearDrag();
    if (!accepted) return;
    quietBay.recordFit(location, payload);
  };

  // Auto-fit removes a low-value berth choice while manual dragging remains available.
  const autoFit = (payload: DropPayload): void => {
    const fits = fitByLocation(catalog, design, payload, inventory);
    const berth = bestLocationFor(catalog, design, payload, fits);
    if (berth === null) {
      const refusal = [...fits.values()].find((fit) => !fit.ok)?.reason;
      setStatus({ tone: 'error', text: refusal ?? 'Nothing on this machine will take that.' });
      return;
    }
    onDrop(payload, berth);
  };

  const selectLocation = (location: MechLocation): void => {
    if (armed !== null) {
      onDrop(armed, location);
      return;
    }
    setSelectedLocation((current) => current === location ? null : location);
    setShelf('weapons');
  };

  return (
    <div
      ref={bayRef}
      className="bay bay--workspace"
      data-testid="mechbay"
      data-workspace={workspace}
      onDragStart={(event) => quietBay.beginDrag(
        event.dataTransfer.getData('application/wreckright'))}
      onDragEnd={quietBay.clearDrag}
      onDrop={quietBay.clearDrag}
    >
      <BayChrome
        catalog={catalog}
        design={design}
        {...(commission === undefined ? {} : {
          commissionTitle: commission.title,
          commissionCancelLabel: commission.cancelLabel,
        })}
        stored={persistence.stored}
        saveable={saveable}
        status={status}
        muted={score.muted}
        onToggleMuted={score.toggleMuted}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={() => navigateHistory('undo')}
        onRedo={() => navigateHistory('redo')}
        onNameChange={(name) => previewDraft('name', setName(design, name))}
        onDesignPick={replace}
        onReset={() => {
          const factory = [...catalog.designs.values()].find(
            (entry) => entry.chassisId === design.chassisId,
          );
          if (factory === undefined) return;
          commitDraft(structuredClone(factory));
          setStatus({ tone: 'ok', text: `Back to the stock ${factory.name} loadout.` });
        }}
        onExit={commission?.onCancel ?? onExit}
        onSave={persistence.save}
        onExport={persistence.exportFile}
        onImport={(file) => void persistence.importFile(file)}
        onLoad={persistence.load}
      />
      <BayWorkspaceTabs
        active={workspace}
        issueCount={report.issues.length}
        onSelect={setWorkspace}
      />

      <BayWorkspacePanel tab="loadout" active={workspace === 'loadout'}>
        <MachinePanel
          catalog={catalog}
          chassis={chassis}
          design={design}
          loadout={loadout}
          heat={heat}
          issues={report.issues}
          selectedLocation={selectedLocation}
          hoveredLocation={hoveredLocation}
          compatibleLocations={compatible}
          cultureExpanded={quietBay.cultureExpanded}
          onCultureExpandedChange={quietBay.setCultureExpanded}
          onSelectLocation={selectLocation}
          onHoverLocation={setHoveredLocation}
        />
        <LoadoutGrid
          catalog={catalog}
          chassis={chassis}
          design={design}
          loadout={loadout}
          armed={armed}
          targeting={targeting}
          guideExpanded={quietBay.guideExpanded}
          snapLocation={quietBay.snapLocation}
          snapTarget={quietBay.snapTarget}
          snapPhase={quietBay.snapPhase}
          selectedLocation={selectedLocation}
          hoveredLocation={hoveredLocation}
          compatibleLocations={compatible}
          locationFits={locationFits}
          onCancelArmed={() => setArmed(null)}
          onGuideExpandedChange={quietBay.setGuideExpanded}
          onAutoFit={autoFit}
          onDrop={onDrop}
          onRemoveMount={(index) => applyIntent({ type: 'remove_weapon', index })}
          onRemoveAmmo={(index) => {
            const bin = design.ammo[index];
            if (bin !== undefined) {
              applyIntent({ type: 'remove_ammo', weaponId: bin.weaponId, location: bin.location });
            }
          }}
          onRemoveEquipment={(index) => applyIntent({ type: 'remove_equipment', index })}
          onInspect={(payload) => { setSelectedLocation(null); setInspected(payload); setShelf(payload.kind === 'weapon' ? 'weapons' : payload.kind); }}
          onSelectLocation={selectLocation}
          onHoverLocation={setHoveredLocation}
        />
        <StoreShelf
          catalog={catalog}
          chassis={chassis}
          design={design}
          inventory={inventory}
          shelf={shelf}
          showAll={showAll}
          selectedLocation={selectedLocation}
          armed={armed}
          inspected={inspected}
          onShelfChange={setShelf}
          onShowAllChange={setShowAll}
          onClearLocation={() => setSelectedLocation(null)}
          onInspect={setInspected}
          onArm={(payload) => {
            setInspected(payload);
            setArmed(payload);
          }}
          onAutoFit={autoFit}
          onHoverWeapon={() => undefined}
        />
      </BayWorkspacePanel>

      <BayWorkspacePanel tab="armour" active={workspace === 'armour'}>
        <CoolingBank
          catalog={catalog}
          chassis={chassis}
          design={design}
          heat={heat}
          equipmentAvailability={inventory?.equipment}
          onIntent={applyIntent}
        />
        <ArmourWorkbench
          catalog={catalog}
          chassis={chassis}
          design={design}
          loadout={loadout}
          onApply={commitDraft}
          onPreview={(next) => previewDraft('armour', next)}
          onPreviewEnd={() => setHistory(
            (current) => finishDesignTransaction(current, 'armour'))}
        />
      </BayWorkspacePanel>

      <BayWorkspacePanel tab="review" active={workspace === 'review'}>
        <BuildCompare catalog={catalog} design={design} />
        <BuildReview
          catalog={catalog}
          design={design}
          loadout={loadout}
          heat={heat}
          onNavigate={setWorkspace}
        />
      </BayWorkspacePanel>
    </div>
  );
}

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
  bestLocationFor,
  compatibleFrom,
  fitByLocation,
} from './autoFit';
import { evaluateEdit, type EditIntent } from './editPreview';
import { LoadoutGrid } from './LoadoutGrid';
import type { DropPayload } from './LocationCard';
import { MachinePanel } from './MachinePanel';
import { evaluateDrop } from './mechbayEdits';
import { StoreShelf, type Shelf } from './StoreShelf';
import { createBayEditAcceptor } from './acceptBayEdit';
import { useWeaponReplacement } from './useWeaponReplacement';
import { WeaponReplacementDialog } from './WeaponReplacementDialog';
import { useArmedPlacementFocus } from './useArmedPlacementFocus';
import './mechbayWorkspaceLayout.css';
import './quietBay.css';
import { useMechbayScore } from './useMechbayScore';
import { useMechbayPersistence } from './useMechbayPersistence';
import { useQuietBay } from './useQuietBay';
import { DraftExitDialog, useDraftExit } from './useDraftExit';

const catalog = getCatalog();
export interface BayCommission {
  title: string;
  design: Design;
  cancelLabel?: string;
  initialPart?: DropPayload;
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
  const initialPart = commission?.initialPart ?? null;
  const coolingPart = initialPart?.kind === 'equipment' && catalog.equipment.get(initialPart.id)?.category === 'heat_sink';
  const [shelf, setShelf] = useState<Shelf>(initialPart?.kind === 'equipment' ? 'equipment' : 'weapons');
  const [inspected, setInspected] = useState<DropPayload | null>(initialPart);
  const [armed, setArmed] = useState<DropPayload | null>(coolingPart ? null : initialPart);
  const [showAll, setShowAll] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<MechLocation | null>(null);
  const [hoveredLocation, setHoveredLocation] = useState<MechLocation | null>(null);
  const [workspace, setWorkspace] = useState<BayWorkspaceTab>(coolingPart ? 'armour' : 'loadout');
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
    draftExit.reset(next);
    setStatus(null);
  };
  const persistence = useMechbayPersistence({
    catalog,
    design,
    commission,
    onReplace: (next, status) => draftExit.requestAction(() => {
      replace(next);
      if (status !== undefined) setStatus(status);
    }),
    onStatus: setStatus,
  });

  const draftExit = useDraftExit({ design, bayRef, onExit: commission?.onCancel ?? onExit, onSave: persistence.save });
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

  const replacement = useWeaponReplacement({
    catalog, design, inventory, targeting, onCommit: commitDraft,
    onClearDrag: quietBay.clearDrag,
    onFinished: (location, payload) => {
      setSelectedLocation(location);
      setArmed(null);
      quietBay.recordFit(location, payload);
      setStatus({ tone: 'ok', text: 'Weapon replaced in the draft. Undo restores the complete previous fit.' });
    },
  });
  useArmedPlacementFocus({
    armed,
    bayRef,
    compatibleLocations: compatible,
    selectedLocation,
    replacementMounts: replacement.fits,
  });

  if (chassis === undefined) return <div className="bay">unknown chassis {design.chassisId}</div>;

  const previewDraft = (transaction: string, next: Design): void => {
    setHistory((current) => previewDesign(current, transaction, next));
    setStatus(null);
  };
  const navigateHistory = (direction: 'undo' | 'redo'): void => {
    setHistory((current) => direction === 'undo' ? undoDesign(current) : redoDesign(current));
    setArmed(null);
    setStatus({ tone: 'ok', text: direction === 'undo' ? 'Last fit undone.' : 'Fit restored.' });
  };

  const acceptEvaluation = createBayEditAcceptor({
    catalog, inventory, commitDraft, setStatus, setSelectedLocation, setArmed, setShelf, setInspected,
  });

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
    <>
    <div
      ref={bayRef}
      inert={replacement.request !== null || draftExit.confirming || undefined}
      className="bay bay--workspace"
      data-testid="mechbay"
      data-workspace={workspace}
      data-dirty={draftExit.dirty}
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
        onDesignPick={(next) => draftExit.requestAction(() => replace(next))}
        onReset={() => {
          const factory = [...catalog.designs.values()].find(
            (entry) => entry.chassisId === design.chassisId,
          );
          if (factory === undefined) return;
          commitDraft(structuredClone(factory));
          setStatus({ tone: 'ok', text: `Back to the stock ${factory.name} loadout.` });
        }}
        onExit={draftExit.requestExit}
        onSave={draftExit.save}
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
          onReplace={replacement.open}
          replacements={replacement.fits}
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
      {draftExit.confirming ? <DraftExitDialog saveable={saveable} switching={draftExit.switching} onSave={draftExit.saveAndExit}
        onDiscard={draftExit.discard} onKeep={draftExit.keepEditing} /> : null}
      {replacement.request !== null && replacement.preview !== null ? (
        <WeaponReplacementDialog catalog={catalog} request={replacement.request} preview={replacement.preview}
          stocked={inventory !== undefined} error={replacement.error}
          onConfirm={replacement.confirm} onCancel={replacement.close} />
      ) : null}
    </>
  );
}

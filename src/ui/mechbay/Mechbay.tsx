import { useMemo, useRef, useState } from 'react';
import type { MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import { validateDesign } from '../../schema/designValidation';
import type { RefitAvailability } from '../../campaign/refitQuote';
import { getCatalog } from '../../schema/load';
import { computeHeatProfile, computeLoadout } from '../../sim/loadout';
import {
  exportDesign,
  InvalidBuildError,
  listStoredDesigns,
  loadFromStorage,
  parseDesign,
  saveToStorage,
  setName,
} from './editor';
import { BayChrome, type BayStatus } from './BayChrome';
import {
  BayWorkspacePanel,
  BayWorkspaceTabs,
  type BayWorkspaceTab,
} from './BayWorkspaceTabs';
import { BuildReview } from './BuildReview';
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
import { evaluateEdit, type EditEvaluation, type EditIntent } from './editPreview';
import { LoadoutGrid } from './LoadoutGrid';
import type { DropPayload } from './LocationCard';
import { MachinePanel } from './MachinePanel';
import { compatibleDropLocations, evaluateDrop } from './mechbayEdits';
import { StoreShelf, type Shelf } from './StoreShelf';
import { useArmedPlacementFocus } from './useArmedPlacementFocus';
import './mechbayWorkspaceLayout.css';

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

export function guidedWeaponId(
  armed: DropPayload | null,
  hoveredWeaponId: string | null,
): string | null {
  return armed?.kind === 'weapon' ? armed.id : hoveredWeaponId;
}

export function Mechbay({
  onExit,
  commission,
}: {
  onExit: () => void;
  commission?: BayCommission;
}) {
  const initial = commission?.design ?? catalog.designs.get('sentinel_brawler');
  if (initial === undefined) throw new Error('missing default mechbay design');

  const [history, setHistory] = useState(() => beginDesignHistory(initial));
  const design = history.present;
  const [status, setStatus] = useState<BayStatus | null>(null);
  const [stored, setStored] = useState<string[]>(() => listStoredDesigns());
  const [shelf, setShelf] = useState<Shelf>('weapons');
  const [inspected, setInspected] = useState<DropPayload | null>(null);
  const [armed, setArmed] = useState<DropPayload | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<MechLocation | null>(null);
  const [hoveredLocation, setHoveredLocation] = useState<MechLocation | null>(null);
  const [hoveredWeaponId, setHoveredWeaponId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<BayWorkspaceTab>('loadout');
  const bayRef = useRef<HTMLDivElement>(null);

  const chassis = catalog.chassis.get(design.chassisId);
  const loadout = useMemo(() => computeLoadout(catalog, design), [design]);
  const heat = useMemo(() => computeHeatProfile(catalog, design), [design]);
  const report = useMemo(() => validateDesign(catalog, design), [design]);
  const saveable = report.valid;
  const inventory = commission?.inventory;
  const guideWeaponId = guidedWeaponId(armed, hoveredWeaponId);
  const guidePayload: DropPayload | null =
    armed ?? (guideWeaponId === null ? null : { kind: 'weapon', id: guideWeaponId });
  const compatible = useMemo(
    () => new Set(compatibleDropLocations(catalog, design, guidePayload, inventory)),
    [design, guidePayload, inventory],
  );

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
      setHoveredWeaponId(null);
      setArmed(null);
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
  const replace = (next: Design): void => {
    setSelectedLocation(null);
    setHoveredLocation(null);
    setHoveredWeaponId(null);
    setArmed(null);
    setInspected(null);
    setShowAll(false);
    setWorkspace('loadout');
    setHistory(beginDesignHistory(next));
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

    commitDraft(evaluation.nextDesign);
    if (evaluation.status === 'needs_ammo') {
      const payload: DropPayload = { kind: 'ammo', id: evaluation.continuation.weaponId };
      setSelectedLocation(null);
      setShelf('ammo');
      setInspected(payload);
      setArmed(payload);
      setStatus({ tone: 'ok', text: evaluation.reasons[0]?.message ?? 'Choose an ammunition bin.' });
      return true;
    }

    if (location !== null) setSelectedLocation(location);
    setArmed(null);
    setStatus(null);
    return true;
  };

  const applyIntent = (intent: EditIntent): boolean =>
    acceptEvaluation(evaluateEdit(catalog, design, intent, inventory));

  const onDrop = (payload: DropPayload, location: MechLocation): void => {
    acceptEvaluation(evaluateDrop(catalog, design, payload, location, inventory), location);
  };

  const selectLocation = (location: MechLocation): void => {
    if (armed !== null) {
      onDrop(armed, location);
      return;
    }
    setSelectedLocation((current) => current === location ? null : location);
    setShelf('weapons');
  };

  const onSave = (): void => {
    if (commission !== undefined) {
      const result = commission.onCommit(design);
      if (!result.ok) setStatus({ tone: 'error', text: result.reason ?? 'refit refused' });
      return;
    }
    try {
      const { replaced } = saveToStorage(catalog, design);
      setStored(listStoredDesigns());
      setStatus({
        tone: 'ok',
        text: replaced
          ? `Saved "${design.name}", replacing the build already under that name.`
          : `Saved "${design.name}".`,
      });
    } catch (error) {
      if (error instanceof InvalidBuildError) {
        setStatus({ tone: 'error', text: `Cannot save — ${error.issues.join('; ')}` });
        return;
      }
      throw error;
    }
  };

  const onExport = (): void => {
    try {
      const url = URL.createObjectURL(exportDesign(catalog, design));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${design.id}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus({ tone: 'ok', text: `Exported "${design.name}".` });
    } catch (error) {
      if (error instanceof InvalidBuildError) {
        setStatus({ tone: 'error', text: `Cannot export — ${error.issues.join('; ')}` });
        return;
      }
      throw error;
    }
  };

  const onImport = async (file: File): Promise<void> => {
    const result = parseDesign(await file.text());
    if (result.design === null) {
      setStatus({ tone: 'error', text: `Import failed — ${result.error ?? 'unknown error'}` });
      return;
    }
    replace(result.design);
    setStatus({ tone: 'ok', text: `Imported "${result.design.name}".` });
  };

  return (
    <div
      ref={bayRef}
      className="bay bay--workspace"
      data-testid="mechbay"
      data-workspace={workspace}
    >
      <BayChrome
        catalog={catalog}
        design={design}
        {...(commission === undefined ? {} : {
          commissionTitle: commission.title,
          commissionCancelLabel: commission.cancelLabel,
        })}
        stored={stored}
        saveable={saveable}
        status={status}
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
        onSave={onSave}
        onExport={onExport}
        onImport={(file) => void onImport(file)}
        onLoad={(id) => {
          const result = loadFromStorage(id);
          if (result.design === null) {
            setStatus({ tone: 'error', text: result.error ?? 'load failed' });
            return;
          }
          replace(result.design);
          setStatus({ tone: 'ok', text: `Loaded "${result.design.name}".` });
        }}
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
          onSelectLocation={selectLocation}
          onHoverLocation={setHoveredLocation}
        />
        <LoadoutGrid
          catalog={catalog}
          chassis={chassis}
          design={design}
          loadout={loadout}
          armed={armed}
          selectedLocation={selectedLocation}
          hoveredLocation={hoveredLocation}
          compatibleLocations={compatible}
          onCancelArmed={() => setArmed(null)}
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
          onHoverWeapon={setHoveredWeaponId}
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

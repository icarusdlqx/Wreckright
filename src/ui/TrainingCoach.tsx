import { useCallback, useEffect, useRef, useState } from 'react';
import { getCatalog } from '../schema/load';
import { usePlaytest } from './playtest';
import { trainingMilestoneEvents } from './playtest/trainingMilestones';
import { useGame, type GameState } from './store';
import {
  advanceTrainingStep,
  completeTraining,
  skipTraining,
  storeTrainingStep,
  type TrainingSignals,
  type TrainingStep,
} from './trainingProgress';
import { setTrainingPresentationStep } from './trainingPresentation';
import { useCompactLayout } from './useCompactLayout';

export const TRAINING_LESSONS: Record<
  TrainingStep,
  { title: string; instruction: string; touch: string }
> = {
  0: {
    title: '1 · Select',
    instruction: 'Select a mech on the field or lance bar. Shift-click adds or removes a mech; E selects all. Tab cycles the lance.',
    touch: 'Tap a mech on the field or in the lance bar.',
  },
  1: {
    title: '2 · Move',
    instruction: 'Click Move, then the marked range gate. Right-click also moves. Orders work while paused.',
    touch: 'Tap Orders, Move, then the marked range gate. Orders work while paused.',
  },
  2: {
    title: '3 · Engage',
    instruction: 'Investigate the red ● sensor dot. Move closer until a named optical contact appears, then click it to engage. Indirect missiles can also use a live sensor return.',
    touch: 'Tap the red ● sensor dot to investigate. Close in until it becomes a named contact, then tap to engage. Indirect missiles can use live sensor returns.',
  },
  3: {
    title: '4 · Read heat',
    instruction: 'Click Resume or press Space. Watch heat rise; pause or hold fire before shutdown.',
    touch: 'Tap Resume, then Heat. Pause or hold fire before shutdown.',
  },
  4: {
    title: 'Range drill',
    instruction: 'Clear the remaining contacts. Pause to plan. Tactics contains the order guide; field tips explain sensors, recovery and formations when you use them.',
    touch: 'Clear the remaining contacts. Pause to plan. Open Tactics for the order guide; field tips explain extra commands when you use them.',
  },
};

interface TrainingCoachProps {
  active?: boolean;
  step?: TrainingStep;
  onStep?: (step: TrainingStep) => void;
  onShowGate?: () => void;
}

interface TrainingPresentationOptions {
  active: boolean;
  battlefieldRevision: number;
  onSkip?: () => void;
  onComplete?: () => void;
  onContinueAnyway?: () => void;
  onFallback: () => void;
}

interface TrainingPresentationState {
  step: TrainingStep;
  presentedStep: TrainingStep | null;
  onStep: (step: TrainingStep) => void;
  skip: () => void;
  complete: () => void;
  continueAnyway: () => void;
}

export function useTrainingPresentation(
  options: TrainingPresentationOptions,
): TrainingPresentationState {
  // The profile remembers an unfinished lesson, not a battlefield checkpoint.
  // A fresh range must recapture its gate before the contact lesson applies.
  const [step, setStep] = useState<TrainingStep>(0);
  const { record } = usePlaytest();
  const presentedStep = options.active ? step : null;
  const onStep = useCallback((next: TrainingStep): void => {
    setTrainingPresentationStep(next);
    setStep(next);
  }, []);

  useEffect(() => {
    if (options.active) setStep(0);
  }, [options.active, options.battlefieldRevision]);

  useEffect(() => {
    setTrainingPresentationStep(presentedStep);
    return () => setTrainingPresentationStep(null);
  }, [presentedStep]);

  const leave = (status: 'complete' | 'skipped', callback?: () => void): void => {
    if (status === 'complete') completeTraining();
    else {
      skipTraining();
      record({ name: 'training_skipped' });
    }
    (callback ?? options.onFallback)();
  };

  return {
    step,
    presentedStep,
    onStep,
    skip: () => leave('skipped', options.onSkip),
    complete: () => leave('complete', options.onComplete),
    continueAnyway: () => leave('skipped', options.onContinueAnyway),
  };
}

export function observeTrainingSignals(
  state: Pick<GameState, 'units' | 'selection' | 'playerTeam' | 'objectives'>,
  observed: TrainingSignals,
  step: TrainingStep,
): TrainingSignals {
  const units = state.units.filter((unit) => unit.team === state.playerTeam && unit.alive);
  return {
    selected: observed.selected || units.some((unit) => state.selection.includes(unit.id)),
    moved: observed.moved || state.objectives.some((objective) =>
      objective.id === 'cross_range_gate' && objective.status === 'complete'),
    engaged: observed.engaged || (step >= 2 && units.some((unit) => unit.hasAttackOrder)),
    heated: observed.heated || (step >= 3 && units.some((unit) => unit.heat > 0.5)),
  };
}

export function TrainingCoach({ active, step: controlledStep, onStep, onShowGate }: TrainingCoachProps = {}) {
  const state = useGame();
  const { record } = usePlaytest();
  const [localStep, setLocalStep] = useState<TrainingStep>(0);
  const [open, setOpen] = useState(true);
  const compact = useCompactLayout();
  const seen = useRef<TrainingSignals>({
    selected: false,
    moved: false,
    engaged: false,
    heated: false,
  });
  const trainingName = getCatalog().missions.get('training_ground')?.name ?? '';
  const activeMission = active ?? state.missionName === trainingName;
  const step = controlledStep ?? localStep;

  useEffect(() => {
    if (activeMission) storeTrainingStep(step);
  }, [activeMission, step]);

  useEffect(() => {
    if (!activeMission || !state.briefingSeen || state.finished) return;

    const observed = seen.current;
    const current = observeTrainingSignals(state, observed, step);
    for (const event of trainingMilestoneEvents(observed, current)) record(event);
    seen.current = current;

    const next = advanceTrainingStep(step, current);
    if (next !== step) {
      if (controlledStep === undefined) setLocalStep(next);
      onStep?.(next);
    }
  }, [
    activeMission,
    state.briefingSeen,
    state.enemies,
    state.finished,
    state.playerTeam,
    state.selection,
    state.units,
    state.objectives,
    controlledStep,
    onStep,
    record,
    step,
  ]);

  useEffect(() => {
    if (!activeMission || !state.finished || state.missionStatus === 'active') return;
    record({ name: 'training_finished', outcome: state.missionStatus });
    if (state.missionStatus === 'success') completeTraining();
  }, [activeMission, record, state.finished, state.missionStatus]);

  if (!activeMission || !state.briefingSeen || state.finished) return null;
  const lesson = TRAINING_LESSONS[step];
  const moveQueued = step === 1 && state.units.some((unit) =>
    state.selection.includes(unit.id) && unit.hasMoveOrder);
  const moveHelp = moveQueued
    ? state.paused
      ? 'Move order ready. Click Resume or press Space, then reach and hold the range gate.'
      : 'Reach the marked range gate and hold it until range control opens the targets.'
    : null;
  const showGate = step === 1 && onShowGate !== undefined ? (
    <button type="button" className="training-show-gate" onClick={onShowGate} data-testid="training-show-gate">
      Show range gate
    </button>
  ) : null;
  const progress = (
    <span className="training-progress" aria-label={`Training step ${step + 1} of 5`}>
      {[0, 1, 2, 3, 4].map((index) => (
        <i key={index} className={index <= step ? 'done' : ''} />
      ))}
    </span>
  );

  if (compact) {
    return (
      <details
        className="training-coach mobile-training"
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        data-testid="training-coach"
        data-training-step={step}
        aria-live="polite"
      >
        <summary>
          Range control <strong>{lesson.title}</strong>
        </summary>
        <p>{moveHelp ?? lesson.touch}</p>
        {showGate}
        {progress}
      </details>
    );
  }

  return (
    <section className="training-coach" data-testid="training-coach" aria-live="polite">
      <span className="training-kicker">Range control</span>
      <strong>{lesson.title}</strong>
      <p>{moveHelp ?? lesson.instruction}</p>
      {showGate}
      {progress}
    </section>
  );
}

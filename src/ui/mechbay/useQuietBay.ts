import { useState } from 'react';
import type { MechLocation } from '../../schema/common';
import {
  completeMechbayFitTraining,
  readMechbayFitComplete,
} from '../trainingProgress';
import type { DropPayload } from './LocationCard';

export type SnapPhase = 0 | 1 | 2;

function parsedDrop(raw: string): DropPayload | null {
  if (raw === '') return null;
  try {
    const value = JSON.parse(raw) as Partial<DropPayload>;
    if (
      typeof value.id === 'string'
      && (value.kind === 'weapon' || value.kind === 'equipment' || value.kind === 'ammo')
    ) return value as DropPayload;
  } catch {
    // Native drags without the game's payload should leave the bay quiet.
  }
  return null;
}

export function useQuietBay(armed: DropPayload | null) {
  const [dragged, setDragged] = useState<DropPayload | null>(null);
  const [complete, setComplete] = useState(readMechbayFitComplete);
  const [cultureExpanded, setCultureExpanded] = useState(() => !readMechbayFitComplete());
  const [guideExpanded, setGuideExpanded] = useState(() => !readMechbayFitComplete());
  const [snapLocation, setSnapLocation] = useState<MechLocation | null>(null);
  const [snapTarget, setSnapTarget] = useState<DropPayload | null>(null);
  const [snapPhase, setSnapPhase] = useState<SnapPhase>(0);

  const recordFit = (location: MechLocation, target: DropPayload): void => {
    if (!complete) {
      completeMechbayFitTraining();
      setComplete(true);
      setCultureExpanded(false);
      setGuideExpanded(false);
    }
    setSnapLocation(location);
    setSnapTarget(target);
    setSnapPhase((current) => current === 1 ? 2 : 1);
  };

  return {
    targeting: armed ?? dragged,
    cultureExpanded,
    guideExpanded,
    snapLocation,
    snapTarget,
    snapPhase,
    setCultureExpanded,
    setGuideExpanded,
    beginDrag: (raw: string) => setDragged(parsedDrop(raw)),
    clearDrag: () => setDragged(null),
    resetSnap: () => { setSnapLocation(null); setSnapTarget(null); setSnapPhase(0); },
    recordFit,
  };
}

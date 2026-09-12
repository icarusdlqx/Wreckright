import { useState } from 'react';
import type { MechLocation } from '../../schema/common';
import {
  completeMechbayFitTraining,
  readMechbayFitComplete,
} from '../trainingProgress';
import { parsedDrop, type DropPayload } from './dropPayload';

export type SnapPhase = 0 | 1 | 2;

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
    targeting: dragged ?? armed,
    dragging: dragged !== null,
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

import { useEffect, useState } from 'react';
import type { Faction } from '../../schema/faction';
import type { AudioDirector } from '../audio';
import { factionCultureShare } from '../audioScoreTreatments';
import { useStrategicScore, useStrategicScoreControls } from '../StrategicScoreProvider';

export function useMechbayScore(
  faction: Faction | null,
  battleAudio?: AudioDirector,
  onBattleMuted?: (muted: boolean) => void,
) {
  const share = factionCultureShare(faction);
  const strategic = useStrategicScoreControls();
  const [battleMuted, setBattleMuted] = useState(() => battleAudio?.muted ?? false);
  useStrategicScore('mechbay', share, battleAudio === undefined);
  useEffect(() => {
    if (battleAudio === undefined) return undefined;
    setBattleMuted(battleAudio.muted);
    onBattleMuted?.(battleAudio.muted);
    return () => battleAudio.clearMechbayScore();
  }, [battleAudio, onBattleMuted]);
  useEffect(() => battleAudio?.setMechbayScore(share), [battleAudio, share]);
  return battleAudio === undefined
    ? strategic
    : {
        muted: battleMuted,
        prepare: () => battleAudio.unlock(),
        toggleMuted: () => {
          const muted = battleAudio.toggleMuted();
          setBattleMuted(muted);
          onBattleMuted?.(muted);
          return muted;
        },
      };
}

import { useSyncExternalStore } from 'react';
import { readLowFx, subscribeLowFx, writeLowFx } from '../render3d/renderQuality';
import { resetFieldHints } from './FieldHints';

export function DisplayControls({ onChange }: { onChange?: (low: boolean) => void }) {
  const low = useSyncExternalStore(subscribeLowFx, readLowFx, () => false);
  return <section className="settings-section" aria-label="Display settings">
    <h3>Display</h3>
    <label className="audio-settings__range">Graphics quality
      <select data-testid="settings-graphics" value={low ? 'low' : 'full'} onChange={(event) => {
        const next = event.currentTarget.value === 'low';
        writeLowFx(next); onChange?.(next);
      }}><option value="full">Full detail</option><option value="low">Low — smoother on modest devices</option></select>
    </label>
    <p className="audio-settings__help">Low removes shadows and fine surface effects. Terrain, contacts and command information stay the same.</p>
    <h3>Motion comfort</h3>
    <p>Your device’s Reduce Motion setting limits camera moves and decorative animation. It is read when you enter a field.</p>
    <p>You can pause at any time and issue orders while the clock is stopped.</p>
  </section>;
}

export function ControlGuide() {
  return <section className="settings-section" aria-label="Controls guide">
    <h3>Mouse & keyboard</h3>
    <dl className="settings-controls">
      <div><dt>Select</dt><dd>Click a machine or its lance card. Drag a box for a group. Tab cycles your lance.</dd></div>
      <div><dt>Move / attack</dt><dd>Right-click ground to move or a hostile to attack. Shift adds a waypoint.</dd></div>
      <div><dt>Pause / camera</dt><dd>Space pauses. Arrow keys pan, wheel zooms. Centre returns to your selection.</dd></div>
    </dl>
    <h3>Touch</h3>
    <dl className="settings-controls">
      <div><dt>Select</dt><dd>Tap a machine or its lance card.</dd></div>
      <div><dt>Orders</dt><dd>Choose Move or Attack, then tap the destination or contact. Queue adds a route leg.</dd></div>
      <div><dt>Camera</dt><dd>Drag empty ground to pan. Pinch to zoom. Use Pause when planning.</dd></div>
    </dl>
    <p className="audio-settings__help">Guard holds your ground. Hold fire preserves ammunition and damaged salvage targets. A new Move order takes priority over an attack.</p>
    <button type="button" onClick={resetFieldHints} data-testid="settings-reset-guidance">Show field guidance again</button>
  </section>;
}

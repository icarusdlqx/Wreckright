import type { Weapon } from '../../schema/weapon';
import { weaponFireProfile } from '../../sim/weaponModes';
import './fireModeComparison.css';

export interface FireModeComparisonRow {
  readonly modeId: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly damage: number;
  readonly projectiles: number;
  readonly volley: number;
  readonly perSecond: number;
  readonly accuracy: number;
  readonly heat: number;
  readonly cooldown: number;
}

export function fireModeComparisonRows(weapon: Weapon): readonly FireModeComparisonRow[] {
  return weapon.modes.map((mode, index) => {
    const profile = weaponFireProfile(weapon, mode.id);
    const volley = profile.damage * profile.projectiles;
    return {
      modeId: mode.id,
      name: mode.name,
      isDefault: index === 0,
      damage: profile.damage,
      projectiles: profile.projectiles,
      volley,
      perSecond: volley / profile.cooldown,
      accuracy: profile.accuracy,
      heat: profile.heat,
      cooldown: profile.cooldown,
    };
  });
}

function compactNumber(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '');
}

export function FireModeComparison({ weapon }: { weapon: Weapon }) {
  const rows = fireModeComparisonRows(weapon);
  if (rows.length === 0) return null;

  const headingId = `fire-modes-${weapon.id}`;
  return (
    <section className="fire-mode-comparison" aria-labelledby={headingId}>
      <h5 id={headingId}>Fire modes</h5>
      <div
        className="fire-mode-comparison__scroll"
        role="region"
        aria-label={`${weapon.name} fire mode statistics`}
        tabIndex={0}
      >
        <table>
          <caption>{weapon.name} firing profiles</caption>
          <thead>
            <tr>
              <th scope="col">Mode</th>
              <th scope="col">Volley</th>
              <th scope="col">Rate</th>
              <th scope="col">Accuracy</th>
              <th scope="col">Heat</th>
              <th scope="col">Cycle</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.modeId} data-mode-id={row.modeId}>
                <th scope="row">
                  <span>{row.name}</span>
                  {row.isDefault ? <small>Default</small> : null}
                </th>
                <td>
                  {compactNumber(row.volley)}
                  {row.projectiles > 1 ? (
                    <small
                      aria-label={`${row.projectiles} projectiles at ${compactNumber(row.damage)} damage each`}
                    >
                      {' '}({row.projectiles}×{compactNumber(row.damage)})
                    </small>
                  ) : null}
                </td>
                <td>{compactNumber(row.perSecond)}/s</td>
                <td>×{compactNumber(row.accuracy)}</td>
                <td>{compactNumber(row.heat)}</td>
                <td>{compactNumber(row.cooldown)}s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

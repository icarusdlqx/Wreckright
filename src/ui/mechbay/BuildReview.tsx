import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import type { HeatProfile, Loadout } from '../../sim/loadout';
import { authoredDesignName } from '../designLabel';
import {
  bayWorkspacePanelId,
  bayWorkspaceTabId,
  type BayWorkspaceTab,
} from './BayWorkspaceTabs';
import { buildReviewSummary } from './buildReviewModel';
import './mechbayWorkspace.css';

export interface BuildReviewProps {
  catalog: Catalog;
  design: Design;
  loadout: Loadout;
  heat: HeatProfile;
  onNavigate?: (tab: BayWorkspaceTab) => void;
}

export function navigateAndFocusWorkspace(
  source: Pick<HTMLElement, 'ownerDocument'>,
  tab: BayWorkspaceTab,
  onNavigate: (tab: BayWorkspaceTab) => void,
): void {
  const document = source.ownerDocument;
  const focusDestination = (): void => {
    const destination = document.getElementById(bayWorkspaceTabId(tab))
      ?? document.getElementById(bayWorkspacePanelId(tab));
    destination?.focus({ preventScroll: true });
  };

  onNavigate(tab);
  const view = document.defaultView;
  if (view === null) focusDestination();
  else view.requestAnimationFrame(focusDestination);
}

function GearList({
  title,
  empty,
  lines,
}: {
  title: string;
  empty: string;
  lines: readonly { id: string; label: string; detail: string }[];
}) {
  return (
    <section className="build-review__gear-group" aria-label={title}>
      <h4>{title}</h4>
      {lines.length === 0 ? <p>{empty}</p> : (
        <ul>
          {lines.map((line) => (
            <li key={line.id}>
              <strong>{line.label}</strong>
              <span>{line.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function BuildReview({
  catalog,
  design,
  loadout,
  heat,
  onNavigate,
}: BuildReviewProps) {
  const review = buildReviewSummary(catalog, design, loadout, heat);

  return (
    <section
      className="build-review"
      aria-labelledby="build-review-title"
      data-testid="build-review"
    >
      <header className="build-review__header">
        <div>
          <p className="build-review__eyebrow">Final inspection</p>
          <h3 id="build-review-title">{authoredDesignName(catalog, design)}</h3>
        </div>
        <div
          className={`build-review__verdict ${review.legal ? 'is-legal' : 'is-blocked'}`}
          role="status"
          aria-live="polite"
          data-testid="build-review-verdict"
        >
          <strong>{review.verdict}</strong>
          <span>{review.verdictDetail}</span>
        </div>
      </header>

      <dl className="build-review__metrics" aria-label="Loadout totals">
        {review.metrics.map((metric) => (
          <div key={metric.id} className={metric.tone === 'warn' ? 'is-warning' : undefined}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
            <span>{metric.detail}</span>
          </div>
        ))}
      </dl>

      <div className="build-review__gear">
        <GearList title="Weapons" empty="No weapons fitted." lines={review.weapons} />
        <GearList
          title="Ammunition"
          empty="No ammunition bins fitted."
          lines={review.ammunition}
        />
      </div>

      {review.issueGroups.length === 0 ? (
        <div className="build-review__clear" role="note">
          <strong>Fitting checks clear</strong>
          <span>No hardpoint, slot, tonnage, armour, cooling, or ammunition conflicts.</span>
        </div>
      ) : (
        <section className="build-review__issues" aria-labelledby="build-review-issues-title">
          <h4 id="build-review-issues-title">
            {review.legal ? 'Advisory notes' : 'Fix before commit'}
            <span aria-label={`${review.issueCount} loadout ${review.issueCount === 1 ? 'issue' : 'issues'}`}>
              {review.issueCount}
            </span>
          </h4>
          {review.issueGroups.map((group) => (
            <section
              key={group.component}
              className={`build-review__issue-group ${group.issues.some((issue) => issue.severity === 'error') ? 'has-errors' : 'has-warnings'}`}
              aria-labelledby={`build-review-issue-${group.component}`}
              data-issue-component={group.component}
            >
              <h5 id={`build-review-issue-${group.component}`}>{group.label}</h5>
              <ol>
                {group.issues.map((issue, index) => (
                  <li
                    key={`${issue.code}-${issue.path.join('.')}-${index}`}
                    data-issue-code={issue.code}
                    data-issue-source={issue.source}
                    data-issue-severity={issue.severity}
                  >
                    {issue.locationLabel === null ? null : (
                      <span className="build-review__location">{issue.locationLabel}</span>
                    )}
                    <span className="build-review__issue-message">{issue.message}</span>
                    <span className="build-review__issue-action">{issue.action}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </section>
      )}

      <footer className="build-review__next">
        <p data-testid="build-review-next-action">{review.nextAction}</p>
        {review.nextTab === null || onNavigate === undefined ? null : (
          <button
            type="button"
            aria-controls={bayWorkspacePanelId(review.nextTab)}
            data-focus-target={bayWorkspaceTabId(review.nextTab)}
            onClick={(event) => navigateAndFocusWorkspace(
              event.currentTarget,
              review.nextTab ?? 'loadout',
              onNavigate,
            )}
            data-testid="build-review-fix"
          >
            Go to {review.nextTab === 'armour' ? 'Armour & Cooling' : 'Loadout'}
          </button>
        )}
      </footer>
    </section>
  );
}

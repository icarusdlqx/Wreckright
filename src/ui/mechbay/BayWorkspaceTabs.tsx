import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import './mechbayWorkspace.css';

export type BayWorkspaceTab = 'loadout' | 'armour' | 'review';

interface WorkspaceTabDefinition {
  readonly id: BayWorkspaceTab;
  readonly label: string;
}

export const BAY_WORKSPACE_TABS: readonly WorkspaceTabDefinition[] = [
  { id: 'loadout', label: 'Loadout' },
  { id: 'armour', label: 'Armour & Cooling' },
  { id: 'review', label: 'Review' },
];

export function bayWorkspaceTabId(tab: BayWorkspaceTab): string {
  return `bay-workspace-tab-${tab}`;
}

export function bayWorkspacePanelId(tab: BayWorkspaceTab): string {
  return `bay-workspace-panel-${tab}`;
}

export function nextBayWorkspaceTab(
  current: BayWorkspaceTab,
  key: string,
): BayWorkspaceTab | null {
  const index = BAY_WORKSPACE_TABS.findIndex((entry) => entry.id === current);
  if (key === 'Home') return BAY_WORKSPACE_TABS[0]?.id ?? null;
  if (key === 'End') return BAY_WORKSPACE_TABS.at(-1)?.id ?? null;
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
  const direction = key === 'ArrowRight' ? 1 : -1;
  const nextIndex = (index + direction + BAY_WORKSPACE_TABS.length)
    % BAY_WORKSPACE_TABS.length;
  return BAY_WORKSPACE_TABS[nextIndex]?.id ?? null;
}

export interface BayWorkspaceTabsProps {
  active: BayWorkspaceTab;
  issueCount: number;
  onSelect: (tab: BayWorkspaceTab) => void;
}

export function BayWorkspaceTabs({
  active,
  issueCount,
  onSelect,
}: BayWorkspaceTabsProps) {
  const tabRefs = useRef<Partial<Record<BayWorkspaceTab, HTMLButtonElement | null>>>({});
  const visibleIssueCount = Math.max(0, Math.trunc(issueCount));

  const selectFromKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    current: BayWorkspaceTab,
  ): void => {
    const next = nextBayWorkspaceTab(current, event.key);
    if (next === null) return;
    event.preventDefault();
    onSelect(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div
      className="bay-workspace-tabs"
      role="tablist"
      aria-label="Mechbay workspace"
      aria-orientation="horizontal"
      data-testid="bay-workspace-tabs"
    >
      {BAY_WORKSPACE_TABS.map((entry) => {
        const selected = entry.id === active;
        return (
          <button
            key={entry.id}
            ref={(node) => { tabRefs.current[entry.id] = node; }}
            id={bayWorkspaceTabId(entry.id)}
            className={`bay-workspace-tabs__tab${selected ? ' is-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={bayWorkspacePanelId(entry.id)}
            tabIndex={selected ? 0 : -1}
            data-workspace-tab={entry.id}
            onClick={() => onSelect(entry.id)}
            onKeyDown={(event) => selectFromKeyboard(event, entry.id)}
          >
            <span>{entry.label}</span>
            {entry.id === 'review' ? (
              <span
                className={`bay-workspace-tabs__count${visibleIssueCount > 0 ? ' has-issues' : ''}`}
                aria-label={`${visibleIssueCount} loadout ${visibleIssueCount === 1 ? 'issue' : 'issues'}`}
              >
                {visibleIssueCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function BayWorkspacePanel({
  tab,
  active,
  className = '',
  children,
}: {
  tab: BayWorkspaceTab;
  active: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={bayWorkspacePanelId(tab)}
      className={`bay-workspace-panel bay-workspace-panel--${tab}${className === '' ? '' : ` ${className}`}`}
      role="tabpanel"
      aria-labelledby={bayWorkspaceTabId(tab)}
      tabIndex={0}
      hidden={!active}
      data-workspace-panel={tab}
    >
      {children}
    </section>
  );
}

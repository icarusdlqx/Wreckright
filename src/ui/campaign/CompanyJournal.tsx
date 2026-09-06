import { useEffect, useRef } from 'react';
import type { Catalog } from '../../schema/load';
import type { CampaignState, MissionOutcome } from '../../campaign/types';
import { getWikiLibrary, isWikiDiscovered } from '../../wiki/library';
import { WikiLink } from '../wiki/WikiLink';
import { PilotPortrait } from '../PilotPortrait';
import { machineDisplayName, stripSerialDesignation } from '../designLabel';
import './companyJournal.css';

function ContractRecord({ catalog, state, outcome }: { catalog: Catalog; state: CampaignState; outcome: MissionOutcome }) {
  const records = [...getWikiLibrary().values()].filter((article) => article.kind === 'story'
    && article.discovery?.unlockNodeId === outcome.nodeId && outcome.won
    && isWikiDiscovered(article, state));
  const objectiveStatus = (objective: NonNullable<MissionOutcome['objectiveReports']>[number]): string => {
    const type = catalog.missions.get(outcome.missionId)?.objectives.find((entry) => entry.id === objective.id)?.type;
    return outcome.won && objective.status === 'active' && (type === 'survive' || type === 'protect_zones') ? 'held'
      : objective.status === 'complete' ? 'complete' : 'not completed';
  };
  return <div className="journal-record">
    <p>Day {outcome.day} · {outcome.employerName} · {outcome.payout.toLocaleString('en-GB')} C paid</p>
    {outcome.objectiveReports === undefined ? null : <ul className="journal-objectives">{outcome.objectiveReports.map((objective) =>
      <li key={objective.id}><span>{objectiveStatus(objective) === 'not completed' ? '—' : '✓'}</span> {objective.label} <small>{objective.required ? 'Required' : 'Optional'} · {objectiveStatus(objective)}</small></li>)}</ul>}
    <div className="journal-crew">{outcome.pilotReports.map((report) => {
      const pilot = state.pilots.find((entry) => entry.id === report.pilotId);
      return <div key={report.pilotId}>{pilot === undefined ? null : <PilotPortrait pilot={pilot} compact />}
        <span><strong>{report.name}</strong><small>{report.fate} · +{report.xp} XP · {report.kills} kills</small>
          {report.serviceNotes?.map((note) => <small key={note}>{note}</small>)}</span></div>;
    })}</div>
    {outcome.mechsLost.length === 0 ? null : <p>Machines lost: {outcome.mechsLost.map(stripSerialDesignation).join(', ')}.</p>}
    <h4>Recovery record</h4>
    {outcome.salvagedChassis.length === 0 ? null : <p>Recovered hulls: {outcome.salvagedChassis.map((id) => {
      const design = catalog.designs.get(id); return design === undefined ? id : machineDisplayName(catalog, design);
    }).join(', ')}.</p>}
    {outcome.salvagedItems.length === 0 ? <p>No loose salvage retained.</p> : <ul>{outcome.salvagedItems.map((item) => {
      const sources = outcome.salvageProvenance.filter((source) => source.kind === item.kind && source.itemId === item.itemId);
      return <li key={`${item.kind}/${item.itemId}`}><strong>{(item.kind === 'weapon' ? catalog.weapons : catalog.equipment).get(item.itemId)?.name ?? item.itemId} ×{item.count}</strong>
        {sources.length === 0 ? null : <small>Recovered from {Array.from(new Set(sources.map((source) => stripSerialDesignation(source.sourceMechName)))).join(', ')}</small>}</li>;
    })}</ul>}
    {outcome.campaignRewards?.map((reward) => <p key={reward.id}><strong>{reward.label}.</strong> {reward.afterword}</p>)}
    {records.length === 0 ? null : <div className="journal-discoveries"><h4>Records discovered on this contract</h4>
      {records.map((article) => <WikiLink key={article.id} to={article}>{article.title} ↗</WikiLink>)}</div>}
  </div>;
}

export function CompanyJournal({ catalog, state, selectedNodeId }: { catalog: Catalog; state: CampaignState; selectedNodeId?: string }) {
  const root = useRef<HTMLElement>(null);
  const campaign = catalog.campaigns.get(state.campaignId);
  useEffect(() => {
    if (selectedNodeId === undefined) return;
    const record = [...(root.current?.querySelectorAll<HTMLDetailsElement>('details[data-node]') ?? [])].find((entry) => entry.dataset.node === selectedNodeId);
    if (record !== undefined) { record.open = true; record.querySelector('summary')?.focus(); record.scrollIntoView({ block: 'nearest' }); }
  }, [selectedNodeId]);
  const missing = campaign?.nodes.filter((node) => (state.completedNodes.includes(node.id) || state.failedNodes.includes(node.id))
    && !state.history.some((outcome) => outcome.nodeId === node.id)) ?? [];
  const discoveries = [...getWikiLibrary().values()].filter((article) => article.kind === 'story' && article.discovery?.unlockNodeId !== undefined && isWikiDiscovered(article, state));
  return <section className="company-journal" ref={root} data-testid="company-journal">
    <header><span>Company record / day {state.day}</span><h3>The work that brought us here.</h3><p>Contracts, crew and recovered machines. Completed operations remain available to review.</p></header>
    {state.history.length === 0 && missing.length === 0 ? <p>Your first contract will open the journal.</p> : null}
    {[...state.history].reverse().map((outcome, index) => <details key={`${outcome.nodeId}/${index}`} data-node={outcome.nodeId} open={selectedNodeId === outcome.nodeId || (selectedNodeId === undefined && index === 0)}>
      <summary><span className={outcome.won ? 'journal-success' : 'journal-loss'}>{outcome.won ? '✓ Complete' : '× Failed'}</span>
        <strong>{campaign?.nodes.find((node) => node.id === outcome.nodeId)?.name ?? catalog.missions.get(outcome.missionId)?.name ?? 'Contract'}</strong><small>Day {outcome.day}</small></summary>
      <ContractRecord catalog={catalog} state={state} outcome={outcome} />
    </details>)}
    {missing.map((node) => <details key={node.id} data-node={node.id} open={selectedNodeId === node.id}><summary><span>{state.completedNodes.includes(node.id) ? '✓ Complete' : '× Failed'}</span><strong>{node.name}</strong></summary>
      <div className="journal-record"><p>{node.brief}</p><p>This older save retained the outcome; its detailed field report is no longer available.</p></div></details>)}
    {state.historyArchive.outcomes === 0 ? null : <p>{state.historyArchive.outcomes} older field reports are included in the employer ledger totals.</p>}
    {discoveries.length === 0 ? null : <aside className="journal-discoveries"><h4>Company discoveries</h4>{discoveries.map((article) => <WikiLink key={article.id} to={article}>{article.title} ↗</WikiLink>)}</aside>}
  </section>;
}

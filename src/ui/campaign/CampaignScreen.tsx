import { advanceDays } from '../../campaign/campaign';
import { useEffect, useMemo, useState } from 'react';
import { abandonContract, acceptContract, availableNodes, campaignOf, standDownCampaign,
  negotiationOptions } from '../../campaign/campaign';
import {
  campaignBlob,
  campaignPersistenceStatus,
  rawCampaignBlob,
  saveCampaign,
} from '../../campaign/save';
import type { CampaignState, ContractTermsId } from '../../campaign/types';
import { getCatalog } from '../../schema/load';
import { isSideContract } from '../../campaign/sidework';
import { deploymentCandidates, deploymentPlan } from '../../campaign/deployment';
import { campaignOutcomeCount } from '../../campaign/history';
import { assessSolvency, retireCompany } from '../../campaign/solvency';
import { employerHistories } from '../../campaign/employers';
import { useCampaignRefit } from './useCampaignRefit';
import { readCompanySlot } from '../../campaign/companySlots';
import { CampaignWorkspace } from './CampaignWorkspace';
import { useCampaignNavigation } from './campaignNavigation';
import { CampaignHeader } from './CampaignHeader';
import { CampaignChooser } from './CampaignChooser';
import { useCampaignFiles } from './useCampaignFiles';
import { CampaignMap, type NodeState } from './CampaignMap';
import { CampaignPostBattle } from './CampaignPostBattle';
import { resolveCurrentEmployer } from './campaignEmployer';
import { visibleCampaignLore } from './campaignLore';
import { ContractPanel } from './ContractPanel';
import { CompanyStatus } from './CompanyStatus';
import { CrewStandDown } from './CrewStandDown';
import { debriefedCount, resetDebriefed, revealLatestDebrief } from './Debrief';
import { FieldManual } from './FieldManual';
import { HiringHall } from './HiringHall';
import { BarracksPanel, cbills, MarketPanel, MechBayPanel, StoresPanel } from './Panels';
import { commitCampaignChange, openCampaignSession } from './campaignSession';
import { downloadCampaignFile } from './campaignDownload';
import { useGame } from '../store';
import { usePlaytest } from '../playtest';
import { CampaignPrep } from './CampaignPrep';
import { beginPreparation } from './preparationModel';
import { firstDropStage, type FirstDropPrep } from './firstDropGuide';
import { canLaunchFirstDropDirectly } from './firstDropLaunch';
import { useCampaignScore } from './useCampaignScore';
import { MissionSurvey } from './MissionSurvey';
import { missionPreviewData, previewMissionId } from './missionPreviewData';
import { CampaignStoryPanel } from './CampaignStoryPanel';
import { CampaignNextStep } from './CampaignNextStep';
import { CampaignRouteList } from './CampaignRouteList';
import { nextCampaignNode } from './campaignFlow';

const catalog = getCatalog();
const DEFAULT_CAMPAIGN_ID = 'border_dispute';
export function CampaignScreen({ onExit }: { onExit: () => void }) {
  const [initial] = useState(() => openCampaignSession(catalog, DEFAULT_CAMPAIGN_ID, resetDebriefed));
  const [state, setState] = useState<CampaignState>(initial.state);
  const navigation = useCampaignNavigation(`${state.campaignId}:${state.seed}`);
  const [persistence, setPersistence] = useState(initial.persistence);
  const [manualOpen, setManualOpen] = useState(false);
  const [guideDismissed, setGuideDismissed] = useState(false);
  const [prep, setPrep] = useState<FirstDropPrep>(null);
  const [debriefed, setDebriefed] = useState(() => debriefedCount());
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedTerms, setSelectedTerms] = useState<ContractTermsId>('standard');
  const [status, setStatus] = useState<string | null>(null);
  const [choosingCampaign, setChoosingCampaign] = useState(false);
  const enterBattle = useGame((game) => game.enterBattle);
  const { record } = usePlaytest();
  const score = useCampaignScore(catalog, state);
  const campaign = campaignOf(catalog, state);
  const employers = useMemo(
    () => employerHistories(
      campaign,
      state.history,
      state.employerFailures,
      state.historyArchive.employers,
    ),
    [campaign, state.history, state.employerFailures, state.historyArchive.employers],
  );
  const open = useMemo(() => availableNodes(catalog, state), [state]);
  const posted = useMemo(() => open.filter((entry) => isSideContract(entry.id)), [open]);
  const node = open.find((entry) => entry.id === selectedNode) ?? nextCampaignNode(catalog, state);
  const options = node === null ? [] : negotiationOptions(catalog, node);
  const lance = deploymentCandidates(state);
  const directLaunch = canLaunchFirstDropDirectly(catalog, state);
  const solvency = useMemo(() => assessSolvency(catalog, state), [state]);
  const outcomeCount = campaignOutcomeCount(state);
  const employer = resolveCurrentEmployer(campaign, state.contract, node, employers);
  const firstDrop = firstDropStage({
    outcomeCount,
    finished: state.finished,
    contractActive: state.contract !== null,
    directLaunch,
    prep,
  });
  const guidedFirstDrop = guideDismissed ? 'done' : firstDrop;
  const surveyMission = previewMissionId(state.contract, node);
  const survey = useMemo(() => missionPreviewData(catalog, surveyMission), [surveyMission]);


  useEffect(() => {
    record({ name: 'campaign_opened' });
  }, [record]);

  // A refusal knows more than the button that hoped it would work.
  const mutate = (
    change: (draft: CampaignState) => string | null | void,
    message?: string,
  ): void => {
    const committed = commitCampaignChange(state, change);
    setState(committed.state);
    setPersistence(committed.persistence.status);
    setStatus(committed.message ?? message ?? null);
  };

  const { refitting, refitBay, setRefitting, onRefitPart } = useCampaignRefit({ catalog, state, prep, mutate, onStatus: setStatus });
  const previewsActive = state.difficultyConfigured && prep === null && refitting === null && !manualOpen && !choosingCampaign && outcomeCount <= debriefed;

  const files = useCampaignFiles({ catalog, current: state, onNotice: setStatus,
    onAdopt: (restored, fresh, message) => {
      if (fresh) resetDebriefed();
      setDebriefed(fresh ? 0 : revealLatestDebrief(campaignOutcomeCount(restored)));
      setPrep(null);
      setRefitting(null);
      setSelectedNode(null);
      setSelectedTerms('standard');
      setChoosingCampaign(false);
      if (fresh) setGuideDismissed(false);
      setState(restored);
      setPersistence(campaignPersistenceStatus());
      setStatus(message);
    },
  });

  const onDeploy = (): void => {
    if (state.finished) {
      setStatus('This campaign is over.');
      return;
    }
    if (state.contract === null) {
      setStatus('Accept a contract first.');
      return;
    }
    record({ name: 'drop_prep_opened' });
    mutate((draft) => beginPreparation(catalog, draft));
    setPrep('bay');
  };

  const onLaunch = (): void => {
    if (state.finished) {
      setPrep(null);
      setRefitting(null);
      setStatus('This campaign is over.');
      return;
    }
    if (state.contract === null) { setStatus('Accept a contract first.'); return; }
    const plan = deploymentPlan(catalog, state, state.contract.missionId);
    if (plan.issues.length > 0) {
      mutate((draft) => beginPreparation(catalog, draft));
      setStatus(plan.issues.join(' '));
      setPrep('manifest');
      return;
    }
    setPrep(null);
    const saved = saveCampaign(state);
    setPersistence(saved.status);
    if (!saved.ok) {
      setStatus('Deployment held. Restart or import a valid campaign before deploying.');
      return;
    }
    record({ name: 'contract_launched' });
    enterBattle({ campaignPending: true });
  };

  const revealPosting = (id: string): void => {
    navigation.navigate({ area: 'operations' });
    setSelectedNode(id);
    globalThis.requestAnimationFrame?.(() => {
      const panel = globalThis.document?.querySelector<HTMLElement>('[data-testid="camp-contract"]');
      panel?.focus({ preventScroll: true });
      panel?.scrollIntoView({ block: 'start' });
    });
  };
  const continueMission = (): void => {
    if (state.contract !== null) onDeploy();
    else if (node !== null) revealPosting(node.id);
    else navigation.navigate({ area: 'operations' });
  };

  return (
    <div
      className="camp camp-workspace"
      data-testid="campaign"
      data-first-drop-stage={guidedFirstDrop === 'done' ? undefined : guidedFirstDrop}
    >
      <CampaignHeader
        key={`header:${state.campaignId}:${state.seed}`}
        title={campaign.name}
        day={state.day}
        balance={cbills(state.cbills)}
        seed={state.seed}
        difficulty={state.difficulty}
        manualOpen={manualOpen}
        muted={score.muted}
        persistence={persistence}
        nextDisabled={state.finished}
        nextLabel={state.finished ? 'Campaign ended' : state.contract !== null ? 'Outfit & deploy' : 'Next mission'}
        onNext={continueMission}
        onSave={files.openSave}
        onLoad={files.openLoad}
        onExport={onExportSave}
        onExportRecovery={onExportRecovery}
        onImport={files.importSave}
        onChooseCampaign={() => setChoosingCampaign(true)}
        onRestart={(difficulty) => files.startNew(state.campaignId, difficulty)}
        onToggleManual={() => setManualOpen((open) => !open)}
        onToggleMuted={score.toggleMuted}
        onExit={() => {
          const saved = saveCampaign(state);
          setPersistence(saved.status);
          if (!saved.ok) {
            setStatus('Campaign remains open while its save is memory-only.');
            return;
          }
          onExit();
        }}
      />
      {files.dialog}
      {!choosingCampaign && state.difficultyConfigured ? null : (
        <CampaignChooser
          campaigns={[...catalog.campaigns.values()]}
          currentId={state.campaignId}
          difficulty={state.difficulty}
          initial={!state.difficultyConfigured}
          onClose={() => state.difficultyConfigured ? setChoosingCampaign(false) : onExit()}
          notice={status}
          onStart={files.startNew}
          onResume={(campaignId) => {
            const slot = readCompanySlot(campaignId);
            if (slot.state === null) { setStatus(slot.error ?? 'No saved company.'); return; }
            files.loadRaw(slot.raw ?? '');
          }}
        />
      )}
      {!manualOpen ? null : (
        <FieldManual
          lore={visibleCampaignLore([...catalog.lore.values()], state.completedNodes, state.campaignId)}
          onClose={() => setManualOpen(false)}
        />
      )}
      <CrewStandDown catalog={catalog} state={state} onStandDown={() => mutate((draft) => standDownCampaign(catalog, draft).reason)} />
      <CampaignNextStep catalog={catalog} state={state} node={node} onContinue={continueMission} />
      <CampaignWorkspace
        key={`${state.campaignId}:${state.seed}`}
        catalog={catalog}
        state={state}
        story={<CampaignStoryPanel campaign={campaign} completedNodes={state.completedNodes} />}
        route={guidedFirstDrop !== 'done' ? null : <CampaignRouteList campaign={campaign} state={state} open={open}
          selectedId={node?.id ?? null} onReview={revealPosting} />}
        fullCompany={true}
        area={navigation.area} onAreaChange={navigation.setArea} journalNodeId={navigation.target?.nodeId}
        workshop={(active) => <MechBayPanel state={state} mutate={mutate} onRefit={setRefitting} previewActive={active && previewsActive} focus={navigation.target} />}
        crew={<BarracksPanel state={state} mutate={mutate} focus={navigation.target} />}
        supplies={<><StoresPanel state={state} mutate={mutate} onRefitPart={onRefitPart} /><MarketPanel state={state} mutate={mutate} /></>}
        operations={(active) => <>
      {state.finished ? null : <MissionSurvey data={survey} active={active && previewsActive} signed={state.contract !== null} />}
      <details className="campaign-route-overview"><summary>Campaign map & completed missions</summary>
      <CampaignMap
        campaign={campaign}
        catalog={catalog}
        contentRevision={state.campaignContentRevision}
        selectedId={node?.id ?? null}
        onSelect={setSelectedNode}
        onReview={(nodeId) => navigation.navigate({ area: 'journal', nodeId })}
        stateOf={(entry): NodeState => {
          if (state.completedNodes.includes(entry.id)) return 'complete';
          if (state.failedNodes.includes(entry.id)) return 'failed';
          return open.some((candidate) => candidate.id === entry.id) ? 'available' : 'locked';
        }}
      />
      </details>
      <ContractPanel
        catalog={catalog}
        state={state}
        contract={state.contract}
        node={node}
        options={options}
        selectedTerms={selectedTerms}
        salvageRules={catalog.rules.salvage}
        readyMechs={lance.length}
        directLaunch={directLaunch}
        finished={state.finished}
        won={state.won}
        employer={employer}
        employers={employers}
        companyStatus={
          <CompanyStatus
            report={solvency}
            contractActive={state.contract !== null}
            onAdvance={(day) =>
              mutate((draft) => advanceDays(catalog, draft, Math.max(0, day - draft.day), false, false))
            }
            onRetire={() =>
              mutate((draft) => {
                const result = retireCompany(catalog, draft);
                return result.ok ? 'Company retired. This campaign is over.' : result.reason;
              })
            }
          />
        }
        onSelectTerms={setSelectedTerms}
        onAccept={(termsId) => {
          let signed = false;
          mutate((draft) => {
            const result = acceptContract(catalog, draft, node?.id ?? '', termsId);
            signed = result.ok;
            if (result.ok) beginPreparation(catalog, draft);
            return result.ok ? null : result.reason;
          }, 'Contract signed.');
          if (signed) {
            record({ name: 'contract_signed' });
            setPrep('bay');
          }
        }}
        onDeploy={onDeploy}
        onLaunch={onLaunch}
        onAbandon={() =>
          mutate(
            (draft) => draft.finished ? 'the campaign is over' : abandonContract(catalog, draft),
            'Contract withdrawn. Recovery terms applied.',
          )
        }
      />
      {state.finished || guidedFirstDrop !== 'done' || state.contract !== null ? null : (
            <details className="campaign-optional-work"><summary>Optional contracts</summary><HiringHall
              catalog={catalog}
              campaign={campaign}
              day={state.day}
              offers={posted}
              employers={employers}
              selectedId={node?.id ?? null}
              onSelect={revealPosting}
            /></details>
      )}
        </>}
      />
      <CampaignPostBattle
        catalog={catalog}
        state={state}
        status={status}
        outcomeCount={outcomeCount}
        debriefed={debriefed}
        mutate={mutate}
        onDebriefed={setDebriefed}
        onNavigate={(target) => {
          if (target.area === 'operations' && target.nodeId !== undefined) revealPosting(target.nodeId);
          else navigation.navigate(target);
        }}
      />
      <CampaignPrep
        catalog={catalog}
        persistent={persistence.mode === 'persistent'}
        state={state}
        prep={prep}
        refitting={refitting}
        refitBay={refitBay}
        mutate={mutate}
        onPrep={setPrep}
        onRefit={setRefitting}
        onManifest={() => record({ name: 'manifest_opened' })}
        onLaunch={onLaunch}
      />
    </div>
  );

  function onExportSave(): void {
    downloadCampaignFile(campaignBlob(state), `${state.campaignId}-day${state.day}.json`);
    setStatus('Save exported.');
  }

  function onExportRecovery(): void {
    if (persistence.recoveryRaw === null) return;
    downloadCampaignFile(rawCampaignBlob(persistence.recoveryRaw), 'ironmuster-campaign-recovery.txt');
    setStatus('Original save exported.');
  }
}

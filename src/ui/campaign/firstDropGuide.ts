export type FirstDropPrep = null | 'bay' | 'manifest';

export type FirstDropStage = 'choose' | 'launch' | 'prepare' | 'bay' | 'manifest' | 'done';

interface FirstDropState {
  outcomeCount: number;
  finished: boolean;
  contractActive: boolean;
  directLaunch: boolean;
  prep: FirstDropPrep;
}

export function firstDropStage(state: FirstDropState): FirstDropStage {
  if (state.finished || state.outcomeCount > 0) return 'done';
  if (!state.contractActive) return 'choose';
  if (state.prep === 'bay') return 'bay';
  if (state.prep === 'manifest') return 'manifest';
  return state.directLaunch ? 'launch' : 'prepare';
}

export function firstDropInstruction(stage: FirstDropStage): string | null {
  if (stage === 'choose') {
    return 'Read the opening job, choose the terms, then sign the contract.';
  }
  if (stage === 'launch') {
    return 'The job is signed. Launch the drop, or review the machines first.';
  }
  if (stage === 'prepare') {
    return 'The job is signed. Open Prepare drop to inspect the machines.';
  }
  if (stage === 'bay') {
    return 'Select a deployment seat to inspect its machine, refit its weapons or choose its pilot. The mission map stays in preparation.';
  }
  if (stage === 'manifest') {
    return 'Assign every cockpit, check the mission allowance, then review the field briefing. Deploy starts the battle.';
  }
  return null;
}

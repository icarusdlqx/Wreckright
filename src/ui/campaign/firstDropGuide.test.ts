import { describe, expect, it } from 'vitest';
import { firstDropInstruction, firstDropStage } from './firstDropGuide';

describe('first drop guidance', () => {
  it.each([
    [{ outcomeCount: 0, finished: false, contractActive: false, directLaunch: false, prep: null }, 'choose'],
    [{ outcomeCount: 0, finished: false, contractActive: true, directLaunch: true, prep: null }, 'launch'],
    [{ outcomeCount: 0, finished: false, contractActive: true, directLaunch: false, prep: null }, 'prepare'],
    [{ outcomeCount: 0, finished: false, contractActive: true, directLaunch: true, prep: 'bay' }, 'bay'],
    [{ outcomeCount: 0, finished: false, contractActive: true, directLaunch: true, prep: 'manifest' }, 'manifest'],
    [{ outcomeCount: 1, finished: false, contractActive: false, directLaunch: false, prep: null }, 'done'],
    [{ outcomeCount: 0, finished: true, contractActive: true, directLaunch: false, prep: 'bay' }, 'done'],
  ] as const)('derives %s as %s', (state, expected) => {
    expect(firstDropStage(state)).toBe(expected);
  });

  it('keeps every active stage actionable and the completed stage silent', () => {
    for (const stage of ['choose', 'launch', 'prepare', 'bay', 'manifest'] as const) {
      expect(firstDropInstruction(stage)).toBeTruthy();
    }
    expect(firstDropInstruction('launch')).toBe(
      'The job is signed. Launch the drop, or review the machines first.',
    );
    expect(firstDropInstruction('prepare')).toBe(
      'The job is signed. Open Prepare drop to inspect the machines.',
    );
    expect(firstDropInstruction('done')).toBeNull();
  });
});

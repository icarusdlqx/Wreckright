import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import {
  beginDesignHistory,
  finishDesignTransaction,
  previewDesign,
  pushDesign,
  redoDesign,
  undoDesign,
} from './designHistory';

function sentinel() {
  const design = catalog.designs.get('sentinel_brawler');
  if (design === undefined) throw new Error('missing Sentinel fixture');
  return structuredClone(design);
}

describe('mechbay design history', () => {
  it('undoes and redoes immutable design edits', () => {
    const original = sentinel();
    const changed = structuredClone(original);
    changed.name = 'Changed';
    const edited = pushDesign(beginDesignHistory(original), changed);
    const undone = undoDesign(edited);
    const redone = redoDesign(undone);

    expect(undone.present.name).toBe(original.name);
    expect(redone.present.name).toBe('Changed');
    expect(original.name).not.toBe('Changed');
  });

  it('does not create a history entry for an identical draft', () => {
    const history = beginDesignHistory(sentinel());
    expect(pushDesign(history, structuredClone(history.present))).toBe(history);
    expect(undoDesign(history)).toBe(history);
    expect(redoDesign(history)).toBe(history);
  });

  it('clears the redo branch after a new edit', () => {
    const initial = beginDesignHistory(sentinel());
    const first = structuredClone(initial.present);
    first.name = 'First';
    const second = structuredClone(initial.present);
    second.name = 'Second';
    const branched = pushDesign(undoDesign(pushDesign(initial, first)), second);

    expect(branched.future).toEqual([]);
    expect(redoDesign(branched)).toBe(branched);
  });

  it('treats a fit and a streamed armour interaction as two undoable steps', () => {
    const original = sentinel();
    const fitted = structuredClone(original);
    fitted.mounts.push({ weaponId: 'medium_laser', location: 'right_torso' });
    const afterFit = pushDesign(beginDesignHistory(original), fitted);
    const armourPreview = structuredClone(fitted);
    armourPreview.armour.head -= 1;
    const armourFinal = structuredClone(armourPreview);
    armourFinal.armour.head -= 2;

    let history = previewDesign(afterFit, 'armour', armourPreview);
    history = previewDesign(history, 'armour', armourFinal);
    history = finishDesignTransaction(history, 'armour');

    expect(history.past).toHaveLength(2);
    const undone = undoDesign(history);
    expect(undone.present).toEqual(fitted);
    expect(redoDesign(undone).present).toEqual(armourFinal);
  });

  it('invalidates armour redo as soon as a new armour branch starts', () => {
    const original = sentinel();
    const armour = structuredClone(original);
    armour.armour.head -= 2;
    const edited = finishDesignTransaction(
      previewDesign(beginDesignHistory(original), 'armour', armour),
      'armour',
    );
    const undone = undoDesign(edited);
    const branch = structuredClone(undone.present);
    branch.armour.head -= 1;
    const branched = previewDesign(undone, 'armour', branch);

    expect(undone.future).toHaveLength(1);
    expect(branched.future).toEqual([]);
    expect(redoDesign(branched)).toBe(branched);
  });

  it('coalesces a whole name entry and cuts off redo on the first new character', () => {
    const original = sentinel();
    const prior = structuredClone(original);
    prior.armour.head -= 1;
    const undone = undoDesign(pushDesign(beginDesignHistory(original), prior));
    let typing = undone;

    for (const name of ['N', 'Ne', 'New', 'New Name']) {
      const next = structuredClone(typing.present);
      next.name = name;
      typing = previewDesign(typing, 'name', next);
    }

    expect(typing.present.name).toBe('New Name');
    expect(typing.past).toHaveLength(1);
    expect(typing.future).toEqual([]);
    expect(undoDesign(typing).present).toEqual(original);
    expect(redoDesign(typing)).toBe(typing);
  });
});

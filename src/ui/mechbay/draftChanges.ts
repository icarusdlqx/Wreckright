import type { Design } from '../../schema/design';

/** History length is not dirtiness: Undo can restore the original fitting. */
export function designHasChanges(saved: Design, draft: Design): boolean {
  return JSON.stringify(saved) !== JSON.stringify(draft);
}

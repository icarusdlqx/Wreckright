export interface CommandAcknowledgement {
  id: number;
  text: string;
  tone: 'confirmed' | 'attention';
}

let current: CommandAcknowledgement | null = null;
let serial = 0;
const listeners = new Set<() => void>();

export const readCommandReceipt = (): CommandAcknowledgement | null => current;
export function subscribeCommandReceipt(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function emit(): void { for (const listener of listeners) listener(); }

export function acknowledgeCommand(text: string, tone: CommandAcknowledgement['tone'] = 'confirmed'): void {
  current = { id: ++serial, text, tone };
  emit();
}

export function clearCommandReceipt(id?: number): void {
  if (id !== undefined && current?.id !== id) return;
  current = null;
  emit();
}

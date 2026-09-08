import { useEffect, useSyncExternalStore } from 'react';
import { clearCommandReceipt, readCommandReceipt, subscribeCommandReceipt } from './commandReceiptState';
import './commandReceipt.css';

export function CommandReceipt() {
  const receipt = useSyncExternalStore(subscribeCommandReceipt, readCommandReceipt, () => null);
  useEffect(() => {
    if (receipt === null) return;
    const timer = setTimeout(() => clearCommandReceipt(receipt.id), 4_000);
    return () => clearTimeout(timer);
  }, [receipt]);
  if (receipt === null) return null;
  return <div className={`command-receipt command-receipt--${receipt.tone}`}
    role="status" aria-live="polite" aria-atomic="true" data-testid="command-receipt">
    <span aria-hidden="true">{receipt.tone === 'confirmed' ? '✓' : '!'}</span> {receipt.text}
  </div>;
}

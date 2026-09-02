import type { NextStep, NextStepTarget } from './nextSteps';
import './campaignGuide.css';

const TARGET_TESTIDS: Record<NextStepTarget, string> = {
  contract: 'camp-contract',
  bay: 'camp-bay',
  roster: 'camp-roster',
  store: 'camp-store',
  market: 'camp-market',
};

function reveal(target: NextStepTarget): void {
  const panel = globalThis.document?.querySelector<HTMLElement>(
    `[data-testid="${TARGET_TESTIDS[target]}"]`,
  );
  panel?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  panel?.focus({ preventScroll: true });
}

/** The standing "what next" strip that takes over once the first-drop guide retires. */
export function CampaignNext({ steps }: { steps: NextStep[] }) {
  if (steps.length === 0) return null;
  const warnings = steps.filter((step) => step.tone === 'warn').length;

  return (
    <section
      className="campaign-guide campaign-next"
      data-testid="campaign-next"
      aria-live="polite"
    >
      <span>
        {warnings > 0 ? `${warnings} thing${warnings === 1 ? ' needs' : 's need'} attention` : 'What next'}
      </span>
      <ul className="campaign-next-list">
        {steps.map((step) => (
          <li key={step.id} className={step.tone} data-testid={`campaign-next-${step.id}`}>
            <button type="button" onClick={() => reveal(step.target)}>
              {step.text}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

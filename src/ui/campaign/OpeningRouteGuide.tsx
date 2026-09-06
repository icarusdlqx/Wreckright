import type { OpeningRecommendation } from './openingRoute';
import { WikiLink } from '../wiki/WikiLink';
import './openingRoute.css';

interface Props {
  recommendation: OpeningRecommendation;
  selectedId: string | null;
  onReview: (nodeId: string) => void;
  onDismiss: () => void;
}

export function OpeningRouteGuide({ recommendation, selectedId, onReview, onDismiss }: Props) {
  const { route, step, node, stepNumber, links } = recommendation;
  return <section className="opening-route" aria-labelledby="opening-route-title" data-testid="opening-route">
    <header>
      <div><p>Suggested opening · contract {stepNumber} of {route.steps.length}</p>
        <h3 id="opening-route-title">{route.title}</h3></div>
      <button type="button" className="opening-route-dismiss" data-testid="opening-route-dismiss" onClick={onDismiss}>Hide opening guide</button>
    </header>
    <div className="opening-route-body">
      <div><h4>{node.name}</h4><p>{step.purpose}</p>
        <button type="button" className="opening-route-review" data-testid="opening-route-review" onClick={() => onReview(node.id)}>
          {selectedId === node.id ? 'Review selected contract' : `Review ${node.name}`}
        </button>
        <small>Choose any available contract on the map.</small>
      </div>
      <aside aria-label="Command practice and background"><h4>Try this on the next drop</h4><p>{step.practice}</p>
        <nav aria-label="Opening route background">{links.map((link) => <WikiLink key={`${link.kind}:${link.id}`} to={{ kind: link.kind, id: link.id }}>{link.label}</WikiLink>)}</nav>
      </aside>
    </div>
  </section>;
}

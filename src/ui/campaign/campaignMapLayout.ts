export interface CampaignMapLabel {
  id: string;
  position: { x: number; y: number };
  available: boolean;
  /** An observed card can be taller than the initial typography estimate. */
  height?: number;
}

export interface CampaignMapCard {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MAP_LABEL_GAP = 8;
export const MAP_EDGE_PADDING = 12;
export const MAP_LEGEND_SPACE = 32;
export const MAP_SSR_SIZE = { width: 1000, height: 550 };

export function mapLabelWidth(width: number): number {
  return Math.max(1, Math.min(width - MAP_EDGE_PADDING * 2, width >= 720 ? 144 : width >= 480 ? 120 : 112));
}

export function mapLabelHeight(available: boolean): number { return available ? 68 : 56; }

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

function clearOf(a: CampaignMapCard, b: CampaignMapCard): boolean {
  return Math.abs(a.x - b.x) + 0.001 >= (a.width + b.width) / 2 + MAP_LABEL_GAP
    || Math.abs(a.y - b.y) + 0.001 >= (a.height + b.height) / 2 + MAP_LABEL_GAP;
}

/** Extra viewport height can spread the settled layout without changing its minimum. */
function fitHeight(cards: Map<string, CampaignMapCard>, minimumHeight: number, requestedHeight: number) {
  const height = Math.max(minimumHeight, requestedHeight);
  const reserved = MAP_EDGE_PADDING * 2 + MAP_LEGEND_SPACE;
  const scale = (height - reserved) / (minimumHeight - reserved);
  const adjusted = new Map([...cards].map(([id, card]) => [id, {
    ...card, y: MAP_EDGE_PADDING + (card.y - MAP_EDGE_PADDING) * scale,
  }]));
  return { height, minimumHeight, cards: adjusted };
}

/**
 * Find the closest free rectangle to each authored location, in stable authored
 * order. Candidate edges push only overlapping labels; no simulation data or
 * random stream is involved. A taller map is preferable to clipped text.
 */
export function layoutCampaignMap(labels: readonly CampaignMapLabel[], size = MAP_SSR_SIZE) {
  const width = Number.isFinite(size.width) && size.width > 0 ? size.width : MAP_SSR_SIZE.width;
  const requestedHeight = Number.isFinite(size.height) && size.height > 0 ? size.height : MAP_SSR_SIZE.height;
  const nodeWidth = mapLabelWidth(width);
  const heights = labels.map((label) => Math.max(mapLabelHeight(label.available), label.height ?? 0));
  const tallest = Math.max(68, ...heights);
  const columns = Math.max(1, Math.floor((width - MAP_EDGE_PADDING * 2 + MAP_LABEL_GAP) / (nodeWidth + MAP_LABEL_GAP)));
  const rows = Math.ceil(labels.length / columns);
  const packingBound = MAP_EDGE_PADDING * 2 + MAP_LEGEND_SPACE
    + rows * tallest + Math.max(0, rows - 1) * MAP_LABEL_GAP;
  // This intrinsic solve must not depend on observed height: the CSS minimum
  // changes that measurement, so feeding it back into packing can oscillate.
  let height = Math.max(width < 480 ? 420 : 550, packingBound);

  // In the worst case one extra row per label provides a complete vertical
  // stack. Restart after growth so the authored geography scales consistently.
  for (let attempt = 0; attempt <= labels.length; attempt += 1) {
    const cards = new Map<string, CampaignMapCard>();
    for (const [index, label] of labels.entries()) {
      const cardHeight = heights[index] ?? tallest;
      const left = MAP_EDGE_PADDING + nodeWidth / 2;
      const right = width - MAP_EDGE_PADDING - nodeWidth / 2;
      const top = MAP_EDGE_PADDING + cardHeight / 2;
      const bottom = height - MAP_EDGE_PADDING - MAP_LEGEND_SPACE - cardHeight / 2;
      const desired = {
        x: clamp(label.position.x * width, left, right),
        y: clamp(label.position.y * height, top, bottom),
      };
      const xs = [desired.x, left, right];
      const ys = [desired.y, top, bottom];
      for (const placed of cards.values()) {
        const dx = (nodeWidth + placed.width) / 2 + MAP_LABEL_GAP;
        const dy = (cardHeight + placed.height) / 2 + MAP_LABEL_GAP;
        xs.push(clamp(placed.x - dx, left, right), clamp(placed.x + dx, left, right));
        ys.push(clamp(placed.y - dy, top, bottom), clamp(placed.y + dy, top, bottom));
      }
      let best: CampaignMapCard | null = null;
      let bestDistance = Infinity;
      for (const y of [...new Set(ys)].sort((a, b) => a - b)) {
        for (const x of [...new Set(xs)].sort((a, b) => a - b)) {
          const distance = (x - desired.x) ** 2 + (y - desired.y) ** 2;
          if (distance >= bestDistance) continue;
          const candidate = { id: label.id, x, y, width: nodeWidth, height: cardHeight };
          if (![...cards.values()].every((placed) => clearOf(candidate, placed))) continue;
          best = candidate;
          bestDistance = distance;
        }
      }
      if (best === null) break;
      cards.set(label.id, best);
    }
    if (cards.size === labels.length) return { width, nodeWidth, ...fitHeight(cards, height, requestedHeight) };
    height += tallest + MAP_LABEL_GAP;
  }
  // The bounded search above normally succeeds near the authored geography.
  // This deterministic stack also handles unusually dense future campaigns.
  let y = MAP_EDGE_PADDING;
  const cards = new Map<string, CampaignMapCard>();
  labels.forEach((label, index) => {
    const cardHeight = heights[index] ?? tallest;
    cards.set(label.id, { id: label.id, x: width / 2, y: y + cardHeight / 2, width: nodeWidth, height: cardHeight });
    y += cardHeight + MAP_LABEL_GAP;
  });
  const minimumHeight = Math.max(height, y + MAP_EDGE_PADDING + MAP_LEGEND_SPACE);
  return { width, nodeWidth, ...fitHeight(cards, minimumHeight, requestedHeight) };
}

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { teamColour } from '../render/palette';
import type { Vec2 } from '../sim/types';
import type { Engine } from './engine';
import {
  routeCommanderOrder,
  type CommanderOrderTarget,
} from './commanderOrders';
import {
  commanderPointFromClient,
  commanderPoints,
  supportLanePoints,
} from './commanderViewGeometry';
import {
  buildCommanderViewModel,
  type CommanderChitView,
  type CommanderContactView,
} from './commanderViewModel';
import { useCommanderView } from './commanderViewState';
import { useGame } from './store';
import { supportRadius } from './supportOptions';
import './commanderView.css';

interface CommanderViewProps {
  engine: Engine | null;
  compact?: boolean;
}

interface SupportAim {
  pointerId: number;
  at: Vec2;
  to: Vec2;
}

function colourForTeam(team: number): string {
  return `#${teamColour(team).toString(16).padStart(6, '0')}`;
}

function eventTarget(
  element: EventTarget | null,
  point: Vec2,
  chits: readonly CommanderChitView[],
  contacts: readonly CommanderContactView[],
): CommanderOrderTarget {
  const marker = element instanceof Element
    ? element.closest<SVGElement>('[data-commander-kind][data-commander-id]')
    : null;
  const id = Number(marker?.dataset.commanderId);
  const kind = marker?.dataset.commanderKind;
  if (Number.isFinite(id) && (kind === 'friendly' || kind === 'optical')) {
    const chit = chits.find((entry) => entry.id === id && entry.kind === kind);
    if (chit !== undefined) return { kind, id: chit.id, position: chit.position };
  }
  if (Number.isFinite(id) && kind === 'contact') {
    const contact = contacts.find((entry) => entry.id === id);
    if (contact !== undefined) {
      return { kind: 'contact', id: contact.id, position: contact.position };
    }
  }
  return { kind: 'ground', position: point };
}

function currentActions() {
  const game = useGame.getState();
  return {
    setSelection: game.setSelection,
    setOrderMode: game.setOrderMode,
    setSupportMode: game.setSupportMode,
    patch: game.patch,
  };
}

export function CommanderView({ engine, compact = false }: CommanderViewProps) {
  const active = useCommanderView();
  const state = useGame();
  const svgRef = useRef<SVGSVGElement>(null);
  const [supportAim, setSupportAim] = useState<SupportAim | null>(null);
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const [orderRevision, setOrderRevision] = useState(0);
  const model = useMemo(
    () =>
      engine === null
        ? null
        : buildCommanderViewModel(engine.world, {
            playerTeam: state.playerTeam,
            selection: state.selection,
            contacts: state.contacts,
          }),
    [engine, orderRevision, state.contacts, state.playerTeam, state.selection, state.tick],
  );

  useEffect(() => {
    document.documentElement.classList.toggle('commander-mode', active);
    if (!active) {
      setSupportAim(null);
      setCursor(null);
    }
    return () => document.documentElement.classList.remove('commander-mode');
  }, [active]);

  if (engine === null || model === null) return null;

  const worldPoint = (event: ReactPointerEvent<SVGSVGElement>): Vec2 => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return commanderPointFromClient(
      { x: event.clientX, y: event.clientY },
      bounds,
      model,
    );
  };

  const issue = (
    target: CommanderOrderTarget,
    pointer: {
      button: number;
      ctrlKey?: boolean;
      shiftKey?: boolean;
      mobile?: boolean;
      headingTo?: Vec2;
    },
  ): void => {
    const current = useGame.getState();
    const result = routeCommanderOrder({
      engine,
      state: current,
      actions: currentActions(),
      target,
      pointer,
    });
    if (result.kind !== 'ignored') setOrderRevision((revision) => revision + 1);
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (state.finished) return;
    engine.audio.unlock();
    const point = worldPoint(event);
    setCursor(point);
    const secondary = event.button === 2 || (event.button === 0 && event.ctrlKey);
    if (
      state.supportMode !== null &&
      event.button === 0 &&
      !secondary &&
      engine.supportNeedsHeading(state.supportMode)
    ) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setSupportAim({ pointerId: event.pointerId, at: point, to: point });
      return;
    }
    issue(eventTarget(event.target, point, model.chits, model.contacts), {
      button: event.button,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      mobile: compact || event.pointerType === 'touch',
    });
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const point = worldPoint(event);
    setCursor(point);
    engine.cursorWorld = point;
    setSupportAim((aim) =>
      aim?.pointerId === event.pointerId ? { ...aim, to: point } : aim,
    );
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const aim = supportAim;
    if (aim === null || aim.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    issue({ kind: 'ground', position: aim.at }, {
      button: 0,
      mobile: compact || event.pointerType === 'touch',
      headingTo: worldPoint(event),
    });
    setSupportAim(null);
  };

  const markerSize = Math.max(model.tileSize * 1.3, Math.min(model.width, model.height) / 34);
  const labelSize = markerSize * 0.42;
  const routeByEntity = new Map(model.chits.map((chit) => [chit.id, colourForTeam(chit.team)]));
  const supportRange = supportRadius(engine.world.rules.support, state.supportMode);
  const air = engine.world.rules.support.air_strike;
  const friendlyCount = model.chits.filter((chit) => chit.kind === 'friendly').length;
  const opticalCount = model.chits.length - friendlyCount;

  return (
    <section
      className="commander-view"
      hidden={!active}
      aria-hidden={!active}
      data-testid="commander-view"
      data-compact={compact || undefined}
    >
      <header className="commander-map-header">
        <strong>Commander</strong>
        <span>{state.paused ? 'Planning halt' : `${state.speed}× live`}</span>
        <span>{friendlyCount} friendly · {opticalCount} optical · {model.contacts.length} sensor</span>
      </header>
      <div className="commander-map-frame">
        <svg
          ref={svgRef}
          className={`commander-map${state.orderMode !== null || state.supportMode !== null ? ' ordering' : ''}`}
          viewBox={`0 0 ${model.width} ${model.height}`}
          preserveAspectRatio="xMidYMid meet"
          aria-label="Commander tactical map. Select friendly units and issue battlefield orders."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setSupportAim(null)}
          onLostPointerCapture={() => setSupportAim(null)}
          onContextMenu={(event) => event.preventDefault()}
          data-testid="commander-map"
        >
          <defs>
            <pattern
              id="commander-grid"
              width={model.tileSize * 5}
              height={model.tileSize * 5}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${model.tileSize * 5} 0 L 0 0 0 ${model.tileSize * 5}`}
                fill="none"
                stroke="rgba(140, 224, 255, 0.16)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            </pattern>
          </defs>
          <rect className="commander-map-border" width={model.width} height={model.height} />
          <rect className="commander-grid-major" width={model.width} height={model.height} />

          {model.zones.map((zone) => {
            const owner = zone.owner === null ? '#81909a' : colourForTeam(zone.owner);
            return (
              <g key={zone.id} data-testid={`commander-zone-${zone.id}`}>
                <circle
                  className={`commander-zone${zone.contested ? ' contested' : ''}`}
                  cx={zone.position.x}
                  cy={zone.position.y}
                  r={zone.radius}
                  fill={owner}
                  stroke={owner}
                />
                <text
                  className="commander-zone-label"
                  x={zone.position.x}
                  y={zone.position.y - zone.radius - markerSize * 0.2}
                  style={{ fontSize: labelSize }}
                >
                  {zone.name}
                </text>
              </g>
            );
          })}

          {model.routes.map((route) => {
            const colour = routeByEntity.get(route.entityId) ?? '#8ce0ff';
            return (
              <g key={route.entityId} data-testid={`commander-route-${route.entityId}`}>
                <polyline
                  className="commander-route"
                  points={commanderPoints(route.active.points)}
                  stroke={colour}
                />
                {route.queued.map((leg, index) => (
                  <polyline
                    key={`${route.entityId}-${index}`}
                    className="commander-route queued"
                    points={commanderPoints(leg.points)}
                    stroke={colour}
                    data-testid={`commander-route-${route.entityId}-queued-${index}`}
                  />
                ))}
                {route.active.points.at(-1) === undefined ? null : (
                  <circle
                    className="commander-route-end"
                    cx={route.active.points.at(-1)?.x}
                    cy={route.active.points.at(-1)?.y}
                    r={markerSize * 0.18}
                    stroke={colour}
                  />
                )}
              </g>
            );
          })}

          {model.chits.map((chit) => {
            const colour = colourForTeam(chit.team);
            const rotation = (chit.facing * 180) / Math.PI;
            return (
              <g
                key={chit.id}
                className={`commander-chit ${chit.kind}${chit.selected ? ' selected' : ''}`}
                transform={`translate(${chit.position.x} ${chit.position.y})`}
                color={colour}
                data-commander-kind={chit.kind}
                data-commander-id={chit.id}
                data-testid={`commander-chit-${chit.id}`}
              >
                {chit.kind === 'friendly' ? (
                  <rect
                    className="commander-chit-body"
                    x={-markerSize * 0.44}
                    y={-markerSize * 0.34}
                    width={markerSize * 0.88}
                    height={markerSize * 0.68}
                    rx={markerSize * 0.1}
                    stroke={colour}
                  />
                ) : (
                  <polygon
                    className="commander-chit-body"
                    points={`0,${-markerSize * 0.48} ${markerSize * 0.48},0 0,${markerSize * 0.48} ${-markerSize * 0.48},0`}
                    stroke={colour}
                  />
                )}
                <polygon
                  className="commander-facing"
                  points={`${markerSize * 0.48},0 ${markerSize * 0.78},${-markerSize * 0.18} ${markerSize * 0.78},${markerSize * 0.18}`}
                  transform={`rotate(${rotation})`}
                />
                <circle className="commander-chit-hit" r={markerSize * 0.78} />
                <text className="commander-chit-label" style={{ fontSize: labelSize }}>
                  {chit.kind === 'friendly' ? `L${chit.id}` : `H${chit.id}`}
                </text>
              </g>
            );
          })}

          {model.contacts.map((contact) => (
            <g
              key={contact.id}
              className={`commander-contact ${contact.current ? 'current' : 'memory'}`}
              transform={`translate(${contact.position.x} ${contact.position.y})`}
              data-commander-kind="contact"
              data-commander-id={contact.id}
              data-testid={`commander-contact-${contact.id}`}
            >
              <polygon
                className="commander-contact-body"
                points={`0,${-markerSize * 0.44} ${markerSize * 0.44},0 0,${markerSize * 0.44} ${-markerSize * 0.44},0`}
              />
              <circle className="commander-contact-hit" r={markerSize * 0.78} />
              <text className="commander-contact-label" style={{ fontSize: labelSize }}>
                {contact.current ? `C${contact.id}` : `M${contact.id}`}
              </text>
            </g>
          ))}

          {cursor !== null && supportRange !== null ? (
            <circle
              className="commander-support-aim"
              cx={cursor.x}
              cy={cursor.y}
              r={supportRange}
              data-testid="commander-support-radius"
            />
          ) : null}
          {supportAim === null ? null : (
            <polygon
              className="commander-support-aim"
              points={supportLanePoints(supportAim.at, supportAim.to, air.length, air.width)}
              data-testid="commander-support-lane"
            />
          )}
        </svg>
      </div>
      <footer className="commander-map-footer">
        <span>Click select · right-click order · Shift queues</span>
        <span>{state.supportMode ?? state.orderMode ?? 'Direct command'}</span>
      </footer>
    </section>
  );
}

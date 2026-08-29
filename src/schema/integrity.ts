import { validateDesign } from './designValidation';
import type { Catalog, ContentIssue } from './load';
import type { Deployment } from './mission';

type Push = (file: string, path: string, message: string) => void;

// Mirror Ridge fields the same authored lance on both sides so balance measures
// the machines rather than two different pilot rosters.
const DUPLICATE_PILOT_EXEMPTIONS = new Set(['mirror_ridge']);

function checkDesigns(catalog: Catalog, push: Push): void {
  for (const design of catalog.designs.values()) {
    const file = `designs/${design.id}.json`;
    for (const issue of validateDesign(catalog, design).issues) {
      const path = issue.path.map(String).join('.') || issue.component;
      push(file, path, issue.message);
    }
  }
}

function checkMissions(catalog: Catalog, push: Push): void {
  for (const mission of catalog.missions.values()) {
    const file = `missions/${mission.id}.json`;
    const map = catalog.maps.get(mission.mapId);

    if (
      mission.atmosphereId !== undefined &&
      !catalog.atmospheres.has(mission.atmosphereId)
    ) {
      push(file, 'atmosphereId', `unknown atmosphere "${mission.atmosphereId}"`);
    }

    if (map === undefined) {
      push(file, 'mapId', `unknown map "${mission.mapId}"`);
      continue;
    }

    const extentX = map.width * map.tileSize;
    const extentY = map.height * map.tileSize;
    const pilotDeployments = new Map<string, string>();

    const checkDeployment = (unit: Deployment, path: string): void => {
      if (!catalog.designs.has(unit.designId)) {
        push(file, path, `unknown design "${unit.designId}"`);
      }
      if (!catalog.pilots.has(unit.pilotId)) {
        push(file, path, `unknown pilot "${unit.pilotId}"`);
      }
      if (!DUPLICATE_PILOT_EXEMPTIONS.has(mission.id)) {
        const firstPath = pilotDeployments.get(unit.pilotId);
        if (firstPath === undefined) {
          pilotDeployments.set(unit.pilotId, path);
        } else {
          push(file, `${path}.pilotId`, `duplicate pilot "${unit.pilotId}"; first deployed at ${firstPath}`);
        }
      }
      if (unit.spawn.x >= extentX || unit.spawn.y >= extentY) {
        push(
          file,
          path,
          `spawn (${unit.spawn.x}, ${unit.spawn.y}) is outside the ${extentX}×${extentY}m map`,
        );
        return;
      }

      const column = Math.floor(unit.spawn.x / map.tileSize);
      const row = Math.floor(unit.spawn.y / map.tileSize);
      const symbol = map.tiles[row]?.[column];
      const terrainId = symbol === undefined ? undefined : map.legend[symbol];
      const terrain = terrainId === undefined ? undefined : catalog.rules.terrain.types[terrainId];

      if (terrain === undefined || !terrain.passable) {
        push(
          file,
          path,
          `spawn (${unit.spawn.x}, ${unit.spawn.y}) is on impassable terrain "${terrainId ?? '?'}"`,
        );
      }
    };

    mission.lances.forEach((lance, lanceIndex) =>
      lance.units.forEach((unit, unitIndex) =>
        checkDeployment(unit, `lances.${lanceIndex}.units.${unitIndex}`),
      ),
    );
    mission.reserves.forEach((unit, unitIndex) => checkDeployment(unit, `reserves.${unitIndex}`));

    mission.zones.forEach((zone, index) => {
      if (zone.x < extentX && zone.y < extentY) return;
      push(
        file,
        `zones.${index}`,
        `zone (${zone.x}, ${zone.y}) is outside the ${extentX}×${extentY}m map`,
      );
    });

    mission.triggers.forEach((trigger, triggerIndex) => {
      trigger.effects.forEach((effect, effectIndex) => {
        const path = `triggers.${triggerIndex}.effects.${effectIndex}`;
        if (effect.type === 'spawn') {
          effect.units.forEach((unit, unitIndex) =>
            checkDeployment(unit, `${path}.units.${unitIndex}`),
          );
        } else if (effect.type === 'reveal' && (effect.x >= extentX || effect.y >= extentY)) {
          push(
            file,
            path,
            `reveal (${effect.x}, ${effect.y}) is outside the ${extentX}×${extentY}m map`,
          );
        }
      });
    });
  }
}

function checkMaps(catalog: Catalog, push: Push): void {
  for (const map of catalog.maps.values()) {
    const file = `maps/${map.id}.json`;
    const cells = map.width * map.height;
    const pathfindingBudget = catalog.rules.simulation.pathfindMaxNodes;
    if (!catalog.atmospheres.has(map.atmosphereId)) {
      push(file, 'atmosphereId', `unknown atmosphere "${map.atmosphereId}"`);
    }
    if (cells > pathfindingBudget) {
      push(
        file,
        'width',
        `${map.width}×${map.height} map has ${cells} cells, exceeding the ${pathfindingBudget}-node pathfinding budget`,
      );
    }
    for (const [symbol, terrainId] of Object.entries(map.legend)) {
      if (catalog.rules.terrain.types[terrainId] === undefined) {
        push(file, `legend.${symbol}`, `unknown terrain type "${terrainId}"`);
      }
    }
  }
}

function checkAiFireModes(catalog: Catalog, push: Push): void {
  for (const [weaponId, policy] of Object.entries(catalog.rules.ai.fireModes)) {
    const weapon = catalog.weapons.get(weaponId);
    if (weapon === undefined) {
      push('rules/ai.json', `fireModes.${weaponId}`, `unknown weapon "${weaponId}"`);
      continue;
    }

    const modeIds = new Set(weapon.modes.map((mode) => mode.id));
    for (const [band, modeId] of Object.entries(policy)) {
      if (modeIds.has(modeId)) continue;
      push(
        'rules/ai.json',
        `fireModes.${weaponId}.${band}`,
        `unknown mode "${modeId}" for weapon "${weaponId}"`,
      );
    }
  }
}

function checkCampaigns(catalog: Catalog, push: Push): void {
  for (const campaign of catalog.campaigns.values()) {
    const file = `campaigns/${campaign.id}.json`;

    for (const node of campaign.nodes) {
      if (!catalog.missions.has(node.missionId)) {
        push(file, `nodes.${node.id}`, `unknown mission "${node.missionId}"`);
      }
    }

    for (const missionId of campaign.sideWork.missionIds) {
      if (!catalog.missions.has(missionId)) {
        push(file, 'sideWork.missionIds', `unknown mission "${missionId}"`);
      }
    }

    for (const designId of campaign.startingDesignIds) {
      if (!catalog.designs.has(designId)) {
        push(file, 'startingDesignIds', `unknown design "${designId}"`);
      }
    }

    for (const pilotId of [...campaign.startingPilotIds, ...campaign.hiringPoolPilotIds]) {
      if (!catalog.pilots.has(pilotId)) {
        push(file, 'startingPilotIds', `unknown pilot "${pilotId}"`);
      }
    }
  }
}

export function checkIntegrity(catalog: Catalog, issues: ContentIssue[]): void {
  const push: Push = (file, path, message) => issues.push({ file, path, message });
  checkMaps(catalog, push);
  checkDesigns(catalog, push);
  checkMissions(catalog, push);
  checkAiFireModes(catalog, push);
  checkCampaigns(catalog, push);
}

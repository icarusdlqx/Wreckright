import type { Catalog } from '../schema/load';
import { computeLoadout, weaponSize, weaponSizeLabel } from '../sim/loadout';
import type { WikiArticle } from './library';

export interface CatalogueAudit {
  issues: string[];
  mechs: {
    faction: string; chassis: string; design: string; role: string; tonnage: number;
    weapons: string; ammo: string; status: string;
  }[];
  weapons: {
    faction: string; name: string; type: string; size: string; slots: number;
    damage: number; range: number; ammo: string;
  }[];
  pilots: { name: string; skills: string; personality: string; portrait: string }[];
}

export function auditCatalogue(
  catalog: Catalog,
  library: ReadonlyMap<string, WikiArticle>,
): CatalogueAudit {
  const issues: string[] = [];
  const machineArticles = [...library.values()].filter((article) => article.kind === 'mech');
  const mechChassis = [...catalog.chassis.values()].filter((chassis) => chassis.frame === 'mech');
  const byChassis = new Map(machineArticles.map((article) => [article.chassis.id, article]));
  for (const chassis of mechChassis) {
    if (!byChassis.has(chassis.id)) issues.push(`${chassis.name} has no machine wiki article`);
    if (chassis.strengths.length === 0) issues.push(`${chassis.name} has no stated strength`);
    if (chassis.weaknesses.length === 0) issues.push(`${chassis.name} has no stated weakness`);
  }
  for (const article of machineArticles) {
    if (article.title !== article.chassis.name) issues.push(`${article.id} title differs from its chassis`);
    if (article.summary !== article.chassis.summary) issues.push(`${article.id} summary differs from its chassis`);
    if (article.design.chassisId !== article.chassis.id) issues.push(`${article.id} stock design uses another chassis`);
  }

  const mechs = machineArticles.map((article) => {
    const loadout = computeLoadout(catalog, article.design);
    if (!loadout.valid) issues.push(`${article.design.name} is illegal: ${loadout.issues.map((issue) => issue.code).join(', ')}`);
    const ammo = article.design.ammo.map((bin) => {
      const weapon = catalog.weapons.get(bin.weaponId);
      return `${weapon?.name ?? bin.weaponId} ${bin.tons}t`;
    }).join('; ') || 'none required';
    return {
      faction: article.chassis.faction,
      chassis: article.chassis.name,
      design: article.design.name,
      role: article.chassis.role,
      tonnage: article.chassis.tonnage,
      weapons: article.design.mounts.map((mount) => catalog.weapons.get(mount.weaponId)?.name ?? mount.weaponId).join('; '),
      ammo,
      status: loadout.valid ? 'consistent' : 'review',
    };
  }).sort((a, b) => a.faction.localeCompare(b.faction) || a.tonnage - b.tonnage);

  const portraitKeys = new Map<string, string>();
  const pilots = [...catalog.pilots.values()].map((pilot) => {
    const portrait = JSON.stringify(pilot.portrait ?? {});
    const duplicate = portraitKeys.get(portrait);
    if (pilot.portrait === undefined) issues.push(`${pilot.name} has no portrait`);
    else if (duplicate !== undefined) issues.push(`${pilot.name} shares a portrait specification with ${duplicate}`);
    else portraitKeys.set(portrait, pilot.name);
    if (pilot.personality === undefined) issues.push(`${pilot.name} has no authored personality`);
    return {
      name: pilot.name,
      skills: `${pilot.gunnery}/${pilot.piloting}/${pilot.sensors}`,
      personality: pilot.personality?.label ?? 'missing',
      portrait: pilot.portrait === undefined ? 'missing' : 'distinct',
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const weapons = [...catalog.weapons.values()].map((weapon) => ({
    faction: weapon.faction,
    name: weapon.name,
    type: weapon.type,
    size: weaponSizeLabel(catalog, weaponSize(catalog, weapon)),
    slots: weapon.slots,
    damage: weapon.damage * weapon.projectiles,
    range: weapon.range.long,
    ammo: weapon.ammoPerTon === null ? 'none' : `${weapon.ammoPerTon}/t`,
  })).sort((a, b) => a.faction.localeCompare(b.faction) || a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  return { issues, mechs, weapons, pilots };
}

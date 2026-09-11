import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { getCatalog } from '../src/schema/load';
import { auditCatalogue } from '../src/wiki/catalogueAudit';
import { getWikiLibrary } from '../src/wiki/library';

const output = process.env.CONTENT_AUDIT_OUT ?? 'docs/review/release-audit/content-consistency.md';
const audit = auditCatalogue(getCatalog(), getWikiLibrary());
const table = (head: string[], rows: (string | number)[][]) => [
  `| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`,
  ...rows.map((row) => `| ${row.join(' | ')} |`),
];
const lines = [
  '# Catalogue consistency report', '',
  'Generated from the same validated catalogue used by the mechbay, deployment screen, battle HUD and wiki.', '',
  `Result: **${audit.issues.length === 0 ? 'pass' : `${audit.issues.length} issue(s)`}**`, '',
  '## Machines', '',
  ...table(['Faction', 'Chassis', 'Stock design', 'Role', 'Tons', 'Weapons', 'Ammo', 'Status'],
    audit.mechs.map((mech) => [mech.faction, mech.chassis, mech.design, mech.role, mech.tonnage, mech.weapons, mech.ammo, mech.status])), '',
  '## Weapons', '',
  ...table(['Faction', 'Weapon', 'Type', 'Size', 'Slots', 'Damage', 'Long range', 'Ammo'],
    audit.weapons.map((weapon) => [weapon.faction, weapon.name, weapon.type, weapon.size, weapon.slots, weapon.damage, weapon.range, weapon.ammo])), '',
  '## Pilots', '',
  ...table(['Pilot', 'G/P/S', 'Temperament', 'Portrait'],
    audit.pilots.map((pilot) => [pilot.name, pilot.skills, pilot.personality, pilot.portrait])), '',
  '## Display source map', '',
  '- Machine names, roles, weight, strengths and weaknesses come from the live chassis record.',
  '- Weapon damage, range, slots, size and ammunition come from the live weapon record.',
  '- Stock equipment and ammunition come from the design that the simulation validates.',
  '- Pilot skills, biography, personality and portrait come from the live pilot record.', '',
  ...(audit.issues.length === 0 ? [] : ['## Issues', '', ...audit.issues.map((issue) => `- ${issue}`), '']),
];
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${lines.join('\n').trimEnd()}\n`);
console.log(`${audit.issues.length === 0 ? 'PASS' : 'FAIL'} ${audit.mechs.length} machines, ${audit.weapons.length} weapons, ${audit.pilots.length} pilots`);
console.log(output);
if (audit.issues.length > 0) process.exitCode = 1;

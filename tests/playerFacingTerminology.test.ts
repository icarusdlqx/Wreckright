import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const DATA = join(SRC, 'data');

interface ProhibitedTerm {
  label: string;
  pattern: RegExp;
}

const PROHIBITED_TERMS: readonly ProhibitedTerm[] = [
  { label: 'C-bill', pattern: /\bc[- ]?bills?\b/i },
  { label: 'BattleMech', pattern: /\bbattle\s*mechs?\b/i },
  {
    label: 'named predecessor franchises',
    pattern: /\b(?:BattleTech|MechWarrior|MechCommander)\b/i,
  },
  {
    label: 'legacy missile or projector designation',
    pattern: /\b(?:PPC|LRM|SRM|MRM|NARC|TAG)\b/i,
  },
  { label: 'numbered autocannon designation', pattern: /\bAC\s*\/?\s*(?:2|5|10|20)\b/i },
  { label: 'LB-X', pattern: /\bLB[ -]?X\b/i },
  { label: 'CASE equipment designation', pattern: /\bCASE\b/ },
  {
    label: 'legacy equipment designation',
    pattern: /\b(?:Double Heat Sink|Active Probe)\b/i,
  },
  {
    label: 'legacy laser or Gauss designation',
    pattern:
      /\b(?:ER\s+(?:PPC|Small Laser|Medium Laser|Large Laser)|(?:Small|Medium|Large)\s+Pulse\s+Laser|Heavy Large Laser|(?:Light|Heavy)\s+Gauss(?:\s+Rifle)?)\b/i,
  },
  { label: 'legacy weapon designation', pattern: /\b(?:Streak|Thunderbolt|Inferno)\b/i },
  { label: 'legacy chassis name', pattern: /\b(?:Wisp|Hornet|WSP-1|HNT-2)\b/i },
  {
    label: 'legacy faction or place name',
    pattern: /\b(?:Steel Legion|Wolfhound Detachment|Warden Compact|Kell Reach)\b/i,
  },
];

interface PlayerText {
  location: string;
  value: string;
}

function collectFiles(directory: string, extensions: ReadonlySet<string>): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(path, extensions));
    else if (extensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

function collectInternalIds(value: unknown, found: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectInternalIds(entry, found));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'id' || /Ids?$/.test(key)) {
      if (typeof child === 'string') found.add(child);
      else if (Array.isArray(child)) {
        child
          .filter((entry): entry is string => typeof entry === 'string')
          .forEach((entry) => found.add(entry));
      }
    }
    collectInternalIds(child, found);
  }
}

const INTERNAL_IDS = new Set<string>();
for (const path of collectFiles(DATA, new Set(['.json']))) {
  collectInternalIds(JSON.parse(readFileSync(path, 'utf8')) as unknown, INTERNAL_IDS);
}

function collectDataStrings(value: unknown, path: readonly string[], found: PlayerText[]): void {
  if (typeof value === 'string') {
    found.push({ location: path.join('.'), value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectDataStrings(entry, [...path, String(index)], found));
    return;
  }
  if (value === null || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    // Stable ids preserve old saves and never render. Everything else in data
    // may become copy through a briefing, dossier, tooltip, or event log.
    if (key === 'id' || /Ids?$/.test(key)) continue;
    collectDataStrings(child, [...path, key], found);
  }
}

function isModuleSpecifier(node: ts.StringLiteralLike): boolean {
  const parent = node.parent;
  return (
    (ts.isImportDeclaration(parent) && parent.moduleSpecifier === node) ||
    (ts.isExportDeclaration(parent) && parent.moduleSpecifier === node) ||
    (ts.isExternalModuleReference(parent) && parent.expression === node)
  );
}

function isNonRenderedCodeString(node: ts.StringLiteralLike): boolean {
  const parent = node.parent;
  if (ts.isJsxAttribute(parent)) {
    const attribute = parent.name.getText();
    return attribute === 'id' || attribute === 'className' || attribute.startsWith('data-');
  }
  if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)) {
    return ['endsWith', 'includes', 'startsWith'].includes(parent.expression.name.text);
  }
  return false;
}

function codeStrings(path: string): PlayerText[] {
  const sourceText = readFileSync(path, 'utf8');
  const scriptKind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
  const found: PlayerText[] = [];

  const record = (node: ts.Node, value: string): void => {
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    found.push({
      location: `${relative(ROOT, path)}:${position.line + 1}`,
      value,
    });
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteralLike(node) &&
      !isModuleSpecifier(node) &&
      !isNonRenderedCodeString(node) &&
      !INTERNAL_IDS.has(node.text)
    ) {
      record(node, node.text);
    } else if (
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      record(node, node.text);
    } else if (ts.isJsxText(node)) {
      record(node, node.text);
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return found;
}

function violations(texts: readonly PlayerText[]): string[] {
  const failures: string[] = [];
  for (const text of texts) {
    for (const term of PROHIBITED_TERMS) {
      term.pattern.lastIndex = 0;
      if (term.pattern.test(text.value)) {
        failures.push(`${text.location}: ${term.label} in ${JSON.stringify(text.value)}`);
      }
    }
  }
  return failures;
}

describe('player-facing terminology', () => {
  it('keeps legacy terms out of authored game data', () => {
    const texts: PlayerText[] = [];
    for (const path of collectFiles(DATA, new Set(['.json']))) {
      collectDataStrings(
        JSON.parse(readFileSync(path, 'utf8')) as unknown,
        [relative(ROOT, path)],
        texts,
      );
    }
    expect(violations(texts)).toEqual([]);
  });

  it('keeps legacy terms out of production source strings and JSX', () => {
    const paths = collectFiles(SRC, new Set(['.ts', '.tsx'])).filter(
      (path) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'),
    );
    expect(violations(paths.flatMap(codeStrings))).toEqual([]);
  });

  it('keeps legacy terms out of the install and document shells', () => {
    const paths = [join(ROOT, 'index.html'), join(ROOT, 'public', 'manifest.webmanifest')];
    const texts = paths.map((path) => ({
      location: relative(ROOT, path),
      value: readFileSync(path, 'utf8'),
    }));
    expect(violations(texts)).toEqual([]);
  });
});

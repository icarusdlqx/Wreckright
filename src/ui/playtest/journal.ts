import {
  MAX_PLAYTEST_BYTES,
  MAX_PLAYTEST_EVENTS,
  MAX_PLAYTEST_SECONDS,
  PLAYTEST_EXPORT_SCHEMA,
  PLAYTEST_STORAGE_KEY,
  PlaytestReportSchema,
  PlaytestSurveySchema,
  emptyPlaytestReport,
  eventIdentity,
  type FirstRunEvent,
  type FirstRunEventInput,
  type PlaytestReport,
  type PlaytestSurveyPatch,
  type ReproductionContext,
} from './schema';
import { sanitisePlaytestNote } from './sanitise';

export type PlaytestStorageIssue =
  | 'invalid-report'
  | 'storage-unavailable'
  | 'write-failed'
  | 'remove-failed'
  | 'report-full';

export interface PlaytestSnapshot {
  enabled: boolean;
  persistence: 'persistent' | 'memory-only';
  issue: PlaytestStorageIssue | null;
  report: PlaytestReport | null;
}

export interface PlaytestJournal {
  getSnapshot: () => PlaytestSnapshot;
  subscribe: (listener: () => void) => () => void;
  enable: () => boolean;
  clear: () => boolean;
  record: (event: FirstRunEventInput) => boolean;
  updateSurvey: (patch: PlaytestSurveyPatch) => boolean;
  captureContext: (context: ReproductionContext) => boolean;
  serialiseExport: (note?: string) => string | null;
  serialiseReadable: (note?: string) => string | null;
}

export interface PlaytestJournalOptions {
  storage?: () => Storage | null;
  now?: () => number;
}

interface PlaytestExport {
  schema: typeof PLAYTEST_EXPORT_SCHEMA;
  report: PlaytestReport;
  note?: string;
}

const textBytes = (value: string): number => new TextEncoder().encode(value).byteLength;

function defaultStorage(): Storage | null {
  return globalThis.localStorage ?? null;
}

function defaultNow(): number {
  return globalThis.performance?.now() ?? 0;
}

function cloneReport(report: PlaytestReport): PlaytestReport {
  return PlaytestReportSchema.parse(report);
}

class LocalPlaytestJournal implements PlaytestJournal {
  private readonly listeners = new Set<() => void>();
  private readonly now: () => number;
  private readonly visitStartedAt: number;
  private persistentStorage: Storage | null = null;
  private locked = false;
  private report: PlaytestReport | null = null;
  private persistence: PlaytestSnapshot['persistence'] = 'persistent';
  private issue: PlaytestStorageIssue | null = null;
  private snapshot: PlaytestSnapshot = {
    enabled: false,
    persistence: 'persistent',
    issue: null,
    report: null,
  };

  constructor(options: PlaytestJournalOptions) {
    this.now = options.now ?? defaultNow;
    this.visitStartedAt = this.now();
    this.open(options.storage ?? defaultStorage);
    this.refreshSnapshot();
  }

  getSnapshot = (): PlaytestSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  enable = (): boolean => {
    if (this.report !== null) return true;
    return this.commit(emptyPlaytestReport());
  };

  clear = (): boolean => {
    const storage = this.persistentStorage;
    this.report = null;
    if (storage === null) {
      this.persistence = 'memory-only';
      this.issue = this.issue ?? 'storage-unavailable';
      this.locked = true;
      this.publish();
      return false;
    }

    try {
      storage.removeItem(PLAYTEST_STORAGE_KEY);
      this.persistence = 'persistent';
      this.issue = null;
      this.locked = false;
      this.publish();
      return true;
    } catch {
      this.persistence = 'memory-only';
      this.issue = 'remove-failed';
      this.locked = true;
      this.publish();
      return false;
    }
  };

  record = (input: FirstRunEventInput): boolean => {
    const report = this.report;
    if (report === null) return false;
    const identity = eventIdentity(input);
    if (report.events.some((event) => eventIdentity(event) === identity)) return false;
    if (report.events.length >= MAX_PLAYTEST_EVENTS) {
      this.commit({ ...report, truncated: true });
      this.issue = 'report-full';
      this.publish();
      return false;
    }

    const elapsed = Math.max(0, this.now() - this.visitStartedAt);
    if (elapsed > MAX_PLAYTEST_SECONDS * 1_000) return false;
    const elapsedSeconds = Math.min(
      MAX_PLAYTEST_SECONDS,
      Math.floor(elapsed / 5_000) * 5,
    );
    const event = {
      ...input,
      seq: report.nextSequence,
      visit: report.visits,
      elapsedSeconds,
    } as FirstRunEvent;
    return this.commit({
      ...report,
      nextSequence: report.nextSequence + 1,
      events: [...report.events, event],
    });
  };

  updateSurvey = (patch: PlaytestSurveyPatch): boolean => {
    const report = this.report;
    if (report === null) return false;
    const survey = PlaytestSurveySchema.safeParse({ ...report.survey, ...patch });
    if (!survey.success) return false;
    return this.commit({ ...report, survey: survey.data });
  };

  captureContext = (context: ReproductionContext): boolean => {
    if (this.report === null) return false;
    return this.commit({ ...this.report, context });
  };

  private exportReport(): PlaytestReport | null {
    if (this.report === null) return null;
    const report = cloneReport(this.report);
    const survey = {
      ...report.survey,
      expected: sanitisePlaytestNote(report.survey.expected),
      observed: sanitisePlaytestNote(report.survey.observed),
      reproductionSteps: sanitisePlaytestNote(report.survey.reproductionSteps, 1_000),
    };
    return { ...report, survey, context: survey.includeContext ? report.context : null };
  }

  serialiseExport = (note = ''): string | null => {
    const report = this.exportReport();
    if (report === null) return null;
    const safeNote = sanitisePlaytestNote(note);
    const payload: PlaytestExport = {
      schema: PLAYTEST_EXPORT_SCHEMA,
      report,
      ...(safeNote === '' ? {} : { note: safeNote }),
    };
    return `${JSON.stringify(payload, null, 2)}\n`;
  };

  serialiseReadable = (note = ''): string | null => {
    const report = this.exportReport();
    if (report === null) return null;
    const context = report.context;
    const lines = [
      '# Ironmuster playtest report', '',
      `Build: ${context?.build ?? 'context not included'}`,
      `Mode: ${context?.mode ?? 'context not included'}`,
      `Mission: ${context?.mission || 'not recorded'}`,
      `Faction: ${context?.faction || 'not recorded'}`,
      `Difficulty: ${context?.difficulty || 'not recorded'}`, '',
      '## Bug report',
      `Expected: ${report.survey.expected || 'not supplied'}`,
      `Observed: ${report.survey.observed || 'not supplied'}`,
      `Steps: ${report.survey.reproductionSteps || 'not supplied'}`, '',
      '## Loadout',
      ...(context?.lance.flatMap((unit) => [
        `- ${unit.pilot} — ${unit.mech}`,
        ...unit.loadout.map((weapon) => `  - ${weapon}`),
      ]) ?? ['Context not included.']), '',
      '## Ratings',
      `Next step clarity: ${report.survey.clarity ?? 'not supplied'}`,
      `Combat readability: ${report.survey.combatReadability ?? 'not supplied'}`,
      `Performance: ${report.survey.performance ?? 'not supplied'}`,
      `Would continue: ${report.survey.continueIntent ?? 'not supplied'}`,
      `Confusing areas: ${report.survey.confusion.join(', ') || 'none supplied'}`,
    ];
    const safeNote = sanitisePlaytestNote(note);
    if (safeNote !== '') lines.push('', '## Other notes', safeNote);
    return `${lines.join('\n')}\n`;
  };

  private open(storageFactory: () => Storage | null): void {
    try {
      this.persistentStorage = storageFactory();
      if (this.persistentStorage === null) throw new Error('storage unavailable');
      const raw = this.persistentStorage.getItem(PLAYTEST_STORAGE_KEY);
      if (raw === null) return;
      if (textBytes(raw) > MAX_PLAYTEST_BYTES) {
        this.holdInvalid();
        return;
      }
      const parsed = PlaytestReportSchema.safeParse(JSON.parse(raw) as unknown);
      if (!parsed.success) {
        this.holdInvalid();
        return;
      }
      this.report = {
        ...parsed.data,
        visits: Math.min(999, parsed.data.visits + 1),
      };
      this.writeCurrent();
    } catch (error) {
      if (this.issue === 'invalid-report' || error instanceof SyntaxError) {
        this.holdInvalid();
        return;
      }
      this.persistence = 'memory-only';
      this.issue = 'storage-unavailable';
      this.locked = true;
    }
  }

  private holdInvalid(): void {
    this.report = null;
    this.persistence = 'memory-only';
    this.issue = 'invalid-report';
    this.locked = true;
  }

  private commit(candidate: PlaytestReport): boolean {
    const parsed = PlaytestReportSchema.safeParse(candidate);
    if (!parsed.success) return false;
    const serialised = JSON.stringify(parsed.data);
    if (textBytes(serialised) > MAX_PLAYTEST_BYTES) {
      this.issue = 'report-full';
      const current = this.report;
      if (current !== null && !current.truncated) {
        this.report = { ...current, truncated: true };
        this.writeCurrent();
      } else {
        this.publish();
      }
      return false;
    }
    this.report = parsed.data;
    return this.writeCurrent();
  }

  private writeCurrent(): boolean {
    const report = this.report;
    if (report === null) {
      this.publish();
      return false;
    }
    if (this.locked || this.persistentStorage === null) {
      this.persistence = 'memory-only';
      this.publish();
      return true;
    }
    try {
      this.persistentStorage.setItem(PLAYTEST_STORAGE_KEY, JSON.stringify(report));
      this.persistence = 'persistent';
      this.issue = null;
      this.publish();
      return true;
    } catch {
      this.persistence = 'memory-only';
      this.issue = 'write-failed';
      this.locked = true;
      this.publish();
      return true;
    }
  }

  private refreshSnapshot(): void {
    this.snapshot = {
      enabled: this.report !== null,
      persistence: this.persistence,
      issue: this.issue,
      report: this.report === null ? null : cloneReport(this.report),
    };
  }

  private publish(): void {
    this.refreshSnapshot();
    for (const listener of this.listeners) listener();
  }
}

export function createPlaytestJournal(
  options: PlaytestJournalOptions = {},
): PlaytestJournal {
  return new LocalPlaytestJournal(options);
}

export const playtestJournal = createPlaytestJournal();

export function playtestRequested(search = globalThis.location?.search ?? ''): boolean {
  try {
    return new URLSearchParams(search).get('playtest') === '1';
  } catch {
    return false;
  }
}

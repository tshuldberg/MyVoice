import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

// Dictation history: one JSON-lines file per day, kept on this Mac only.
// Takes the folder as a parameter so the logic is tested against real files.

export interface HistoryEntry {
  id: string;
  timestamp: string;
  /** YYYY-MM-DD in local time; also the file name. */
  date: string;
  /** The text that was inserted. */
  transcript: string;
  /** Whisper's text before cleanup, so an entry can be reformatted later. */
  raw?: string;
  modeId?: string;
  modeName?: string;
  appName?: string;
  appBundleId?: string;
  modelId?: string;
  /** Length of the recording. */
  durationMs?: number;
  /** Time from stop to text. */
  transcribeMs?: number;
  source?: 'dictation' | 'file';
  fileName?: string;
}

export type NewHistoryEntry = Omit<HistoryEntry, 'id' | 'timestamp' | 'date'>;

/** -1 keeps history forever; 0 keeps none. */
export type RetentionDays = -1 | 0 | 1 | 7 | 30 | 90 | 365;
export const RETENTION_OPTIONS: RetentionDays[] = [-1, 365, 90, 30, 7, 1, 0];

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const optionalString = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);
const optionalNumber = (value: unknown): number | undefined =>
  (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined);

/** Reads one day's file contents. Malformed lines are skipped; 0.2 entries get an id from their timestamp. */
export function parseHistoryLines(content: string): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const data = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof data.timestamp !== 'string' || typeof data.date !== 'string' || typeof data.transcript !== 'string') continue;
      const entry: HistoryEntry = {
        id: optionalString(data.id) ?? data.timestamp,
        timestamp: data.timestamp,
        date: data.date,
        transcript: data.transcript,
        raw: optionalString(data.raw),
        modeId: optionalString(data.modeId),
        modeName: optionalString(data.modeName),
        appName: optionalString(data.appName),
        appBundleId: optionalString(data.appBundleId),
        modelId: optionalString(data.modelId),
        durationMs: optionalNumber(data.durationMs),
        transcribeMs: optionalNumber(data.transcribeMs),
        source: data.source === 'file' ? 'file' : data.source === 'dictation' ? 'dictation' : undefined,
        fileName: optionalString(data.fileName),
      };
      // Leave absent fields out rather than present-but-undefined.
      for (const key of Object.keys(entry) as (keyof HistoryEntry)[]) {
        if (entry[key] === undefined) delete entry[key];
      }
      entries.push(entry);
    } catch {
      // Skip malformed lines
    }
  }
  return entries;
}

function dayFile(directory: string, dateKey: string): string {
  return path.join(directory, `${dateKey}.jsonl`);
}

export function appendHistoryEntry(directory: string, entry: NewHistoryEntry, now = new Date()): HistoryEntry | null {
  const transcript = entry.transcript.trim();
  if (!transcript) return null;
  const saved: HistoryEntry = {
    id: `${now.getTime().toString(36)}-${randomBytes(3).toString('hex')}`,
    timestamp: now.toISOString(),
    date: toDateKey(now),
    ...entry,
    transcript,
  };
  fs.mkdirSync(directory, { recursive: true });
  fs.appendFileSync(dayFile(directory, saved.date), `${JSON.stringify(saved)}\n`, 'utf8');
  return saved;
}

export function readHistoryDay(directory: string, dateKey: string): HistoryEntry[] {
  if (!DATE_KEY.test(dateKey)) return [];
  try {
    return parseHistoryLines(fs.readFileSync(dayFile(directory, dateKey), 'utf8'));
  } catch {
    return [];
  }
}

/** Day keys with a history file, newest first. */
export function listHistoryDates(directory: string): string[] {
  try {
    return fs.readdirSync(directory)
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) => name.slice(0, -'.jsonl'.length))
      .filter((key) => DATE_KEY.test(key))
      .sort((a, b) => b.localeCompare(a));
  } catch {
    return [];
  }
}

/**
 * Searches every day, newest first. All words in the query must appear
 * (case-insensitive) in the inserted text, the raw text, the app or the mode.
 */
export function searchHistory(directory: string, query: string, limit = 200): HistoryEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const results: HistoryEntry[] = [];
  for (const dateKey of listHistoryDates(directory)) {
    const day = readHistoryDay(directory, dateKey).reverse();
    for (const entry of day) {
      const haystack = [entry.transcript, entry.raw, entry.appName, entry.modeName, entry.fileName]
        .filter(Boolean).join('\n').toLowerCase();
      if (terms.every((term) => haystack.includes(term))) {
        results.push(entry);
        if (results.length >= limit) return results;
      }
    }
  }
  return results;
}

function writeDay(directory: string, dateKey: string, entries: HistoryEntry[]): void {
  const file = dayFile(directory, dateKey);
  if (entries.length === 0) {
    fs.rmSync(file, { force: true });
    return;
  }
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n', 'utf8');
  fs.renameSync(temp, file);
}

export function deleteHistoryEntry(directory: string, dateKey: string, id: string): boolean {
  const entries = readHistoryDay(directory, dateKey);
  const kept = entries.filter((entry) => entry.id !== id);
  if (kept.length === entries.length) return false;
  writeDay(directory, dateKey, kept);
  return true;
}

export function deleteAllHistory(directory: string): void {
  for (const dateKey of listHistoryDates(directory)) {
    fs.rmSync(dayFile(directory, dateKey), { force: true });
  }
}

/** Day keys older than the retention window. */
export function datesToPurge(dates: string[], today: Date, retentionDays: RetentionDays): string[] {
  if (retentionDays < 0) return [];
  if (retentionDays === 0) return [...dates];
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - retentionDays + 1);
  const cutoffKey = toDateKey(cutoff);
  return dates.filter((key) => key < cutoffKey);
}

export function purgeHistory(directory: string, retentionDays: RetentionDays, today = new Date()): string[] {
  const purged = datesToPurge(listHistoryDates(directory), today, retentionDays);
  for (const dateKey of purged) fs.rmSync(dayFile(directory, dateKey), { force: true });
  return purged;
}

export interface HistoryStats {
  dictations: number;
  words: number;
  /** Speaking speed over entries that recorded their length. */
  wordsPerMinute: number | null;
  /** Typing time saved at `typingWpm`, never negative. */
  minutesSaved: number;
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

export function computeHistoryStats(entries: HistoryEntry[], typingWpm = 40): HistoryStats {
  let words = 0;
  let timedWords = 0;
  let speakingMs = 0;
  for (const entry of entries) {
    const count = countWords(entry.transcript);
    words += count;
    if (entry.durationMs && entry.source !== 'file') {
      timedWords += count;
      speakingMs += entry.durationMs;
    }
  }
  const speakingMinutes = speakingMs / 60_000;
  return {
    dictations: entries.length,
    words,
    wordsPerMinute: speakingMinutes > 0 ? Math.round(timedWords / speakingMinutes) : null,
    minutesSaved: Math.max(0, Math.round(timedWords / typingWpm - speakingMinutes)),
  };
}

/** Entries from the last `days` days (including today), newest first. */
export function readRecentHistory(directory: string, days: number, today = new Date()): HistoryEntry[] {
  const cutoff = toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days + 1));
  return listHistoryDates(directory)
    .filter((key) => key >= cutoff)
    .flatMap((key) => readHistoryDay(directory, key).reverse());
}

/** Apps the user dictated into, most used first: quick picks when assigning apps to a mode. */
export function recentAppsFromHistory(entries: HistoryEntry[], limit = 12): { bundleId: string; name: string }[] {
  const counts = new Map<string, { bundleId: string; name: string; count: number }>();
  for (const entry of entries) {
    if (!entry.appBundleId) continue;
    const key = entry.appBundleId.toLowerCase();
    const current = counts.get(key) ?? { bundleId: entry.appBundleId, name: entry.appName ?? entry.appBundleId, count: 0 };
    current.count++;
    counts.set(key, current);
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ bundleId, name }) => ({ bundleId, name }));
}

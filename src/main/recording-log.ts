import { app } from 'electron';
import path from 'path';
import {
  appendHistoryEntry,
  computeHistoryStats,
  deleteAllHistory,
  deleteHistoryEntry,
  listHistoryDates,
  purgeHistory,
  readHistoryDay,
  readRecentHistory,
  recentAppsFromHistory,
  searchHistory,
  toDateKey,
  type HistoryEntry,
  type HistoryStats,
  type NewHistoryEntry,
  type RetentionDays,
} from './history-core';

export type RecordingLogEntry = HistoryEntry;

function getLogDirectory(): string | null {
  if (!app.isReady()) return null;
  return path.join(app.getPath('userData'), 'recording-logs');
}

export function getTodayDateKey(): string {
  return toDateKey(new Date());
}

/** Saves an entry unless history is turned off (retention 0). */
export function appendRecordingLog(entry: NewHistoryEntry, retentionDays: RetentionDays): RecordingLogEntry | null {
  const directory = getLogDirectory();
  if (!directory || retentionDays === 0) return null;
  try {
    return appendHistoryEntry(directory, entry);
  } catch (error) {
    console.error('[MyVoice] Failed to append recording log:', error);
    return null;
  }
}

export function readRecordingLogByDate(dateKey: string): RecordingLogEntry[] {
  const directory = getLogDirectory();
  return directory ? readHistoryDay(directory, dateKey) : [];
}

export function readTodayRecordingLog(): RecordingLogEntry[] {
  return readRecordingLogByDate(getTodayDateKey());
}

export function listRecordingLogDates(): string[] {
  const directory = getLogDirectory();
  return directory ? listHistoryDates(directory) : [];
}

export function searchRecordingLogs(query: string): RecordingLogEntry[] {
  const directory = getLogDirectory();
  return directory ? searchHistory(directory, query) : [];
}

export function deleteRecordingLogEntry(dateKey: string, id: string): boolean {
  const directory = getLogDirectory();
  return directory ? deleteHistoryEntry(directory, dateKey, id) : false;
}

export function clearRecordingLogs(): void {
  const directory = getLogDirectory();
  if (directory) deleteAllHistory(directory);
}

export function purgeRecordingLogs(retentionDays: RetentionDays): string[] {
  const directory = getLogDirectory();
  return directory ? purgeHistory(directory, retentionDays) : [];
}

/** The most recent dictation, for "Paste Last Dictation". */
export function lastRecordingLogEntry(): RecordingLogEntry | null {
  const directory = getLogDirectory();
  if (!directory) return null;
  for (const dateKey of listHistoryDates(directory).slice(0, 7)) {
    const day = readHistoryDay(directory, dateKey);
    if (day.length > 0) return day[day.length - 1];
  }
  return null;
}

export interface HistoryStatsSummary {
  week: HistoryStats;
  allTime: HistoryStats;
}

export function getHistoryStats(): HistoryStatsSummary {
  const directory = getLogDirectory();
  const empty = computeHistoryStats([]);
  if (!directory) return { week: empty, allTime: empty };
  return {
    week: computeHistoryStats(readRecentHistory(directory, 7)),
    allTime: computeHistoryStats(readRecentHistory(directory, 36500)),
  };
}

export function recentDictationApps(): { bundleId: string; name: string }[] {
  const directory = getLogDirectory();
  return directory ? recentAppsFromHistory(readRecentHistory(directory, 30)) : [];
}

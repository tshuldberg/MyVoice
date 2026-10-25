import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  appendHistoryEntry,
  computeHistoryStats,
  countWords,
  datesToPurge,
  deleteAllHistory,
  deleteHistoryEntry,
  listHistoryDates,
  parseHistoryLines,
  purgeHistory,
  readHistoryDay,
  readRecentHistory,
  recentAppsFromHistory,
  searchHistory,
} from '../dist/main/history-core.js';

const dir = () => mkdtempSync(path.join(tmpdir(), 'myvoice-history-'));
const at = (iso) => new Date(iso);

test('entries are appended to one file per local day with an id and metadata', () => {
  const folder = dir();
  const entry = appendHistoryEntry(folder, { transcript: '  Hello there  ', raw: 'hello there', appName: 'Mail', durationMs: 2000 }, at('2026-10-20T10:00:00'));
  assert.equal(entry.transcript, 'Hello there');
  assert.equal(entry.date, '2026-10-20');
  assert.match(entry.id, /^[0-9a-z]+-[0-9a-f]{6}$/);
  assert.deepEqual(readHistoryDay(folder, '2026-10-20'), [entry]);
  assert.equal(appendHistoryEntry(folder, { transcript: '   ' }), null);
});

test('0.2 entries without ids still load, and malformed lines are skipped', () => {
  const lines = [
    JSON.stringify({ timestamp: '2026-02-14T10:00:00.000Z', date: '2026-02-14', transcript: 'old entry' }),
    'not json',
    JSON.stringify({ date: '2026-02-14', transcript: 'missing timestamp' }),
  ].join('\n');
  const [entry, ...rest] = parseHistoryLines(lines);
  assert.equal(rest.length, 0);
  assert.equal(entry.id, '2026-02-14T10:00:00.000Z');
  assert.equal(entry.transcript, 'old entry');
});

test('search covers every day, newest first, and needs every word', () => {
  const folder = dir();
  appendHistoryEntry(folder, { transcript: 'Quarterly budget review', appName: 'Mail' }, at('2026-10-18T09:00:00'));
  appendHistoryEntry(folder, { transcript: 'Lunch order', appName: 'Slack' }, at('2026-10-19T09:00:00'));
  appendHistoryEntry(folder, { transcript: 'Budget is approved', appName: 'Slack' }, at('2026-10-20T09:00:00'));
  assert.deepEqual(searchHistory(folder, 'budget').map((entry) => entry.transcript), ['Budget is approved', 'Quarterly budget review']);
  assert.deepEqual(searchHistory(folder, 'budget slack').map((entry) => entry.transcript), ['Budget is approved']);
  assert.deepEqual(searchHistory(folder, '   '), []);
  assert.deepEqual(listHistoryDates(folder), ['2026-10-20', '2026-10-19', '2026-10-18']);
});

test('deleting one entry rewrites only its day; deleting the last removes the file', () => {
  const folder = dir();
  const first = appendHistoryEntry(folder, { transcript: 'one' }, at('2026-10-20T09:00:00'));
  const second = appendHistoryEntry(folder, { transcript: 'two' }, at('2026-10-20T10:00:00'));
  assert.equal(deleteHistoryEntry(folder, '2026-10-20', first.id), true);
  assert.deepEqual(readHistoryDay(folder, '2026-10-20').map((entry) => entry.id), [second.id]);
  assert.equal(deleteHistoryEntry(folder, '2026-10-20', 'missing'), false);
  deleteHistoryEntry(folder, '2026-10-20', second.id);
  assert.equal(existsSync(path.join(folder, '2026-10-20.jsonl')), false);
});

test('retention keeps the window, purges older days, and 0 keeps nothing', () => {
  const dates = ['2026-10-20', '2026-10-14', '2026-10-13', '2026-09-01'];
  const today = at('2026-10-20T12:00:00');
  assert.deepEqual(datesToPurge(dates, today, -1), []);
  assert.deepEqual(datesToPurge(dates, today, 7), ['2026-10-13', '2026-09-01']);
  assert.deepEqual(datesToPurge(dates, today, 1), ['2026-10-14', '2026-10-13', '2026-09-01']);
  assert.deepEqual(datesToPurge(dates, today, 0), dates);

  const folder = dir();
  for (const date of dates) writeFileSync(path.join(folder, `${date}.jsonl`), '');
  writeFileSync(path.join(folder, 'notes.txt'), 'not history');
  assert.deepEqual(purgeHistory(folder, 7, today), ['2026-10-13', '2026-09-01']);
  assert.deepEqual(listHistoryDates(folder), ['2026-10-20', '2026-10-14']);
  deleteAllHistory(folder);
  assert.deepEqual(listHistoryDates(folder), []);
  assert.equal(readFileSync(path.join(folder, 'notes.txt'), 'utf8'), 'not history');
});

test('stats count words, speaking speed and time saved, never negative', () => {
  assert.equal(countWords('Hello, world! 42 - ok'), 4);
  const stats = computeHistoryStats([
    { transcript: Array(80).fill('word').join(' '), durationMs: 30_000 },
    { transcript: Array(20).fill('word').join(' '), durationMs: 30_000 },
    { transcript: 'from a file', source: 'file', durationMs: 999_000 },
  ]);
  assert.deepEqual(stats, { dictations: 3, words: 103, wordsPerMinute: 100, minutesSaved: 2 });
  assert.equal(computeHistoryStats([{ transcript: 'slow', durationMs: 600_000 }]).minutesSaved, 0);
  assert.equal(computeHistoryStats([]).wordsPerMinute, null);
});

test('recent history and recent apps', () => {
  const folder = dir();
  appendHistoryEntry(folder, { transcript: 'a', appName: 'Mail', appBundleId: 'com.apple.mail' }, at('2026-10-20T09:00:00'));
  appendHistoryEntry(folder, { transcript: 'b', appName: 'Slack', appBundleId: 'com.tinyspeck.slackmacgap' }, at('2026-10-19T09:00:00'));
  appendHistoryEntry(folder, { transcript: 'c', appName: 'Slack', appBundleId: 'com.tinyspeck.slackmacgap' }, at('2026-10-19T10:00:00'));
  appendHistoryEntry(folder, { transcript: 'old', appName: 'Notes', appBundleId: 'com.apple.Notes' }, at('2026-08-01T09:00:00'));
  const recent = readRecentHistory(folder, 7, at('2026-10-20T12:00:00'));
  assert.deepEqual(recent.map((entry) => entry.transcript), ['a', 'c', 'b']);
  assert.deepEqual(recentAppsFromHistory(recent), [
    { bundleId: 'com.tinyspeck.slackmacgap', name: 'Slack' },
    { bundleId: 'com.apple.mail', name: 'Mail' },
  ]);
});

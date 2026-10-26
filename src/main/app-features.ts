import { clipboard, dialog, ipcMain, type BrowserWindow } from 'electron';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { getModesState, updateModesState } from './modes-settings';
import {
  assignApp,
  assignDomain,
  createMode,
  deleteMode,
  selectMode,
  unassignApp,
  unassignDomain,
  updateMode,
  type AppRef,
  type DictationMode,
  type ModesState,
} from './modes';
import { getDictionary, updateDictionary } from './dictionary-settings';
import {
  addVocabularyTerm,
  dictionaryToCsv,
  mergeDictionaries,
  parseDictionaryCsv,
  removeReplacement,
  removeVocabularyTerm,
  upsertReplacement,
  type Dictionary,
} from './dictionary';
import { LANGUAGES, MODEL_CATALOG, isModelId } from './model-catalog';
import { cancelModelDownload, deleteModel, downloadModel, listModelStatus, onModelStatusChange, type ModelStatus } from './model-manager';
import { getPreferences, updatePreferences } from './preferences';
import { MAX_RECORDING_OPTIONS, type Preferences } from './preferences-model';
import { RETENTION_OPTIONS } from './history-core';
import {
  clearRecordingLogs,
  deleteRecordingLogEntry,
  getHistoryStats,
  purgeRecordingLogs,
  recentDictationApps,
  searchRecordingLogs,
  type HistoryStatsSummary,
} from './recording-log';
import { processTranscript } from './text-pipeline';
import { SUPPORTED_AUDIO_EXTENSIONS } from './audio-file';
import { cancelFileTranscription, transcribeFile } from './file-transcription';
import { getMeetingStatus, onMeetingAutoStop, onMeetingStatus, startMeeting, stopMeeting, type MeetingStatus } from './meeting-recorder';
import { runLocalCleanup } from './local-ai';
import { resolveLocalAi } from './local-ai-runtime';
import { setTriggerStyle } from './fn-trigger';
import { pasteLastShortcut } from './trigger-shortcut';
import { updateTrayMenu } from './tray';
import { FEATURE_FLAGS, type FeatureFlags } from './feature-flags';
import { isGgufFile } from './local-engine';

export const FEATURE_CHANNELS = {
  MODES_SELECT: 'app:modes-select',
  MODES_CREATE: 'app:modes-create',
  MODES_UPDATE: 'app:modes-update',
  MODES_DELETE: 'app:modes-delete',
  MODES_ADD_APP: 'app:modes-add-app',
  MODES_REMOVE_APP: 'app:modes-remove-app',
  MODES_ADD_DOMAIN: 'app:modes-add-domain',
  MODES_REMOVE_DOMAIN: 'app:modes-remove-domain',
  DICTIONARY_ADD_TERM: 'app:dictionary-add-term',
  DICTIONARY_REMOVE_TERM: 'app:dictionary-remove-term',
  DICTIONARY_UPSERT_RULE: 'app:dictionary-upsert-rule',
  DICTIONARY_REMOVE_RULE: 'app:dictionary-remove-rule',
  DICTIONARY_IMPORT: 'app:dictionary-import',
  DICTIONARY_EXPORT: 'app:dictionary-export',
  MODELS_DOWNLOAD: 'app:models-download',
  MODELS_CANCEL: 'app:models-cancel',
  MODELS_DELETE: 'app:models-delete',
  MODELS_UPDATED: 'app:models-updated',
  PREFERENCES_UPDATE: 'app:preferences-update',
  HISTORY_SEARCH: 'app:history-search',
  HISTORY_DELETE: 'app:history-delete',
  HISTORY_CLEAR: 'app:history-clear',
  HISTORY_REFORMAT: 'app:history-reformat',
  HISTORY_COPY: 'app:history-copy',
  FILE_CHOOSE: 'app:file-choose',
  FILE_TRANSCRIBE: 'app:file-transcribe',
  FILE_CANCEL: 'app:file-cancel',
  FILE_PROGRESS: 'app:file-progress',
  AI_TEST: 'app:ai-test',
  AI_CHOOSE_MODEL: 'app:ai-choose-model',
  MEETING_START: 'app:meeting-start',
  MEETING_STOP: 'app:meeting-stop',
  MEETING_STATUS: 'app:meeting-status',
} as const;

export interface FeatureState {
  modes: ModesState;
  dictionary: Dictionary;
  models: { catalog: { id: string; label: string; description: string; sizeBytes: number; englishOnly: boolean; canTranslate: boolean }[]; status: ModelStatus[] };
  languages: typeof LANGUAGES;
  preferences: Preferences;
  stats: HistoryStatsSummary;
  recentApps: AppRef[];
  flags: FeatureFlags;
  meeting: MeetingStatus;
  options: {
    retentionDays: typeof RETENTION_OPTIONS;
    maxRecordingMinutes: typeof MAX_RECORDING_OPTIONS;
    audioExtensions: string[];
  };
}

export function getFeatureState(): FeatureState {
  return {
    modes: getModesState(),
    dictionary: getDictionary(),
    models: {
      catalog: MODEL_CATALOG.map(({ id, label, description, sizeBytes, englishOnly, canTranslate }) => ({
        id, label, description, sizeBytes, englishOnly, canTranslate,
      })),
      status: listModelStatus(),
    },
    languages: LANGUAGES,
    preferences: getPreferences(),
    stats: getHistoryStats(),
    recentApps: recentDictationApps(),
    flags: FEATURE_FLAGS,
    meeting: getMeetingStatus(),
    options: {
      retentionDays: RETENTION_OPTIONS,
      maxRecordingMinutes: MAX_RECORDING_OPTIONS,
      audioExtensions: SUPPORTED_AUDIO_EXTENSIONS,
    },
  };
}

const newModeId = (): string => `mode-${Date.now().toString(36)}-${randomBytes(2).toString('hex')}`;

function readPlistValue(plistPath: string, key: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plistPath], { timeout: 3000 }, (error, stdout) => {
      resolve(error ? null : stdout.trim() || null);
    });
  });
}

/** Lets the user pick an app in /Applications and reads its bundle id. */
async function chooseApp(window: BrowserWindow | null): Promise<AppRef | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Choose an App',
    defaultPath: '/Applications',
    properties: ['openFile'],
    filters: [{ name: 'Applications', extensions: ['app'] }],
  };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  const appPath = result.filePaths[0];
  if (result.canceled || !appPath) return null;
  const plist = path.join(appPath, 'Contents', 'Info.plist');
  const bundleId = await readPlistValue(plist, 'CFBundleIdentifier');
  if (!bundleId) return null;
  const name = (await readPlistValue(plist, 'CFBundleDisplayName'))
    ?? (await readPlistValue(plist, 'CFBundleName'))
    ?? path.basename(appPath, '.app');
  return { bundleId, name };
}

function asText(value: unknown, max = 2000): string {
  return String(value ?? '').slice(0, max);
}

/**
 * Registers the handlers for modes, dictionary, models, preferences, history,
 * file transcription and local AI. Each mutation returns the whole app state.
 */
export function registerFeatureHandlers(getAppState: () => unknown, getWindow: () => BrowserWindow | null): void {
  const C = FEATURE_CHANNELS;
  const send = (channel: string, payload: unknown): void => {
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  };
  const changedModes = (edit: (state: ModesState) => ModesState) => {
    updateModesState(edit);
    updateTrayMenu();
    return getAppState();
  };

  onModelStatusChange((status) => send(C.MODELS_UPDATED, status));
  onMeetingStatus((status) => {
    send(C.MEETING_STATUS, status);
    updateTrayMenu();
  });
  onMeetingAutoStop(() => send(C.MEETING_STATUS, getMeetingStatus()));

  // --- Modes
  ipcMain.handle(C.MODES_SELECT, (_event, id: string) => changedModes((state) => selectMode(state, asText(id, 64))));
  ipcMain.handle(C.MODES_CREATE, (_event, payload: { name?: string; basedOn?: string }) =>
    changedModes((state) => createMode(state, asText(payload?.name, 40), newModeId(), asText(payload?.basedOn, 64) || 'default')));
  ipcMain.handle(C.MODES_UPDATE, (_event, payload: { id?: string; patch?: Partial<DictationMode> }) =>
    changedModes((state) => updateMode(state, asText(payload?.id, 64), payload?.patch ?? {})));
  ipcMain.handle(C.MODES_DELETE, (_event, id: string) => changedModes((state) => deleteMode(state, asText(id, 64))));
  ipcMain.handle(C.MODES_ADD_APP, async (_event, payload: { modeId?: string; app?: AppRef }) => {
    const appRef = payload?.app?.bundleId ? payload.app : await chooseApp(getWindow());
    if (!appRef) return getAppState();
    return changedModes((state) => assignApp(state, asText(payload?.modeId, 64), appRef));
  });
  ipcMain.handle(C.MODES_REMOVE_APP, (_event, payload: { modeId?: string; bundleId?: string }) =>
    changedModes((state) => unassignApp(state, asText(payload?.modeId, 64), asText(payload?.bundleId, 200))));
  ipcMain.handle(C.MODES_ADD_DOMAIN, (_event, payload: { modeId?: string; domain?: string }) =>
    changedModes((state) => assignDomain(state, asText(payload?.modeId, 64), asText(payload?.domain, 300))));
  ipcMain.handle(C.MODES_REMOVE_DOMAIN, (_event, payload: { modeId?: string; domain?: string }) =>
    changedModes((state) => unassignDomain(state, asText(payload?.modeId, 64), asText(payload?.domain, 300))));

  // --- Dictionary
  ipcMain.handle(C.DICTIONARY_ADD_TERM, (_event, term: string) => {
    updateDictionary((dictionary) => addVocabularyTerm(dictionary, asText(term, 200)));
    return getAppState();
  });
  ipcMain.handle(C.DICTIONARY_REMOVE_TERM, (_event, term: string) => {
    updateDictionary((dictionary) => removeVocabularyTerm(dictionary, asText(term, 200)));
    return getAppState();
  });
  ipcMain.handle(C.DICTIONARY_UPSERT_RULE, (_event, rule: { from?: string; to?: string }) => {
    updateDictionary((dictionary) => upsertReplacement(dictionary, { from: asText(rule?.from, 200), to: asText(rule?.to) }));
    return getAppState();
  });
  ipcMain.handle(C.DICTIONARY_REMOVE_RULE, (_event, from: string) => {
    updateDictionary((dictionary) => removeReplacement(dictionary, asText(from, 200)));
    return getAppState();
  });
  ipcMain.handle(C.DICTIONARY_IMPORT, async () => {
    const window = getWindow();
    const options: Electron.OpenDialogOptions = { title: 'Import Dictionary', properties: ['openFile'], filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }] };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    const file = result.filePaths[0];
    if (result.canceled || !file) return getAppState();
    const imported = parseDictionaryCsv(fs.readFileSync(file, 'utf8').slice(0, 1_000_000));
    updateDictionary((dictionary) => mergeDictionaries(dictionary, imported));
    return getAppState();
  });
  ipcMain.handle(C.DICTIONARY_EXPORT, async () => {
    const window = getWindow();
    const options: Electron.SaveDialogOptions = { title: 'Export Dictionary', defaultPath: 'myvoice-dictionary.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] };
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { ok: false };
    fs.writeFileSync(result.filePath, dictionaryToCsv(getDictionary()), 'utf8');
    return { ok: true };
  });

  // --- Models
  ipcMain.handle(C.MODELS_DOWNLOAD, async (_event, id: string) => {
    if (!isModelId(id)) return { ok: false, error: 'Unknown model.' };
    try {
      await downloadModel(id);
      return { ok: true };
    } catch (error) {
      const aborted = (error as Error)?.name === 'AbortError';
      return { ok: false, error: aborted ? 'Download cancelled.' : 'The download failed. Check your connection and try again.' };
    }
  });
  ipcMain.handle(C.MODELS_CANCEL, (_event, id: string) => {
    if (isModelId(id)) cancelModelDownload(id);
    return getAppState();
  });
  ipcMain.handle(C.MODELS_DELETE, (_event, id: string) => {
    if (isModelId(id)) deleteModel(id);
    return getAppState();
  });

  // --- Preferences
  ipcMain.handle(C.PREFERENCES_UPDATE, (_event, patch: Partial<Preferences>) => {
    const next = updatePreferences(patch ?? {});
    setTriggerStyle(next.triggerStyle);
    if (patch && 'pasteLastShortcut' in patch) pasteLastShortcut.apply(next.pasteLastShortcut);
    if (patch && 'historyRetentionDays' in patch) purgeRecordingLogs(next.historyRetentionDays);
    return getAppState();
  });

  // --- History
  ipcMain.handle(C.HISTORY_SEARCH, (_event, query: string) => searchRecordingLogs(asText(query, 200)));
  ipcMain.handle(C.HISTORY_DELETE, (_event, payload: { date?: string; id?: string }) => {
    deleteRecordingLogEntry(asText(payload?.date, 10), asText(payload?.id, 100));
    return getAppState();
  });
  ipcMain.handle(C.HISTORY_CLEAR, async () => {
    const window = getWindow();
    const options: Electron.MessageBoxOptions = {
      type: 'warning',
      message: 'Delete all dictation history?',
      detail: 'Every saved transcript on this Mac is removed. This cannot be undone.',
      buttons: ['Delete All', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    };
    const { response } = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options);
    if (response === 0) clearRecordingLogs();
    return getAppState();
  });
  ipcMain.handle(C.HISTORY_REFORMAT, (_event, payload: { raw?: string; modeId?: string }) => {
    const mode = getModesState().modes.find((entry) => entry.id === payload?.modeId);
    if (!mode) return { ok: false };
    const text = processTranscript(asText(payload?.raw, 100_000), mode.pipeline, getDictionary());
    if (text) clipboard.writeText(text);
    return { ok: Boolean(text), text };
  });
  ipcMain.handle(C.HISTORY_COPY, (_event, text: string) => {
    clipboard.writeText(asText(text, 100_000));
    return { ok: true };
  });

  // --- Audio files
  const runFile = async (filePath: string) => {
    try {
      const result = await transcribeFile(filePath, (stage, percent) => send(C.FILE_PROGRESS, { stage, percent, fileName: path.basename(filePath) }));
      return { ok: true, text: result.text };
    } catch (error) {
      const message = (error as Error)?.message === 'cancelled' ? 'Transcription cancelled.' : String((error as Error)?.message ?? error);
      send(C.FILE_PROGRESS, { stage: 'done', percent: 0, fileName: path.basename(filePath) });
      return { ok: false, error: message };
    }
  };
  ipcMain.handle(C.FILE_CHOOSE, async () => {
    const window = getWindow();
    const options: Electron.OpenDialogOptions = {
      title: 'Transcribe Audio File',
      properties: ['openFile'],
      filters: [{ name: 'Audio and Video', extensions: SUPPORTED_AUDIO_EXTENSIONS }],
    };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    const file = result.filePaths[0];
    if (result.canceled || !file) return { ok: false, cancelled: true };
    return runFile(file);
  });
  ipcMain.handle(C.FILE_TRANSCRIBE, (_event, filePath: string) => {
    const resolved = path.resolve(asText(filePath, 4096));
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return { ok: false, error: 'That file could not be found.' };
    return runFile(resolved);
  });
  ipcMain.handle(C.FILE_CANCEL, () => {
    cancelFileTranscription();
    return { ok: true };
  });

  // --- Meetings
  ipcMain.handle(C.MEETING_START, async () => {
    const error = await startMeeting();
    return { ok: error === null, error };
  });
  ipcMain.handle(C.MEETING_STOP, async () => {
    try {
      const result = await stopMeeting();
      return { ok: true, text: result.text };
    } catch (error) {
      return { ok: false, error: String((error as Error)?.message ?? error) };
    }
  });

  // --- Local AI
  ipcMain.handle(C.AI_TEST, async () => {
    const sample = 'um so this is a quick test of the the local model cleanup';
    try {
      const settings = await resolveLocalAi({ ...getPreferences().localAi, enabled: true });
      return runLocalCleanup(settings, sample, { modeName: 'Test' });
    } catch (error) {
      return { status: 'failed', text: sample, reason: (error as Error).message };
    }
  });
  ipcMain.handle(C.AI_CHOOSE_MODEL, async () => {
    const window = getWindow();
    const options: Electron.OpenDialogOptions = {
      title: 'Choose a Model File',
      properties: ['openFile'],
      filters: [{ name: 'GGUF model', extensions: ['gguf'] }],
    };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    const file = result.filePaths[0];
    if (result.canceled || !file) return getAppState();
    if (!isGgufFile(file)) {
      await dialog.showMessageBox({ type: 'warning', message: 'That file is not a GGUF model.', buttons: ['OK'] });
      return getAppState();
    }
    updatePreferences({ localAi: { ...getPreferences().localAi, modelFile: file, engine: 'built-in' } });
    return getAppState();
  });
}

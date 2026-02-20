import { BrowserWindow, app, dialog, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import {
  getFormattingSettings,
  setAiEnhancementEnabled,
  setFormattingMode,
  type FormattingMode,
} from './formatting-settings';
import {
  AUTO_STOP_DELAY_OPTIONS_MS,
  getDictationSettings,
  setAutoStopPauseMs,
  type AutoStopPauseMs,
} from './dictation-settings';
import {
  getVisualizationSettings,
  setWaveformDebugOverlay,
  setWaveformSensitivity,
} from './visualization-settings';
import { listRecordingLogDates, readRecordingLogByDate, readTodayRecordingLog, getTodayDateKey, type RecordingLogEntry } from './recording-log';
import { getHotkeySettings, setTriggerShortcut } from './hotkey-settings';
import { applyTriggerShortcut, getTriggerShortcutStatus } from './trigger-shortcut';

export type AppSection = 'settings' | 'logs';

export interface AppStatePayload {
  formatting: ReturnType<typeof getFormattingSettings>;
  dictation: ReturnType<typeof getDictationSettings>;
  visualization: ReturnType<typeof getVisualizationSettings>;
  hotkey: {
    triggerShortcut: string;
    activeShortcut: string | null;
    error: string | null;
  };
  todayLog: ReturnType<typeof readTodayRecordingLog>;
  todayDateKey: string;
  availableLogDates: string[];
  autoStopOptionsMs: typeof AUTO_STOP_DELAY_OPTIONS_MS;
}

interface ExportLogPayload {
  date: string;
  search: string;
  entries: RecordingLogEntry[];
  format: 'txt' | 'json';
}

const IPC_CHANNELS = {
  APP_GET_STATE: 'app:get-state',
  APP_SET_FORMATTING_MODE: 'app:set-formatting-mode',
  APP_SET_AI_ENHANCEMENT: 'app:set-ai-enhancement',
  APP_SET_AUTO_STOP: 'app:set-auto-stop',
  APP_SET_WAVEFORM_SENSITIVITY: 'app:set-waveform-sensitivity',
  APP_SET_WAVEFORM_DEBUG: 'app:set-waveform-debug',
  APP_SET_TRIGGER_SHORTCUT: 'app:set-trigger-shortcut',
  APP_GET_TODAY_LOG: 'app:get-today-log',
  APP_GET_LOG_BY_DATE: 'app:get-log-by-date',
  APP_LIST_LOG_DATES: 'app:list-log-dates',
  APP_EXPORT_LOG: 'app:export-log',
  APP_LOG_UPDATED: 'app:log-updated',
  APP_NAVIGATE: 'app:navigate',
} as const;

let appWindow: BrowserWindow | null = null;
let handlersRegistered = false;
let pendingSection: AppSection = 'settings';
let isQuitting = false;

app.on('before-quit', () => {
  isQuitting = true;
});

function getAppState(): AppStatePayload {
  const hotkey = getHotkeySettings();
  const hotkeyStatus = getTriggerShortcutStatus();
  return {
    formatting: getFormattingSettings(),
    dictation: getDictationSettings(),
    visualization: getVisualizationSettings(),
    hotkey: {
      triggerShortcut: hotkey.triggerShortcut,
      activeShortcut: hotkeyStatus.activeShortcut,
      error: hotkeyStatus.error,
    },
    todayLog: readTodayRecordingLog(),
    todayDateKey: getTodayDateKey(),
    availableLogDates: listRecordingLogDates(),
    autoStopOptionsMs: AUTO_STOP_DELAY_OPTIONS_MS,
  };
}

function registerHandlers(): void {
  if (handlersRegistered) return;

  ipcMain.handle(IPC_CHANNELS.APP_GET_STATE, () => getAppState());
  ipcMain.handle(IPC_CHANNELS.APP_GET_TODAY_LOG, () => readTodayRecordingLog());
  ipcMain.handle(IPC_CHANNELS.APP_GET_LOG_BY_DATE, (_event, date: string) => {
    return readRecordingLogByDate(String(date || ''));
  });
  ipcMain.handle(IPC_CHANNELS.APP_LIST_LOG_DATES, () => listRecordingLogDates());
  ipcMain.handle(IPC_CHANNELS.APP_EXPORT_LOG, async (_event, payload: ExportLogPayload) => {
    const format = payload?.format === 'json' ? 'json' : 'txt';
    const safeDate = String(payload?.date || getTodayDateKey());
    const safeSearch = String(payload?.search || '').trim();
    const entries = Array.isArray(payload?.entries) ? payload.entries : [];

    const defaultFileName = `myvoice-log-${safeDate}${safeSearch ? '-filtered' : ''}.${format}`;
    const result = await dialog.showSaveDialog({
      title: 'Export MyVoice Log',
      defaultPath: defaultFileName,
      filters: format === 'json'
        ? [{ name: 'JSON', extensions: ['json'] }]
        : [{ name: 'Text', extensions: ['txt'] }],
    });

    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true };
    }

    const output = format === 'json'
      ? JSON.stringify({
          date: safeDate,
          search: safeSearch,
          exportedAt: new Date().toISOString(),
          entries,
        }, null, 2)
      : [
          `MyVoice Log Export`,
          `Date: ${safeDate}`,
          `Search: ${safeSearch || '(none)'}`,
          `Exported: ${new Date().toISOString()}`,
          '',
          ...entries.map((entry) => `[${entry.timestamp}] ${entry.transcript}`),
          '',
        ].join('\n');

    fs.writeFileSync(result.filePath, output, 'utf8');
    return { ok: true, canceled: false, filePath: result.filePath };
  });
  ipcMain.handle(IPC_CHANNELS.APP_SET_FORMATTING_MODE, (_event, mode: FormattingMode) => {
    setFormattingMode(mode);
    return getAppState();
  });
  ipcMain.handle(IPC_CHANNELS.APP_SET_AI_ENHANCEMENT, (_event, enabled: boolean) => {
    setAiEnhancementEnabled(Boolean(enabled));
    return getAppState();
  });
  ipcMain.handle(IPC_CHANNELS.APP_SET_AUTO_STOP, (_event, pauseMs: AutoStopPauseMs) => {
    setAutoStopPauseMs(pauseMs);
    return getAppState();
  });
  ipcMain.handle(IPC_CHANNELS.APP_SET_WAVEFORM_SENSITIVITY, (_event, sensitivity: 'low' | 'balanced' | 'high') => {
    setWaveformSensitivity(sensitivity);
    return getAppState();
  });
  ipcMain.handle(IPC_CHANNELS.APP_SET_WAVEFORM_DEBUG, (_event, enabled: boolean) => {
    setWaveformDebugOverlay(Boolean(enabled));
    return getAppState();
  });
  ipcMain.handle(IPC_CHANNELS.APP_SET_TRIGGER_SHORTCUT, (_event, shortcut: string) => {
    const next = setTriggerShortcut(String(shortcut || ''));
    applyTriggerShortcut(next.triggerShortcut);
    return getAppState();
  });

  handlersRegistered = true;
}

export function createAppWindow(): BrowserWindow {
  if (appWindow && !appWindow.isDestroyed()) return appWindow;

  registerHandlers();

  appWindow = new BrowserWindow({
    width: 940,
    height: 700,
    minWidth: 860,
    minHeight: 600,
    show: false,
    title: 'MyVoice',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  appWindow.loadFile(path.join(__dirname, '../../src/renderer/app.html'));

  appWindow.webContents.on('did-finish-load', () => {
    if (!appWindow || appWindow.isDestroyed()) return;
    appWindow.webContents.send(IPC_CHANNELS.APP_NAVIGATE, pendingSection);
  });

  appWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    appWindow?.hide();
  });

  return appWindow;
}

export function showAppWindow(section: AppSection = 'settings'): void {
  pendingSection = section;
  const win = createAppWindow();
  win.show();
  win.focus();
  win.webContents.send(IPC_CHANNELS.APP_NAVIGATE, section);
}

export function broadcastLogUpdated(): void {
  if (!appWindow || appWindow.isDestroyed()) return;
  const todayDate = getTodayDateKey();
  appWindow.webContents.send(IPC_CHANNELS.APP_LOG_UPDATED, {
    date: todayDate,
    entries: readTodayRecordingLog(),
    availableDates: listRecordingLogDates(),
  });
}

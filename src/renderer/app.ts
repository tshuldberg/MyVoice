(() => {
const IPC_CHANNELS = {
  APP_GET_STATE: 'app:get-state',
  APP_SET_FORMATTING_MODE: 'app:set-formatting-mode',
  APP_SET_AI_ENHANCEMENT: 'app:set-ai-enhancement',
  APP_SET_AUTO_STOP: 'app:set-auto-stop',
  APP_SET_WAVEFORM_SENSITIVITY: 'app:set-waveform-sensitivity',
  APP_SET_WAVEFORM_DEBUG: 'app:set-waveform-debug',
  APP_SET_TRIGGER_SHORTCUT: 'app:set-trigger-shortcut',
  APP_SET_AUDIO_DEVICE: 'app:set-audio-device',
  APP_GET_TODAY_LOG: 'app:get-today-log',
  APP_GET_LOG_BY_DATE: 'app:get-log-by-date',
  APP_LIST_LOG_DATES: 'app:list-log-dates',
  APP_EXPORT_LOG: 'app:export-log',
  APP_LOG_UPDATED: 'app:log-updated',
  APP_NAVIGATE: 'app:navigate',
} as const;

type FormattingMode = 'off' | 'basic' | 'structured';
type WaveformSensitivity = 'low' | 'balanced' | 'high';
type ViewKey = 'settings' | 'logs';
type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

interface RecordingLogEntry {
  timestamp: string;
  date: string;
  transcript: string;
}

interface AppStatePayload {
  formatting: {
    mode: FormattingMode;
    aiEnhancementEnabled: boolean;
  };
  dictation: {
    autoStopPauseMs: number;
  };
  hotkey: {
    triggerShortcut: string;
    activeShortcut: string | null;
    error: string | null;
  };
  visualization: {
    sensitivity: WaveformSensitivity;
    debugOverlay: boolean;
  };
  audio: {
    selectedDeviceUID: string;
    availableDevices: { uid: string; name: string }[];
  };
  todayLog: RecordingLogEntry[];
  todayDateKey: string;
  availableLogDates: string[];
  autoStopOptionsMs: number[];
}

interface MyVoiceIpcBridge {
  on: (channel: IpcChannel, listener: (...args: unknown[]) => void) => void;
  invoke: (channel: IpcChannel, payload?: unknown) => Promise<unknown>;
}

function ipc(): MyVoiceIpcBridge {
  const bridge = (window as any).myvoiceIpc as MyVoiceIpcBridge | undefined;
  if (!bridge) throw new Error('MyVoice IPC bridge is unavailable');
  return bridge;
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
}

const tabSettings = required<HTMLButtonElement>('tab-settings');
const tabLogs = required<HTMLButtonElement>('tab-logs');
const settingsView = required<HTMLElement>('view-settings');
const logsView = required<HTMLElement>('view-logs');

const formattingModeEl = required<HTMLSelectElement>('formatting-mode');
const aiEnhancementEl = required<HTMLInputElement>('ai-enhancement');
const autoStopEl = required<HTMLSelectElement>('auto-stop');
const audioDeviceEl = required<HTMLSelectElement>('audio-device');
const waveformSensitivityEl = required<HTMLSelectElement>('waveform-sensitivity');
const waveformDebugEl = required<HTMLInputElement>('waveform-debug');
const triggerShortcutEl = required<HTMLInputElement>('trigger-shortcut');
const saveTriggerShortcutEl = required<HTMLButtonElement>('save-trigger-shortcut');
const clearTriggerShortcutEl = required<HTMLButtonElement>('clear-trigger-shortcut');
const triggerShortcutStatusEl = required<HTMLElement>('trigger-shortcut-status');

const logDateEl = required<HTMLElement>('log-date');
const logListEl = required<HTMLUListElement>('log-list');
const logDatePickerEl = required<HTMLInputElement>('log-date-picker');
const logSearchEl = required<HTMLInputElement>('log-search');
const exportTxtEl = required<HTMLButtonElement>('export-txt');
const exportJsonEl = required<HTMLButtonElement>('export-json');

let state: AppStatePayload | null = null;
let activeLogDate = '';
let activeLogEntries: RecordingLogEntry[] = [];
let visibleLogEntries: RecordingLogEntry[] = [];

function setActiveView(view: ViewKey): void {
  const settingsActive = view === 'settings';
  tabSettings.classList.toggle('active', settingsActive);
  tabLogs.classList.toggle('active', !settingsActive);
  settingsView.classList.toggle('hidden', !settingsActive);
  logsView.classList.toggle('hidden', settingsActive);
}

function formatAutoStopLabel(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

function dateKeyToLabel(dateKey: string): string {
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString([], {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function renderLog(entries: RecordingLogEntry[], dateKey: string): void {
  logListEl.textContent = '';

  const query = logSearchEl.value.trim().toLowerCase();
  const filtered = query
    ? entries.filter((entry) => entry.transcript.toLowerCase().includes(query))
    : entries;
  visibleLogEntries = filtered;
  logDateEl.textContent = `${dateKeyToLabel(dateKey)} • ${filtered.length} entr${filtered.length === 1 ? 'y' : 'ies'}`;

  if (!filtered.length) {
    const li = document.createElement('li');
    li.textContent = query
      ? 'No recordings match your search for this date.'
      : 'No recordings logged for this date.';
    logListEl.appendChild(li);
    return;
  }

  const sorted = [...filtered].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  for (const entry of sorted) {
    const li = document.createElement('li');

    const time = document.createElement('div');
    time.className = 'entry-time';
    time.textContent = formatTime(entry.timestamp);

    const text = document.createElement('div');
    text.textContent = entry.transcript;

    li.append(time, text);
    logListEl.appendChild(li);
  }
}

function applyAvailableDates(dates: string[]): void {
  const sorted = [...dates].sort((a, b) => b.localeCompare(a));
  const minDate = sorted[sorted.length - 1] ?? '';
  const maxDate = sorted[0] ?? '';
  if (minDate) logDatePickerEl.min = minDate;
  if (maxDate) logDatePickerEl.max = maxDate;
}

async function loadLogByDate(dateKey: string): Promise<void> {
  activeLogDate = dateKey;
  logDatePickerEl.value = dateKey;
  const entries = await ipc().invoke(IPC_CHANNELS.APP_GET_LOG_BY_DATE, dateKey) as RecordingLogEntry[];
  activeLogEntries = Array.isArray(entries) ? entries : [];
  renderLog(activeLogEntries, activeLogDate);
}

async function exportVisibleLog(format: 'txt' | 'json'): Promise<void> {
  await ipc().invoke(IPC_CHANNELS.APP_EXPORT_LOG, {
    date: activeLogDate,
    search: logSearchEl.value.trim(),
    entries: visibleLogEntries,
    format,
  });
}

function renderSettings(payload: AppStatePayload): void {
  formattingModeEl.value = payload.formatting.mode;
  aiEnhancementEl.checked = payload.formatting.aiEnhancementEnabled;
  waveformSensitivityEl.value = payload.visualization.sensitivity;
  waveformDebugEl.checked = payload.visualization.debugOverlay;
  triggerShortcutEl.value = payload.hotkey.triggerShortcut || '';

  if (payload.hotkey.error) {
    triggerShortcutStatusEl.textContent = payload.hotkey.error;
  } else if (payload.hotkey.activeShortcut) {
    triggerShortcutStatusEl.textContent = `Active shortcut: ${payload.hotkey.activeShortcut}`;
  } else {
    triggerShortcutStatusEl.textContent = 'No custom shortcut set. Double-tap fn is active.';
  }

  // Audio device dropdown
  audioDeviceEl.textContent = '';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'System Default';
  if (!payload.audio.selectedDeviceUID) defaultOpt.selected = true;
  audioDeviceEl.appendChild(defaultOpt);
  for (const device of payload.audio.availableDevices) {
    const opt = document.createElement('option');
    opt.value = device.uid;
    opt.textContent = device.name;
    if (device.uid === payload.audio.selectedDeviceUID) opt.selected = true;
    audioDeviceEl.appendChild(opt);
  }

  const selected = String(payload.dictation.autoStopPauseMs);
  autoStopEl.textContent = '';
  for (const optionMs of payload.autoStopOptionsMs) {
    const option = document.createElement('option');
    option.value = String(optionMs);
    option.textContent = optionMs === 3000
      ? `${formatAutoStopLabel(optionMs)} (default)`
      : formatAutoStopLabel(optionMs);
    if (option.value === selected) {
      option.selected = true;
    }
    autoStopEl.appendChild(option);
  }
}

function render(payload: AppStatePayload): void {
  state = payload;
  renderSettings(payload);
  applyAvailableDates(payload.availableLogDates);
  activeLogDate = payload.todayDateKey;
  activeLogEntries = payload.todayLog;
  logDatePickerEl.value = payload.todayDateKey;
  renderLog(payload.todayLog, payload.todayDateKey);
}

async function refreshState(): Promise<void> {
  const next = await ipc().invoke(IPC_CHANNELS.APP_GET_STATE) as AppStatePayload;
  render(next);
}

tabSettings.addEventListener('click', () => setActiveView('settings'));
tabLogs.addEventListener('click', () => setActiveView('logs'));
logDatePickerEl.addEventListener('change', () => {
  const selected = logDatePickerEl.value;
  if (!selected) return;
  loadLogByDate(selected).catch((error) => {
    console.error('[MyVoice][AppWindow] Failed to load log by date:', error);
  });
});
logSearchEl.addEventListener('input', () => {
  if (!activeLogDate) return;
  renderLog(activeLogEntries, activeLogDate);
});
exportTxtEl.addEventListener('click', () => {
  exportVisibleLog('txt').catch((error) => {
    console.error('[MyVoice][AppWindow] Export TXT failed:', error);
  });
});
exportJsonEl.addEventListener('click', () => {
  exportVisibleLog('json').catch((error) => {
    console.error('[MyVoice][AppWindow] Export JSON failed:', error);
  });
});

formattingModeEl.addEventListener('change', async () => {
  const next = await ipc().invoke(
    IPC_CHANNELS.APP_SET_FORMATTING_MODE,
    formattingModeEl.value as FormattingMode
  ) as AppStatePayload;
  render(next);
});

aiEnhancementEl.addEventListener('change', async () => {
  const next = await ipc().invoke(
    IPC_CHANNELS.APP_SET_AI_ENHANCEMENT,
    aiEnhancementEl.checked
  ) as AppStatePayload;
  render(next);
});

autoStopEl.addEventListener('change', async () => {
  const next = await ipc().invoke(
    IPC_CHANNELS.APP_SET_AUTO_STOP,
    Number(autoStopEl.value)
  ) as AppStatePayload;
  render(next);
});

audioDeviceEl.addEventListener('change', async () => {
  const next = await ipc().invoke(
    IPC_CHANNELS.APP_SET_AUDIO_DEVICE,
    audioDeviceEl.value
  ) as AppStatePayload;
  render(next);
});

waveformSensitivityEl.addEventListener('change', async () => {
  const next = await ipc().invoke(
    IPC_CHANNELS.APP_SET_WAVEFORM_SENSITIVITY,
    waveformSensitivityEl.value as WaveformSensitivity
  ) as AppStatePayload;
  render(next);
});

waveformDebugEl.addEventListener('change', async () => {
  const next = await ipc().invoke(
    IPC_CHANNELS.APP_SET_WAVEFORM_DEBUG,
    waveformDebugEl.checked
  ) as AppStatePayload;
  render(next);
});

saveTriggerShortcutEl.addEventListener('click', async () => {
  const next = await ipc().invoke(
    IPC_CHANNELS.APP_SET_TRIGGER_SHORTCUT,
    triggerShortcutEl.value.trim()
  ) as AppStatePayload;
  render(next);
});

clearTriggerShortcutEl.addEventListener('click', async () => {
  const next = await ipc().invoke(
    IPC_CHANNELS.APP_SET_TRIGGER_SHORTCUT,
    ''
  ) as AppStatePayload;
  render(next);
});

ipc().on(IPC_CHANNELS.APP_LOG_UPDATED, (payload: unknown) => {
  if (!state) return;
  if (!payload || typeof payload !== 'object') return;

  const data = payload as {
    date?: string;
    entries?: RecordingLogEntry[];
    availableDates?: string[];
  };

  const availableDates = Array.isArray(data.availableDates)
    ? data.availableDates
    : state.availableLogDates;
  state = {
    ...state,
    availableLogDates: availableDates,
    todayLog: data.date === state.todayDateKey && Array.isArray(data.entries)
      ? data.entries
      : state.todayLog,
  };
  applyAvailableDates(state.availableLogDates);

  if (data.date && data.date === activeLogDate && Array.isArray(data.entries)) {
    activeLogEntries = data.entries;
    renderLog(activeLogEntries, activeLogDate);
  }
});

ipc().on(IPC_CHANNELS.APP_NAVIGATE, (payload: unknown) => {
  setActiveView(payload === 'logs' ? 'logs' : 'settings');
});

refreshState().catch((error) => {
  console.error('[MyVoice][AppWindow] Failed to load app state:', error);
});
})();

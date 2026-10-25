(() => {
const IPC_CHANNELS = {
  APP_GET_STATE: 'app:get-state',
  APP_SET_FORMATTING_MODE: 'app:set-formatting-mode',
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
  APP_GET_PERMISSIONS: 'app:get-permissions',
  APP_REQUEST_MICROPHONE: 'app:request-microphone',
  APP_REQUEST_ACCESSIBILITY: 'app:request-accessibility',
  APP_COMPLETE_SETUP: 'app:complete-setup',
} as const;

type FormattingMode = 'off' | 'basic' | 'structured';
type WaveformSensitivity = 'low' | 'balanced' | 'high';
type ViewKey = 'settings' | 'logs' | 'setup';
type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
type MicrophoneStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';

interface PermissionSnapshot {
  microphone: MicrophoneStatus;
  accessibility: boolean;
}

interface RecordingLogEntry {
  timestamp: string;
  date: string;
  transcript: string;
}

interface AppStatePayload {
  formatting: {
    mode: FormattingMode;
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
  setup: {
    completed: boolean;
    permissions: PermissionSnapshot;
  };
  appVersion: string;
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
const tabSetup = required<HTMLButtonElement>('tab-setup');
const settingsView = required<HTMLElement>('view-settings');
const logsView = required<HTMLElement>('view-logs');
const setupView = required<HTMLElement>('view-setup');

const formattingModeEl = required<HTMLSelectElement>('formatting-mode');
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

const microphoneStatusEl = required<HTMLElement>('microphone-status');
const microphoneActionEl = required<HTMLButtonElement>('microphone-action');
const accessibilityStatusEl = required<HTMLElement>('accessibility-status');
const accessibilityActionEl = required<HTMLButtonElement>('accessibility-action');
const accessibilityHelpEl = required<HTMLElement>('accessibility-help');
const finishSetupEl = required<HTMLButtonElement>('finish-setup');
const finishHintEl = required<HTMLElement>('finish-hint');

// Accessibility has no change event, so the Setup view polls while it is open.
const PERMISSION_POLL_MS = 1000;
let permissionPoll: ReturnType<typeof setInterval> | null = null;
let accessibilityRequested = false;

let state: AppStatePayload | null = null;
let activeLogDate = '';
let activeLogEntries: RecordingLogEntry[] = [];
let visibleLogEntries: RecordingLogEntry[] = [];

function setActiveView(view: ViewKey): void {
  const views: [ViewKey, HTMLButtonElement, HTMLElement][] = [
    ['settings', tabSettings, settingsView],
    ['logs', tabLogs, logsView],
    ['setup', tabSetup, setupView],
  ];
  for (const [key, tab, section] of views) {
    tab.classList.toggle('active', key === view);
    section.classList.toggle('hidden', key !== view);
  }

  if (view === 'setup') {
    startPermissionPoll();
  } else {
    stopPermissionPoll();
  }
}

function setStatus(el: HTMLElement, text: string, ok: boolean): void {
  el.textContent = text;
  el.classList.toggle('ok', ok);
  el.classList.toggle('missing', !ok);
}

function renderPermissions(permissions: PermissionSnapshot): void {
  const mic = permissions.microphone;
  if (mic === 'granted') {
    setStatus(microphoneStatusEl, 'Allowed', true);
  } else if (mic === 'not-determined') {
    setStatus(microphoneStatusEl, 'Not asked yet', false);
    microphoneActionEl.textContent = 'Allow Microphone';
  } else {
    setStatus(microphoneStatusEl, 'Turned off', false);
    microphoneActionEl.textContent = 'Open Microphone Settings';
  }
  microphoneActionEl.classList.toggle('hidden', mic === 'granted');

  if (permissions.accessibility) {
    setStatus(accessibilityStatusEl, 'Allowed', true);
  } else {
    setStatus(accessibilityStatusEl, 'Not allowed yet', false);
    accessibilityActionEl.textContent = accessibilityRequested ? 'Open Accessibility Settings' : 'Allow Accessibility';
  }
  accessibilityActionEl.classList.toggle('hidden', permissions.accessibility);
  accessibilityHelpEl.classList.toggle('hidden', permissions.accessibility || !accessibilityRequested);

  const ready = mic === 'granted' && permissions.accessibility;
  finishHintEl.textContent = ready
    ? 'All set. Double-tap fn in any app to dictate.'
    : 'Dictation starts working once both permissions are allowed.';
}

async function refreshPermissions(): Promise<void> {
  const permissions = await ipc().invoke(IPC_CHANNELS.APP_GET_PERMISSIONS) as PermissionSnapshot;
  renderPermissions(permissions);
}

function startPermissionPoll(): void {
  if (permissionPoll) return;
  permissionPoll = setInterval(() => {
    refreshPermissions().catch((error) => {
      console.error('[MyVoice][AppWindow] Failed to read permissions:', error);
    });
  }, PERMISSION_POLL_MS);
}

function stopPermissionPoll(): void {
  if (!permissionPoll) return;
  clearInterval(permissionPoll);
  permissionPoll = null;
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
  renderPermissions(payload.setup.permissions);
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
tabSetup.addEventListener('click', () => setActiveView('setup'));

microphoneActionEl.addEventListener('click', async () => {
  const permissions = await ipc().invoke(IPC_CHANNELS.APP_REQUEST_MICROPHONE) as PermissionSnapshot;
  renderPermissions(permissions);
});

accessibilityActionEl.addEventListener('click', async () => {
  const permissions = await ipc().invoke(IPC_CHANNELS.APP_REQUEST_ACCESSIBILITY) as PermissionSnapshot;
  accessibilityRequested = true;
  renderPermissions(permissions);
});

finishSetupEl.addEventListener('click', async () => {
  const next = await ipc().invoke(IPC_CHANNELS.APP_COMPLETE_SETUP) as AppStatePayload;
  render(next);
  setActiveView('settings');
});
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
  setActiveView(payload === 'logs' || payload === 'setup' ? payload : 'settings');
});

refreshState().catch((error) => {
  console.error('[MyVoice][AppWindow] Failed to load app state:', error);
});
})();

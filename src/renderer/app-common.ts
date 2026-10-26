// Shared helpers for the MyVoice window. A plain script (no imports or
// exports), loaded before the view scripts, so its declarations are globals.

interface MvBridge {
  on(channel: string, listener: (...args: unknown[]) => void): void;
  invoke(channel: string, payload?: unknown): Promise<unknown>;
}

type MvView = 'settings' | 'modes' | 'dictionary' | 'logs' | 'models' | 'setup';
type MvFormatting = 'off' | 'basic' | 'structured';
type MvMicrophoneStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';

interface MvAppRef { bundleId: string; name: string }

interface MvMode {
  id: string;
  name: string;
  builtIn: boolean;
  pipeline: { formatting: MvFormatting; removeFillers: boolean; spokenCommands: boolean; spokenPunctuation: boolean; useDictionary: boolean; fuzzyVocabulary: boolean; spelling: 'us' | 'uk' };
  modelId: string;
  language: string;
  translateToEnglish: boolean;
  insertion: 'paste' | 'type' | 'copy';
  pressReturn: boolean;
  apps: MvAppRef[];
  domains: string[];
  aiCleanup: boolean;
  aiInstructions: string;
  aiContext: boolean;
}

interface MvHistoryEntry {
  id: string;
  timestamp: string;
  date: string;
  transcript: string;
  raw?: string;
  modeId?: string;
  modeName?: string;
  appName?: string;
  modelId?: string;
  durationMs?: number;
  transcribeMs?: number;
  source?: 'dictation' | 'file' | 'meeting';
  fileName?: string;
}

interface MvMeetingStatus { stage: 'idle' | 'recording' | 'transcribing'; startedAt: number | null; percent: number }

interface MvStats { dictations: number; words: number; wordsPerMinute: number | null; minutesSaved: number }

interface MvModelInfo { id: string; label: string; description: string; sizeBytes: number; englishOnly: boolean; canTranslate: boolean }
interface MvModelStatus { id: string; installed: boolean; downloadPercent: number | null }

interface MvPreferences {
  triggerStyle: 'double-tap' | 'hold' | 'both';
  livePreview: boolean;
  sounds: boolean;
  ducking: 'off' | 'lower' | 'mute';
  clipboard: 'restore' | 'keep';
  smartSpacing: boolean;
  historyRetentionDays: number;
  maxRecordingMinutes: number;
  pasteLastShortcut: string;
  allowUrlControl: boolean;
  websiteModes: boolean;
  autoCheckUpdates: boolean;
  localAi: { enabled: boolean; engine: 'server' | 'built-in'; modelFile: string; endpoint: string; model: string; instructions: string; timeoutMs: number };
}

interface MvAppState {
  dictation: { autoStopPauseMs: number };
  visualization: { sensitivity: 'low' | 'balanced' | 'high'; debugOverlay: boolean };
  hotkey: { triggerShortcut: string; activeShortcut: string | null; error: string | null };
  audio: { selectedDeviceUID: string; avoidBluetooth: boolean; availableDevices: { uid: string; name: string; transport: string }[] };
  todayLog: MvHistoryEntry[];
  todayDateKey: string;
  availableLogDates: string[];
  autoStopOptionsMs: number[];
  setup: { completed: boolean; permissions: { microphone: MvMicrophoneStatus; accessibility: boolean } };
  appVersion: string;
  features: {
    modes: { modes: MvMode[]; selectedModeId: string };
    dictionary: { vocabulary: string[]; replacements: { from: string; to: string }[] };
    models: { catalog: MvModelInfo[]; status: MvModelStatus[] };
    languages: { code: string; name: string }[];
    preferences: MvPreferences;
    stats: { week: MvStats; allTime: MvStats };
    recentApps: MvAppRef[];
    flags: { websiteModes: boolean; aiScreenContext: boolean };
    meeting: MvMeetingStatus;
    options: { retentionDays: number[]; maxRecordingMinutes: number[]; audioExtensions: string[] };
  };
}

function mvBridge(): MvBridge {
  const bridge = (window as unknown as { myvoiceIpc?: MvBridge }).myvoiceIpc;
  if (!bridge) throw new Error('MyVoice IPC bridge is unavailable');
  return bridge;
}

function mvInvoke<T = unknown>(channel: string, payload?: unknown): Promise<T> {
  return mvBridge().invoke(channel, payload) as Promise<T>;
}

function mvElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
}

/** The latest app state, shared by every view. */
let mvState: MvAppState | null = null;

function mvPublishState(state: MvAppState): void {
  mvState = state;
  window.dispatchEvent(new CustomEvent('myvoice:state', { detail: state }));
}

function mvOnState(handler: (state: MvAppState) => void): void {
  window.addEventListener('myvoice:state', (event) => handler((event as CustomEvent<MvAppState>).detail));
}

function mvOnView(handler: (view: MvView) => void): void {
  window.addEventListener('myvoice:view', (event) => handler((event as CustomEvent<MvView>).detail));
}

/** Calls a handler that returns the new app state, and shares it with every view. */
async function mvUpdate(channel: string, payload?: unknown): Promise<void> {
  mvPublishState(await mvInvoke<MvAppState>(channel, payload));
}

function mvRun(task: Promise<unknown>, context: string): void {
  task.catch((error) => console.error(`[MyVoice][AppWindow] ${context}:`, error));
}

function mvFormatBytes(bytes: number): string {
  return bytes >= 1_000_000_000 ? `${(bytes / 1_000_000_000).toFixed(1)} GB` : `${Math.round(bytes / 1_000_000)} MB`;
}

/** Small DOM builder: mvEl('button', { className: 'btn', textContent: 'Copy' }). */
function mvEl<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  Object.assign(element, props);
  for (const child of children) element.append(child);
  return element;
}

function mvFillSelect(select: HTMLSelectElement, options: { value: string; label: string }[], selected: string): void {
  select.textContent = '';
  for (const option of options) {
    select.append(mvEl('option', { value: option.value, textContent: option.label, selected: option.value === selected }));
  }
}

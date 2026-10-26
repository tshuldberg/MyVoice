import type { TriggerStyle } from './fn-gesture';
import type { DuckingMode } from './session-rules';
import { RETENTION_OPTIONS, type RetentionDays } from './history-core';
import { defaultLivePreview } from './session-rules';
import { DEFAULT_LOCAL_AI, normalizeLocalAiSettings, type LocalAiSettings } from './local-ai';

// App-wide preferences that are not part of a mode. Pure, so validation is tested.

export type ClipboardBehavior = 'restore' | 'keep';

export interface Preferences {
  triggerStyle: TriggerStyle;
  livePreview: boolean;
  sounds: boolean;
  ducking: DuckingMode;
  /** Put the user's clipboard back after pasting, or leave the dictation on it. */
  clipboard: ClipboardBehavior;
  /** Add a space and adjust capitalization to fit the text before the caret. */
  smartSpacing: boolean;
  historyRetentionDays: RetentionDays;
  /** Recording stops by itself after this long. */
  maxRecordingMinutes: number;
  /** Optional global shortcut that pastes the last dictation again. */
  pasteLastShortcut: string;
  /** Let other apps and Shortcuts control MyVoice through myvoice:// links. */
  allowUrlControl: boolean;
  /** Read the front browser tab's site to pick a mode (only when FEATURE_FLAGS.websiteModes is on). */
  websiteModes: boolean;
  /** Ask GitHub for a newer release once a day. Off: MyVoice only checks when asked. */
  autoCheckUpdates: boolean;
  localAi: LocalAiSettings;
}

export const MAX_RECORDING_OPTIONS = [2, 5, 10, 20, 30];

export function defaultPreferences(arch: string): Preferences {
  return {
    triggerStyle: 'double-tap',
    livePreview: defaultLivePreview(arch),
    sounds: true,
    ducking: 'off',
    clipboard: 'restore',
    smartSpacing: true,
    historyRetentionDays: -1,
    maxRecordingMinutes: 10,
    pasteLastShortcut: '',
    allowUrlControl: false,
    websiteModes: false,
    autoCheckUpdates: false,
    localAi: { ...DEFAULT_LOCAL_AI },
  };
}

const TRIGGER_STYLES: TriggerStyle[] = ['double-tap', 'hold', 'both'];
const DUCKING_MODES: DuckingMode[] = ['off', 'lower', 'mute'];
const CLIPBOARD_BEHAVIORS: ClipboardBehavior[] = ['restore', 'keep'];

export function normalizePreferences(raw: unknown, arch: string): Preferences {
  const defaults = defaultPreferences(arch);
  const data = (raw && typeof raw === 'object' ? raw : {}) as Partial<Preferences>;
  const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
    (allowed.includes(value as T) ? value as T : fallback);
  const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);

  return {
    triggerStyle: pick(data.triggerStyle, TRIGGER_STYLES, defaults.triggerStyle),
    livePreview: bool(data.livePreview, defaults.livePreview),
    sounds: bool(data.sounds, defaults.sounds),
    ducking: pick(data.ducking, DUCKING_MODES, defaults.ducking),
    clipboard: pick(data.clipboard, CLIPBOARD_BEHAVIORS, defaults.clipboard),
    smartSpacing: bool(data.smartSpacing, defaults.smartSpacing),
    historyRetentionDays: pick(data.historyRetentionDays, RETENTION_OPTIONS, defaults.historyRetentionDays),
    maxRecordingMinutes: pick(data.maxRecordingMinutes, MAX_RECORDING_OPTIONS, defaults.maxRecordingMinutes),
    pasteLastShortcut: typeof data.pasteLastShortcut === 'string' ? data.pasteLastShortcut.trim().slice(0, 64) : '',
    allowUrlControl: bool(data.allowUrlControl, defaults.allowUrlControl),
    websiteModes: bool(data.websiteModes, defaults.websiteModes),
    autoCheckUpdates: bool(data.autoCheckUpdates, defaults.autoCheckUpdates),
    localAi: normalizeLocalAiSettings(data.localAi),
  };
}

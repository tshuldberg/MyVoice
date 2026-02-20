import { app } from 'electron';
import fs from 'fs';
import path from 'path';

export interface HotkeySettings {
  triggerShortcut: string;
}

const DEFAULT_SETTINGS: HotkeySettings = {
  triggerShortcut: '',
};

let cachedSettings: HotkeySettings | null = null;

function getSettingsPath(): string | null {
  try {
    return path.join(app.getPath('userData'), 'hotkey-settings.json');
  } catch {
    return null;
  }
}

function loadSettings(): HotkeySettings {
  const settingsPath = getSettingsPath();
  if (!settingsPath) return { ...DEFAULT_SETTINGS };

  try {
    if (!fs.existsSync(settingsPath)) return { ...DEFAULT_SETTINGS };
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<HotkeySettings>;
    return {
      triggerShortcut: String(parsed.triggerShortcut ?? '').trim(),
    };
  } catch (error) {
    console.error('[MyVoice] Failed to load hotkey settings, using defaults:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: HotkeySettings): void {
  const settingsPath = getSettingsPath();
  if (!settingsPath) return;

  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (error) {
    console.error('[MyVoice] Failed to save hotkey settings:', error);
  }
}

export function getHotkeySettings(): HotkeySettings {
  if (!cachedSettings) {
    cachedSettings = loadSettings();
  }
  return { ...cachedSettings };
}

export function setTriggerShortcut(triggerShortcut: string): HotkeySettings {
  const next: HotkeySettings = {
    ...getHotkeySettings(),
    triggerShortcut: String(triggerShortcut || '').trim(),
  };
  cachedSettings = next;
  saveSettings(next);
  return { ...next };
}

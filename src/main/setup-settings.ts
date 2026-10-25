import { app } from 'electron';
import fs from 'fs';
import path from 'path';

export interface SetupSettings {
  completed: boolean;
}

const DEFAULT_SETTINGS: SetupSettings = {
  completed: false,
};

let cachedSettings: SetupSettings | null = null;

function getSettingsPath(): string | null {
  try {
    return path.join(app.getPath('userData'), 'setup-settings.json');
  } catch {
    return null;
  }
}

function loadSettings(): SetupSettings {
  const settingsPath = getSettingsPath();
  if (!settingsPath) return { ...DEFAULT_SETTINGS };

  try {
    if (!fs.existsSync(settingsPath)) return { ...DEFAULT_SETTINGS };
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SetupSettings>;
    return {
      completed: parsed.completed === true,
    };
  } catch (error) {
    console.error('[MyVoice] Failed to load setup settings, using defaults:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: SetupSettings): void {
  const settingsPath = getSettingsPath();
  if (!settingsPath) return;

  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (error) {
    console.error('[MyVoice] Failed to save setup settings:', error);
  }
}

export function getSetupSettings(): SetupSettings {
  if (!cachedSettings) {
    cachedSettings = loadSettings();
  }
  return { ...cachedSettings };
}

export function setSetupCompleted(completed: boolean): SetupSettings {
  const next: SetupSettings = {
    ...getSetupSettings(),
    completed,
  };
  cachedSettings = next;
  saveSettings(next);
  return { ...next };
}

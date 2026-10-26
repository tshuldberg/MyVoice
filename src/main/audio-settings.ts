import { app } from 'electron';
import fs from 'fs';
import path from 'path';

export interface AudioSettings {
  selectedDeviceUID: string;
  /** Prefer a non-Bluetooth microphone so headphones keep full sound quality. */
  avoidBluetooth: boolean;
}

const DEFAULT_SETTINGS: AudioSettings = {
  selectedDeviceUID: '',
  avoidBluetooth: false,
};

let cachedSettings: AudioSettings | null = null;

function getSettingsPath(): string | null {
  try {
    return path.join(app.getPath('userData'), 'audio-settings.json');
  } catch {
    return null;
  }
}

function loadSettings(): AudioSettings {
  const settingsPath = getSettingsPath();
  if (!settingsPath) return { ...DEFAULT_SETTINGS };

  try {
    if (!fs.existsSync(settingsPath)) return { ...DEFAULT_SETTINGS };
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      selectedDeviceUID: String(parsed.selectedDeviceUID ?? '').trim(),
      avoidBluetooth: parsed.avoidBluetooth === true,
    };
  } catch (error) {
    console.error('[MyVoice] Failed to load audio settings, using defaults:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: AudioSettings): void {
  const settingsPath = getSettingsPath();
  if (!settingsPath) return;

  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (error) {
    console.error('[MyVoice] Failed to save audio settings:', error);
  }
}

export function getAudioSettings(): AudioSettings {
  if (!cachedSettings) {
    cachedSettings = loadSettings();
  }
  return { ...cachedSettings };
}

export function setSelectedDeviceUID(deviceUID: string): AudioSettings {
  const next: AudioSettings = {
    ...getAudioSettings(),
    selectedDeviceUID: String(deviceUID || '').trim(),
  };
  cachedSettings = next;
  saveSettings(next);
  return { ...next };
}

export function setAvoidBluetooth(avoidBluetooth: boolean): AudioSettings {
  const next: AudioSettings = {
    ...getAudioSettings(),
    avoidBluetooth,
  };
  cachedSettings = next;
  saveSettings(next);
  return { ...next };
}

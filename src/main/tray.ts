import { Tray, Menu, nativeImage, app, shell } from 'electron';
import { getModesState, updateModesState } from './modes-settings';
import { selectMode } from './modes';
import {
  getVisualizationSettings,
  setWaveformSensitivity,
  setWaveformDebugOverlay,
} from './visualization-settings';
import { broadcastWaveformConfig } from './overlay-window';
import { getAudioSettings, setSelectedDeviceUID } from './audio-settings';
import * as native from './native-bridge';
import {
  AUTO_STOP_DELAY_OPTIONS_MS,
  formatAutoStopDelayLabel,
  getDictationSettings,
  setAutoStopPauseMs,
} from './dictation-settings';
import { loadTrayIcon } from './icon';
import { checkForUpdates } from './update-checker';
import { broadcastAppState } from './app-window';

let tray: Tray | null = null;
let isRecording = false;

interface TrayActions {
  openMainWindow?: () => void;
  openSettings?: () => void;
  openTodayLog?: () => void;
  openSetup?: () => void;
  openModes?: () => void;
  openFileTranscription?: () => void;
  pasteLast?: () => void;
}

let trayActions: TrayActions = {};

export function createTray(actions: TrayActions = {}): Tray {
  trayActions = actions;
  tray = new Tray(loadTrayIcon() ?? nativeImage.createEmpty());
  tray.setToolTip('MyVoice — Double-tap fn or use your configured shortcut');
  updateTrayMenu();
  return tray;
}

export function setRecordingState(recording: boolean): void {
  isRecording = recording;
  updateTrayMenu();

  if (tray) {
    tray.setImage(loadTrayIcon() ?? nativeImage.createEmpty());
    tray.setToolTip(recording ? 'MyVoice — Recording...' : 'MyVoice — Double-tap fn or use your configured shortcut');
  }
}

export function updateTrayMenu(): void {
  if (!tray) return;

  const modes = getModesState();
  const visualization = getVisualizationSettings();
  const dictation = getDictationSettings();
  const audio = getAudioSettings();
  const availableDevices = native.listAudioInputDevices();
  const contextMenu = Menu.buildFromTemplate([
    {
      label: `MyVoice ${app.getVersion()}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Open MyVoice',
      click: () => {
        trayActions.openMainWindow?.();
      },
    },
    {
      label: 'Settings',
      click: () => {
        trayActions.openSettings?.();
      },
    },
    {
      label: 'History',
      click: () => {
        trayActions.openTodayLog?.();
      },
    },
    {
      label: 'Paste Last Dictation',
      click: () => {
        trayActions.pasteLast?.();
      },
    },
    {
      label: 'Transcribe Audio File…',
      click: () => {
        trayActions.openFileTranscription?.();
      },
    },
    {
      label: 'Set Up Permissions…',
      click: () => {
        trayActions.openSetup?.();
      },
    },
    { type: 'separator' },
    {
      label: isRecording ? 'Status: Recording...' : 'Status: Ready',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Launch at Login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({ openAtLogin: menuItem.checked });
      },
    },
    {
      label: 'Mode',
      submenu: [
        ...modes.modes.map((mode) => ({
          label: mode.apps.length > 0 ? `${mode.name} (also used in ${mode.apps.length} app${mode.apps.length === 1 ? '' : 's'})` : mode.name,
          type: 'radio' as const,
          checked: modes.selectedModeId === mode.id,
          click: () => {
            updateModesState((state) => selectMode(state, mode.id));
            updateTrayMenu();
            broadcastAppState();
          },
        })),
        { type: 'separator' as const },
        {
          label: 'Edit Modes…',
          click: () => {
            trayActions.openModes?.();
          },
        },
      ],
    },
    {
      label: 'Auto-Stop Pause',
      submenu: AUTO_STOP_DELAY_OPTIONS_MS.map((delayMs) => ({
        label: delayMs === 3000
          ? `${formatAutoStopDelayLabel(delayMs)} (default)`
          : formatAutoStopDelayLabel(delayMs),
        type: 'radio',
        checked: dictation.autoStopPauseMs === delayMs,
        click: () => {
          setAutoStopPauseMs(delayMs);
          updateTrayMenu();
        },
      })),
    },
    {
      label: 'Waveform',
      submenu: [
        {
          label: 'Sensitivity: Low',
          type: 'radio',
          checked: visualization.sensitivity === 'low',
          click: () => {
            setWaveformSensitivity('low');
            broadcastWaveformConfig();
            updateTrayMenu();
          },
        },
        {
          label: 'Sensitivity: Balanced (default)',
          type: 'radio',
          checked: visualization.sensitivity === 'balanced',
          click: () => {
            setWaveformSensitivity('balanced');
            broadcastWaveformConfig();
            updateTrayMenu();
          },
        },
        {
          label: 'Sensitivity: High',
          type: 'radio',
          checked: visualization.sensitivity === 'high',
          click: () => {
            setWaveformSensitivity('high');
            broadcastWaveformConfig();
            updateTrayMenu();
          },
        },
        { type: 'separator' },
        {
          label: 'Show Waveform Debug Overlay',
          type: 'checkbox',
          checked: visualization.debugOverlay,
          click: (menuItem) => {
            setWaveformDebugOverlay(menuItem.checked);
            broadcastWaveformConfig();
            updateTrayMenu();
          },
        },
      ],
    },
    {
      label: 'Audio Input',
      submenu: [
        {
          label: 'System Default',
          type: 'radio',
          checked: !audio.selectedDeviceUID,
          click: () => {
            setSelectedDeviceUID('');
            native.clearAudioInputDevice();
            updateTrayMenu();
          },
        },
        ...availableDevices.map((device) => ({
          label: device.name,
          type: 'radio' as const,
          checked: audio.selectedDeviceUID === device.uid,
          click: () => {
            setSelectedDeviceUID(device.uid);
            native.setAudioInputDevice(device.uid);
            updateTrayMenu();
          },
        })),
      ],
    },
    { type: 'separator' },
    {
      label: 'Check for Updates…',
      click: () => {
        checkForUpdates().catch((error) => {
          console.error('[MyVoice] Update check failed:', error);
        });
      },
    },
    {
      label: 'Buy Me a Coffee ☕',
      click: () => shell.openExternal('https://buymeacoffee.com/TreyTre'),
    },
    { type: 'separator' },
    {
      label: 'Quit MyVoice',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
}

export function getTray(): Tray | null {
  return tray;
}

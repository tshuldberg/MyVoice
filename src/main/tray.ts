import { Tray, Menu, nativeImage, app, shell } from 'electron';
import {
  getFormattingSettings,
  setFormattingMode,
  setAiEnhancementEnabled,
} from './formatting-settings';
import {
  getVisualizationSettings,
  setWaveformSensitivity,
  setWaveformDebugOverlay,
} from './visualization-settings';
import { broadcastWaveformConfig } from './overlay-window';
import {
  AUTO_STOP_DELAY_OPTIONS_MS,
  formatAutoStopDelayLabel,
  getDictationSettings,
  setAutoStopPauseMs,
} from './dictation-settings';
import { loadTrayIcon } from './icon';

let tray: Tray | null = null;
let isRecording = false;

interface TrayActions {
  openMainWindow?: () => void;
  openSettings?: () => void;
  openTodayLog?: () => void;
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

function updateTrayMenu(): void {
  if (!tray) return;

  const formatting = getFormattingSettings();
  const visualization = getVisualizationSettings();
  const dictation = getDictationSettings();
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'MyVoice',
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
      label: "Today's Log",
      click: () => {
        trayActions.openTodayLog?.();
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
      label: 'Text Formatting',
      submenu: [
        {
          label: 'Off (verbatim)',
          type: 'radio',
          checked: formatting.mode === 'off',
          click: () => {
            setFormattingMode('off');
            updateTrayMenu();
          },
        },
        {
          label: 'Basic (default)',
          type: 'radio',
          checked: formatting.mode === 'basic',
          click: () => {
            setFormattingMode('basic');
            updateTrayMenu();
          },
        },
        {
          label: 'Structured (more paragraph/list formatting)',
          type: 'radio',
          checked: formatting.mode === 'structured',
          click: () => {
            setFormattingMode('structured');
            updateTrayMenu();
          },
        },
        { type: 'separator' },
        {
          label: 'AI Enhancement (optional)',
          type: 'checkbox',
          checked: formatting.aiEnhancementEnabled,
          click: (menuItem) => {
            setAiEnhancementEnabled(menuItem.checked);
            updateTrayMenu();
          },
        },
        {
          label: 'AI enhancement currently falls back to local formatting.',
          enabled: false,
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
    { type: 'separator' },
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

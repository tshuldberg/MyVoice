import { app, globalShortcut, Menu } from 'electron';
import { createOverlayWindow } from './overlay-window';
import { createTray, updateTrayMenu } from './tray';
import {
  cancelDictation,
  getDictationState,
  initDictation,
  pasteLastDictation,
  setPermissionsMissingHandler,
  stopDictation,
  toggleDictation,
} from './dictation-controller';
import { ensureWhisperReady, warmUpWhisper } from './dependency-setup';
import { broadcastAppState, createAppWindow, showAppWindow } from './app-window';
import { setFileTranscriber } from './file-transcription';
import { loadDockIcon } from './icon';
import { getHotkeySettings } from './hotkey-settings';
import { applyTriggerShortcut, clearTriggerShortcut, pasteLastShortcut, setTriggerShortcutHandler } from './trigger-shortcut';
import { getPermissionSnapshot, setAccessibilityGrantedHandler } from './permissions';
import { shouldShowSetup } from './permission-state';
import { getSetupSettings } from './setup-settings';
import { getPreferences } from './preferences';
import { setTriggerStyle, startFnTrigger, stopFnTrigger } from './fn-trigger';
import { parseControlUrl } from './control-url';
import { updateModesState } from './modes-settings';
import { selectMode } from './modes';
import { purgeRecordingLogs } from './recording-log';

function installEpipeGuards(): void {
  const installGuard = (stream: NodeJS.WriteStream | undefined): void => {
    if (!stream || typeof stream.on !== 'function') return;

    stream.on('error', (error: NodeJS.ErrnoException) => {
      if (error?.code === 'EPIPE') {
        return;
      }

      process.nextTick(() => {
        throw error;
      });
    });
  };

  installGuard(process.stdout);
  installGuard(process.stderr);
}

installEpipeGuards();

let ready = false;
const pendingUrls: string[] = [];

/** myvoice:// links, honored only when the user allowed other apps to control MyVoice. */
function handleControlUrl(url: string): void {
  if (!ready) {
    pendingUrls.push(url);
    return;
  }
  const action = parseControlUrl(url);
  if (!action) return;
  if (!getPreferences().allowUrlControl) {
    console.warn('[MyVoice] Ignored a myvoice:// link: "Allow other apps to control MyVoice" is off.');
    return;
  }
  switch (action.kind) {
    case 'start':
      if (getDictationState() === 'idle') toggleDictation('url');
      break;
    case 'stop':
      stopDictation();
      break;
    case 'toggle':
      toggleDictation('url');
      break;
    case 'cancel':
      cancelDictation();
      break;
    case 'paste-last':
      pasteLastDictation().catch((error) => console.error('[MyVoice] Paste last failed:', error));
      break;
    case 'select-mode':
      updateModesState((state) => selectMode(state, action.modeId));
      updateTrayMenu();
      broadcastAppState();
      break;
  }
}

// Registered before ready: macOS delivers a launch link right away.
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleControlUrl(url);
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

app.whenReady().then(async () => {
  app.dock?.show();
  const dockIcon = loadDockIcon();
  if (dockIcon) {
    app.dock?.setIcon(dockIcon);
  }
  if (app.dock) {
    app.dock.setMenu(Menu.buildFromTemplate([
      {
        label: 'Open MyVoice',
        click: () => showAppWindow('settings'),
      },
      { type: 'separator' },
      {
        label: 'Quit MyVoice',
        click: () => app.quit(),
      },
    ]));
  }

  // Ensure whisper-cli and model are available (may show setup UI)
  const whisperPaths = await ensureWhisperReady();
  warmUpWhisper(whisperPaths);
  setFileTranscriber(whisperPaths.whisperCli);

  const prefs = getPreferences();
  purgeRecordingLogs(prefs.historyRetentionDays);

  // Create main app window and tray icon
  createAppWindow();
  createTray({
    openMainWindow: () => showAppWindow('settings'),
    openSettings: () => showAppWindow('settings'),
    openTodayLog: () => showAppWindow('logs'),
    openSetup: () => showAppWindow('setup'),
    openModes: () => showAppWindow('modes'),
    openFileTranscription: () => showAppWindow('logs'),
    pasteLast: () => {
      pasteLastDictation().catch((error) => console.error('[MyVoice] Paste last failed:', error));
    },
  });

  // Pre-create overlay window (hidden)
  createOverlayWindow();

  // Initialize dictation with resolved paths
  initDictation(whisperPaths);
  setPermissionsMissingHandler(() => showAppWindow('setup'));

  setTriggerShortcutHandler(() => {
    toggleDictation('toggle');
  });
  const configuredTriggerShortcut = getHotkeySettings().triggerShortcut;
  const triggerShortcutResult = applyTriggerShortcut(configuredTriggerShortcut);
  if (!triggerShortcutResult.ok && triggerShortcutResult.error) {
    console.error('[MyVoice] Failed to register trigger shortcut:', triggerShortcutResult.error);
  }

  pasteLastShortcut.setHandler(() => {
    pasteLastDictation().catch((error) => console.error('[MyVoice] Paste last failed:', error));
  });
  pasteLastShortcut.apply(prefs.pasteLastShortcut);

  // The fn listener needs Accessibility, so it is re-armed when that
  // permission is granted while MyVoice is running.
  setTriggerStyle(prefs.triggerStyle);
  startFnTrigger();
  setAccessibilityGrantedHandler(startFnTrigger);

  if (shouldShowSetup(getPermissionSnapshot(), getSetupSettings().completed)) {
    showAppWindow('setup');
  }

  ready = true;
  pendingUrls.splice(0).forEach(handleControlUrl);
  console.log('MyVoice is running. Double-tap fn to dictate.');
});

app.on('activate', () => {
  showAppWindow('settings');
});

app.on('will-quit', () => {
  stopFnTrigger();
  clearTriggerShortcut();
  pasteLastShortcut.clear();
  globalShortcut.unregisterAll();
});

// Keep app running when all windows are closed (menu bar app)
app.on('window-all-closed', () => {
  // Do nothing — keep app running as menu bar app
});

import { app, globalShortcut, Menu } from 'electron';
import { createOverlayWindow } from './overlay-window';
import { createTray } from './tray';
import { toggleDictation, cancelDictation, getDictationState, initDictation } from './dictation-controller';
import { hotkeyStart, hotkeyStop } from './native-bridge';
import { ensureWhisperReady } from './dependency-setup';
import { createAppWindow, showAppWindow } from './app-window';
import { loadDockIcon } from './icon';
import { getHotkeySettings } from './hotkey-settings';
import { applyTriggerShortcut, clearTriggerShortcut, setTriggerShortcutHandler } from './trigger-shortcut';

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

  // Create main app window and tray icon
  createAppWindow();
  createTray({
    openMainWindow: () => showAppWindow('settings'),
    openSettings: () => showAppWindow('settings'),
    openTodayLog: () => showAppWindow('logs'),
  });

  // Pre-create overlay window (hidden)
  createOverlayWindow();

  // Initialize dictation with resolved paths
  initDictation(whisperPaths);

  setTriggerShortcutHandler(() => {
    toggleDictation();
  });
  const configuredTriggerShortcut = getHotkeySettings().triggerShortcut;
  const triggerShortcutResult = applyTriggerShortcut(configuredTriggerShortcut);
  if (!triggerShortcutResult.ok && triggerShortcutResult.error) {
    console.error('[MyVoice] Failed to register trigger shortcut:', triggerShortcutResult.error);
  }

  // Start listening for fn double-tap
  hotkeyStart(() => {
    toggleDictation();
  });

  // Register Escape key to cancel active dictation
  globalShortcut.register('Escape', () => {
    if (getDictationState() !== 'idle') {
      cancelDictation();
    }
  });

  console.log('MyVoice is running. Double-tap fn to dictate.');
});

app.on('activate', () => {
  showAppWindow('settings');
});

app.on('will-quit', () => {
  hotkeyStop();
  clearTriggerShortcut();
  globalShortcut.unregisterAll();
});

// Keep app running when all windows are closed (menu bar app)
app.on('window-all-closed', () => {
  // Do nothing — keep app running as menu bar app
});

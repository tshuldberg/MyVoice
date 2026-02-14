import { app, globalShortcut } from 'electron';
import { createOverlayWindow } from './overlay-window';
import { createTray } from './tray';
import { toggleDictation, cancelDictation, getDictationState } from './dictation-controller';
import { hotkeyStart, hotkeyStop } from './native-bridge';

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// Hide dock icon (menu bar app only)
app.dock?.hide();

app.whenReady().then(() => {
  // Create tray icon
  createTray();

  // Pre-create overlay window (hidden)
  createOverlayWindow();

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

app.on('will-quit', () => {
  hotkeyStop();
  globalShortcut.unregisterAll();
});

// Keep app running when all windows are closed (menu bar app)
app.on('window-all-closed', () => {
  // Do nothing — keep app running as menu bar app
});

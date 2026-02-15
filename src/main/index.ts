import { app, globalShortcut } from 'electron';
import { createOverlayWindow } from './overlay-window';
import { createTray } from './tray';
import { toggleDictation, cancelDictation, getDictationState, initDictation } from './dictation-controller';
import { hotkeyStart, hotkeyStop } from './native-bridge';
import { ensureWhisperReady } from './dependency-setup';

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// Hide dock icon (menu bar app only)
app.dock?.hide();

app.whenReady().then(async () => {
  // Ensure whisper-cli and model are available (may show setup UI)
  const whisperPaths = await ensureWhisperReady();

  // Create tray icon
  createTray();

  // Pre-create overlay window (hidden)
  createOverlayWindow();

  // Initialize dictation with resolved paths
  initDictation(whisperPaths);

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

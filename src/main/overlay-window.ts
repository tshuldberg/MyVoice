import { BrowserWindow, screen, ipcMain } from 'electron';
import path from 'path';
import { OVERLAY_WIDTH, OVERLAY_HEIGHT_COMPACT, OVERLAY_TOP_OFFSET } from '../shared/constants';
import { IPC_CHANNELS } from '../shared/types';

let overlayWindow: BrowserWindow | null = null;

export function createOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;

  overlayWindow = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT_COMPACT,
    x: Math.round((screenWidth - OVERLAY_WIDTH) / 2),
    y: OVERLAY_TOP_OFFSET,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'floating');
  overlayWindow.setIgnoreMouseEvents(true);
  overlayWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));

  // Listen for overlay dismissed event
  ipcMain.on('overlay:dismissed', () => {
    hideOverlay();
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

export function showOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
  }
  overlayWindow!.show();
  overlayWindow!.webContents.send(IPC_CHANNELS.DICTATION_START);
}

export function hideOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }
}

export function sendToOverlay(channel: string, data?: any): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(channel, data);
  }
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow;
}

import { BrowserWindow, screen, ipcMain } from 'electron';
import path from 'path';
import { OVERLAY_WIDTH, OVERLAY_HEIGHT_COMPACT, OVERLAY_TOP_OFFSET } from '../shared/constants';
import { IPC_CHANNELS } from '../shared/types';

let overlayWindow: BrowserWindow | null = null;
let ipcRegistered = false;

export function createOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  // Position on display nearest to cursor, not always primary
  const cursorPoint = screen.getCursorScreenPoint();
  const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
  const { x: displayX, width: screenWidth } = activeDisplay.workArea;

  overlayWindow = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT_COMPACT,
    x: displayX + Math.round((screenWidth - OVERLAY_WIDTH) / 2),
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

  // Register IPC listener only once to avoid leaking listeners
  if (!ipcRegistered) {
    ipcMain.on('overlay:dismissed', () => {
      hideOverlay();
    });
    ipcRegistered = true;
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

export function showOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
  }
  // Re-center on display nearest to cursor each time
  const cursorPoint = screen.getCursorScreenPoint();
  const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
  const { x: displayX, width: screenWidth } = activeDisplay.workArea;
  overlayWindow!.setPosition(
    displayX + Math.round((screenWidth - OVERLAY_WIDTH) / 2),
    OVERLAY_TOP_OFFSET
  );
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

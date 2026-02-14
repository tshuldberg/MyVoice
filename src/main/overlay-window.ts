import { BrowserWindow, screen, ipcMain } from 'electron';
import path from 'path';
import {
  OVERLAY_EXPANDED_WIDTH,
  OVERLAY_EXPANDED_HEIGHT,
  OVERLAY_TOP_OFFSET,
} from '../shared/constants';
import { IPC_CHANNELS, OverlaySetSizePayload } from '../shared/types';

let overlayWindow: BrowserWindow | null = null;
let ipcRegistered = false;

export function createOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  // Position on display nearest to cursor
  const cursorPoint = screen.getCursorScreenPoint();
  const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
  const { x: displayX, width: screenWidth } = activeDisplay.workArea;

  overlayWindow = new BrowserWindow({
    width: OVERLAY_EXPANDED_WIDTH,
    height: OVERLAY_EXPANDED_HEIGHT,
    x: displayX + Math.round((screenWidth - OVERLAY_EXPANDED_WIDTH) / 2),
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

  // Forward mouse events through transparent regions, but clickable content still works
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  // Visible on all macOS Spaces (desktops) including fullscreen
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  overlayWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));

  // Register IPC listeners only once to avoid leaking listeners
  if (!ipcRegistered) {
    ipcMain.on(IPC_CHANNELS.OVERLAY_DISMISSED, () => {
      hideOverlay();
    });

    ipcMain.on(IPC_CHANNELS.OVERLAY_SET_SIZE, (_event, payload: OverlaySetSizePayload) => {
      if (!overlayWindow || overlayWindow.isDestroyed()) return;

      const cursorPoint = screen.getCursorScreenPoint();
      const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
      const { x: displayX, y: displayY, width: screenWidth } = activeDisplay.workArea;

      let newX: number;
      let newY: number;

      if (payload.position === 'center') {
        newX = displayX + Math.round((screenWidth - payload.width) / 2);
        newY = OVERLAY_TOP_OFFSET;
      } else {
        // top-left with margin
        newX = displayX + 20;
        newY = displayY + OVERLAY_TOP_OFFSET;
      }

      overlayWindow.setSize(payload.width, payload.height);
      overlayWindow.setPosition(newX, newY);
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

  // Re-center on display nearest to cursor each time (always expanded)
  const cursorPoint = screen.getCursorScreenPoint();
  const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
  const { x: displayX, width: screenWidth } = activeDisplay.workArea;

  overlayWindow!.setSize(OVERLAY_EXPANDED_WIDTH, OVERLAY_EXPANDED_HEIGHT);
  overlayWindow!.setPosition(
    displayX + Math.round((screenWidth - OVERLAY_EXPANDED_WIDTH) / 2),
    OVERLAY_TOP_OFFSET
  );
  overlayWindow!.showInactive();
  overlayWindow!.moveTop();
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

import { Tray, Menu, nativeImage, app } from 'electron';
import path from 'path';

let tray: Tray | null = null;
let isRecording = false;

export function createTray(): Tray {
  // Create a simple template image for the tray
  // On macOS, template images adapt to light/dark mode automatically
  const iconPath = path.join(__dirname, '../../assets/tray-icon.png');

  // Fallback: create a simple icon if file doesn't exist
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    icon = icon.resize({ width: 16, height: 16 });
  } catch {
    // Create a minimal microphone-like icon as fallback
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('MyVoice — Double-tap fn to dictate');
  updateTrayMenu();

  return tray;
}

export function setRecordingState(recording: boolean): void {
  isRecording = recording;
  updateTrayMenu();

  if (tray) {
    tray.setToolTip(recording ? 'MyVoice — Recording...' : 'MyVoice — Double-tap fn to dictate');
  }
}

function updateTrayMenu(): void {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'MyVoice',
      enabled: false,
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

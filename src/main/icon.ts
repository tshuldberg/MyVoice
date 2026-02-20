import { app, nativeImage, NativeImage } from 'electron';
import path from 'path';

function getRootIconPath(): string {
  return path.join(app.getAppPath(), 'icon.png');
}

export function loadDockIcon(): NativeImage | null {
  const icon = nativeImage.createFromPath(getRootIconPath());
  return icon.isEmpty() ? null : icon;
}

export function loadTrayIcon(): NativeImage | null {
  const icon = nativeImage.createFromPath(getRootIconPath());
  if (icon.isEmpty()) {
    return null;
  }

  const size = process.platform === 'darwin' ? 18 : 16;
  const resized = icon.resize({ width: size, height: size, quality: 'best' });
  // Keep the original artwork instead of monochrome template rendering.
  resized.setTemplateImage(false);
  return resized;
}

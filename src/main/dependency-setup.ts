import { app, BrowserWindow, dialog, shell } from 'electron';
import { execFile } from 'child_process';
import { rmSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { IPC_CHANNELS } from '../shared/types';
import {
  BASE_EN_MODEL,
  ModelIntegrityError,
  downloadVerifiedFile,
  findExecutable,
  findValidModel,
  formatMegabytes,
  modelCandidates,
  whisperCliCandidates,
} from './whisper-assets';
import { silentWav } from './wav';

export interface WhisperPaths {
  whisperCli: string;
  whisperModel: string;
}

const RELEASES_URL = 'https://github.com/tshuldberg/MyVoice/releases/latest';

let setupWindow: BrowserWindow | null = null;

// --- Setup progress window ---

function showSetupWindow(): BrowserWindow {
  if (setupWindow && !setupWindow.isDestroyed()) return setupWindow;

  setupWindow = new BrowserWindow({
    width: 420,
    height: 200,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  setupWindow.loadFile(path.join(__dirname, '../../src/renderer/setup.html'));

  setupWindow.once('ready-to-show', () => {
    setupWindow?.show();
  });

  setupWindow.on('closed', () => {
    setupWindow = null;
  });

  return setupWindow;
}

function sendProgress(message: string, percent: number): void {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.webContents.send(IPC_CHANNELS.SETUP_PROGRESS, { message, percent });
  }
}

function closeSetupWindow(): void {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.close();
    setupWindow = null;
  }
}

function quitSetup(reason: string): never {
  closeSetupWindow();
  app.quit();
  throw new Error(reason);
}

// --- Bundled whisper-cli ---

function resolveWhisperCli(): string {
  const whisperCli = findExecutable(whisperCliCandidates({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appRoot: app.getAppPath(),
  }));
  if (whisperCli) return whisperCli;

  if (app.isPackaged) {
    const choice = dialog.showMessageBoxSync({
      type: 'error',
      title: 'MyVoice Setup',
      message: 'MyVoice is missing its speech engine.',
      detail: 'This copy of MyVoice looks incomplete. Download the latest release and drag it to Applications again.',
      buttons: ['Open Download Page', 'Quit'],
      defaultId: 0,
    });
    if (choice === 0) shell.openExternal(RELEASES_URL);
  } else {
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'MyVoice Setup',
      message: 'whisper-cli not found.',
      detail: 'Run "npm run build:whisper" to build the bundled speech engine, then start MyVoice again.',
      buttons: ['Quit'],
    });
  }
  return quitSetup('whisper-cli not found');
}

// --- Speech model ---

function confirmModelDownload(): boolean {
  const size = formatMegabytes(BASE_EN_MODEL.sizeBytes);
  const choice = dialog.showMessageBoxSync({
    type: 'info',
    title: 'MyVoice Setup',
    message: `Download the speech model (${size})?`,
    detail: 'MyVoice turns speech into text on this Mac with the Whisper base.en model. '
      + `It is a one-time ${size} download from Hugging Face. After that, dictation works offline `
      + 'and your voice never leaves your Mac.',
    buttons: [`Download ${size}`, 'Quit'],
    defaultId: 0,
    cancelId: 1,
  });
  return choice === 0;
}

async function downloadModelWithProgress(destPath: string): Promise<void> {
  const totalMb = formatMegabytes(BASE_EN_MODEL.sizeBytes);
  let lastPercent = -1;
  sendProgress(`Downloading speech model… 0 of ${totalMb}`, 0);

  await downloadVerifiedFile(BASE_EN_MODEL.url, destPath, BASE_EN_MODEL, (received, total) => {
    const percent = Math.floor((received / total) * 100);
    if (percent === lastPercent) return;
    lastPercent = percent;
    sendProgress(`Downloading speech model… ${formatMegabytes(received)} of ${totalMb}`, percent);
  });

  sendProgress('Checking speech model…', 100);
}

function askToRetryDownload(error: unknown): boolean {
  const detail = error instanceof ModelIntegrityError
    ? `${error.message} The partial file was deleted.`
    : 'Check your internet connection and try again.';
  const choice = dialog.showMessageBoxSync({
    type: 'error',
    title: 'MyVoice Setup',
    message: 'The speech model could not be downloaded.',
    detail,
    buttons: ['Try Again', 'Quit'],
    defaultId: 0,
    cancelId: 1,
  });
  return choice === 0;
}

async function ensureModel(): Promise<string> {
  const candidates = modelCandidates(app.getPath('userData'), os.homedir());
  const existing = await findValidModel(candidates);
  if (existing) return existing;

  if (!confirmModelDownload()) {
    return quitSetup('Model download declined');
  }

  const destPath = candidates[0];
  showSetupWindow();
  for (;;) {
    try {
      await downloadModelWithProgress(destPath);
      return destPath;
    } catch (error) {
      console.error('[MyVoice] Model download failed:', error);
      if (!askToRetryDownload(error)) {
        return quitSetup('Model download failed');
      }
    }
  }
}

// --- Main entry point ---

export async function ensureWhisperReady(): Promise<WhisperPaths> {
  const whisperCli = resolveWhisperCli();
  const whisperModel = await ensureModel();
  closeSetupWindow();
  return { whisperCli, whisperModel };
}

/**
 * Runs one transcription of a short silent clip in the background. The first
 * run after install compiles whisper.cpp's Metal shaders (about 10 seconds on
 * an M-series Mac); doing it here keeps that delay out of the first dictation.
 */
export function warmUpWhisper(paths: WhisperPaths): void {
  const clipPath = path.join(app.getPath('temp'), 'myvoice-warmup.wav');
  writeFileSync(clipPath, silentWav(500));
  const startedAt = Date.now();

  execFile(
    paths.whisperCli,
    ['-m', paths.whisperModel, '--no-timestamps', '-l', 'en', '-f', clipPath],
    { timeout: 120000 },
    (error) => {
      rmSync(clipPath, { force: true });
      if (error) {
        console.error('[MyVoice] Speech engine warm-up failed:', error.message);
        return;
      }
      console.log(`[MyVoice] Speech engine ready in ${Date.now() - startedAt} ms`);
    }
  );
}

import { app, BrowserWindow, dialog } from 'electron';
import { execFile } from 'child_process';
import { accessSync, mkdirSync, statSync, renameSync, createWriteStream, unlinkSync, constants } from 'fs';
import { get as httpsGet } from 'https';
import path from 'path';
import os from 'os';
import { IPC_CHANNELS } from '../shared/types';

export interface WhisperPaths {
  whisperCli: string;
  whisperModel: string;
}

const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin';
const MODEL_DIR = path.join(os.homedir(), '.cache', 'whisper');
const MODEL_FILE = 'ggml-base.en.bin';
const MODEL_PATH = path.join(MODEL_DIR, MODEL_FILE);
const MODEL_MIN_SIZE = 100 * 1024 * 1024; // 100MB — catch partial downloads

let setupWindow: BrowserWindow | null = null;

// --- Whisper CLI probe ---

function probeWhisperCli(): string | null {
  const candidates = [
    '/opt/homebrew/bin/whisper-cli',  // ARM (Apple Silicon)
    '/usr/local/bin/whisper-cli',     // Intel
  ];

  for (const p of candidates) {
    try {
      accessSync(p, constants.X_OK);
      return p;
    } catch {
      // not found, try next
    }
  }

  // Fallback: which
  try {
    const { execFileSync } = require('child_process');
    const result = execFileSync('which', ['whisper-cli'], { encoding: 'utf8', timeout: 5000 }).trim();
    if (result) {
      accessSync(result, constants.X_OK);
      return result;
    }
  } catch {
    // not found
  }

  return null;
}

// --- Homebrew probe ---

function probeHomebrew(): string | null {
  const candidates = [
    '/opt/homebrew/bin/brew',
    '/usr/local/bin/brew',
  ];

  for (const p of candidates) {
    try {
      accessSync(p, constants.X_OK);
      return p;
    } catch {
      // not found
    }
  }
  return null;
}

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

// --- Install whisper-cpp via Homebrew ---

function installWhisperCli(brewPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sendProgress('Installing whisper-cpp via Homebrew…', -1);

    execFile(brewPath, ['install', 'whisper-cpp'], { timeout: 5 * 60 * 1000 }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`brew install failed: ${error.message}\n${stderr}`));
        return;
      }
      resolve();
    });
  });
}

// --- Download model ---

function downloadModel(): Promise<void> {
  return new Promise((resolve, reject) => {
    mkdirSync(MODEL_DIR, { recursive: true });

    const tempPath = MODEL_PATH + '.download';

    // Clean up any prior partial download
    try { unlinkSync(tempPath); } catch { /* no-op */ }

    sendProgress('Downloading speech model…', 0);

    const request = httpsGet(MODEL_URL, (response) => {
      // Follow redirects (Hugging Face uses them)
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        request.destroy();
        httpsGet(response.headers.location, (redirected) => {
          handleDownloadResponse(redirected, tempPath, resolve, reject);
        }).on('error', reject);
        return;
      }

      handleDownloadResponse(response, tempPath, resolve, reject);
    });

    request.on('error', reject);
  });
}

function handleDownloadResponse(
  response: import('http').IncomingMessage,
  tempPath: string,
  resolve: () => void,
  reject: (err: Error) => void
): void {
  if (response.statusCode !== 200) {
    reject(new Error(`Download failed: HTTP ${response.statusCode}`));
    return;
  }

  const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
  let downloaded = 0;

  const file = createWriteStream(tempPath);

  response.on('data', (chunk: Buffer) => {
    downloaded += chunk.length;
    if (totalBytes > 0) {
      const percent = Math.round((downloaded / totalBytes) * 100);
      const mb = (downloaded / 1024 / 1024).toFixed(0);
      const totalMb = (totalBytes / 1024 / 1024).toFixed(0);
      sendProgress(`Downloading speech model… ${mb}/${totalMb} MB`, percent);
    }
  });

  response.pipe(file);

  file.on('finish', () => {
    file.close(() => {
      try {
        renameSync(tempPath, MODEL_PATH);
        resolve();
      } catch (err) {
        reject(err as Error);
      }
    });
  });

  file.on('error', (err) => {
    try { unlinkSync(tempPath); } catch { /* no-op */ }
    reject(err);
  });
}

// --- Model probe ---

function probeModel(): boolean {
  try {
    const stat = statSync(MODEL_PATH);
    return stat.size > MODEL_MIN_SIZE;
  } catch {
    return false;
  }
}

// --- Main entry point ---

export async function ensureWhisperReady(): Promise<WhisperPaths> {
  // 1. Probe whisper-cli
  let whisperCli = probeWhisperCli();

  if (!whisperCli) {
    // Need to install — check for Homebrew first
    const brewPath = probeHomebrew();

    if (!brewPath) {
      const choice = dialog.showMessageBoxSync({
        type: 'info',
        title: 'MyVoice Setup',
        message: 'MyVoice requires Homebrew to install whisper-cpp.\n\nPlease install Homebrew first, then relaunch MyVoice.',
        buttons: ['Open brew.sh', 'Quit'],
        defaultId: 0,
      });

      if (choice === 0) {
        const { shell } = require('electron');
        shell.openExternal('https://brew.sh');
      }
      app.quit();
      throw new Error('Homebrew not found');
    }

    // Show setup window and install
    showSetupWindow();
    await installWhisperCli(brewPath);

    // Re-probe after install
    whisperCli = probeWhisperCli();
    if (!whisperCli) {
      dialog.showMessageBoxSync({
        type: 'error',
        title: 'MyVoice Setup',
        message: 'whisper-cpp installed but whisper-cli not found.\n\nPlease check your Homebrew installation and try again.',
        buttons: ['Quit'],
      });
      app.quit();
      throw new Error('whisper-cli not found after install');
    }
  }

  // 2. Probe model
  if (!probeModel()) {
    if (!setupWindow) showSetupWindow();
    await downloadModel();

    if (!probeModel()) {
      dialog.showMessageBoxSync({
        type: 'error',
        title: 'MyVoice Setup',
        message: 'Model download failed. Please check your internet connection and try again.',
        buttons: ['Quit'],
      });
      app.quit();
      throw new Error('Model download failed');
    }
  }

  closeSetupWindow();

  return { whisperCli, whisperModel: MODEL_PATH };
}

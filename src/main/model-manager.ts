import { app } from 'electron';
import { rmSync, statSync } from 'fs';
import os from 'os';
import path from 'path';
import { DEFAULT_MODEL_ID, MODEL_CATALOG, getModel, type ModelId, type ModelInfo } from './model-catalog';
import { downloadVerifiedFile, modelPath } from './whisper-assets';

export interface ModelStatus {
  id: ModelId;
  installed: boolean;
  /** Set while a download runs: 0 to 100. */
  downloadPercent: number | null;
}

type ProgressListener = (status: ModelStatus[]) => void;

const downloads = new Map<ModelId, { controller: AbortController; percent: number }>();
let listener: ProgressListener | null = null;
// The default model may live in the 0.2 cache folder; dependency-setup reports where it found it.
let defaultModelPath: string | null = null;

export function setDefaultModelPath(filePath: string): void {
  defaultModelPath = filePath;
}

export function onModelStatusChange(handler: ProgressListener): void {
  listener = handler;
}

function notify(): void {
  listener?.(listModelStatus());
}

function candidatePaths(model: ModelInfo): string[] {
  const paths = [modelPath(app.getPath('userData'), model)];
  if (model.id === DEFAULT_MODEL_ID && defaultModelPath) paths.unshift(defaultModelPath);
  paths.push(path.join(os.homedir(), '.cache', 'whisper', model.fileName));
  return paths;
}

/**
 * A downloaded model's path, or null. Downloads are hash-checked before they
 * are moved into place, so an exact size match is enough here.
 */
export function installedModelPath(id: ModelId): string | null {
  const model = getModel(id);
  if (!model) return null;
  for (const candidate of candidatePaths(model)) {
    try {
      if (statSync(candidate).size === model.sizeBytes) return candidate;
    } catch {
      // not here
    }
  }
  return null;
}

export function installedModelIds(): ModelId[] {
  return MODEL_CATALOG.filter((model) => installedModelPath(model.id)).map((model) => model.id);
}

export function listModelStatus(): ModelStatus[] {
  return MODEL_CATALOG.map((model) => ({
    id: model.id,
    installed: installedModelPath(model.id) !== null,
    downloadPercent: downloads.get(model.id)?.percent ?? null,
  }));
}

export async function downloadModel(id: ModelId): Promise<void> {
  const model = getModel(id);
  if (!model || downloads.has(id) || installedModelPath(id)) return;

  const controller = new AbortController();
  const entry = { controller, percent: 0 };
  downloads.set(id, entry);
  notify();
  try {
    await downloadVerifiedFile(model.url, modelPath(app.getPath('userData'), model), model, (received, total) => {
      const percent = Math.floor((received / total) * 100);
      if (percent !== entry.percent) {
        entry.percent = percent;
        notify();
      }
    }, controller.signal);
  } finally {
    downloads.delete(id);
    notify();
  }
}

export function cancelModelDownload(id: ModelId): void {
  downloads.get(id)?.controller.abort();
}

/**
 * Deletes a model MyVoice downloaded. The default model is kept so dictation
 * always works, and files in other folders (the 0.2 cache) are left alone.
 * Returns true when the model is no longer installed.
 */
export function deleteModel(id: ModelId): boolean {
  const model = getModel(id);
  if (!model || id === DEFAULT_MODEL_ID) return false;
  rmSync(modelPath(app.getPath('userData'), model), { force: true });
  notify();
  return installedModelPath(id) === null;
}

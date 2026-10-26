import { app } from 'electron';
import { findExecutable } from './whisper-assets';
import { LocalEngine, isGgufFile } from './local-engine';
import type { LocalAiSettings } from './local-ai';

// Connects the local AI settings to a running server: the user's own, or the
// built-in llama-server started on demand with the chosen model file.

let engine: LocalEngine | null = null;

function engineBinary(): string | null {
  const candidates = app.isPackaged
    ? [`${process.resourcesPath}/bin/llama-server`]
    : [`${app.getAppPath()}/resources/bin/llama-server`, '/opt/homebrew/bin/llama-server', '/usr/local/bin/llama-server'];
  return findExecutable(candidates);
}

/** Settings with a usable endpoint; throws a readable error when the built-in engine cannot run. */
export async function resolveLocalAi(settings: LocalAiSettings): Promise<LocalAiSettings> {
  if (settings.engine !== 'built-in') return settings;
  if (!settings.modelFile || !isGgufFile(settings.modelFile)) {
    throw new Error('Choose a GGUF model file for the built-in engine in Settings > Local AI cleanup.');
  }
  const binary = engineBinary();
  if (!binary) throw new Error('The built-in AI engine is not part of this copy of MyVoice.');
  if (!engine) engine = new LocalEngine(binary);
  return { ...settings, endpoint: await engine.ensure(settings.modelFile) };
}

/** Starts loading the model while the user is still speaking. */
export function warmLocalAi(settings: LocalAiSettings): void {
  if (!settings.enabled || settings.engine !== 'built-in') return;
  resolveLocalAi(settings).catch((error) => console.warn('[MyVoice] Local AI warm-up failed:', (error as Error).message));
}

export function stopLocalAi(): void {
  engine?.stop();
}

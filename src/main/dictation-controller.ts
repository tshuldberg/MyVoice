import { app, globalShortcut } from 'electron';
import { rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { DictationState } from '../shared/types';
import { IPC_CHANNELS } from '../shared/types';
import { showOverlay, hideOverlay, sendToOverlay } from './overlay-window';
import { setRecordingState } from './tray';
import * as native from './native-bridge';
import type { WhisperPaths } from './dependency-setup';
import { getDictationSettings, formatAutoStopDelayLabel } from './dictation-settings';
import { getAudioSettings } from './audio-settings';
import { appendRecordingLog, lastRecordingLogEntry } from './recording-log';
import { broadcastLogUpdated } from './app-window';
import { getPermissionSnapshot } from './permissions';
import { missingPermissions } from './permission-state';
import { getPreferences } from './preferences';
import { getModesState } from './modes-settings';
import { resolveMode, type DictationMode } from './modes';
import { canTranslate, effectiveLanguage, getModel, pickInstalledModel, type ModelId } from './model-catalog';
import { installedModelIds, installedModelPath, setDefaultModelPath } from './model-manager';
import { getDictionary } from './dictionary-settings';
import { buildVocabularyPrompt } from './dictionary';
import { processTranscript, stripAnnotations } from './text-pipeline';
import { runLocalCleanup } from './local-ai';
import { recommendedThreads, transcriptionTimeoutMs } from './whisper-args';
import { transcribe, type RunningTranscription } from './transcriber';
import { deliverText, readCaretContext } from './delivery';
import { duckOutput, playSound, restoreOutput } from './feedback';
import {
  PREVIEW_INTERVAL_MS,
  PREVIEW_TAIL_SECONDS,
  shouldConfirmCancel,
  shouldWarnNoInput,
} from './session-rules';

export type DictationTrigger = 'toggle' | 'hold' | 'url';

interface Session {
  id: number;
  trigger: DictationTrigger;
  mode: DictationMode;
  app: native.FrontmostApp | null;
  modelId: ModelId;
  modelPath: string;
  startedAt: number;
  lastAudioAboveThreshold: number;
  heardSpeech: boolean;
  heardAnything: boolean;
  warnedNoInput: boolean;
  lastEscapeAt: number | null;
  timers: ReturnType<typeof setTimeout>[];
  preview: RunningTranscription | null;
  transcription: RunningTranscription | null;
}

let state: DictationState = 'idle';
let session: Session | null = null;
let sessionCounter = 0;
let lastDictation: string | null = null;
let onPermissionsMissing: (() => void) | null = null;
let whisperCli: string | null = null;

const SILENCE_AUDIO_THRESHOLD = 0.02;
const ANY_INPUT_THRESHOLD = 0.003;
// The start sound can reach the microphone; levels this early are not speech.
const IGNORE_LEVELS_FIRST_MS = 250;
const CANCEL_SHORTCUT = 'Escape';
const SHOULD_LOG_AUDIO_LEVELS = process.env.MYVOICE_DEBUG_AUDIO_LEVELS === '1';
const THREADS = recommendedThreads(os.cpus().length);

export function initDictation(paths: WhisperPaths): void {
  whisperCli = paths.whisperCli;
  setDefaultModelPath(paths.whisperModel);
  console.log('[MyVoice] Dictation initialized:', paths);
}

/** Called when dictation is triggered while Microphone or Accessibility is missing. */
export function setPermissionsMissingHandler(handler: () => void): void {
  onPermissionsMissing = handler;
}

export function getDictationState(): DictationState {
  return state;
}

export function getActiveTrigger(): DictationTrigger | null {
  return session?.trigger ?? null;
}

export function toggleDictation(trigger: DictationTrigger = 'toggle'): void {
  if (state === 'idle') {
    startDictation(trigger);
  } else if (state === 'recording') {
    stopDictation();
  }
  // Ignore if 'stopping' (debounce)
}

export function cancelDictation(): void {
  if (state !== 'recording' && state !== 'stopping') return;
  native.speechStop();
  sendToOverlay(IPC_CHANNELS.DICTATION_CANCEL);
  resetState();
}

/** A short status message in the overlay; sticky ones stay until the dictation ends. */
function notice(text: string, sticky = false): void {
  sendToOverlay(IPC_CHANNELS.DICTATION_NOTICE, { text, sticky });
}

// Checked on every start: a grant can be revoked in System Settings at any time.
function checkPermissions(): boolean {
  const missing = missingPermissions(getPermissionSnapshot());
  if (missing.length === 0) return true;

  console.error('[MyVoice] Missing permissions:', missing.join(', '));
  onPermissionsMissing?.();
  return false;
}

function onEscape(): void {
  if (state === 'stopping') {
    cancelDictation();
    return;
  }
  if (state !== 'recording' || !session) return;
  const now = Date.now();
  if (shouldConfirmCancel(now - session.startedAt, session.lastEscapeAt, now) === 'confirm') {
    session.lastEscapeAt = now;
    notice('Press Esc again to discard this recording');
    return;
  }
  cancelDictation();
}

// Escape is only claimed while dictating; a permanent global Escape would block it in every app.
function setCancelShortcutEnabled(enabled: boolean): void {
  const registered = globalShortcut.isRegistered(CANCEL_SHORTCUT);
  if (enabled && !registered) {
    globalShortcut.register(CANCEL_SHORTCUT, onEscape);
  } else if (!enabled && registered) {
    globalShortcut.unregister(CANCEL_SHORTCUT);
  }
}

function deleteRecording(wavPath: string): void {
  rmSync(wavPath, { force: true });
}

function chooseModel(mode: DictationMode): { modelId: ModelId; modelPath: string } | null {
  const modelId = pickInstalledModel(mode.modelId, installedModelIds());
  const modelPath = modelId ? installedModelPath(modelId) : null;
  return modelId && modelPath ? { modelId, modelPath } : null;
}

function startDictation(trigger: DictationTrigger): void {
  if (!whisperCli) {
    console.error('[MyVoice] Dictation not initialized — call initDictation() first');
    return;
  }
  if (!checkPermissions()) return;

  const prefs = getPreferences();
  const frontmost = native.frontmostApplication();
  // MyVoice's own window counts as "no app", so the practice field uses the selected mode.
  const bundleId = frontmost && frontmost.pid !== process.pid ? frontmost.bundleId : null;
  const { mode, reason } = resolveMode(getModesState(), bundleId);
  const model = chooseModel(mode);
  if (!model) {
    showOverlay();
    sendToOverlay(IPC_CHANNELS.DICTATION_ERROR, 'No speech model is downloaded. Open Settings > Models.');
    resetState();
    return;
  }

  const now = Date.now();
  session = {
    id: ++sessionCounter,
    trigger,
    mode,
    app: bundleId ? frontmost : null,
    ...model,
    startedAt: now,
    lastAudioAboveThreshold: now,
    heardSpeech: false,
    heardAnything: false,
    warnedNoInput: false,
    lastEscapeAt: null,
    timers: [],
    preview: null,
    transcription: null,
  };
  const current = session;

  state = 'recording';
  setRecordingState(true);
  setCancelShortcutEnabled(true);
  playSound('start', prefs.sounds);
  duckOutput(prefs.ducking);
  showOverlay();

  const label = reason === 'app' && current.app ? `${mode.name} · ${current.app.name}` : mode.name;
  sendToOverlay(IPC_CHANNELS.DICTATION_CONTEXT, label);
  if (model.modelId !== mode.modelId) {
    notice(`${getModel(mode.modelId)?.label ?? mode.modelId} is not downloaded. Using ${getModel(model.modelId)?.label}.`);
  }

  // Apply saved audio input device before recording
  const audioDeviceUID = getAudioSettings().selectedDeviceUID;
  if (audioDeviceUID) {
    native.setAudioInputDevice(audioDeviceUID);
  } else {
    native.clearAudioInputDevice();
  }

  const autoStopPauseMs = getDictationSettings().autoStopPauseMs;
  console.log(`[MyVoice] Recording (${trigger}, mode ${mode.id}, model ${model.modelId}, auto-stop ${formatAutoStopDelayLabel(autoStopPauseMs)})`);

  let levelCount = 0;
  native.recordStart(
    (level: number) => {
      levelCount++;
      if (SHOULD_LOG_AUDIO_LEVELS && (levelCount <= 5 || levelCount % 10 === 0)) {
        console.log(`[MyVoice] Audio level #${levelCount}: ${level.toFixed(4)}`);
      }
      sendToOverlay(IPC_CHANNELS.DICTATION_AUDIO_LEVEL, level);
      if (session !== current || Date.now() - current.startedAt < IGNORE_LEVELS_FIRST_MS) return;
      if (level > ANY_INPUT_THRESHOLD) current.heardAnything = true;
      if (level > SILENCE_AUDIO_THRESHOLD) {
        current.lastAudioAboveThreshold = Date.now();
        current.heardSpeech = true;
      }
    },
    (error: string) => {
      console.error('[MyVoice] Recording error:', error);
      native.speechStop();
      sendToOverlay(IPC_CHANNELS.DICTATION_ERROR, error);
      resetState();
    }
  );

  // Push-to-talk ends on release, so only toggled dictation stops on silence.
  const stopsOnSilence = trigger !== 'hold' && autoStopPauseMs > 0;
  current.timers.push(setInterval(() => {
    if (session !== current || state !== 'recording') return;
    const elapsed = Date.now() - current.startedAt;
    if (shouldWarnNoInput(elapsed, current.heardAnything, current.warnedNoInput)) {
      current.warnedNoInput = true;
      notice('No sound from the microphone. Check Audio Input in Settings.');
    }
    if (stopsOnSilence && Date.now() - current.lastAudioAboveThreshold >= autoStopPauseMs) {
      stopDictation();
    }
  }, 100));

  current.timers.push(setTimeout(() => {
    if (session === current && state === 'recording') {
      notice(`Stopped at the ${prefs.maxRecordingMinutes}-minute limit`);
      stopDictation();
    }
  }, prefs.maxRecordingMinutes * 60_000));

  if (prefs.livePreview) {
    current.timers.push(setInterval(() => runPreview(current), PREVIEW_INTERVAL_MS));
  }
}

function whisperInput(target: Session, audioPath: string) {
  const model = getModel(target.modelId)!;
  const dictionary = getDictionary();
  return {
    modelPath: target.modelPath,
    audioPath,
    language: effectiveLanguage(model, target.mode.language),
    translate: target.mode.translateToEnglish && canTranslate(model, target.mode.language),
    prompt: target.mode.pipeline.useDictionary ? buildVocabularyPrompt(dictionary.vocabulary) : null,
    threads: THREADS,
  };
}

/** Re-transcribes the recent audio while recording so the overlay shows text as you speak. */
function runPreview(target: Session): void {
  if (session !== target || state !== 'recording' || target.preview || !target.heardSpeech || !whisperCli) return;
  const snapshotPath = path.join(app.getPath('temp'), `myvoice-preview-${target.id}.wav`);
  if (!native.recordSnapshot(snapshotPath, PREVIEW_TAIL_SECONDS)) return;

  const running = transcribe(whisperCli, whisperInput(target, snapshotPath), 20_000);
  target.preview = running;
  running.result
    .then(({ text }) => {
      const preview = stripAnnotations(text);
      if (session === target && state === 'recording' && preview) {
        sendToOverlay(IPC_CHANNELS.DICTATION_PARTIAL_TEXT, preview);
      }
    })
    .catch(() => {
      // A preview that fails or is cancelled at stop is simply skipped.
    })
    .finally(() => {
      deleteRecording(snapshotPath);
      if (target.preview === running) target.preview = null;
    });
}

function clearSessionTimers(target: Session): void {
  for (const timer of target.timers) clearInterval(timer);
  target.timers = [];
}

export function stopDictation(): void {
  if (state !== 'recording' || !session) return;
  const current = session;

  state = 'stopping';
  clearSessionTimers(current);
  current.preview?.cancel();
  restoreOutput();

  const wavPath = native.recordStop();
  if (!wavPath) {
    console.log('[MyVoice] No audio recorded');
    resetState();
    return;
  }

  // Whisper invents words for silent clips (often "you"), so never send it one.
  if (!current.heardSpeech) {
    console.log('[MyVoice] Input never rose above the silence threshold; skipping transcription');
    deleteRecording(wavPath);
    playSound('empty', getPreferences().sounds);
    sendToOverlay(IPC_CHANNELS.DICTATION_ERROR, 'No speech detected.');
    resetState();
    return;
  }

  notice('Transcribing…', true);
  finishSession(current, wavPath).catch((error) => {
    console.error('[MyVoice] Dictation failed:', error);
    if (session === current) {
      sendToOverlay(IPC_CHANNELS.DICTATION_ERROR, 'Transcription failed. Try again.');
      resetState();
    }
  });
}

async function finishSession(target: Session, wavPath: string): Promise<void> {
  const prefs = getPreferences();
  const audioMs = Date.now() - target.startedAt;
  const stoppedAt = Date.now();

  let raw: string;
  try {
    target.transcription = transcribe(whisperCli!, whisperInput(target, wavPath), transcriptionTimeoutMs(audioMs));
    raw = (await target.transcription.result).text;
  } finally {
    // The audio is only needed for this one transcription.
    deleteRecording(wavPath);
  }

  if (session !== target || state !== 'stopping') {
    console.log('[MyVoice] Dictation was cancelled during transcription; discarding result');
    return;
  }

  const dictionary = getDictionary();
  let text = processTranscript(raw, target.mode.pipeline, dictionary);
  if (!text) {
    console.log('[MyVoice] Empty transcript — no speech detected');
    playSound('empty', prefs.sounds);
    sendToOverlay(IPC_CHANNELS.DICTATION_ERROR, 'No speech detected.');
    resetState();
    return;
  }

  if (target.mode.aiCleanup && prefs.localAi.enabled) {
    notice('Cleaning up with your local model…', true);
    const outcome = await runLocalCleanup(prefs.localAi, text, { appName: target.app?.name, modeName: target.mode.name });
    if (outcome.status !== 'cleaned') console.log(`[MyVoice] Local AI cleanup ${outcome.status}: ${outcome.reason}`);
    text = outcome.text;
    if (session !== target || state !== 'stopping') return;
  }

  lastDictation = text;
  const logged = appendRecordingLog({
    transcript: text,
    raw,
    modeId: target.mode.id,
    modeName: target.mode.name,
    appName: target.app?.name,
    appBundleId: target.app?.bundleId,
    modelId: target.modelId,
    durationMs: audioMs,
    transcribeMs: Date.now() - stoppedAt,
    source: 'dictation',
  }, prefs.historyRetentionDays);
  if (logged) broadcastLogUpdated();

  sendToOverlay(IPC_CHANNELS.DICTATION_STOP, text);
  const outcome = await deliverText(text, {
    insertion: target.mode.insertion,
    pressReturn: target.mode.pressReturn,
    clipboard: prefs.clipboard,
    caret: prefs.smartSpacing ? readCaretContext() : null,
    keepCase: dictionary.vocabulary,
  });
  console.log(`[MyVoice] Dictation ${outcome} (${text.length} chars, ${Date.now() - stoppedAt} ms after stop)`);
  playSound('done', prefs.sounds);
  if (outcome === 'copied') notice('Copied to the clipboard');
  resetState();
}

/** Inserts the most recent dictation again at the cursor. */
export async function pasteLastDictation(): Promise<boolean> {
  const text = lastDictation ?? lastRecordingLogEntry()?.transcript ?? null;
  if (!text || state !== 'idle') return false;
  const prefs = getPreferences();
  await deliverText(text, {
    insertion: 'paste',
    pressReturn: false,
    clipboard: prefs.clipboard,
    caret: prefs.smartSpacing ? readCaretContext() : null,
    keepCase: getDictionary().vocabulary,
  });
  return true;
}

function resetState(): void {
  if (session) {
    clearSessionTimers(session);
    session.preview?.cancel();
    session.transcription?.cancel();
  }
  session = null;
  state = 'idle';
  restoreOutput();
  setRecordingState(false);
  setCancelShortcutEnabled(false);

  // Hide overlay after fade animation
  setTimeout(() => {
    if (state === 'idle') hideOverlay();
  }, 900);
}

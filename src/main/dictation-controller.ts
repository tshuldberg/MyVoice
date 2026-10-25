import { clipboard } from 'electron';
import { execFile } from 'child_process';
import { DictationState } from '../shared/types';
import { IPC_CHANNELS } from '../shared/types';
import { showOverlay, hideOverlay, sendToOverlay } from './overlay-window';
import { setRecordingState } from './tray';
import * as native from './native-bridge';
import type { WhisperPaths } from './dependency-setup';
import { getFormattingSettings } from './formatting-settings';
import { formatTranscript } from './transcript-formatter';
import { getDictationSettings, formatAutoStopDelayLabel } from './dictation-settings';
import { getAudioSettings } from './audio-settings';
import { appendRecordingLog } from './recording-log';
import { broadcastLogUpdated } from './app-window';
import { getPermissionSnapshot } from './permissions';
import { missingPermissions } from './permission-state';

let state: DictationState = 'idle';
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
let lastAudioAboveThreshold = 0;
let isFinishing = false;
let onPermissionsMissing: (() => void) | null = null;
let audioLevelCount = 0;
const SILENCE_AUDIO_THRESHOLD = 0.02;
const SHOULD_LOG_AUDIO_LEVELS = process.env.MYVOICE_DEBUG_AUDIO_LEVELS === '1';

let whisperCli: string | null = null;
let whisperModel: string | null = null;

export function initDictation(paths: WhisperPaths): void {
  whisperCli = paths.whisperCli;
  whisperModel = paths.whisperModel;
  console.log('[MyVoice] Dictation initialized:', { whisperCli, whisperModel });
}

/** Called when dictation is triggered while Microphone or Accessibility is missing. */
export function setPermissionsMissingHandler(handler: () => void): void {
  onPermissionsMissing = handler;
}

export function getDictationState(): DictationState {
  return state;
}

export function toggleDictation(): void {
  if (state === 'idle') {
    startDictation();
  } else if (state === 'recording') {
    stopDictation();
  }
  // Ignore if 'stopping' (debounce)
}

export function cancelDictation(): void {
  if (state !== 'recording' && state !== 'stopping') return;

  clearSilenceTimer();
  native.speechStop();
  sendToOverlay(IPC_CHANNELS.DICTATION_CANCEL);
  resetState();
}

// Checked on every start: a grant can be revoked in System Settings at any time.
function checkPermissions(): boolean {
  const missing = missingPermissions(getPermissionSnapshot());
  if (missing.length === 0) return true;

  console.error('[MyVoice] Missing permissions:', missing.join(', '));
  onPermissionsMissing?.();
  return false;
}

function startDictation(): void {
  if (!whisperCli || !whisperModel) {
    console.error('[MyVoice] Dictation not initialized — call initDictation() first');
    return;
  }

  if (!checkPermissions()) return;

  state = 'recording';
  isFinishing = false;
  setRecordingState(true);
  showOverlay();
  lastAudioAboveThreshold = Date.now();
  audioLevelCount = 0;

  // Apply saved audio input device before recording
  const audioDeviceUID = getAudioSettings().selectedDeviceUID;
  if (audioDeviceUID) {
    native.setAudioInputDevice(audioDeviceUID);
  } else {
    native.clearAudioInputDevice();
  }

  console.log('[MyVoice] Starting audio recording for Whisper');
  console.log(
    `[MyVoice] Auto-stop pause: ${formatAutoStopDelayLabel(getDictationSettings().autoStopPauseMs)}`
  );

  native.recordStart(
    // onAudioLevel
    (level: number) => {
      audioLevelCount++;
      if (
        SHOULD_LOG_AUDIO_LEVELS
        && (audioLevelCount <= 5 || (level > SILENCE_AUDIO_THRESHOLD && audioLevelCount % 10 === 0))
      ) {
        console.log(`[MyVoice] Audio level #${audioLevelCount}: ${level.toFixed(4)}`);
      }

      sendToOverlay(IPC_CHANNELS.DICTATION_AUDIO_LEVEL, level);

      if (level > SILENCE_AUDIO_THRESHOLD) {
        lastAudioAboveThreshold = Date.now();
      }

      checkSilenceTimeout();
    },
    // onError
    (error: string) => {
      console.error('[MyVoice] Recording error:', error);
      clearSilenceTimer();
      native.speechStop();
      sendToOverlay(IPC_CHANNELS.DICTATION_ERROR, error);
      resetState();
    }
  );

  startSilenceTimer();
}

function stopDictation(): void {
  if (state !== 'recording') return;

  state = 'stopping';
  clearSilenceTimer();

  console.log('[MyVoice] Stopping recording…');
  const wavPath = native.recordStop();

  if (!wavPath) {
    console.log('[MyVoice] No audio recorded');
    resetState();
    return;
  }

  console.log('[MyVoice] WAV saved:', wavPath);
  sendToOverlay(IPC_CHANNELS.DICTATION_PARTIAL_TEXT, 'Transcribing…');

  transcribeWithWhisper(wavPath);
}

function transcribeWithWhisper(wavPath: string): void {
  console.log('[MyVoice] Running whisper-cli on', wavPath);

  execFile(
    whisperCli!,
    [
      '-m', whisperModel!,
      '--no-timestamps',
      '-l', 'en',
      '-f', wavPath,
    ],
    { timeout: 30000 },
    (error, stdout, stderr) => {
      if (error) {
        console.error('[MyVoice] Whisper error:', error.message);
        if (stderr) console.error('[MyVoice] Whisper stderr:', stderr);
        sendToOverlay(IPC_CHANNELS.DICTATION_ERROR, 'Transcription failed. Check whisper-cli installation.');
        resetState();
        return;
      }

      // whisper-cli outputs the transcript on stdout, strip whitespace
      const transcript = stdout.trim();
      console.log('[MyVoice] Whisper transcript:', JSON.stringify(transcript));

      if (transcript.length === 0) {
        console.log('[MyVoice] Empty transcript — no speech detected');
        sendToOverlay(IPC_CHANNELS.DICTATION_ERROR, 'No speech detected.');
        resetState();
        return;
      }

      const formatting = getFormattingSettings();
      const formatted = formatTranscript(transcript, formatting.mode);
      finishDictation(formatted || transcript);
    }
  );
}

function finishDictation(transcript: string): void {
  if (isFinishing) return;
  isFinishing = true;

  console.log('[MyVoice] finishDictation:', JSON.stringify(transcript));
  const logged = appendRecordingLog(transcript);
  if (logged) {
    broadcastLogUpdated();
  }

  clearSilenceTimer();
  sendToOverlay(IPC_CHANNELS.DICTATION_STOP, transcript);

  // Save original clipboard, paste transcribed text, then restore
  const originalClipboard = clipboard.readText();
  clipboard.writeText(transcript);

  console.log('[MyVoice] Pasting via Cmd+V in 150ms');

  setTimeout(() => {
    console.log('[MyVoice] Invoking keyboardPaste now');
    native.keyboardPaste();

    // Restore original clipboard after paste completes
    setTimeout(() => {
      clipboard.writeText(originalClipboard);
      console.log('[MyVoice] Clipboard restored');
      resetState();
    }, 300);
  }, 150);
}

function resetState(): void {
  state = 'idle';
  isFinishing = false;
  setRecordingState(false);
  clearSilenceTimer();

  // Hide overlay after fade animation
  setTimeout(() => {
    hideOverlay();
  }, 250);
}

// --- Silence Detection ---------------------------------------------------

function startSilenceTimer(): void {
  clearSilenceTimer();
  silenceTimer = setInterval(() => {
    checkSilenceTimeout();
  }, 100);
}

function clearSilenceTimer(): void {
  if (silenceTimer) {
    clearInterval(silenceTimer);
    silenceTimer = null;
  }
}

function checkSilenceTimeout(): void {
  if (state !== 'recording') return;

  const silenceDuration = Date.now() - lastAudioAboveThreshold;
  const autoStopPauseMs = getDictationSettings().autoStopPauseMs;
  if (silenceDuration >= autoStopPauseMs) {
    stopDictation();
  }
}

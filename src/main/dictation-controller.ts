import { DictationState } from '../shared/types';
import { IPC_CHANNELS } from '../shared/types';
import { SILENCE_TIMEOUT_MS, SPEECH_LOCALE, KEYSTROKE_DELAY_MS } from '../shared/constants';
import { showOverlay, hideOverlay, sendToOverlay } from './overlay-window';
import { setRecordingState } from './tray';
import * as native from './native-bridge';

let state: DictationState = 'idle';
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
let lastAudioAboveThreshold = 0;
let isFinishing = false;
let permissionsChecked = false;
const SILENCE_AUDIO_THRESHOLD = 0.02;

const ERROR_MESSAGES: Record<string, string> = {
  'Speech recognizer not available for this locale':
    'On-device speech model not found. Download it in System Settings → Keyboard → Dictation.',
  'Audio engine failed':
    'Microphone access failed. Check System Settings → Privacy & Security → Microphone.',
};

function friendlyError(rawError: string): string {
  for (const [key, msg] of Object.entries(ERROR_MESSAGES)) {
    if (rawError.includes(key)) return msg;
  }
  return rawError;
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

async function checkPermissions(): Promise<boolean> {
  if (permissionsChecked) return true;

  if (!native.keyboardCheckPermission()) {
    native.keyboardRequestPermission();
    return false;
  }

  const speechAuthorized = await native.speechRequestAuth();
  if (!speechAuthorized) {
    console.error('Speech recognition permission denied');
    return false;
  }

  permissionsChecked = true;
  return true;
}

async function startDictation(): Promise<void> {
  const permitted = await checkPermissions();
  if (!permitted) return;

  state = 'recording';
  isFinishing = false;
  setRecordingState(true);
  showOverlay();
  lastAudioAboveThreshold = Date.now();

  native.speechStart(
    SPEECH_LOCALE,
    // onPartialResult
    (text: string) => {
      sendToOverlay(IPC_CHANNELS.DICTATION_PARTIAL_TEXT, text);
    },
    // onFinalResult
    (text: string) => {
      finishDictation(text);
    },
    // onAudioLevel
    (level: number) => {
      sendToOverlay(IPC_CHANNELS.DICTATION_AUDIO_LEVEL, level);

      // Silence detection
      if (level > SILENCE_AUDIO_THRESHOLD) {
        lastAudioAboveThreshold = Date.now();
      }

      checkSilenceTimeout();
    },
    // onError
    (error: string) => {
      console.error('Speech recognition error:', error);
      sendToOverlay(IPC_CHANNELS.DICTATION_ERROR, friendlyError(error));
      resetState();
    }
  );

  // Start silence detection timer
  startSilenceTimer();
}

function stopDictation(): void {
  if (state !== 'recording') return;

  state = 'stopping';
  clearSilenceTimer();
  native.speechStop();
  // finishDictation will be called via onFinalResult callback

  // Safety timeout: if no final result in 2s, reset
  setTimeout(() => {
    if (state === 'stopping') {
      resetState();
    }
  }, 2000);
}

function finishDictation(transcript: string): void {
  if (isFinishing) return;
  isFinishing = true;

  clearSilenceTimer();
  sendToOverlay(IPC_CHANNELS.DICTATION_STOP, transcript);

  if (transcript.trim().length > 0) {
    // Estimate typing duration to avoid resetting state before typing completes
    const estimatedTypingMs = transcript.length * KEYSTROKE_DELAY_MS + 200;

    setTimeout(() => {
      native.keyboardType(transcript, KEYSTROKE_DELAY_MS);
    }, 100);

    setTimeout(() => {
      resetState();
    }, 100 + estimatedTypingMs);
  } else {
    setTimeout(() => {
      resetState();
    }, 100);
  }
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

// --- Silence Detection -------------------------------------------------

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
  if (silenceDuration >= SILENCE_TIMEOUT_MS) {
    stopDictation();
  }
}

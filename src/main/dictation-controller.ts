import { DictationState } from '../shared/types';
import { IPC_CHANNELS } from '../shared/types';
import { SILENCE_TIMEOUT_MS, SPEECH_LOCALE, KEYSTROKE_DELAY_MS } from '../shared/constants';
import { showOverlay, hideOverlay, sendToOverlay } from './overlay-window';
import { setRecordingState } from './tray';
import * as native from './native-bridge';

let state: DictationState = 'idle';
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
let lastAudioAboveThreshold = 0;
const SILENCE_AUDIO_THRESHOLD = 0.02;

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

function startDictation(): void {
  // Check permissions first
  if (!native.keyboardCheckPermission()) {
    native.keyboardRequestPermission();
    return;
  }

  state = 'recording';
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
      sendToOverlay(IPC_CHANNELS.DICTATION_ERROR, error);
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
  clearSilenceTimer();

  sendToOverlay(IPC_CHANNELS.DICTATION_STOP, transcript);

  // Wait for overlay to start dismissing, then type
  setTimeout(() => {
    if (transcript.trim().length > 0) {
      native.keyboardType(transcript, KEYSTROKE_DELAY_MS);
    }
    resetState();
  }, 100);
}

function resetState(): void {
  state = 'idle';
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

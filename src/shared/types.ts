// IPC channel names
export const IPC_CHANNELS = {
  DICTATION_START: 'dictation:start',
  DICTATION_STOP: 'dictation:stop',
  DICTATION_CANCEL: 'dictation:cancel',
  DICTATION_AUDIO_LEVEL: 'dictation:audio-level',
  DICTATION_PARTIAL_TEXT: 'dictation:partial-text',
  DICTATION_ERROR: 'dictation:error',
  SETUP_PROGRESS: 'setup:progress',
  WAVEFORM_CONFIG: 'waveform:config',
  OVERLAY_READY: 'overlay:ready',
  OVERLAY_DISMISSED: 'overlay:dismissed',
  OVERLAY_SET_SIZE: 'overlay:set-size',
  APP_GET_STATE: 'app:get-state',
  APP_SET_FORMATTING_MODE: 'app:set-formatting-mode',
  APP_SET_AI_ENHANCEMENT: 'app:set-ai-enhancement',
  APP_SET_AUTO_STOP: 'app:set-auto-stop',
  APP_SET_WAVEFORM_SENSITIVITY: 'app:set-waveform-sensitivity',
  APP_SET_WAVEFORM_DEBUG: 'app:set-waveform-debug',
  APP_GET_TODAY_LOG: 'app:get-today-log',
  APP_GET_LOG_BY_DATE: 'app:get-log-by-date',
  APP_LIST_LOG_DATES: 'app:list-log-dates',
  APP_EXPORT_LOG: 'app:export-log',
  APP_LOG_UPDATED: 'app:log-updated',
  APP_NAVIGATE: 'app:navigate',
} as const;

// Dictation state machine
export type DictationState = 'idle' | 'recording' | 'stopping';

// Overlay state
export type OverlayMode = 'expanded' | 'minimized';
export type WaveformSensitivity = 'low' | 'balanced' | 'high';

// IPC payloads
export interface AudioLevelPayload {
  level: number; // 0.0 to 1.0
}

export interface PartialTextPayload {
  text: string;
}

export interface DictationStopPayload {
  transcript: string;
}

export interface DictationErrorPayload {
  message: string;
}

export interface OverlaySetSizePayload {
  width: number;
  height: number;
  position: 'center' | 'top-left';
}

export interface WaveformConfigPayload {
  sensitivity: WaveformSensitivity;
  debugOverlay: boolean;
}

export interface SetupProgressPayload {
  message: string;
  percent: number;
}

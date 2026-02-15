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

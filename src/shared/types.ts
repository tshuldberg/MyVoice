// IPC channel names
export const IPC_CHANNELS = {
  DICTATION_START: 'dictation:start',
  DICTATION_STOP: 'dictation:stop',
  DICTATION_CANCEL: 'dictation:cancel',
  DICTATION_AUDIO_LEVEL: 'dictation:audio-level',
  DICTATION_PARTIAL_TEXT: 'dictation:partial-text',
  DICTATION_ERROR: 'dictation:error',
} as const;

// Dictation state machine
export type DictationState = 'idle' | 'recording' | 'stopping';

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

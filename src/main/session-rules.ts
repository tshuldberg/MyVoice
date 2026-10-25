// Small timing and safety rules for a dictation session. Pure, so they are unit tested.

/** Recordings longer than this ask for a second Escape before they are thrown away. */
export const CONFIRM_CANCEL_AFTER_MS = 15_000;
export const CONFIRM_CANCEL_WINDOW_MS = 2_000;

export function shouldConfirmCancel(recordingMs: number, lastEscapeAt: number | null, now: number): 'confirm' | 'cancel' {
  if (recordingMs < CONFIRM_CANCEL_AFTER_MS) return 'cancel';
  if (lastEscapeAt !== null && now - lastEscapeAt <= CONFIRM_CANCEL_WINDOW_MS) return 'cancel';
  return 'confirm';
}

/** When the meter has shown nothing for this long, the overlay warns about the microphone. */
export const NO_INPUT_WARNING_MS = 3_000;

export function shouldWarnNoInput(recordingMs: number, heardAnything: boolean, alreadyWarned: boolean): boolean {
  return !heardAnything && !alreadyWarned && recordingMs >= NO_INPUT_WARNING_MS;
}

export type DuckingMode = 'off' | 'lower' | 'mute';

/** The output volume while recording, or null to leave it alone. */
export function duckedVolume(current: number, mode: DuckingMode): number | null {
  if (mode === 'off' || current <= 0) return null;
  return mode === 'mute' ? 0 : Math.round(current * 0.3 * 100) / 100;
}

/**
 * Restores the volume only if it is still what MyVoice set, so a change the
 * user made during the dictation is kept.
 */
export function shouldRestoreVolume(current: number, setTo: number): boolean {
  return Math.abs(current - setTo) < 0.02;
}

/** Live preview re-transcribes at most this much of the most recent audio. */
export const PREVIEW_TAIL_SECONDS = 30;
export const PREVIEW_INTERVAL_MS = 1_500;

/** Preview is on by default on Apple silicon, where a preview pass takes a fraction of a second. */
export function defaultLivePreview(arch: string): boolean {
  return arch === 'arm64';
}

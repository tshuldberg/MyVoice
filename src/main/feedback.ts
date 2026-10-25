import { execFile } from 'child_process';
import * as native from './native-bridge';
import { duckedVolume, shouldRestoreVolume, type DuckingMode } from './session-rules';

// Short macOS system sounds: nothing to bundle or license.
const SOUNDS = {
  start: '/System/Library/Sounds/Tink.aiff',
  done: '/System/Library/Sounds/Pop.aiff',
  empty: '/System/Library/Sounds/Basso.aiff',
} as const;

export type FeedbackSound = keyof typeof SOUNDS;

export function playSound(sound: FeedbackSound, enabled: boolean): void {
  if (!enabled) return;
  execFile('/usr/bin/afplay', ['-v', '0.6', SOUNDS[sound]], () => {
    // Sounds are best effort.
  });
}

let ducked: { original: number; setTo: number } | null = null;

/** Lowers or mutes other audio while recording; remembers what to restore. */
export function duckOutput(mode: DuckingMode): void {
  if (ducked) return;
  const current = native.outputVolume();
  const target = duckedVolume(current, mode);
  if (target === null) return;
  if (native.setOutputVolume(target)) ducked = { original: current, setTo: target };
}

export function restoreOutput(): void {
  if (!ducked) return;
  const { original, setTo } = ducked;
  ducked = null;
  if (shouldRestoreVolume(native.outputVolume(), setTo)) native.setOutputVolume(original);
}

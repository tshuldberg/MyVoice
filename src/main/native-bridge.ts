import path from 'path';

// Load the native addon
// eslint-disable-next-line @typescript-eslint/no-var-requires
const native = require(path.join(__dirname, '../../src/native/build/Release/myvoice_native.node'));

// --- Microphone Authorization ---------------------------------------------

export function speechRequestAuth(): Promise<boolean> {
  return new Promise((resolve) => {
    native.speechRequestAuth((granted: boolean) => resolve(granted));
  });
}

export function speechIsAvailable(): boolean {
  return native.speechIsAvailable();
}

// --- Audio Recording (for Whisper) ----------------------------------------

export function recordStart(
  onAudioLevel: (level: number) => void,
  onError: (error: string) => void
): void {
  native.recordStart(onAudioLevel, onError);
}

/** Stops recording and returns the path to the WAV file, or null if no audio. */
export function recordStop(): string | null {
  return native.recordStop();
}

export function speechStop(): void {
  native.speechStop();
}

// --- Hotkey Detection ------------------------------------------------------

export function hotkeyStart(onDoubleTapFn: () => void): void {
  native.hotkeyStart(onDoubleTapFn);
}

export function hotkeyStop(): void {
  native.hotkeyStop();
}

// --- Keyboard Simulation ---------------------------------------------------

export function keyboardType(text: string, delayMs?: number): void {
  native.keyboardType(text, delayMs ?? 10);
}

export function keyboardPaste(): void {
  native.keyboardPaste();
}

export function keyboardCheckPermission(): boolean {
  return native.keyboardCheckPermission();
}

export function keyboardRequestPermission(): void {
  native.keyboardRequestPermission();
}

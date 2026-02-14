import path from 'path';

// Load the native addon
// eslint-disable-next-line @typescript-eslint/no-var-requires
const native = require(path.join(__dirname, '../../src/native/build/Release/myvoice_native.node'));

// --- Speech Recognition ------------------------------------------------

export function speechRequestAuth(): Promise<boolean> {
  return new Promise((resolve) => {
    native.speechRequestAuth((granted: boolean) => resolve(granted));
  });
}

export function speechIsAvailable(): boolean {
  return native.speechIsAvailable();
}

export function speechStart(
  locale: string,
  onPartialResult: (text: string) => void,
  onFinalResult: (text: string) => void,
  onAudioLevel: (level: number) => void,
  onError: (error: string) => void
): void {
  native.speechStart(locale, onPartialResult, onFinalResult, onAudioLevel, onError);
}

export function speechStop(): void {
  native.speechStop();
}

// --- Hotkey Detection --------------------------------------------------

export function hotkeyStart(onDoubleTapFn: () => void): void {
  native.hotkeyStart(onDoubleTapFn);
}

export function hotkeyStop(): void {
  native.hotkeyStop();
}

// --- Keyboard Simulation -----------------------------------------------

export function keyboardType(text: string, delayMs?: number): void {
  native.keyboardType(text, delayMs ?? 10);
}

export function keyboardCheckPermission(): boolean {
  return native.keyboardCheckPermission();
}

export function keyboardRequestPermission(): void {
  native.keyboardRequestPermission();
}

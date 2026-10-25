import path from 'path';

// Load the native addon
// eslint-disable-next-line @typescript-eslint/no-var-requires
const native = require(path.join(__dirname, '../../src/native/build/Release/myvoice_native.node'));

// --- Audio Availability ----------------------------------------------------

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

/** Writes the last `maxSeconds` of audio recorded so far to `path` (for live preview) without stopping. */
export function recordSnapshot(path: string, maxSeconds: number): string | null {
  return native.recordSnapshot(path, maxSeconds);
}

export function speechStop(): void {
  native.speechStop();
}

// --- Audio Input Device Selection ------------------------------------------

export interface AudioInputDevice {
  uid: string;
  name: string;
}

export function listAudioInputDevices(): AudioInputDevice[] {
  return native.listAudioInputDevices();
}

export function setAudioInputDevice(uid: string): boolean {
  return native.setAudioInputDevice(uid);
}

export function clearAudioInputDevice(): void {
  native.clearAudioInputDevice();
}

// --- fn Key Events -----------------------------------------------------------

export type FnEventType = 'down' | 'up' | 'other';

/** Raw fn events; src/main/fn-gesture.ts turns them into double-tap and hold gestures. */
export function hotkeyStart(onFnEvent: (type: FnEventType, timestampMs: number) => void): void {
  native.hotkeyStart(onFnEvent);
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

export function keyboardPressReturn(): void {
  native.keyboardPressReturn();
}

// --- System -------------------------------------------------------------------

export interface FrontmostApp {
  bundleId: string;
  name: string;
  pid: number;
}

export function frontmostApplication(): FrontmostApp | null {
  return native.frontmostApplication();
}

export interface FocusedTextContext {
  /** True for password fields; nothing else is read from them. */
  secure: boolean;
  /** Up to two characters before the caret. */
  before: string;
  atStart: boolean;
  hasSelection: boolean;
}

export function focusedTextContext(): FocusedTextContext | null {
  return native.focusedTextContext();
}

/** Saves every pasteboard item and type; returns the pasteboard change count. */
export function pasteboardSave(): number {
  return native.pasteboardSave();
}

/** Writes text marked transient for clipboard managers; returns the new change count. */
export function pasteboardWriteText(text: string): number {
  return native.pasteboardWriteText(text);
}

/** Restores the saved items unless something else wrote to the pasteboard since `changeCount`. */
export function pasteboardRestoreIfUnchanged(changeCount: number): boolean {
  return native.pasteboardRestoreIfUnchanged(changeCount);
}

/** Output volume from 0 to 1, or -1 when the device has no software volume. */
export function outputVolume(): number {
  return native.outputVolume();
}

export function setOutputVolume(volume: number): boolean {
  return native.setOutputVolume(volume);
}

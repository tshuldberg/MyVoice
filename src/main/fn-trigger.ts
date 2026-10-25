import * as native from './native-bridge';
import { DEFAULT_GESTURE_CONFIG, FnGestureDetector, type GestureAction, type TriggerStyle } from './fn-gesture';
import { cancelDictation, getActiveTrigger, getDictationState, stopDictation, toggleDictation } from './dictation-controller';

const detector = new FnGestureDetector(DEFAULT_GESTURE_CONFIG);
let wakeTimer: ReturnType<typeof setTimeout> | null = null;

function run(actions: GestureAction[]): void {
  for (const action of actions) {
    switch (action) {
      case 'toggle':
        toggleDictation('toggle');
        break;
      case 'hold-start':
        if (getDictationState() === 'idle') toggleDictation('hold');
        break;
      case 'hold-end':
        if (getActiveTrigger() === 'hold') stopDictation();
        break;
      case 'hold-cancel':
        if (getActiveTrigger() === 'hold') cancelDictation();
        break;
    }
  }
}

function schedule(wakeAt: number | null): void {
  if (wakeTimer) clearTimeout(wakeTimer);
  wakeTimer = null;
  if (wakeAt === null) return;
  wakeTimer = setTimeout(() => {
    wakeTimer = null;
    const result = detector.poll(Date.now());
    run(result.actions);
    schedule(result.wakeAt);
  }, Math.max(0, wakeAt - Date.now()));
}

export function setTriggerStyle(style: TriggerStyle): void {
  detector.setConfig({ ...DEFAULT_GESTURE_CONFIG, style });
  schedule(null);
}

/** Starts (or re-arms) the fn listener. The native layer reports raw key events. */
export function startFnTrigger(): void {
  native.hotkeyStart((type, at) => {
    const result = detector.handle({ type, at });
    run(result.actions);
    schedule(result.wakeAt);
  });
}

export function stopFnTrigger(): void {
  schedule(null);
  native.hotkeyStop();
}

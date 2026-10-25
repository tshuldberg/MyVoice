// Turns raw fn key events into dictation gestures. Pure and time-injected, so
// every timing rule is unit tested without a keyboard.
//
//   double-tap: two quick presses toggle dictation (hands-free; auto-stop applies)
//   hold:       hold fn to talk, release to finish (push-to-talk)
//   both:       either gesture works

export type TriggerStyle = 'double-tap' | 'hold' | 'both';

export type FnEvent = { type: 'down' | 'up' | 'other'; at: number };

export type GestureAction = 'toggle' | 'hold-start' | 'hold-end' | 'hold-cancel';

export interface GestureConfig {
  style: TriggerStyle;
  /** Maximum time between the two presses of a double-tap. */
  doubleTapMs: number;
  /** How long fn must be held before push-to-talk starts. */
  holdMs: number;
}

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  style: 'double-tap',
  doubleTapMs: 400,
  holdMs: 300,
};

export interface GestureResult {
  actions: GestureAction[];
  /** When to call poll() next, so a hold can start without another key event. */
  wakeAt: number | null;
}

export class FnGestureDetector {
  private config: GestureConfig;
  private downAt: number | null = null;
  private interrupted = false;
  private holding = false;
  /** Time of the previous press, when it was a clean tap. */
  private lastTapDownAt: number | null = null;

  constructor(config: GestureConfig = DEFAULT_GESTURE_CONFIG) {
    this.config = config;
  }

  setConfig(config: GestureConfig): void {
    this.config = config;
    this.reset();
  }

  reset(): void {
    this.downAt = null;
    this.interrupted = false;
    this.holding = false;
    this.lastTapDownAt = null;
  }

  private get allowsDoubleTap(): boolean {
    return this.config.style !== 'hold';
  }

  private get allowsHold(): boolean {
    return this.config.style !== 'double-tap';
  }

  handle(event: FnEvent): GestureResult {
    if (event.type === 'down') return this.onDown(event.at);
    if (event.type === 'up') return this.onUp(event.at);
    return this.onOther();
  }

  /** Starts push-to-talk once fn has been held long enough. */
  poll(now: number): GestureResult {
    if (this.downAt === null || this.interrupted || this.holding || !this.allowsHold) {
      return { actions: [], wakeAt: null };
    }
    if (now - this.downAt >= this.config.holdMs) {
      this.holding = true;
      this.lastTapDownAt = null;
      return { actions: ['hold-start'], wakeAt: null };
    }
    return { actions: [], wakeAt: this.downAt + this.config.holdMs };
  }

  private onDown(at: number): GestureResult {
    this.downAt = at;
    this.interrupted = false;
    this.holding = false;

    if (this.allowsDoubleTap && this.lastTapDownAt !== null && at - this.lastTapDownAt < this.config.doubleTapMs) {
      this.lastTapDownAt = null;
      // The second press of a double-tap never turns into a hold.
      this.interrupted = true;
      return { actions: ['toggle'], wakeAt: null };
    }

    return { actions: [], wakeAt: this.allowsHold ? at + this.config.holdMs : null };
  }

  private onUp(at: number): GestureResult {
    const downAt = this.downAt;
    const wasHolding = this.holding;
    const wasInterrupted = this.interrupted;
    this.downAt = null;
    this.holding = false;
    this.interrupted = false;

    if (wasHolding) return { actions: ['hold-end'], wakeAt: null };

    const wasTap = downAt !== null && !wasInterrupted && at - downAt < this.config.holdMs;
    this.lastTapDownAt = wasTap ? downAt : null;
    return { actions: [], wakeAt: null };
  }

  /** Another key while fn is down (fn+arrow, fn+F5): not a dictation gesture. */
  private onOther(): GestureResult {
    if (this.downAt === null) return { actions: [], wakeAt: null };
    this.interrupted = true;
    this.lastTapDownAt = null;
    if (this.holding) {
      this.holding = false;
      return { actions: ['hold-cancel'], wakeAt: null };
    }
    return { actions: [], wakeAt: null };
  }
}

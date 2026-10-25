import test from 'node:test';
import assert from 'node:assert/strict';
import { FnGestureDetector } from '../dist/main/fn-gesture.js';

const detector = (style) => new FnGestureDetector({ style, doubleTapMs: 400, holdMs: 300 });

/** Feeds events and polls at every requested wake time, collecting actions in order. */
function play(d, events) {
  const actions = [];
  let wakeAt = null;
  for (const event of events) {
    while (wakeAt !== null && wakeAt <= event.at) {
      const polled = d.poll(wakeAt);
      actions.push(...polled.actions);
      wakeAt = polled.wakeAt;
    }
    const result = d.handle(event);
    actions.push(...result.actions);
    wakeAt = result.wakeAt;
  }
  return actions;
}

const down = (at) => ({ type: 'down', at });
const up = (at) => ({ type: 'up', at });
const other = (at) => ({ type: 'other', at });

test('two quick taps toggle dictation', () => {
  assert.deepEqual(play(detector('double-tap'), [down(0), up(80), down(250), up(320)]), ['toggle']);
});

test('taps too far apart do nothing', () => {
  assert.deepEqual(play(detector('double-tap'), [down(0), up(80), down(500), up(560)]), []);
});

test('three quick taps toggle once, not twice', () => {
  assert.deepEqual(play(detector('double-tap'), [down(0), up(50), down(150), up(200), down(300), up(350)]), ['toggle']);
});

test('fn used with another key is not a tap', () => {
  assert.deepEqual(play(detector('double-tap'), [down(0), other(40), up(90), down(200), up(260)]), []);
});

test('hold mode starts on hold and finishes on release', () => {
  assert.deepEqual(play(detector('hold'), [down(0), up(2000)]), ['hold-start', 'hold-end']);
});

test('a short press in hold mode does nothing', () => {
  assert.deepEqual(play(detector('hold'), [down(0), up(150)]), []);
});

test('hold mode ignores double-taps', () => {
  assert.deepEqual(play(detector('hold'), [down(0), up(80), down(200), up(260)]), []);
});

test('pressing another key while holding cancels push-to-talk', () => {
  assert.deepEqual(play(detector('hold'), [down(0), other(800), up(900)]), ['hold-start', 'hold-cancel']);
});

test('fn+key shortcuts never start push-to-talk', () => {
  assert.deepEqual(play(detector('hold'), [down(0), other(100), up(1000)]), []);
});

test('both: double-tap toggles and hold talks', () => {
  assert.deepEqual(play(detector('both'), [down(0), up(80), down(250), up(320)]), ['toggle']);
  assert.deepEqual(play(detector('both'), [down(0), up(1500)]), ['hold-start', 'hold-end']);
});

test('both: the second press of a double-tap held down does not also start a hold', () => {
  assert.deepEqual(play(detector('both'), [down(0), up(80), down(250), up(1250)]), ['toggle']);
});

test('poll before the hold time asks to be woken at the right moment', () => {
  const d = detector('hold');
  assert.deepEqual(d.handle(down(1000)), { actions: [], wakeAt: 1300 });
  assert.deepEqual(d.poll(1100), { actions: [], wakeAt: 1300 });
  assert.deepEqual(d.poll(1300), { actions: ['hold-start'], wakeAt: null });
});

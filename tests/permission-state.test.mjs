import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRIVACY_PANE_URLS,
  microphoneAction,
  missingPermissions,
  shouldShowSetup,
} from '../dist/main/permission-state.js';

const allowed = { microphone: 'granted', accessibility: true };

test('nothing is missing when both permissions are granted', () => {
  assert.deepEqual(missingPermissions(allowed), []);
});

test('each missing permission is listed', () => {
  assert.deepEqual(missingPermissions({ microphone: 'not-determined', accessibility: false }), ['microphone', 'accessibility']);
  assert.deepEqual(missingPermissions({ microphone: 'denied', accessibility: true }), ['microphone']);
  assert.deepEqual(missingPermissions({ microphone: 'granted', accessibility: false }), ['accessibility']);
});

test('the microphone button prompts once, then points to System Settings', () => {
  assert.equal(microphoneAction('not-determined'), 'request');
  assert.equal(microphoneAction('denied'), 'open-settings');
  assert.equal(microphoneAction('restricted'), 'open-settings');
  assert.equal(microphoneAction('unknown'), 'open-settings');
  assert.equal(microphoneAction('granted'), 'none');
});

test('setup shows on first launch and whenever a permission is missing', () => {
  assert.equal(shouldShowSetup(allowed, false), true);
  assert.equal(shouldShowSetup(allowed, true), false);
  assert.equal(shouldShowSetup({ microphone: 'granted', accessibility: false }, true), true);
  assert.equal(shouldShowSetup({ microphone: 'denied', accessibility: true }, true), true);
});

test('privacy panes deep-link to the right System Settings sections', () => {
  assert.match(PRIVACY_PANE_URLS.microphone, /^x-apple\.systempreferences:.*Privacy_Microphone$/);
  assert.match(PRIVACY_PANE_URLS.accessibility, /^x-apple\.systempreferences:.*Privacy_Accessibility$/);
});

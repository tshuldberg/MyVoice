import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The addon uses N-API, which is ABI-stable, so the Electron build loads in plain Node too.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const addonPath = path.join(root, 'src/native/build/Release/myvoice_native.node');
const built = process.platform === 'darwin' && existsSync(addonPath);
const require = createRequire(import.meta.url);

test('the addon is universal and exports every bridge function', { skip: !built && 'native addon not built' }, () => {
  const archs = execFileSync('lipo', ['-archs', addonPath], { encoding: 'utf8' });
  assert.match(archs, /arm64/);
  assert.match(archs, /x86_64/);

  const native = require(addonPath);
  for (const name of [
    'recordStart', 'recordStop', 'recordSnapshot', 'speechStop',
    'hotkeyStart', 'hotkeyStop',
    'keyboardType', 'keyboardPaste', 'keyboardPressReturn',
    'listAudioInputDevices', 'setAudioInputDevice', 'clearAudioInputDevice',
    'frontmostApplication', 'focusedTextContext', 'focusedSelectionContext', 'runAppleScript',
    'pasteboardSave', 'pasteboardWriteText', 'pasteboardRestoreIfUnchanged',
    'outputVolume', 'setOutputVolume',
    'meetingStart', 'meetingStop', 'meetingIsRecording',
  ]) {
    assert.equal(typeof native[name], 'function', name);
  }
});

test('read-only system calls return well-formed values', { skip: !built && 'native addon not built' }, () => {
  const native = require(addonPath);

  const front = native.frontmostApplication();
  if (front !== null) {
    assert.equal(typeof front.bundleId, 'string');
    assert.equal(typeof front.name, 'string');
    assert.ok(Number.isInteger(front.pid));
  }

  const devices = native.listAudioInputDevices();
  assert.ok(Array.isArray(devices));
  for (const device of devices) {
    assert.equal(typeof device.uid, 'string');
    assert.equal(typeof device.name, 'string');
    assert.ok(['built-in', 'bluetooth', 'usb', 'virtual', 'other'].includes(device.transport), device.transport);
    assert.equal(typeof device.isDefault, 'boolean');
  }
  assert.ok(devices.filter((device) => device.isDefault).length <= 1);

  const volume = native.outputVolume();
  assert.ok(volume === -1 || (volume >= 0 && volume <= 1), `volume ${volume}`);

  assert.equal(native.meetingIsRecording(), false);
  assert.equal(native.meetingStop(path.join(root, 'never-written.wav')), null);

  // Without a recording in progress there is nothing to snapshot.
  assert.equal(native.recordSnapshot(path.join(root, 'never-written.wav'), 30), null);
  assert.equal(existsSync(path.join(root, 'never-written.wav')), false);
});

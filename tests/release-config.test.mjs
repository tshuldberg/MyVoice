import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { accessSync, constants, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const builder = json('electron-builder.json');

test('the release is one universal DMG with the bundled speech engine', () => {
  assert.deepEqual(builder.mac.target, [{ target: 'dmg', arch: ['universal'] }]);
  assert.deepEqual(builder.extraResources, [{ from: 'resources/bin', to: 'bin', filter: ['whisper-cli'] }]);
  assert.equal(builder.mac.minimumSystemVersion, '13.0');
});

test('signing uses the hardened runtime and leaves notarization to the release script', () => {
  assert.equal(builder.mac.hardenedRuntime, true);
  assert.equal(builder.mac.notarize, false);
});

test('the main app may use JIT and the microphone, nothing else', () => {
  const main = read(builder.mac.entitlements);
  assert.match(main, /com\.apple\.security\.cs\.allow-jit/);
  assert.match(main, /com\.apple\.security\.device\.audio-input/);
  assert.doesNotMatch(main, /automation\.apple-events|disable-library-validation|allow-unsigned-executable-memory/);
});

test('helper processes and bundled tools never get the microphone', () => {
  const inherit = read(builder.mac.entitlementsInherit);
  assert.match(inherit, /com\.apple\.security\.cs\.allow-jit/);
  assert.doesNotMatch(inherit, /audio-input|apple-events/);
});

test('Info.plist only asks for what the app uses, and says where speech is processed', () => {
  const info = builder.mac.extendInfo;
  assert.equal(info.NSSpeechRecognitionUsageDescription, undefined);
  assert.match(info.NSMicrophoneUsageDescription, /only while you dictate/);
  assert.match(info.NSMicrophoneUsageDescription, /on this Mac/);
});

test('Electron fuses block using the signed app as a generic Node runtime', () => {
  assert.deepEqual(builder.electronFuses, {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    resetAdHocDarwinSignature: true,
  });
});

test('package and lockfile agree on version 0.3.0', () => {
  assert.equal(json('package.json').version, '0.3.0');
  const lock = json('package-lock.json');
  assert.equal(lock.version, '0.3.0');
  assert.equal(lock.packages[''].version, '0.3.0');
});

test('whisper.cpp is pinned to a tag and its exact commit', () => {
  const script = read('scripts/build-whisper.sh');
  assert.match(script, /^WHISPER_VERSION="v\d+\.\d+\.\d+"$/m);
  assert.match(script, /^WHISPER_COMMIT="[0-9a-f]{40}"$/m);
  assert.match(script, /-DGGML_NATIVE=OFF/);
  assert.match(script, /-DBUILD_SHARED_LIBS=OFF/);
});

test('build and release scripts are executable', () => {
  for (const script of ['build-whisper.sh', 'build-native.sh', 'package-mac.sh', 'release-mac.sh']) {
    accessSync(path.join(root, 'scripts', script), constants.X_OK);
  }
});

test('release preflight stops before building when the notary profile is missing', { skip: process.platform !== 'darwin' }, () => {
  const profile = `myvoice-test-absent-${process.pid}`;
  const result = spawnSync('bash', ['scripts/release-mac.sh', '--check'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, MYVOICE_NOTARY_PROFILE: profile, MYVOICE_SKIP_PROFILE_CHECK: '' },
  });
  const output = result.stdout + result.stderr;
  assert.equal(result.status, 1, output);
  assert.match(output, new RegExp(`MISSING  notarytool keychain profile "${profile}"`));
  assert.match(output, new RegExp(`xcrun notarytool store-credentials ${profile} --apple-id`));
  assert.match(output, /Nothing was built\./);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A channel missing from the preload allow-list fails only at runtime, so the
// contract between renderer scripts, preload and main handlers is checked here.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

const preload = read('src/main/preload.ts');
const channelValues = new Map([...preload.matchAll(/^\s+([A-Z_]+): '([a-z:-]+)',$/gm)].map((m) => [m[1], m[2]]));
const allowList = (name) => {
  const block = preload.match(new RegExp(`const ${name} = new Set<IpcChannel>\\(\\[([\\s\\S]*?)\\]\\);`))[1];
  return new Set([...block.matchAll(/IPC_CHANNELS\.([A-Z_]+)/g)].map((m) => channelValues.get(m[1])));
};
const invoke = allowList('invokeChannels');
const receive = allowList('receiveChannels');

const rendererFiles = readdirSync(path.join(root, 'src/renderer'))
  .filter((file) => /^(app|app-common|.*-view)\.ts$/.test(file))
  .map((file) => `src/renderer/${file}`);

const mainSources = readdirSync(path.join(root, 'src/main')).filter((file) => file.endsWith('.ts')).map((file) => read(`src/main/${file}`)).join('\n');

test('every channel the window invokes is allowed by the preload and handled in main', () => {
  for (const file of rendererFiles) {
    const source = read(file);
    for (const [, channel] of source.matchAll(/mv(?:Invoke|Update)(?:<[^>]+>)?\(\s*'([a-z:-]+)'/g)) {
      assert.ok(invoke.has(channel), `${file} invokes ${channel}, which the preload does not allow`);
      assert.ok(mainSources.includes(`'${channel}'`), `${file} invokes ${channel}, which no main module defines`);
    }
  }
});

test('every channel the window listens to is allowed by the preload', () => {
  for (const file of rendererFiles) {
    const source = read(file);
    for (const [, channel] of source.matchAll(/mvBridge\(\)\.on\(\s*'([a-z:-]+)'/g)) {
      assert.ok(receive.has(channel), `${file} listens to ${channel}, which the preload does not allow`);
    }
  }
});

test('every feature channel defined in main is exposed by the preload', () => {
  const features = read('src/main/app-features.ts');
  const block = features.match(/export const FEATURE_CHANNELS = \{([\s\S]*?)\} as const;/)[1];
  for (const [, channel] of block.matchAll(/'([a-z:-]+)'/g)) {
    assert.ok(invoke.has(channel) || receive.has(channel), `${channel} is defined in main but not exposed by the preload`);
  }
});

test('the overlay receives the new context and notice channels', () => {
  for (const channel of ['dictation:context', 'dictation:notice', 'dictation:partial-text']) {
    assert.ok(receive.has(channel), channel);
  }
});

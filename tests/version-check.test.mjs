import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, evaluateUpdate, parseLatestRelease, parseVersion } from '../dist/main/version-check.js';

const release = (overrides = {}) => ({
  tag_name: 'v0.4.0',
  html_url: 'https://github.com/tshuldberg/MyVoice/releases/tag/v0.4.0',
  draft: false,
  prerelease: false,
  assets: [
    { name: 'MyVoice.dmg.sha256', browser_download_url: 'https://github.com/tshuldberg/MyVoice/releases/download/v0.4.0/MyVoice.dmg.sha256' },
    { name: 'MyVoice.dmg', browser_download_url: 'https://github.com/tshuldberg/MyVoice/releases/download/v0.4.0/MyVoice.dmg' },
  ],
  ...overrides,
});

test('versions parse with or without a leading v', () => {
  assert.deepEqual(parseVersion('v0.3.0'), [0, 3, 0]);
  assert.deepEqual(parseVersion('1.10.2'), [1, 10, 2]);
  assert.equal(parseVersion('latest'), null);
});

test('versions compare numerically, not as text', () => {
  assert.ok(compareVersions('0.10.0', '0.9.9') > 0);
  assert.ok(compareVersions('0.3.0', 'v0.3.1') < 0);
  assert.equal(compareVersions('v1.2.3', '1.2.3'), 0);
});

test('a release response yields its version, page and DMG link', () => {
  assert.deepEqual(parseLatestRelease(release()), {
    version: '0.4.0',
    pageUrl: 'https://github.com/tshuldberg/MyVoice/releases/tag/v0.4.0',
    downloadUrl: 'https://github.com/tshuldberg/MyVoice/releases/download/v0.4.0/MyVoice.dmg',
  });
});

test('a release without a DMG still links to its page', () => {
  assert.equal(parseLatestRelease(release({ assets: [] })).downloadUrl, null);
});

test('links outside the MyVoice repository are never trusted', () => {
  assert.equal(parseLatestRelease(release({ html_url: 'https://evil.example/MyVoice' })), null);
  const spoofed = parseLatestRelease(release({
    assets: [{ name: 'MyVoice.dmg', browser_download_url: 'https://evil.example/MyVoice.dmg' }],
  }));
  assert.equal(spoofed.downloadUrl, null);
});

test('drafts, prereleases and malformed bodies are ignored', () => {
  assert.equal(parseLatestRelease(release({ draft: true })), null);
  assert.equal(parseLatestRelease(release({ prerelease: true })), null);
  assert.equal(parseLatestRelease(release({ tag_name: 'nightly' })), null);
  assert.equal(parseLatestRelease(null), null);
  assert.equal(parseLatestRelease('not json'), null);
});

test('an update is offered only for a newer version', () => {
  const latest = parseLatestRelease(release());
  assert.equal(evaluateUpdate('0.3.0', latest), 'update-available');
  assert.equal(evaluateUpdate('0.4.0', latest), 'up-to-date');
  assert.equal(evaluateUpdate('0.5.0', latest), 'up-to-date');
});

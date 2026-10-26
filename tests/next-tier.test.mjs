import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BROWSER_URL_SCRIPTS,
  bestDomainMatch,
  domainMatches,
  hostFromUrl,
  isSupportedBrowser,
  normalizeDomain,
} from '../dist/main/website-context.js';
import { applyFuzzyVocabulary, editDistance, phoneticKey } from '../dist/main/phonetic.js';
import { isUpdateCheckDue, UPDATE_CHECK_INTERVAL_MS } from '../dist/main/update-schedule.js';
import { FEATURE_FLAGS } from '../dist/main/feature-flags.js';

// --- website modes -------------------------------------------------------------

test('front-tab URLs reduce to a host, ignoring www and non-web pages', () => {
  assert.equal(hostFromUrl('https://mail.google.com/mail/u/0/#inbox'), 'mail.google.com');
  assert.equal(hostFromUrl('https://www.github.com/x'), 'github.com');
  assert.equal(hostFromUrl('file:///Users/me/a.html'), null);
  assert.equal(hostFromUrl('chrome://settings'), null);
  assert.equal(hostFromUrl('not a url'), null);
});

test('typed domains are normalized to bare host names', () => {
  assert.equal(normalizeDomain('Gmail.com'), 'gmail.com');
  assert.equal(normalizeDomain('https://docs.google.com/document/d/1'), 'docs.google.com');
  assert.equal(normalizeDomain('*.slack.com'), 'slack.com');
  assert.equal(normalizeDomain('www.notion.so/page'), 'notion.so');
  assert.equal(normalizeDomain('localhost'), null);
  assert.equal(normalizeDomain('bad domain.com'), null);
  assert.equal(normalizeDomain(''), null);
});

test('a site matches itself and its subdomains only', () => {
  assert.equal(domainMatches('docs.google.com', 'google.com'), true);
  assert.equal(domainMatches('google.com', 'google.com'), true);
  assert.equal(domainMatches('notgoogle.com', 'google.com'), false);
});

test('the most specific site wins', () => {
  const modes = [{ id: 'all', domains: ['google.com'] }, { id: 'docs', domains: ['docs.google.com'] }];
  assert.equal(bestDomainMatch(modes, 'docs.google.com').id, 'docs');
  assert.equal(bestDomainMatch(modes, 'mail.google.com').id, 'all');
  assert.equal(bestDomainMatch(modes, 'example.com'), null);
  assert.equal(bestDomainMatch(modes, null), null);
});

test('browser scripts are fixed strings with a short timeout, one per supported browser', () => {
  assert.equal(isSupportedBrowser('com.apple.Safari'), true);
  assert.equal(isSupportedBrowser('com.google.Chrome'), true);
  assert.equal(isSupportedBrowser('com.apple.Notes'), false);
  assert.equal(isSupportedBrowser(null), false);
  for (const [bundleId, script] of Object.entries(BROWSER_URL_SCRIPTS)) {
    assert.ok(script.includes(`application id "${bundleId}"`), bundleId);
    assert.match(script, /return URL of (front document|active tab of front window)/);
  }
});

// --- phonetic vocabulary -----------------------------------------------------------

test('sound-alike keys group spellings of the same sounds', () => {
  assert.equal(phoneticKey('Kubernetes'), phoneticKey('kubernetties'));
  assert.equal(phoneticKey('Kubernetes'), 'KPRNTS');
  assert.notEqual(phoneticKey('motion'), phoneticKey('Notion'));
  assert.notEqual(phoneticKey('progress'), phoneticKey('Postgres'));
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.equal(editDistance('', 'abc'), 3);
});

test('near-miss spellings of vocabulary terms are corrected', () => {
  const vocabulary = ['Kubernetes', 'Supabase', 'Tailscale'];
  assert.equal(applyFuzzyVocabulary('Deploy it on kubernetties today.', vocabulary), 'Deploy it on Kubernetes today.');
  assert.equal(applyFuzzyVocabulary('We moved to supa base, finally.', vocabulary), 'We moved to Supabase, finally.');
  assert.equal(applyFuzzyVocabulary('Is tail scale up?', vocabulary), 'Is Tailscale up?');
});

test('ordinary words and short terms are left alone', () => {
  assert.equal(applyFuzzyVocabulary('The motion passed.', ['Notion']), 'The motion passed.');
  assert.equal(applyFuzzyVocabulary('Good progress today.', ['Postgres']), 'Good progress today.');
  assert.equal(applyFuzzyVocabulary('A cat sat.', ['Cats']), 'A cat sat.');
  assert.equal(applyFuzzyVocabulary('Nothing to do.', []), 'Nothing to do.');
});

// --- update schedule and flags -------------------------------------------------------

test('automatic update checks run at most once a day', () => {
  const now = 1_800_000_000_000;
  assert.equal(isUpdateCheckDue(null, now), true);
  assert.equal(isUpdateCheckDue(now - 60_000, now), false);
  assert.equal(isUpdateCheckDue(now - UPDATE_CHECK_INTERVAL_MS, now), true);
  assert.equal(isUpdateCheckDue(now + 60_000, now), true);
});

test('decision-gated features ship off', () => {
  assert.deepEqual(FEATURE_FLAGS, { websiteModes: false, aiScreenContext: false });
});

// --- British spelling ------------------------------------------------------------

test('British spelling covers whole word families and keeps the case', async () => {
  const { applySpelling } = await import('../dist/main/spelling.js');
  assert.equal(
    applySpelling('Color the organized catalogs. The favorite theater canceled its program.', 'uk'),
    'Colour the organised catalogues. The favourite theatre cancelled its program.',
  );
  assert.equal(applySpelling('ANALYZE behavioral colorful', 'uk'), 'ANALYSE behavioural colourful');
  assert.equal(applySpelling('The color is gray.', 'us'), 'The color is gray.');
});

test('words with two British spellings, and look-alike words, are left alone', async () => {
  const { applySpelling, britishSpellingFor } = await import('../dist/main/spelling.js');
  assert.equal(applySpelling('Check the license, the meter and the dialog box.', 'uk'), 'Check the license, the meter and the dialog box.');
  assert.equal(applySpelling('An honorary humorous laboratory.', 'uk'), 'An honorary humorous laboratory.');
  assert.equal(britishSpellingFor('cataloging'), undefined);
});

test('the pipeline applies British spelling per mode, before replacements', async () => {
  const { processTranscript, DEFAULT_PIPELINE_OPTIONS } = await import('../dist/main/text-pipeline.js');
  const dictionary = { vocabulary: [], replacements: [{ from: 'colour scheme', to: 'palette' }] };
  assert.equal(processTranscript('i love the color of it', { ...DEFAULT_PIPELINE_OPTIONS, spelling: 'uk' }, dictionary), 'I love the colour of it.');
  assert.equal(processTranscript('the color scheme', { ...DEFAULT_PIPELINE_OPTIONS, spelling: 'uk', formatting: 'off' }, dictionary), 'the palette');
});

// --- microphone choice -------------------------------------------------------------

const mic = (uid, transport, isDefault = false) => ({ uid, name: uid, transport, isDefault });

test('the default microphone is used unless it is Bluetooth and Bluetooth is avoided', async () => {
  const { chooseInputDevice } = await import('../dist/main/input-device.js');
  const devices = [mic('airpods', 'bluetooth', true), mic('macbook', 'built-in'), mic('loopback', 'virtual')];
  assert.equal(chooseInputDevice(devices, { selectedUID: '', avoidBluetooth: false }), '');
  assert.equal(chooseInputDevice(devices, { selectedUID: '', avoidBluetooth: true }), 'macbook');
  assert.equal(chooseInputDevice([mic('usb', 'usb', true), mic('macbook', 'built-in')], { selectedUID: '', avoidBluetooth: true }), '');
});

test('an explicitly picked microphone wins, and an unplugged one falls back', async () => {
  const { chooseInputDevice } = await import('../dist/main/input-device.js');
  const devices = [mic('airpods', 'bluetooth', true), mic('usb', 'usb')];
  assert.equal(chooseInputDevice(devices, { selectedUID: 'airpods', avoidBluetooth: true }), 'airpods');
  assert.equal(chooseInputDevice(devices, { selectedUID: 'unplugged', avoidBluetooth: true }), 'usb');
  assert.equal(chooseInputDevice([mic('airpods', 'bluetooth', true)], { selectedUID: '', avoidBluetooth: true }), '');
});

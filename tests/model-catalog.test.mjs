import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MODEL_ID,
  MODEL_CATALOG,
  canTranslate,
  effectiveLanguage,
  getModel,
  pickInstalledModel,
} from '../dist/main/model-catalog.js';

test('every model is pinned to one commit with a SHA-256 and a size', () => {
  const revisions = new Set();
  for (const model of MODEL_CATALOG) {
    const match = model.url.match(/\/resolve\/([0-9a-f]{40})\/(ggml-[\w.-]+\.bin)$/);
    assert.ok(match, model.url);
    revisions.add(match[1]);
    assert.equal(match[2], model.fileName);
    assert.match(model.sha256, /^[0-9a-f]{64}$/);
    assert.ok(model.sizeBytes > 10_000_000);
  }
  assert.equal(revisions.size, 1);
  assert.equal(new Set(MODEL_CATALOG.map((model) => model.id)).size, MODEL_CATALOG.length);
});

test('the default model is Base (English) at its published hash', () => {
  const model = getModel(DEFAULT_MODEL_ID);
  assert.equal(model.fileName, 'ggml-base.en.bin');
  assert.equal(model.sha256, 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002');
});

test('English-only models always run in English', () => {
  assert.equal(effectiveLanguage(getModel('base.en'), 'fr'), 'en');
  assert.equal(effectiveLanguage(getModel('base'), 'fr'), 'fr');
  assert.equal(effectiveLanguage(getModel('base'), 'klingon'), 'auto');
});

test('translation needs a capable model and non-English speech', () => {
  assert.equal(canTranslate(getModel('small'), 'de'), true);
  assert.equal(canTranslate(getModel('small'), 'en'), false);
  assert.equal(canTranslate(getModel('small.en'), 'de'), false);
  assert.equal(canTranslate(getModel('large-v3-turbo-q5_0'), 'de'), false);
});

test('a missing model falls back to the nearest installed one of the same kind', () => {
  assert.equal(pickInstalledModel('small.en', ['small.en', 'base.en']), 'small.en');
  assert.equal(pickInstalledModel('small.en', ['base.en', 'base']), 'base.en');
  assert.equal(pickInstalledModel('small', ['base.en', 'base']), 'base');
  assert.equal(pickInstalledModel('large-v3-turbo-q5_0', ['tiny.en']), 'tiny.en');
  assert.equal(pickInstalledModel('base.en', []), null);
});

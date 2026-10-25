import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DICTIONARY_LIMITS,
  addVocabularyTerm,
  applyReplacements,
  applyVocabularyCasing,
  buildVocabularyPrompt,
  mergeDictionaries,
  normalizeDictionary,
  parseDictionaryCsv,
  removeReplacement,
  removeVocabularyTerm,
  upsertReplacement,
} from '../dist/main/dictionary.js';

test('replacements match whole words only, ignoring case', () => {
  const rules = [{ from: 'cat', to: 'dog' }];
  assert.equal(applyReplacements('Cat and caterpillar', rules), 'dog and caterpillar');
  assert.equal(applyReplacements('CAT, cat.', rules), 'dog, dog.');
});

test('replacement output is inserted exactly as typed, including new lines', () => {
  const rules = [{ from: 'sign off', to: 'Best,\nTrey' }];
  assert.equal(applyReplacements('Thanks. Sign off', rules), 'Thanks. Best,\nTrey');
});

test('symbol outputs join the neighboring words', () => {
  const rules = [
    { from: 'at sign', to: '@' },
    { from: 'dot com', to: '.com' },
    { from: 'hashtag', to: '#' },
  ];
  assert.equal(applyReplacements('trey at sign example dot com', rules), 'trey@example.com');
  assert.equal(applyReplacements('use hashtag launch', rules), 'use #launch');
});

test('longer phrases win and outputs are never replaced again', () => {
  const rules = [
    { from: 'new york', to: 'NYC' },
    { from: 'new york city', to: 'New York City' },
    { from: 'NYC', to: 'loop' },
  ];
  assert.equal(applyReplacements('I love new york city and new york', rules), 'I love New York City and NYC');
});

test('a numeric rule cannot corrupt another rule', () => {
  const rules = Array.from({ length: 12 }, (_, i) => ({ from: `word${i}`, to: `W${i}` }));
  rules.push({ from: '1', to: 'one' });
  assert.equal(applyReplacements('word11 and 1', rules), 'W11 and one');
});

test('vocabulary restores spelling for single and multi-word terms', () => {
  assert.equal(applyVocabularyCasing('Iphone and hugging face', ['iPhone', 'Hugging Face']), 'iPhone and Hugging Face');
  assert.equal(applyVocabularyCasing('phoneme', ['phone']), 'phoneme');
});

test('the vocabulary prompt is a short comma list within the character cap', () => {
  assert.equal(buildVocabularyPrompt(['MyVoice', 'whisper.cpp']), 'MyVoice, whisper.cpp');
  assert.equal(buildVocabularyPrompt([]), null);
  const long = Array.from({ length: 300 }, (_, i) => `term${i}`);
  const prompt = buildVocabularyPrompt(long);
  assert.ok(prompt.length <= DICTIONARY_LIMITS.promptCharacters);
  assert.ok(prompt.startsWith('term0, term1'));
});

test('normalizing trims, removes duplicates and enforces limits', () => {
  const dictionary = normalizeDictionary({
    vocabulary: ['  MyVoice ', 'myvoice', '', 42, 'x'.repeat(100)],
    replacements: [{ from: ' brb ', to: ' be right back ' }, { from: 'BRB', to: 'dup' }, { from: '', to: 'nothing' }],
  });
  assert.deepEqual(dictionary.vocabulary, ['MyVoice', '42', 'x'.repeat(DICTIONARY_LIMITS.termLength)]);
  assert.deepEqual(dictionary.replacements, [{ from: 'brb', to: 'be right back' }]);
  assert.deepEqual(normalizeDictionary(null), { vocabulary: [], replacements: [] });
});

test('editing helpers keep newest first and replace by key', () => {
  let dictionary = { vocabulary: ['Alpha'], replacements: [] };
  dictionary = addVocabularyTerm(dictionary, 'Beta');
  assert.deepEqual(dictionary.vocabulary, ['Beta', 'Alpha']);
  dictionary = removeVocabularyTerm(dictionary, 'alpha');
  assert.deepEqual(dictionary.vocabulary, ['Beta']);
  dictionary = upsertReplacement(dictionary, { from: 'brb', to: 'be right back' });
  dictionary = upsertReplacement(dictionary, { from: 'BRB', to: 'back soon' });
  assert.deepEqual(dictionary.replacements, [{ from: 'BRB', to: 'back soon' }]);
  dictionary = removeReplacement(dictionary, 'brb');
  assert.deepEqual(dictionary.replacements, []);
});

test('CSV import reads terms and spoken,written pairs with quotes and CRLF', () => {
  const csv = 'from,to\r\nMyVoice\r\n"dot com",.com\r\n"sign off","Best, Trey"\r\n"say ""hi""",hello\r\n';
  assert.deepEqual(parseDictionaryCsv(csv), {
    vocabulary: ['MyVoice'],
    replacements: [
      { from: 'dot com', to: '.com' },
      { from: 'sign off', to: 'Best, Trey' },
      { from: 'say "hi"', to: 'hello' },
    ],
  });
});

test('merging puts imported entries first and lets them override rules', () => {
  const merged = mergeDictionaries(
    { vocabulary: ['Old'], replacements: [{ from: 'brb', to: 'old' }, { from: 'ty', to: 'thank you' }] },
    { vocabulary: ['New', 'old'], replacements: [{ from: 'BRB', to: 'new' }] },
  );
  assert.deepEqual(merged.vocabulary, ['New', 'old']);
  assert.deepEqual(merged.replacements, [{ from: 'BRB', to: 'new' }, { from: 'ty', to: 'thank you' }]);
});

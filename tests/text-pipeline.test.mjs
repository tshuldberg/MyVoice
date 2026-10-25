import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyScratchThat,
  applySpokenPunctuation,
  joinSegments,
  splitOnLineBreakCommands,
} from '../dist/main/spoken-commands.js';
import {
  DEFAULT_PIPELINE_OPTIONS,
  processTranscript,
  removeFillerWords,
  stripAnnotations,
} from '../dist/main/text-pipeline.js';

const noDictionary = { vocabulary: [], replacements: [] };
const run = (raw, options = {}, dictionary = noDictionary) =>
  processTranscript(raw, { ...DEFAULT_PIPELINE_OPTIONS, ...options }, dictionary);

// --- spoken commands -------------------------------------------------------

test('scratch that removes the sentence spoken before it', () => {
  assert.equal(applyScratchThat('Meet me at five. Scratch that. Meet me at six.'), 'Meet me at six.');
  assert.equal(applyScratchThat('Send it today, scratch that, send it tomorrow'), 'send it tomorrow');
  assert.equal(applyScratchThat('First point. Second point. Delete that.'), 'First point.');
});

test('scratch that keeps earlier sentences and handles repeats', () => {
  assert.equal(applyScratchThat('One. Two. Scratch that. Scratch that. Three.'), 'Three.');
  assert.equal(applyScratchThat('Scratch that. Hello there.'), 'Hello there.');
});

test('spoken punctuation becomes symbols with natural spacing', () => {
  assert.equal(applySpokenPunctuation('hello comma how are you question mark'), 'hello, how are you?');
  assert.equal(applySpokenPunctuation('Wait, period. Then go.'), 'Wait. Then go.');
  assert.equal(applySpokenPunctuation('she said open quote hi close quote and left'), 'she said "hi" and left');
  assert.equal(applySpokenPunctuation('add milk open paren two liters close paren'), 'add milk (two liters)');
  assert.equal(applySpokenPunctuation('wait for it ellipsis'), 'wait for it...');
});

test('spoken punctuation leaves whisper text such as domains alone', () => {
  assert.equal(applySpokenPunctuation('Visit example.com today'), 'Visit example.com today');
});

test('new line and new paragraph split the text, absorbing whisper punctuation', () => {
  const segments = splitOnLineBreakCommands('Dear Sam. New paragraph. Thanks for coming, new line, see you soon.');
  assert.deepEqual(segments, [
    { text: 'Dear Sam.', breakAfter: '\n\n' },
    { text: 'Thanks for coming,', breakAfter: '\n' },
    { text: 'see you soon.', breakAfter: '' },
  ]);
  assert.equal(joinSegments(segments), 'Dear Sam.\n\nThanks for coming,\nsee you soon.');
});

// --- fillers and annotations -------------------------------------------------

test('filler words are removed with their commas', () => {
  assert.equal(removeFillerWords('Um, so I think, uh, we should go.'), 'so I think we should go.');
  assert.equal(removeFillerWords('I, uh, think. Hmm. Okay.'), 'I think. Okay.');
  assert.equal(removeFillerWords('Ummm what about umbrellas'), 'what about umbrellas');
});

test('only never-grammatical stutters are collapsed', () => {
  assert.equal(removeFillerWords('I I think the the plan works'), 'I think the plan works');
  assert.equal(removeFillerWords('I said that that was fine'), 'I said that that was fine');
  assert.equal(removeFillerWords('She had had enough'), 'She had had enough');
});

test('an ellipsis survives filler cleanup', () => {
  assert.equal(removeFillerWords('Well... um maybe'), 'Well... maybe');
});

test('annotations are stripped', () => {
  assert.equal(stripAnnotations('[MUSIC] Hello (wind blowing) there'), 'Hello there');
});

// --- whole pipeline ----------------------------------------------------------

test('pipeline formats each line on its own', () => {
  const raw = 'Hi team. New line. Um, the build is green. New paragraph. Thanks.';
  assert.equal(run(raw), 'Hi team.\nThe build is green.\n\nThanks.');
});

test('pipeline with commands off keeps the words', () => {
  assert.equal(run('Hello new line world', { spokenCommands: false, formatting: 'off' }), 'Hello new line world');
});

test('verbatim formatting with commands still inserts line breaks', () => {
  assert.equal(run('ls -la new line cd src', { formatting: 'off', removeFillers: false }), 'ls -la\ncd src');
});

test('pipeline applies replacements and vocabulary spelling last', () => {
  const dictionary = {
    vocabulary: ['iPhone', 'MyVoice'],
    replacements: [{ from: 'my work email', to: 'trey@example.com' }],
  };
  assert.equal(
    run('send it to my work email from my iphone using my voice app', {}, dictionary),
    'Send it to trey@example.com from my iPhone using my voice app.',
  );
  assert.equal(run('iphone sales are up', {}, dictionary), 'iPhone sales are up.');
});

test('pipeline returns empty text for annotation-only output', () => {
  assert.equal(run('[BLANK_AUDIO]'), '');
  assert.equal(run('  '), '');
});

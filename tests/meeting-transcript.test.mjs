import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMeetingTranscript,
  formatTimestamp,
  isEcho,
  mergeMeetingSegments,
  parseWhisperJson,
  wordOverlap,
} from '../dist/main/meeting-transcript.js';

const seg = (startMs, endMs, text) => ({ startMs, endMs, text });

test('whisper JSON segments are read, skipping annotations and malformed items', () => {
  const body = {
    transcription: [
      { timestamps: { from: '00:00:00,000', to: '00:00:02,000' }, offsets: { from: 0, to: 2000 }, text: ' Hi everyone.' },
      { offsets: { from: 2000, to: 3000 }, text: ' [BLANK_AUDIO]' },
      { offsets: { from: 'x', to: 4000 }, text: 'bad offsets' },
      { offsets: { from: 4000, to: 5000 }, text: '   ' },
      { offsets: { from: 5000, to: 4000 }, text: 'Reversed end' },
    ],
  };
  assert.deepEqual(parseWhisperJson(body), [seg(0, 2000, 'Hi everyone.'), seg(5000, 5000, 'Reversed end')]);
  assert.deepEqual(parseWhisperJson({}), []);
  assert.deepEqual(parseWhisperJson(null), []);
});

test('word overlap measures shared words', () => {
  assert.equal(wordOverlap('the plan is ready', 'The plan is ready.'), 1);
  assert.equal(wordOverlap('ship it friday', 'lunch on monday'), 0);
  assert.equal(wordOverlap('', 'anything'), 0);
});

test('the microphone hearing the speakers is detected as an echo only when it lines up in time', () => {
  const theirs = [seg(10_000, 14_000, 'Can everyone see my screen now')];
  assert.equal(isEcho(seg(10_400, 14_200, 'can everyone see my screen now'), theirs), true);
  assert.equal(isEcho(seg(60_000, 64_000, 'can everyone see my screen now'), theirs), false);
  assert.equal(isEcho(seg(10_500, 13_000, 'yes I can see it'), theirs), false);
});

test('tracks are interleaved by time, echoes dropped and same-speaker runs joined', () => {
  const mine = [
    seg(0, 1500, 'Hi, can you hear me?'),
    seg(5200, 8000, 'Sounds good, let us start'),
    seg(8500, 9000, 'with the budget.'),
    seg(3100, 4800, 'Yes I can hear you fine'),
  ];
  const theirs = [seg(3000, 5000, 'Yes, I can hear you fine.'), seg(10_000, 12_000, 'Great.')];
  const turns = mergeMeetingSegments(mine, theirs);
  assert.deepEqual(turns.map((turn) => [turn.speaker, turn.text]), [
    ['You', 'Hi, can you hear me?'],
    ['Others', 'Yes, I can hear you fine.'],
    ['You', 'Sounds good, let us start with the budget.'],
    ['Others', 'Great.'],
  ]);
});

test('timestamps and transcript lines are formatted for reading', () => {
  assert.equal(formatTimestamp(5_000), '0:05');
  assert.equal(formatTimestamp(65_000), '1:05');
  assert.equal(formatTimestamp(3_725_000), '1:02:05');
  assert.equal(
    formatMeetingTranscript([{ startMs: 0, endMs: 1, text: 'Hello.', speaker: 'Others' }, { startMs: 61_000, endMs: 62_000, text: 'Hi.', speaker: 'You' }]),
    '[0:00] Others: Hello.\n[1:01] You: Hi.',
  );
});

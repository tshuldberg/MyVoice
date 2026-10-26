import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptToCaret } from '../dist/main/insertion-context.js';
import {
  CONFIRM_CANCEL_AFTER_MS,
  defaultLivePreview,
  duckedVolume,
  shouldConfirmCancel,
  shouldRestoreVolume,
  shouldWarnNoInput,
} from '../dist/main/session-rules.js';
import { buildWhisperArgs, recommendedThreads, transcriptionTimeoutMs } from '../dist/main/whisper-args.js';
import { afconvertArgs, audioFilePlan, parseWhisperProgress } from '../dist/main/audio-file.js';
import { parseControlUrl } from '../dist/main/control-url.js';
import { normalizePreferences } from '../dist/main/preferences-model.js';

const caret = (before, atStart = false) => ({ secure: false, before, atStart });

// --- smart spacing -----------------------------------------------------------

test('text after a word gets a space and continues in lowercase', () => {
  assert.equal(adaptToCaret('The meeting moved.', caret('ow')), ' the meeting moved.');
  assert.equal(adaptToCaret('Then we left.', caret(', ')), 'then we left.');
});

test('text after a sentence end gets a space and keeps its capital', () => {
  assert.equal(adaptToCaret('Next point.', caret('e.')), ' Next point.');
  assert.equal(adaptToCaret('Next point.', caret('. ')), 'Next point.');
});

test('the start of a field, a new line or an empty field are left alone', () => {
  assert.equal(adaptToCaret('Hello.', caret('', true)), 'Hello.');
  assert.equal(adaptToCaret('Hello.', caret('a\n')), 'Hello.');
  assert.equal(adaptToCaret('Hello.', null), 'Hello.');
});

test('names, acronyms, "I" and vocabulary keep their capitals mid-sentence', () => {
  assert.equal(adaptToCaret('I agree.', caret('so')), ' I agree.');
  assert.equal(adaptToCaret('NASA called.', caret('so')), ' NASA called.');
  assert.equal(adaptToCaret('iPhone works.', caret('so')), ' iPhone works.');
  assert.equal(adaptToCaret('Kubernetes is up.', caret('so'), ['Kubernetes']), ' Kubernetes is up.');
});

test('punctuation attaches, open brackets need no space, password fields are untouched', () => {
  assert.equal(adaptToCaret(', and more', caret('rd')), ', and more');
  assert.equal(adaptToCaret('Inside', caret('x(')), 'inside');
  assert.equal(adaptToCaret('Secret', { secure: true, before: '', atStart: false }), 'Secret');
});

// --- session rules -------------------------------------------------------------

test('a long recording needs a second Escape within two seconds', () => {
  assert.equal(shouldConfirmCancel(5_000, null, 0), 'cancel');
  assert.equal(shouldConfirmCancel(CONFIRM_CANCEL_AFTER_MS, null, 100_000), 'confirm');
  assert.equal(shouldConfirmCancel(30_000, 99_000, 100_000), 'cancel');
  assert.equal(shouldConfirmCancel(30_000, 90_000, 100_000), 'confirm');
});

test('the no-input warning appears once, after three silent seconds', () => {
  assert.equal(shouldWarnNoInput(2_000, false, false), false);
  assert.equal(shouldWarnNoInput(3_000, false, false), true);
  assert.equal(shouldWarnNoInput(3_000, true, false), false);
  assert.equal(shouldWarnNoInput(9_000, false, true), false);
});

test('ducking lowers to 30 percent or mutes, and restores only an untouched volume', () => {
  assert.equal(duckedVolume(0.8, 'lower'), 0.24);
  assert.equal(duckedVolume(0.8, 'mute'), 0);
  assert.equal(duckedVolume(0.8, 'off'), null);
  assert.equal(duckedVolume(0, 'lower'), null);
  assert.equal(duckedVolume(-1, 'mute'), null);
  assert.equal(shouldRestoreVolume(0.24, 0.24), true);
  assert.equal(shouldRestoreVolume(0.6, 0.24), false);
});

test('live preview defaults on for Apple silicon only', () => {
  assert.equal(defaultLivePreview('arm64'), true);
  assert.equal(defaultLivePreview('x64'), false);
});

// --- whisper arguments ---------------------------------------------------------

test('whisper arguments carry the language, threads, translation and vocabulary prompt', () => {
  assert.deepEqual(
    buildWhisperArgs({ modelPath: '/m.bin', audioPath: '/a.wav', language: 'de', translate: true, prompt: 'MyVoice, Kubernetes', threads: 4 }),
    ['-m', '/m.bin', '--no-timestamps', '-l', 'de', '-t', '4', '--translate', '--prompt', 'MyVoice, Kubernetes', '-f', '/a.wav'],
  );
  assert.deepEqual(
    buildWhisperArgs({ modelPath: '/m.bin', audioPath: '/a.wav', language: 'en', translate: false, prompt: null, threads: 2 }),
    ['-m', '/m.bin', '--no-timestamps', '-l', 'en', '-t', '2', '-f', '/a.wav'],
  );
});

test('threads leave headroom and timeouts grow with the recording', () => {
  assert.equal(recommendedThreads(1), 1);
  assert.equal(recommendedThreads(4), 2);
  assert.equal(recommendedThreads(12), 4);
  assert.equal(transcriptionTimeoutMs(0), 30_000);
  assert.equal(transcriptionTimeoutMs(60_000), 210_000);
});

// --- audio files -----------------------------------------------------------------

test('audio files are decoded directly, converted first, or refused', () => {
  assert.equal(audioFilePlan('/x/Talk.MP3'), 'direct');
  assert.equal(audioFilePlan('/x/note.wav'), 'direct');
  assert.equal(audioFilePlan('/x/memo.m4a'), 'convert');
  assert.equal(audioFilePlan('/x/clip.mov'), 'convert');
  assert.equal(audioFilePlan('/x/doc.pdf'), 'unsupported');
  assert.deepEqual(afconvertArgs('/in.m4a', '/out.wav'), ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', '/in.m4a', '/out.wav']);
});

test('whisper progress lines are read, keeping the latest value', () => {
  assert.equal(parseWhisperProgress('whisper_print_progress_callback: progress =  15%\n... progress =  20%'), 20);
  assert.equal(parseWhisperProgress('no progress here'), null);
});

// --- myvoice:// links -------------------------------------------------------------

test('control links parse into actions', () => {
  assert.deepEqual(parseControlUrl('myvoice://start'), { kind: 'start' });
  assert.deepEqual(parseControlUrl('myvoice://TOGGLE'), { kind: 'toggle' });
  assert.deepEqual(parseControlUrl('myvoice://paste-last'), { kind: 'paste-last' });
  assert.deepEqual(parseControlUrl('myvoice://mode/notes'), { kind: 'select-mode', modeId: 'notes' });
  assert.deepEqual(parseControlUrl('myvoice://mode?id=mode-abc'), { kind: 'select-mode', modeId: 'mode-abc' });
});

test('unknown, malformed or foreign links are ignored', () => {
  assert.equal(parseControlUrl('myvoice://format-disk'), null);
  assert.equal(parseControlUrl('myvoice://start/now'), null);
  assert.equal(parseControlUrl('myvoice://mode/bad id!'), null);
  assert.equal(parseControlUrl('https://example.com/start'), null);
  assert.equal(parseControlUrl('not a url'), null);
});

// --- preferences ---------------------------------------------------------------------

test('preferences default to safe values and reject bad input', () => {
  const defaults = normalizePreferences(undefined, 'arm64');
  assert.equal(defaults.triggerStyle, 'double-tap');
  assert.equal(defaults.allowUrlControl, false);
  assert.equal(defaults.localAi.enabled, false);
  assert.equal(defaults.historyRetentionDays, -1);
  assert.equal(defaults.livePreview, true);
  assert.equal(defaults.websiteModes, false);
  assert.equal(defaults.autoCheckUpdates, false);

  const cleaned = normalizePreferences({
    triggerStyle: 'shout',
    ducking: 'lower',
    historyRetentionDays: 12,
    maxRecordingMinutes: 999,
    allowUrlControl: 'yes',
    localAi: { enabled: true, endpoint: 'https://api.example.com/v1/chat/completions' },
  }, 'x64');
  assert.equal(cleaned.triggerStyle, 'double-tap');
  assert.equal(cleaned.ducking, 'lower');
  assert.equal(cleaned.historyRetentionDays, -1);
  assert.equal(cleaned.maxRecordingMinutes, 10);
  assert.equal(cleaned.allowUrlControl, false);
  assert.equal(cleaned.livePreview, false);
  assert.equal(cleaned.localAi.enabled, true);
  assert.equal(cleaned.localAi.endpoint, 'http://127.0.0.1:11434/v1/chat/completions');
});

test('meeting transcription keeps timestamps and writes JSON segments', () => {
  assert.deepEqual(
    buildWhisperArgs({ modelPath: '/m.bin', audioPath: '/mic.wav', language: 'en', translate: false, prompt: null, threads: 4, jsonOutputBase: '/tmp/mic' }),
    ['-m', '/m.bin', '-l', 'en', '-t', '4', '--output-json', '--output-file', '/tmp/mic', '-f', '/mic.wav'],
  );
});

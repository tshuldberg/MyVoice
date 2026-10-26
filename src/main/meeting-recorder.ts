import { app } from 'electron';
import { readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import * as native from './native-bridge';
import { getModesState } from './modes-settings';
import { resolveMode } from './modes';
import { effectiveLanguage, getModel, pickInstalledModel } from './model-catalog';
import { installedModelIds, installedModelPath } from './model-manager';
import { getDictionary } from './dictionary-settings';
import { buildVocabularyPrompt } from './dictionary';
import { processTranscript } from './text-pipeline';
import { recommendedThreads } from './whisper-args';
import { transcribe } from './transcriber';
import { appendRecordingLog, type RecordingLogEntry } from './recording-log';
import { getPreferences } from './preferences';
import { formatMeetingTranscript, mergeMeetingSegments, parseWhisperJson, type TimedSegment } from './meeting-transcript';
import { getPermissionSnapshot } from './permissions';

// Meeting recordings: the microphone ("You") and the Mac's own audio
// ("Others") are recorded side by side, transcribed separately with
// timestamps and interleaved. Audio files are deleted once transcribed.

export type MeetingStage = 'idle' | 'recording' | 'transcribing';

export interface MeetingStatus {
  stage: MeetingStage;
  startedAt: number | null;
  percent: number;
}

let whisperCli: string | null = null;
let status: MeetingStatus = { stage: 'idle', startedAt: null, percent: 0 };
let listener: ((value: MeetingStatus) => void) | null = null;
let limitTimer: ReturnType<typeof setTimeout> | null = null;
let onAutoStop: ((result: { text: string; entry: RecordingLogEntry | null }) => void) | null = null;

/** Recordings stop by themselves after three hours (about 700 MB of audio in memory). */
export const MAX_MEETING_MS = 3 * 60 * 60_000;

export function onMeetingAutoStop(handler: (result: { text: string; entry: RecordingLogEntry | null }) => void): void {
  onAutoStop = handler;
}

export function setMeetingTranscriber(cliPath: string): void {
  whisperCli = cliPath;
}

export function onMeetingStatus(handler: (value: MeetingStatus) => void): void {
  listener = handler;
}

export function getMeetingStatus(): MeetingStatus {
  return { ...status };
}

/** Dictation stays off while a meeting is recorded: both use the microphone. */
export function isMeetingActive(): boolean {
  return status.stage !== 'idle';
}

function setStatus(next: MeetingStatus): void {
  status = next;
  listener?.({ ...status });
}

/** Returns an error message, or null when recording started. */
export async function startMeeting(): Promise<string | null> {
  if (status.stage !== 'idle') return 'A meeting is already being recorded or transcribed.';
  if (!whisperCli) return 'The speech engine is not ready yet.';
  if (getPermissionSnapshot().microphone !== 'granted') return 'Allow the microphone in Setup first.';

  const systemError = await native.meetingStart();
  if (systemError) return `macOS did not allow recording the Mac's audio: ${systemError}. Allow MyVoice in System Settings > Privacy & Security > Screen & System Audio Recording.`;

  native.recordStart(() => undefined, (error) => console.error('[MyVoice] Meeting microphone error:', error), true);
  const startedAt = Date.now();
  setStatus({ stage: 'recording', startedAt, percent: 0 });
  limitTimer = setTimeout(() => {
    if (status.stage === 'recording' && status.startedAt === startedAt) {
      stopMeeting().then(onAutoStop ?? (() => undefined)).catch((error) => console.error('[MyVoice] Meeting stop failed:', error));
    }
  }, MAX_MEETING_MS);
  return null;
}

async function transcribeTrack(audioPath: string, label: string, onPercent: (percent: number) => void): Promise<TimedSegment[]> {
  const { mode } = resolveMode(getModesState(), null);
  const modelId = pickInstalledModel(mode.modelId, installedModelIds());
  const modelPath = modelId ? installedModelPath(modelId) : null;
  if (!modelId || !modelPath) throw new Error('No speech model is downloaded.');
  const model = getModel(modelId)!;
  const jsonBase = path.join(app.getPath('temp'), `myvoice-meeting-${label}-${Date.now()}`);
  try {
    const dictionary = getDictionary();
    const running = transcribe(whisperCli!, {
      modelPath,
      audioPath,
      language: effectiveLanguage(model, mode.language),
      translate: false,
      prompt: mode.pipeline.useDictionary ? buildVocabularyPrompt(dictionary.vocabulary) : null,
      threads: recommendedThreads(os.cpus().length),
      jsonOutputBase: jsonBase,
    }, 6 * 60 * 60_000, onPercent);
    await running.result;
    return parseWhisperJson(JSON.parse(readFileSync(`${jsonBase}.json`, 'utf8')));
  } finally {
    rmSync(`${jsonBase}.json`, { force: true });
  }
}

/** Stops recording, transcribes both tracks and saves the transcript to History. */
export async function stopMeeting(): Promise<{ text: string; entry: RecordingLogEntry | null }> {
  if (status.stage !== 'recording' || status.startedAt === null) throw new Error('No meeting is being recorded.');
  const startedAt = status.startedAt;
  const durationMs = Date.now() - startedAt;
  if (limitTimer) clearTimeout(limitTimer);
  limitTimer = null;

  const micPath = native.recordStop();
  const systemPath = native.meetingStop(path.join(app.getPath('temp'), `myvoice-meeting-system-${startedAt}.wav`));
  setStatus({ stage: 'transcribing', startedAt, percent: 0 });

  try {
    // The system track counts for most of the progress bar: it is usually the longer one.
    const mine = micPath ? await transcribeTrack(micPath, 'mic', (p) => setStatus({ ...status, percent: Math.round(p * 0.4) })) : [];
    const theirs = systemPath ? await transcribeTrack(systemPath, 'system', (p) => setStatus({ ...status, percent: 40 + Math.round(p * 0.6) })) : [];

    const { mode } = resolveMode(getModesState(), null);
    const dictionary = getDictionary();
    // Spoken commands are speech in a meeting, never instructions.
    const pipeline = { ...mode.pipeline, spokenCommands: false, spokenPunctuation: false, formatting: 'off' as const };
    const turns = mergeMeetingSegments(mine, theirs)
      .map((turn) => ({ ...turn, text: processTranscript(turn.text, pipeline, dictionary) }))
      .filter((turn) => turn.text);
    if (turns.length === 0) throw new Error('No speech was found in the recording.');

    const text = formatMeetingTranscript(turns);
    const entry = appendRecordingLog({
      transcript: text,
      modeId: mode.id,
      modeName: mode.name,
      durationMs,
      source: 'meeting',
      fileName: `Meeting ${new Date(startedAt).toLocaleString()}`,
    }, getPreferences().historyRetentionDays);
    return { text, entry };
  } finally {
    if (micPath) rmSync(micPath, { force: true });
    if (systemPath) rmSync(systemPath, { force: true });
    setStatus({ stage: 'idle', startedAt: null, percent: 0 });
  }
}

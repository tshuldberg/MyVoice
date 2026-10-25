import { app } from 'electron';
import { execFile } from 'child_process';
import { rmSync, statSync } from 'fs';
import os from 'os';
import path from 'path';
import { afconvertArgs, audioFilePlan } from './audio-file';
import { getModesState } from './modes-settings';
import { resolveMode } from './modes';
import { canTranslate, effectiveLanguage, getModel, pickInstalledModel } from './model-catalog';
import { installedModelIds, installedModelPath } from './model-manager';
import { getDictionary } from './dictionary-settings';
import { buildVocabularyPrompt } from './dictionary';
import { processTranscript } from './text-pipeline';
import { recommendedThreads } from './whisper-args';
import { transcribe, type RunningTranscription } from './transcriber';
import { appendRecordingLog, type RecordingLogEntry } from './recording-log';
import { getPreferences } from './preferences';

export type FileStage = 'converting' | 'transcribing' | 'done';
export type FileProgress = (stage: FileStage, percent: number) => void;

let whisperCli: string | null = null;
let running: RunningTranscription | null = null;

export function setFileTranscriber(cliPath: string): void {
  whisperCli = cliPath;
}

function convertToWav(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/afconvert', afconvertArgs(input, output), { timeout: 10 * 60_000 }, (error) => {
      if (error) reject(new Error('macOS could not read the audio in this file.'));
      else resolve();
    });
  });
}

// A 16 kHz mono 16-bit WAV holds 32,000 bytes per second; other files get a generous limit.
function timeoutFor(audioPath: string, converted: boolean): number {
  if (!converted) return 2 * 60 * 60_000;
  const seconds = Math.max(1, (statSync(audioPath).size - 44) / 32_000);
  return 60_000 + seconds * 4_000;
}

/**
 * Transcribes an audio file with the selected mode (spoken commands are off:
 * "new line" in a recording is speech, not an instruction) and saves it to History.
 */
export async function transcribeFile(filePath: string, onProgress: FileProgress): Promise<{ text: string; entry: RecordingLogEntry | null }> {
  if (!whisperCli) throw new Error('The speech engine is not ready yet.');
  if (running) throw new Error('Another file is being transcribed.');

  const plan = audioFilePlan(filePath);
  if (plan === 'unsupported') throw new Error('This file type is not supported. Use WAV, MP3, M4A, FLAC, Ogg, AIFF or a video with sound.');

  const { mode } = resolveMode(getModesState(), null);
  const modelId = pickInstalledModel(mode.modelId, installedModelIds());
  const modelPath = modelId ? installedModelPath(modelId) : null;
  if (!modelId || !modelPath) throw new Error('No speech model is downloaded.');
  const model = getModel(modelId)!;

  let audioPath = filePath;
  const converted = plan === 'convert';
  if (converted) {
    onProgress('converting', 0);
    audioPath = path.join(app.getPath('temp'), `myvoice-file-${Date.now()}.wav`);
    await convertToWav(filePath, audioPath);
  }

  try {
    onProgress('transcribing', 0);
    const dictionary = getDictionary();
    running = transcribe(whisperCli, {
      modelPath,
      audioPath,
      language: effectiveLanguage(model, mode.language),
      translate: mode.translateToEnglish && canTranslate(model, mode.language),
      prompt: mode.pipeline.useDictionary ? buildVocabularyPrompt(dictionary.vocabulary) : null,
      threads: recommendedThreads(os.cpus().length),
    }, timeoutFor(audioPath, converted), (percent) => onProgress('transcribing', percent));
    const { text: raw, elapsedMs } = await running.result;

    const text = processTranscript(raw, { ...mode.pipeline, spokenCommands: false, spokenPunctuation: false }, dictionary);
    if (!text) throw new Error('No speech was found in this file.');

    const entry = appendRecordingLog({
      transcript: text,
      raw,
      modeId: mode.id,
      modeName: mode.name,
      modelId,
      transcribeMs: elapsedMs,
      source: 'file',
      fileName: path.basename(filePath),
    }, getPreferences().historyRetentionDays);
    onProgress('done', 100);
    return { text, entry };
  } finally {
    running = null;
    if (converted) rmSync(audioPath, { force: true });
  }
}

export function cancelFileTranscription(): void {
  running?.cancel();
}

import { spawn, type ChildProcess } from 'child_process';
import { buildWhisperArgs, type WhisperArgsInput } from './whisper-args';
import { parseWhisperProgress } from './audio-file';

export interface TranscriptionResult {
  text: string;
  elapsedMs: number;
}

export interface RunningTranscription {
  result: Promise<TranscriptionResult>;
  cancel(): void;
}

/**
 * Runs whisper-cli once. stdout is the transcript; stderr carries logs and,
 * with `onProgress`, "progress = N%" lines for long files.
 */
export function transcribe(
  whisperCli: string,
  input: WhisperArgsInput,
  timeoutMs: number,
  onProgress?: (percent: number) => void,
): RunningTranscription {
  const args = buildWhisperArgs(input);
  if (onProgress) args.splice(args.length - 2, 0, '--print-progress');

  const startedAt = Date.now();
  let child: ChildProcess | null = null;
  let cancelled = false;

  const result = new Promise<TranscriptionResult>((resolve, reject) => {
    child = spawn(whisperCli, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child?.kill('SIGKILL');
      reject(new Error(`whisper-cli timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stderr = (stderr + text).slice(-8000);
      if (onProgress) {
        const percent = parseWhisperProgress(text);
        if (percent !== null) onProgress(percent);
      }
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (cancelled) {
        reject(new Error('cancelled'));
      } else if (code === 0) {
        resolve({ text: stdout.trim(), elapsedMs: Date.now() - startedAt });
      } else {
        reject(new Error(`whisper-cli exited with code ${code}: ${stderr.trim().split('\n').slice(-3).join(' ')}`));
      }
    });
  });

  return {
    result,
    cancel() {
      cancelled = true;
      child?.kill('SIGKILL');
    },
  };
}

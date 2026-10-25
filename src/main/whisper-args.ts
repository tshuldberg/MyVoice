// Builds whisper-cli arguments. Pure, so flag choices are unit tested.

export interface WhisperArgsInput {
  modelPath: string;
  audioPath: string;
  /** 'auto' or a language code. */
  language: string;
  translate: boolean;
  /** Vocabulary hint passed as the initial prompt. */
  prompt: string | null;
  threads: number;
}

export function buildWhisperArgs(input: WhisperArgsInput): string[] {
  const args = [
    '-m', input.modelPath,
    '--no-timestamps',
    '-l', input.language,
    '-t', String(input.threads),
  ];
  if (input.translate) args.push('--translate');
  if (input.prompt) args.push('--prompt', input.prompt);
  args.push('-f', input.audioPath);
  return args;
}

/**
 * CPU threads for whisper. Metal does most of the work on Apple silicon, so a
 * few threads are enough; leave headroom for the app the user is typing in.
 */
export function recommendedThreads(cpuCount: number): number {
  return Math.max(1, Math.min(4, cpuCount - 2));
}

/** Allows for slower models and long dictations: 30 s plus three times the audio length. */
export function transcriptionTimeoutMs(audioDurationMs: number): number {
  return 30_000 + Math.max(0, audioDurationMs) * 3;
}

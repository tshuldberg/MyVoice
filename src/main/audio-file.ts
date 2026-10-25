import path from 'path';

// Which audio files can be transcribed, and how. whisper-cli decodes WAV, MP3,
// FLAC and Ogg Vorbis itself; AAC-family files are converted first with
// macOS's own afconvert. Pure, so the rules are unit tested.

export type AudioFilePlan = 'direct' | 'convert' | 'unsupported';

const DIRECT = new Set(['.wav', '.mp3', '.flac', '.ogg', '.oga']);
const CONVERT = new Set(['.m4a', '.aac', '.aiff', '.aif', '.aifc', '.caf', '.mp4', '.m4v', '.mov']);

export const SUPPORTED_AUDIO_EXTENSIONS = [...DIRECT, ...CONVERT].map((ext) => ext.slice(1));

export function audioFilePlan(filePath: string): AudioFilePlan {
  const ext = path.extname(filePath).toLowerCase();
  if (DIRECT.has(ext)) return 'direct';
  if (CONVERT.has(ext)) return 'convert';
  return 'unsupported';
}

/** afconvert arguments for a 16 kHz mono 16-bit WAV, the format whisper works in. */
export function afconvertArgs(inputPath: string, outputPath: string): string[] {
  return ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', inputPath, outputPath];
}

/** Reads whisper-cli's "progress = 42%" lines (printed with --print-progress). */
export function parseWhisperProgress(chunk: string): number | null {
  const matches = [...chunk.matchAll(/progress\s*=\s*(\d{1,3})%/g)];
  if (matches.length === 0) return null;
  return Math.min(100, Number(matches[matches.length - 1][1]));
}

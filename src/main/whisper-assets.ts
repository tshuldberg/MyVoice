import { accessSync, constants, createReadStream, createWriteStream, mkdirSync, renameSync, rmSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as NodeReadableStream } from 'stream/web';
import path from 'path';

// Kept free of Electron imports so the lookup and integrity rules can be unit tested with plain Node.

export interface ModelSpec {
  fileName: string;
  url: string;
  sha256: string;
  sizeBytes: number;
}

// Pinned to a Hugging Face commit so the bytes behind the URL cannot change under the hash.
const MODEL_REPO_REVISION = '5359861c739e955e79d9a303bcbc70fb988958b1';

export const BASE_EN_MODEL: ModelSpec = {
  fileName: 'ggml-base.en.bin',
  url: `https://huggingface.co/ggerganov/whisper.cpp/resolve/${MODEL_REPO_REVISION}/ggml-base.en.bin`,
  sha256: 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002',
  sizeBytes: 147_964_211,
};

export interface WhisperCliLookup {
  isPackaged: boolean;
  /** process.resourcesPath of the packaged app. */
  resourcesPath: string;
  /** Repository root when running from source. */
  appRoot: string;
}

/**
 * Where to look for whisper-cli, in order. A packaged app only trusts the copy
 * it ships with; Homebrew paths are a convenience for running from source.
 */
export function whisperCliCandidates(lookup: WhisperCliLookup): string[] {
  if (lookup.isPackaged) {
    return [path.join(lookup.resourcesPath, 'bin', 'whisper-cli')];
  }
  return [
    path.join(lookup.appRoot, 'resources', 'bin', 'whisper-cli'),
    '/opt/homebrew/bin/whisper-cli',
    '/usr/local/bin/whisper-cli',
  ];
}

export function findExecutable(candidates: string[]): string | null {
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // not found, try next
    }
  }
  return null;
}

/**
 * Model locations, in order: the app's own folder, then the whisper.cpp cache
 * that MyVoice 0.2 used, so existing installs do not download again.
 */
export function modelCandidates(userDataDir: string, homeDir: string, spec: ModelSpec = BASE_EN_MODEL): string[] {
  return [
    path.join(userDataDir, 'models', spec.fileName),
    path.join(homeDir, '.cache', 'whisper', spec.fileName),
  ];
}

export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

export async function isModelFileValid(filePath: string, spec: ModelSpec = BASE_EN_MODEL): Promise<boolean> {
  try {
    if (statSync(filePath).size !== spec.sizeBytes) return false;
    return (await sha256File(filePath)) === spec.sha256;
  } catch {
    return false;
  }
}

/** Returns the first candidate whose size and SHA-256 match the pinned model. */
export async function findValidModel(candidates: string[], spec: ModelSpec = BASE_EN_MODEL): Promise<string | null> {
  for (const candidate of candidates) {
    if (await isModelFileValid(candidate, spec)) return candidate;
  }
  return null;
}

export class ModelIntegrityError extends Error {}

/**
 * Downloads to `<destPath>.download`, hashing while streaming, and only moves the
 * file into place when the byte count and SHA-256 match. A failed or tampered
 * download never reaches destPath.
 */
export async function downloadVerifiedFile(
  url: string,
  destPath: string,
  expected: Pick<ModelSpec, 'sha256' | 'sizeBytes'>,
  onProgress?: (receivedBytes: number, totalBytes: number) => void,
): Promise<void> {
  mkdirSync(path.dirname(destPath), { recursive: true });
  const tempPath = `${destPath}.download`;
  rmSync(tempPath, { force: true });

  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  const hash = createHash('sha256');
  let received = 0;
  const verifier = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > expected.sizeBytes) {
        callback(new ModelIntegrityError('The download is larger than the expected model.'));
        return;
      }
      hash.update(chunk);
      onProgress?.(received, expected.sizeBytes);
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body as unknown as NodeReadableStream),
      verifier,
      createWriteStream(tempPath),
    );
    if (received !== expected.sizeBytes || hash.digest('hex') !== expected.sha256) {
      throw new ModelIntegrityError('The downloaded model did not match its published checksum.');
    }
    renameSync(tempPath, destPath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}

export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { silentWav } from '../dist/main/wav.js';

test('silent WAV has a valid 16 kHz mono 16-bit PCM header', () => {
  const wav = silentWav(500);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(20), 1); // PCM
  assert.equal(wav.readUInt16LE(22), 1); // mono
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), 16000); // 0.5 s x 16000 samples x 2 bytes
  assert.equal(wav.length, 44 + 16000);
  assert.equal(wav.readUInt32LE(4), wav.length - 8);
});

test('silent WAV samples are all zero', () => {
  const samples = silentWav(100).subarray(44);
  assert.ok(samples.every((byte) => byte === 0));
});

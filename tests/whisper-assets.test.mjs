import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  BASE_EN_MODEL,
  ModelIntegrityError,
  downloadVerifiedFile,
  findValidModel,
  isModelFileValid,
  modelCandidates,
  whisperCliCandidates,
} from '../dist/main/whisper-assets.js';

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const tempDir = () => mkdtempSync(path.join(tmpdir(), 'myvoice-test-'));

test('packaged app only trusts the whisper-cli bundled in Resources', () => {
  const candidates = whisperCliCandidates({
    isPackaged: true,
    resourcesPath: '/Applications/MyVoice.app/Contents/Resources',
    appRoot: '/ignored',
  });
  assert.deepEqual(candidates, ['/Applications/MyVoice.app/Contents/Resources/bin/whisper-cli']);
  assert.ok(candidates.every((candidate) => !candidate.includes('homebrew')));
});

test('running from source prefers the repo build, then Homebrew', () => {
  const candidates = whisperCliCandidates({ isPackaged: false, resourcesPath: '/ignored', appRoot: '/repo' });
  assert.deepEqual(candidates, [
    '/repo/resources/bin/whisper-cli',
    '/opt/homebrew/bin/whisper-cli',
    '/usr/local/bin/whisper-cli',
  ]);
});

test('model lookup checks the app folder first, then the 0.2 cache', () => {
  assert.deepEqual(modelCandidates('/support/MyVoice', '/Users/me'), [
    '/support/MyVoice/models/ggml-base.en.bin',
    '/Users/me/.cache/whisper/ggml-base.en.bin',
  ]);
});

test('the model download is pinned to a commit and a SHA-256', () => {
  assert.match(BASE_EN_MODEL.url, /^https:\/\/huggingface\.co\/ggerganov\/whisper\.cpp\/resolve\/[0-9a-f]{40}\/ggml-base\.en\.bin$/);
  assert.match(BASE_EN_MODEL.sha256, /^[0-9a-f]{64}$/);
  assert.equal(BASE_EN_MODEL.sizeBytes, 147_964_211);
});

test('a model file is valid only when size and hash both match', async () => {
  const dir = tempDir();
  const bytes = Buffer.from('pretend model weights');
  const spec = { ...BASE_EN_MODEL, sha256: sha256(bytes), sizeBytes: bytes.length };

  const good = path.join(dir, 'good.bin');
  writeFileSync(good, bytes);
  const truncated = path.join(dir, 'truncated.bin');
  writeFileSync(truncated, bytes.subarray(0, 5));
  const tampered = path.join(dir, 'tampered.bin');
  writeFileSync(tampered, Buffer.from('pretend model weightz'));

  assert.equal(await isModelFileValid(good, spec), true);
  assert.equal(await isModelFileValid(truncated, spec), false);
  assert.equal(await isModelFileValid(tampered, spec), false);
  assert.equal(await isModelFileValid(path.join(dir, 'absent.bin'), spec), false);
  assert.equal(await findValidModel([tampered, good], spec), good);
  assert.equal(await findValidModel([tampered, truncated], spec), null);
});

async function withServer(routes, run) {
  const server = createServer((req, res) => {
    const route = routes[req.url];
    if (!route) {
      res.writeHead(404).end();
      return;
    }
    route(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('download follows redirects and moves the file into place only after verification', async () => {
  const body = Buffer.alloc(64 * 1024, 7);
  const expected = { sha256: sha256(body), sizeBytes: body.length };
  const dest = path.join(tempDir(), 'models', 'model.bin');
  const progress = [];

  await withServer({
    '/resolve': (res) => res.writeHead(302, { Location: '/cdn/model.bin' }).end(),
    '/cdn/model.bin': (res) => res.writeHead(200, { 'Content-Length': body.length }).end(body),
  }, async (base) => {
    await downloadVerifiedFile(`${base}/resolve`, dest, expected, (received, total) => progress.push([received, total]));
  });

  assert.deepEqual(readFileSync(dest), body);
  assert.equal(existsSync(`${dest}.download`), false);
  assert.deepEqual(progress.at(-1), [body.length, body.length]);
});

test('a download with the wrong checksum is deleted and never reaches the destination', async () => {
  const body = Buffer.from('tampered bytes!!');
  const expected = { sha256: sha256(Buffer.from('original bytes!!')), sizeBytes: body.length };
  const dest = path.join(tempDir(), 'model.bin');

  await withServer({ '/model.bin': (res) => res.writeHead(200).end(body) }, async (base) => {
    await assert.rejects(downloadVerifiedFile(`${base}/model.bin`, dest, expected), ModelIntegrityError);
  });

  assert.equal(existsSync(dest), false);
  assert.equal(existsSync(`${dest}.download`), false);
});

test('a download larger than the expected model is stopped', async () => {
  const body = Buffer.alloc(2048, 1);
  const expected = { sha256: sha256(body.subarray(0, 1024)), sizeBytes: 1024 };
  const dest = path.join(tempDir(), 'model.bin');

  await withServer({ '/model.bin': (res) => res.writeHead(200).end(body) }, async (base) => {
    await assert.rejects(downloadVerifiedFile(`${base}/model.bin`, dest, expected), ModelIntegrityError);
  });

  assert.equal(existsSync(dest), false);
  assert.equal(existsSync(`${dest}.download`), false);
});

test('an HTTP error is reported and leaves nothing behind', async () => {
  const dest = path.join(tempDir(), 'model.bin');
  await withServer({}, async (base) => {
    await assert.rejects(
      downloadVerifiedFile(`${base}/missing.bin`, dest, { sha256: '0'.repeat(64), sizeBytes: 1 }),
      /HTTP 404/,
    );
  });
  assert.equal(existsSync(dest), false);
});

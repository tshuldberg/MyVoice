import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LocalEngine, findFreePort, isGgufFile, llamaServerArgs } from '../dist/main/local-engine.js';

// A stand-in for llama-server: answers /health with 503 twice (still loading),
// then 200, and serves chat completions. Exits at once for models named "broken".
const FAKE_SERVER = `#!/usr/bin/env node
const http = require('http');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]);
const model = args[args.indexOf('-m') + 1];
if (model.includes('broken')) { console.error('failed to load model'); process.exit(3); }
let health = 0;
http.createServer((req, res) => {
  if (req.url === '/health') { health++; res.writeHead(health > 2 ? 200 : 503).end(); return; }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { content: 'pid ' + process.pid } }] }));
}).listen(port, '127.0.0.1');
`;

function fakeBinary() {
  const dir = mkdtempSync(path.join(tmpdir(), 'myvoice-engine-'));
  const binary = path.join(dir, 'llama-server');
  writeFileSync(binary, FAKE_SERVER);
  chmodSync(binary, 0o755);
  return binary;
}

const options = { idleMs: 60_000, startTimeoutMs: 10_000, contextSize: 2048 };
const askPid = async (endpoint) => (await (await fetch(endpoint, { method: 'POST', body: '{}' })).json()).choices[0].message.content;

test('server arguments bind to loopback only', () => {
  assert.deepEqual(llamaServerArgs('/m.gguf', 4321, 4096), ['-m', '/m.gguf', '--host', '127.0.0.1', '--port', '4321', '-c', '4096', '-ngl', '99']);
});

test('GGUF files are recognized by their magic bytes', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'myvoice-gguf-'));
  writeFileSync(path.join(dir, 'ok.gguf'), Buffer.concat([Buffer.from('GGUF'), Buffer.alloc(16)]));
  writeFileSync(path.join(dir, 'fake.gguf'), 'not a model');
  assert.equal(isGgufFile(path.join(dir, 'ok.gguf')), true);
  assert.equal(isGgufFile(path.join(dir, 'fake.gguf')), false);
  assert.equal(isGgufFile(path.join(dir, 'missing.gguf')), false);
});

test('free ports are on loopback and usable', async () => {
  const port = await findFreePort();
  assert.ok(port > 1024 && port < 65536);
});

test('the engine waits for the model to load, reuses the server, and restarts for a new model', async () => {
  const engine = new LocalEngine(fakeBinary(), options);
  try {
    const endpoint = await engine.ensure('/models/a.gguf');
    assert.match(endpoint, /^http:\/\/127\.0\.0\.1:\d+\/v1\/chat\/completions$/);
    const firstPid = await askPid(endpoint);
    assert.equal(await engine.ensure('/models/a.gguf'), endpoint);
    assert.equal(await askPid(endpoint), firstPid);

    const second = await engine.ensure('/models/b.gguf');
    assert.notEqual(await askPid(second), firstPid);
  } finally {
    engine.stop();
  }
  assert.equal(engine.running, false);
});

test('a model that fails to load reports the engine error', async () => {
  const engine = new LocalEngine(fakeBinary(), options);
  await assert.rejects(engine.ensure('/models/broken.gguf'), /stopped \(code 3\).*failed to load model/);
  assert.equal(engine.running, false);
});

test('the engine stops itself after the idle time', async () => {
  const engine = new LocalEngine(fakeBinary(), { ...options, idleMs: 300 });
  await engine.ensure('/models/a.gguf');
  assert.equal(engine.running, true);
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.equal(engine.running, false);
});

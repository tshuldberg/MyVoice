import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  DEFAULT_LOCAL_AI,
  acceptCleanup,
  buildCleanupRequest,
  isLoopbackEndpoint,
  normalizeLocalAiSettings,
  parseCleanupResponse,
  runLocalCleanup,
} from '../dist/main/local-ai.js';

test('only servers on this Mac are accepted', () => {
  assert.equal(isLoopbackEndpoint('http://127.0.0.1:11434/v1/chat/completions'), true);
  assert.equal(isLoopbackEndpoint('http://localhost:1234/v1/chat/completions'), true);
  assert.equal(isLoopbackEndpoint('http://[::1]:8080/v1/chat/completions'), true);
  assert.equal(isLoopbackEndpoint('https://api.openai.com/v1/chat/completions'), false);
  assert.equal(isLoopbackEndpoint('http://127.0.0.1.example.com/v1'), false);
  assert.equal(isLoopbackEndpoint('file:///etc/passwd'), false);
  assert.equal(normalizeLocalAiSettings({ endpoint: 'http://192.168.1.5:11434/v1/chat/completions' }).endpoint, DEFAULT_LOCAL_AI.endpoint);
});

test('settings default to off and are validated', () => {
  const settings = normalizeLocalAiSettings({ enabled: 'yes', model: '  ', timeoutMs: 5 });
  assert.equal(settings.enabled, false);
  assert.equal(settings.model, DEFAULT_LOCAL_AI.model);
  assert.equal(settings.timeoutMs, DEFAULT_LOCAL_AI.timeoutMs);
});

test('the request is an OpenAI-compatible chat completion with the app as context', () => {
  const body = buildCleanupRequest(DEFAULT_LOCAL_AI, 'um hello', { appName: 'Mail' });
  assert.equal(body.model, DEFAULT_LOCAL_AI.model);
  assert.equal(body.stream, false);
  assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /inserted into Mail\.$/);
  assert.deepEqual(body.messages[1], { role: 'user', content: 'um hello' });
});

test('responses are read and reasoning blocks dropped', () => {
  assert.equal(parseCleanupResponse({ choices: [{ message: { content: '<think>hmm</think>\nHello.' } }] }), 'Hello.');
  assert.equal(parseCleanupResponse({ choices: [] }), null);
  assert.equal(parseCleanupResponse({ error: 'bad' }), null);
});

test('answers, summaries and empty replies are rejected', () => {
  const original = 'so the plan for next week is that we ship the beta on tuesday and then collect feedback';
  assert.equal(acceptCleanup(original, 'So the plan for next week: we ship the beta on Tuesday, then collect feedback.'), true);
  assert.equal(acceptCleanup(original, 'Beta Tuesday.'), false);
  assert.equal(acceptCleanup(original, `${original} ${original} Here is some extra advice for you.`), false);
  assert.equal(acceptCleanup('hi', ''), false);
  assert.equal(acceptCleanup('hi there', 'Hi there.'), true);
});

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}/v1/chat/completions`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

const settingsFor = (endpoint, extra = {}) => ({ ...DEFAULT_LOCAL_AI, enabled: true, endpoint, ...extra });

test('a working local server cleans the text', async () => {
  let received = null;
  await withServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      received = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'This is a test of the cleanup.' } }] }));
    });
  }, async (endpoint) => {
    const outcome = await runLocalCleanup(settingsFor(endpoint), 'um this is a test of the the cleanup');
    assert.deepEqual(outcome, { status: 'cleaned', text: 'This is a test of the cleanup.' });
  });
  assert.equal(received.messages[1].content, 'um this is a test of the the cleanup');
});

test('failures fall back to the original text', async () => {
  const text = 'keep this text exactly as it is please';
  assert.equal((await runLocalCleanup({ ...DEFAULT_LOCAL_AI }, text)).status, 'skipped');
  assert.equal((await runLocalCleanup(settingsFor('https://api.example.com/v1/chat/completions'), text)).status, 'skipped');

  await withServer((_req, res) => res.writeHead(500).end(), async (endpoint) => {
    assert.deepEqual(await runLocalCleanup(settingsFor(endpoint), text), { status: 'failed', text, reason: 'The model server returned HTTP 500.' });
  });
  await withServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'Sure! Here is a poem about text instead.' } }] }));
  }, async (endpoint) => {
    const outcome = await runLocalCleanup(settingsFor(endpoint), 'keep this short');
    assert.equal(outcome.status, 'rejected');
    assert.equal(outcome.text, 'keep this short');
  });
  await withServer(() => { /* never answers */ }, async (endpoint) => {
    const outcome = await runLocalCleanup(settingsFor(endpoint, { timeoutMs: 1000 }), text);
    assert.equal(outcome.status, 'failed');
    assert.equal(outcome.text, text);
  });
});

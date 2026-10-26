import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendHistoryEntry } from '../dist/main/history-core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'cli', 'myvoice-history.js');

function historyFolder() {
  const folder = mkdtempSync(path.join(tmpdir(), 'myvoice-cli-'));
  appendHistoryEntry(folder, { transcript: 'Ship the beta on Tuesday', appName: 'Slack', modeName: 'Default', durationMs: 3000 });
  appendHistoryEntry(folder, { transcript: 'Budget review notes', appName: 'Notes', modeName: 'Notes', durationMs: 4000 });
  return folder;
}

const run = (folder, args) => spawnSync(process.execPath, [cli, ...args], {
  encoding: 'utf8',
  env: { ...process.env, MYVOICE_HISTORY_DIR: folder },
});

test('search, recent and stats read the history folder', () => {
  const folder = historyFolder();
  const found = run(folder, ['search', 'beta', 'tuesday']);
  assert.equal(found.status, 0);
  assert.match(found.stdout, /Slack \| Default mode\] Ship the beta on Tuesday/);

  const json = JSON.parse(run(folder, ['search', 'budget', '--json']).stdout);
  assert.deepEqual(json.map((entry) => entry.transcript), ['Budget review notes']);

  assert.equal(run(folder, ['recent', '--days', '1', '--json']).stdout.includes('Ship the beta'), true);
  assert.match(run(folder, ['stats']).stdout, /Last 7 days: 2 dictations, 8 words/);
});

test('bad usage exits with code 2', () => {
  const folder = historyFolder();
  assert.equal(run(folder, ['search']).status, 2);
  assert.equal(run(folder, ['delete-everything']).status, 2);
});

function mcpSession(folder, messages) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'mcp'], { env: { ...process.env, MYVOICE_HISTORY_DIR: folder } });
    const responses = [];
    let buffer = '';
    const expected = messages.filter((message) => message.id !== undefined).length;
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) if (line.trim()) responses.push(JSON.parse(line));
      if (responses.length >= expected) {
        child.kill();
        resolve(responses);
      }
    });
    child.on('error', reject);
    setTimeout(() => { child.kill(); reject(new Error('MCP server did not answer')); }, 5000);
    for (const message of messages) child.stdin.write(`${JSON.stringify(message)}\n`);
  });
}

test('the MCP server lists its tools and answers tool calls', async () => {
  const folder = historyFolder();
  const responses = await mcpSession(folder, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_dictation_history', arguments: { query: 'budget' } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'dictation_stats', arguments: {} } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'format_disk' } },
    { jsonrpc: '2.0', id: 6, method: 'resources/list' },
  ]);
  const byId = Object.fromEntries(responses.map((response) => [response.id, response]));
  assert.equal(byId[1].result.serverInfo.name, 'myvoice-history');
  assert.equal(byId[1].result.protocolVersion, '2025-03-26');
  assert.deepEqual(byId[2].result.tools.map((tool) => tool.name), ['search_dictation_history', 'recent_dictations', 'dictation_stats']);
  assert.match(byId[3].result.content[0].text, /Budget review notes/);
  assert.match(byId[4].result.content[0].text, /All time: 2 dictations/);
  assert.equal(byId[5].error.code, -32602);
  assert.equal(byId[6].error.code, -32601);
  assert.equal(responses.length, 6);
});

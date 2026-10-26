#!/usr/bin/env node
// Read-only access to MyVoice's dictation history from the terminal, and an
// MCP server so assistants such as Claude Code can search it. Local files only;
// nothing is sent anywhere.
//
//   node myvoice-history.js search <words> [--limit N] [--json]
//   node myvoice-history.js recent [--days N] [--json]
//   node myvoice-history.js stats [--json]
//   node myvoice-history.js mcp            (MCP server on stdin/stdout)
//
// MYVOICE_HISTORY_DIR overrides the history folder.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function loadHistoryCore() {
  // Packaged: next to this file. From source: the compiled module in dist/.
  for (const candidate of [path.join(__dirname, 'history-core.js'), path.join(__dirname, '..', 'dist', 'main', 'history-core.js')]) {
    if (fs.existsSync(candidate)) return require(candidate);
  }
  throw new Error('history-core.js not found. From source, run "npm run build:ts" first.');
}

const core = loadHistoryCore();
const VERSION = '0.3.0';
const historyDir = process.env.MYVOICE_HISTORY_DIR
  || path.join(os.homedir(), 'Library', 'Application Support', 'MyVoice', 'recording-logs');

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) return fallback;
  const value = Number(args[index + 1]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function positional(args) {
  const words = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' || args[i] === '--days') i++;
    else if (!args[i].startsWith('--')) words.push(args[i]);
  }
  return words.join(' ');
}

function describe(entry) {
  const parts = [entry.timestamp];
  if (entry.appName) parts.push(entry.appName);
  if (entry.site) parts.push(entry.site);
  if (entry.modeName) parts.push(`${entry.modeName} mode`);
  if (entry.fileName) parts.push(`file ${entry.fileName}`);
  return `[${parts.join(' | ')}] ${entry.transcript}`;
}

function search(query, limit) {
  return core.searchHistory(historyDir, query, limit);
}

function recent(days, limit) {
  return core.readRecentHistory(historyDir, days).slice(0, limit);
}

function stats() {
  return {
    week: core.computeHistoryStats(core.readRecentHistory(historyDir, 7)),
    allTime: core.computeHistoryStats(core.readRecentHistory(historyDir, 36500)),
  };
}

function formatStats(value) {
  const line = (label, s) => `${label}: ${s.dictations} dictations, ${s.words} words, `
    + `${s.wordsPerMinute ?? 'n/a'} words per minute, ${s.minutesSaved} minutes saved`;
  return `${line('Last 7 days', value.week)}\n${line('All time', value.allTime)}`;
}

// --- MCP server (JSON-RPC 2.0, one message per line) -------------------------

const TOOLS = [
  {
    name: 'search_dictation_history',
    description: 'Search everything the user dictated with MyVoice. All words must match; newest first.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to find in the dictated text, app, site or mode' },
        limit: { type: 'number', description: 'Maximum results (default 20, at most 200)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'recent_dictations',
    description: 'The user\'s most recent dictations, newest first.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'How many days back (default 1)' },
        limit: { type: 'number', description: 'Maximum results (default 20, at most 200)' },
      },
    },
  },
  {
    name: 'dictation_stats',
    description: 'Words dictated, speaking speed and typing time saved, for the last week and all time.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const clamp = (value, fallback, max) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(max, Math.floor(number)) : fallback;
};

function callTool(name, args) {
  const params = args && typeof args === 'object' ? args : {};
  if (name === 'search_dictation_history') {
    const query = String(params.query ?? '').trim();
    if (!query) return { isError: true, content: [{ type: 'text', text: 'query is required' }] };
    const results = search(query, clamp(params.limit, 20, 200));
    return { content: [{ type: 'text', text: results.length ? results.map(describe).join('\n') : 'No dictations match.' }] };
  }
  if (name === 'recent_dictations') {
    const results = recent(clamp(params.days, 1, 3650), clamp(params.limit, 20, 200));
    return { content: [{ type: 'text', text: results.length ? results.map(describe).join('\n') : 'No dictations in that period.' }] };
  }
  if (name === 'dictation_stats') {
    return { content: [{ type: 'text', text: formatStats(stats()) }] };
  }
  return null;
}

function handleMessage(message) {
  const { id, method, params } = message;
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, text) => ({ jsonrpc: '2.0', id, error: { code, message: text } });

  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: params?.protocolVersion ?? '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'myvoice-history', version: VERSION },
      });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS });
    case 'tools/call': {
      const result = callTool(params?.name, params?.arguments);
      return result ? reply(result) : fail(-32602, `Unknown tool: ${params?.name}`);
    }
    default:
      // Notifications (no id) never get a reply.
      return id === undefined ? null : fail(-32601, `Method not found: ${method}`);
  }
}

function serveMcp() {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
      if (!line) continue;
      let response;
      try {
        response = handleMessage(JSON.parse(line));
      } catch {
        response = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } };
      }
      if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  });
}

// --- CLI ---------------------------------------------------------------------

function main(argv) {
  const [command, ...args] = argv;
  const json = args.includes('--json');
  const print = (value, text) => process.stdout.write(`${json ? JSON.stringify(value, null, 2) : text}\n`);

  switch (command) {
    case 'search': {
      const query = positional(args);
      if (!query) {
        process.stderr.write('Usage: myvoice-history.js search <words> [--limit N] [--json]\n');
        return 2;
      }
      const results = search(query, option(args, '--limit', 20));
      print(results, results.length ? results.map(describe).join('\n') : 'No dictations match.');
      return 0;
    }
    case 'recent': {
      const results = recent(option(args, '--days', 1), option(args, '--limit', 50));
      print(results, results.length ? results.map(describe).join('\n') : 'No dictations in that period.');
      return 0;
    }
    case 'stats': {
      const value = stats();
      print(value, formatStats(value));
      return 0;
    }
    case 'mcp':
      serveMcp();
      return null;
    default:
      process.stderr.write('Usage: myvoice-history.js <search|recent|stats|mcp> [options]\n');
      return 2;
  }
}

const code = main(process.argv.slice(2));
if (code !== null) process.exitCode = code;

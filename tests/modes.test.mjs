import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILT_IN_MODES,
  MODE_LIMITS,
  assignApp,
  createMode,
  deleteMode,
  normalizeModesState,
  resolveMode,
  selectMode,
  unassignApp,
  updateMode,
} from '../dist/main/modes.js';

const fresh = () => normalizeModesState(undefined);

test('a fresh install has the three built-in modes with Default selected', () => {
  const state = fresh();
  assert.deepEqual(state.modes.map((mode) => mode.id), ['default', 'verbatim', 'notes']);
  assert.equal(state.selectedModeId, 'default');
  assert.ok(state.modes.every((mode) => mode.builtIn));
});

test('Verbatim keeps exact words and turns off spoken line breaks for terminals', () => {
  const verbatim = fresh().modes.find((mode) => mode.id === 'verbatim');
  assert.equal(verbatim.pipeline.formatting, 'off');
  assert.equal(verbatim.pipeline.spokenCommands, false);
  assert.ok(verbatim.apps.some((app) => app.bundleId === 'com.apple.Terminal'));
});

test('the 0.2 formatting choice carries into Default on first run only', () => {
  assert.equal(normalizeModesState(undefined, 'structured').modes[0].pipeline.formatting, 'structured');
  const saved = { modes: [{ id: 'default', pipeline: { formatting: 'off' } }], selectedModeId: 'default' };
  assert.equal(normalizeModesState(saved, 'structured').modes[0].pipeline.formatting, 'off');
});

test('stored values are validated and built-ins cannot be removed by editing the file', () => {
  const state = normalizeModesState({
    modes: [
      { id: 'default', name: '', modelId: 'nope', language: 'xx', insertion: 'teleport', pipeline: { removeFillers: 'yes' } },
      { id: 'BAD ID', name: 'Broken' },
      { id: 'mode-a', name: '  Email  ', builtIn: true, apps: [{ bundleId: 'com.apple.mail', name: 'Mail' }, { bundleId: 'bad id!' }] },
    ],
    selectedModeId: 'missing',
  });
  const [first] = state.modes;
  assert.equal(first.name, 'Default');
  assert.equal(first.modelId, 'base.en');
  assert.equal(first.language, 'en');
  assert.equal(first.insertion, 'paste');
  assert.equal(first.pipeline.removeFillers, true);
  assert.deepEqual(state.modes.map((mode) => mode.id), ['default', 'verbatim', 'notes', 'mode-a']);
  const email = state.modes[3];
  assert.equal(email.name, 'Email');
  assert.equal(email.builtIn, false);
  assert.deepEqual(email.apps, [{ bundleId: 'com.apple.mail', name: 'Mail' }]);
  assert.equal(state.selectedModeId, 'default');
});

test('the frontmost app picks its mode; otherwise the selected mode is used', () => {
  let state = createMode(fresh(), 'Email', 'mode-email');
  state = assignApp(state, 'mode-email', { bundleId: 'com.apple.mail', name: 'Mail' });
  state = selectMode(state, 'notes');
  assert.deepEqual(
    [resolveMode(state, 'com.apple.Mail').mode.id, resolveMode(state, 'com.apple.Mail').reason],
    ['mode-email', 'app'],
  );
  assert.equal(resolveMode(state, 'com.apple.Terminal').mode.id, 'verbatim');
  assert.deepEqual([resolveMode(state, 'com.example.other').mode.id, resolveMode(state, null).reason], ['notes', 'selected']);
});

test('an app belongs to one mode at a time', () => {
  let state = createMode(fresh(), 'Shell', 'mode-shell');
  state = assignApp(state, 'mode-shell', { bundleId: 'com.apple.Terminal', name: 'Terminal' });
  const verbatim = state.modes.find((mode) => mode.id === 'verbatim');
  assert.ok(!verbatim.apps.some((app) => app.bundleId === 'com.apple.Terminal'));
  assert.equal(resolveMode(state, 'com.apple.Terminal').mode.id, 'mode-shell');
  state = unassignApp(state, 'mode-shell', 'com.apple.terminal');
  assert.equal(resolveMode(state, 'com.apple.Terminal').reason, 'selected');
});

test('a new mode copies its base settings but not its apps, and is selected', () => {
  const state = createMode(fresh(), 'Code', 'mode-code', 'verbatim');
  const mode = state.modes.at(-1);
  assert.equal(mode.pipeline.formatting, 'off');
  assert.deepEqual(mode.apps, []);
  assert.equal(mode.builtIn, false);
  assert.equal(state.selectedModeId, 'mode-code');
});

test('updates are validated and cannot change the id or built-in flag', () => {
  let state = updateMode(fresh(), 'default', {
    id: 'hijack',
    builtIn: false,
    name: 'Everyday',
    pipeline: { spokenPunctuation: true },
    modelId: 'small.en',
    insertion: 'type',
    pressReturn: true,
  });
  const mode = state.modes[0];
  assert.deepEqual(
    [mode.id, mode.builtIn, mode.name, mode.pipeline.spokenPunctuation, mode.pipeline.removeFillers, mode.modelId, mode.insertion, mode.pressReturn],
    ['default', true, 'Everyday', true, true, 'small.en', 'type', true],
  );
  state = updateMode(state, 'default', { modelId: 'not-a-model' });
  assert.equal(state.modes[0].modelId, 'small.en');
});

test('built-in modes cannot be deleted; deleting the selected custom mode falls back to Default', () => {
  let state = createMode(fresh(), 'Temp', 'mode-temp');
  assert.equal(deleteMode(state, 'default').modes.length, state.modes.length);
  state = deleteMode(state, 'mode-temp');
  assert.ok(!state.modes.some((mode) => mode.id === 'mode-temp'));
  assert.equal(state.selectedModeId, 'default');
});

test('the number of modes is capped', () => {
  let state = fresh();
  for (let i = 0; i < MODE_LIMITS.count + 5; i++) state = createMode(state, `M${i}`, `mode-${i}`);
  assert.equal(state.modes.length, MODE_LIMITS.count);
  assert.equal(BUILT_IN_MODES.length, 3);
});

test('websites pick a mode before apps, most specific site first', async () => {
  const { assignDomain, unassignDomain } = await import('../dist/main/modes.js');
  let state = createMode(fresh(), 'Mail', 'mode-mail');
  state = createMode(state, 'Docs', 'mode-docs');
  state = assignDomain(state, 'mode-mail', 'https://mail.google.com/mail/u/0');
  state = assignDomain(state, 'mode-docs', 'google.com');
  state = assignApp(state, 'notes', { bundleId: 'com.google.Chrome', name: 'Chrome' });
  assert.deepEqual(
    [resolveMode(state, 'com.google.Chrome', 'mail.google.com').mode.id, resolveMode(state, 'com.google.Chrome', 'mail.google.com').reason],
    ['mode-mail', 'website'],
  );
  assert.equal(resolveMode(state, 'com.google.Chrome', 'docs.google.com').mode.id, 'mode-docs');
  assert.deepEqual([resolveMode(state, 'com.google.Chrome', 'example.com').mode.id, resolveMode(state, 'com.google.Chrome', null).reason], ['notes', 'app']);
  state = unassignDomain(state, 'mode-mail', 'mail.google.com');
  assert.equal(resolveMode(state, 'com.google.Chrome', 'mail.google.com').mode.id, 'mode-docs');
});

test('a website belongs to one mode, and invalid sites are ignored', async () => {
  const { assignDomain } = await import('../dist/main/modes.js');
  let state = createMode(fresh(), 'A', 'mode-a');
  state = assignDomain(state, 'default', 'slack.com');
  state = assignDomain(state, 'mode-a', 'Slack.com');
  assert.deepEqual(state.modes[0].domains, []);
  assert.deepEqual(state.modes.at(-1).domains, ['slack.com']);
  assert.deepEqual(assignDomain(state, 'mode-a', 'not a site'), state);
});

test('AI instructions, AI context and fuzzy vocabulary are stored per mode and default off', () => {
  const mode = fresh().modes[0];
  assert.deepEqual([mode.aiInstructions, mode.aiContext, mode.pipeline.fuzzyVocabulary, mode.domains], ['', false, false, []]);
  const updated = updateMode(fresh(), 'default', {
    aiInstructions: `  ${'x'.repeat(3000)}  `,
    aiContext: true,
    pipeline: { fuzzyVocabulary: true },
    domains: ['https://www.notion.so/page', 'bad domain'],
  }).modes[0];
  assert.equal(updated.aiInstructions.length, 2000);
  assert.equal(updated.aiContext, true);
  assert.equal(updated.pipeline.fuzzyVocabulary, true);
  assert.deepEqual(updated.domains, ['notion.so']);
});

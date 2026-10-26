(() => {
// Modes: what each mode does, which one is in use, and the apps that switch to it.

const listEl = mvElement<HTMLUListElement>('mode-list');
const newEl = mvElement<HTMLButtonElement>('mode-new');
const titleEl = mvElement<HTMLElement>('mode-editor-title');
const useEl = mvElement<HTMLButtonElement>('mode-use');
const deleteEl = mvElement<HTMLButtonElement>('mode-delete');
const nameEl = mvElement<HTMLInputElement>('mode-name');
const formattingEl = mvElement<HTMLSelectElement>('mode-formatting');
const insertionEl = mvElement<HTMLSelectElement>('mode-insertion');
const spellingEl = mvElement<HTMLSelectElement>('mode-spelling');
const modelEl = mvElement<HTMLSelectElement>('mode-model');
const languageEl = mvElement<HTMLSelectElement>('mode-language');
const languageHintEl = mvElement<HTMLElement>('mode-language-hint');
const fillersEl = mvElement<HTMLInputElement>('mode-fillers');
const commandsEl = mvElement<HTMLInputElement>('mode-commands');
const punctuationEl = mvElement<HTMLInputElement>('mode-punctuation');
const dictionaryEl = mvElement<HTMLInputElement>('mode-dictionary');
const fuzzyEl = mvElement<HTMLInputElement>('mode-fuzzy');
const aiContextRowEl = mvElement<HTMLElement>('mode-ai-context-row');
const aiContextEl = mvElement<HTMLInputElement>('mode-ai-context');
const aiInstructionsEl = mvElement<HTMLTextAreaElement>('mode-ai-instructions');
const sitesSectionEl = mvElement<HTMLElement>('mode-sites-section');
const sitesEl = mvElement<HTMLElement>('mode-sites');
const siteFormEl = mvElement<HTMLFormElement>('mode-site-form');
const siteInputEl = mvElement<HTMLInputElement>('mode-site-input');
const translateEl = mvElement<HTMLInputElement>('mode-translate');
const aiEl = mvElement<HTMLInputElement>('mode-ai');
const aiHintEl = mvElement<HTMLElement>('mode-ai-hint');
const returnEl = mvElement<HTMLInputElement>('mode-return');
const appsEl = mvElement<HTMLElement>('mode-apps');
const addAppEl = mvElement<HTMLButtonElement>('mode-add-app');
const recentAppsEl = mvElement<HTMLElement>('mode-recent-apps');

let editingId = 'default';

function currentMode(state: MvAppState): MvMode {
  const modes = state.features.modes.modes;
  return modes.find((mode) => mode.id === editingId) ?? modes[0];
}

function modeSummary(mode: MvMode): string {
  const parts = [{ off: 'Verbatim', basic: 'Basic', structured: 'Structured' }[mode.pipeline.formatting]];
  if (mode.apps.length > 0) parts.push(`${mode.apps.length} app${mode.apps.length === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

function renderList(state: MvAppState): void {
  listEl.textContent = '';
  for (const mode of state.features.modes.modes) {
    const inUse = mode.id === state.features.modes.selectedModeId;
    const button = mvEl('button', { type: 'button', className: `mode-item${mode.id === editingId ? ' editing' : ''}` }, [
      mode.name,
      ...(inUse ? [mvEl('span', { className: 'badge', textContent: 'In use' })] : []),
      mvEl('span', { className: 'meta', textContent: modeSummary(mode) }),
    ]);
    button.setAttribute('aria-pressed', String(mode.id === editingId));
    button.addEventListener('click', () => {
      editingId = mode.id;
      render(state);
    });
    listEl.append(mvEl('li', {}, [button]));
  }
}

function renderEditor(state: MvAppState): void {
  const mode = currentMode(state);
  const features = state.features;
  const inUse = mode.id === features.modes.selectedModeId;
  titleEl.textContent = mode.name;
  useEl.disabled = inUse;
  useEl.textContent = inUse ? 'In Use' : 'Use This Mode';
  deleteEl.classList.toggle('hidden', mode.builtIn);

  if (document.activeElement !== nameEl) nameEl.value = mode.name;
  formattingEl.value = mode.pipeline.formatting;
  insertionEl.value = mode.insertion;
  spellingEl.value = mode.pipeline.spelling;

  const installed = new Set(features.models.status.filter((status) => status.installed).map((status) => status.id));
  mvFillSelect(modelEl, features.models.catalog.map((model) => ({
    value: model.id,
    label: installed.has(model.id) ? model.label : `${model.label} (not downloaded)`,
  })), mode.modelId);

  const model = features.models.catalog.find((entry) => entry.id === mode.modelId);
  const englishOnly = model?.englishOnly ?? true;
  mvFillSelect(languageEl, features.languages.map((language) => ({ value: language.code, label: language.name })), englishOnly ? 'en' : mode.language);
  languageEl.disabled = englishOnly;
  languageHintEl.textContent = englishOnly
    ? 'English models only transcribe English. Pick a multilingual model for other languages.'
    : installed.has(mode.modelId) ? '' : 'Download this model in Models before using the mode.';

  fillersEl.checked = mode.pipeline.removeFillers;
  commandsEl.checked = mode.pipeline.spokenCommands;
  punctuationEl.checked = mode.pipeline.spokenPunctuation;
  dictionaryEl.checked = mode.pipeline.useDictionary;
  fuzzyEl.checked = mode.pipeline.fuzzyVocabulary;
  fuzzyEl.disabled = !mode.pipeline.useDictionary;

  const translatable = Boolean(model?.canTranslate) && mode.language !== 'en';
  translateEl.checked = mode.translateToEnglish && translatable;
  translateEl.disabled = !translatable;

  const aiReady = features.preferences.localAi.enabled;
  aiEl.checked = mode.aiCleanup;
  aiEl.disabled = !aiReady && !mode.aiCleanup;
  aiHintEl.textContent = aiReady ? '' : '(set up Local AI cleanup in Settings first)';
  aiContextRowEl.classList.toggle('hidden', !features.flags.aiScreenContext);
  aiContextEl.checked = mode.aiContext;
  aiContextEl.disabled = !mode.aiCleanup;
  if (document.activeElement !== aiInstructionsEl) aiInstructionsEl.value = mode.aiInstructions;
  aiInstructionsEl.disabled = !mode.aiCleanup;

  sitesSectionEl.classList.toggle('hidden', !(features.flags.websiteModes && features.preferences.websiteModes));
  sitesEl.textContent = '';
  for (const domain of mode.domains) {
    const remove = mvEl('button', { type: 'button', textContent: '×' });
    remove.setAttribute('aria-label', `Remove ${domain}`);
    remove.addEventListener('click', () => mvRun(mvUpdate('app:modes-remove-domain', { modeId: mode.id, domain }), 'Removing website failed'));
    sitesEl.append(mvEl('span', { className: 'chip' }, [domain, remove]));
  }
  if (mode.domains.length === 0) sitesEl.append(mvEl('span', { className: 'hint', textContent: 'No websites yet.' }));

  returnEl.checked = mode.pressReturn;
  returnEl.disabled = mode.insertion === 'copy';

  appsEl.textContent = '';
  for (const app of mode.apps) {
    const remove = mvEl('button', { type: 'button', textContent: '×', title: `Remove ${app.name}` });
    remove.setAttribute('aria-label', `Remove ${app.name}`);
    remove.addEventListener('click', () => mvRun(mvUpdate('app:modes-remove-app', { modeId: mode.id, bundleId: app.bundleId }), 'Removing app failed'));
    appsEl.append(mvEl('span', { className: 'chip', title: app.bundleId }, [app.name, remove]));
  }
  if (mode.apps.length === 0) appsEl.append(mvEl('span', { className: 'hint', textContent: 'No apps yet.' }));

  recentAppsEl.textContent = '';
  const assigned = new Set(features.modes.modes.flatMap((entry) => entry.apps.map((app) => app.bundleId.toLowerCase())));
  const suggestions = features.recentApps.filter((app) => !assigned.has(app.bundleId.toLowerCase()));
  if (suggestions.length > 0) recentAppsEl.append(mvEl('span', { className: 'hint', textContent: 'Apps you dictated into:' }));
  for (const app of suggestions) {
    const chip = mvEl('button', { type: 'button', className: 'chip add', textContent: `+ ${app.name}` });
    chip.addEventListener('click', () => mvRun(mvUpdate('app:modes-add-app', { modeId: mode.id, app }), 'Adding app failed'));
    recentAppsEl.append(chip);
  }
}

function render(state: MvAppState): void {
  if (!state.features.modes.modes.some((mode) => mode.id === editingId)) editingId = state.features.modes.selectedModeId;
  renderList(state);
  renderEditor(state);
}

function patchMode(patch: Record<string, unknown>): void {
  mvRun(mvUpdate('app:modes-update', { id: editingId, patch }), 'Saving mode failed');
}

function patchPipeline(pipeline: Partial<MvMode['pipeline']>): void {
  patchMode({ pipeline });
}

newEl.addEventListener('click', () => mvRun((async () => {
  const before = new Set(mvState?.features.modes.modes.map((mode) => mode.id));
  await mvUpdate('app:modes-create', { name: 'New Mode', basedOn: editingId });
  const created = mvState?.features.modes.modes.find((mode) => !before.has(mode.id));
  if (created && mvState) {
    editingId = created.id;
    render(mvState);
    nameEl.focus();
    nameEl.select();
  }
})(), 'Creating mode failed'));

useEl.addEventListener('click', () => mvRun(mvUpdate('app:modes-select', editingId), 'Selecting mode failed'));
deleteEl.addEventListener('click', () => mvRun(mvUpdate('app:modes-delete', editingId), 'Deleting mode failed'));
nameEl.addEventListener('change', () => patchMode({ name: nameEl.value }));
formattingEl.addEventListener('change', () => patchPipeline({ formatting: formattingEl.value as MvFormatting }));
insertionEl.addEventListener('change', () => patchMode({ insertion: insertionEl.value }));
spellingEl.addEventListener('change', () => patchPipeline({ spelling: spellingEl.value as 'us' | 'uk' }));
modelEl.addEventListener('change', () => patchMode({ modelId: modelEl.value }));
languageEl.addEventListener('change', () => patchMode({ language: languageEl.value }));
fillersEl.addEventListener('change', () => patchPipeline({ removeFillers: fillersEl.checked }));
commandsEl.addEventListener('change', () => patchPipeline({ spokenCommands: commandsEl.checked }));
punctuationEl.addEventListener('change', () => patchPipeline({ spokenPunctuation: punctuationEl.checked }));
dictionaryEl.addEventListener('change', () => patchPipeline({ useDictionary: dictionaryEl.checked }));
fuzzyEl.addEventListener('change', () => patchPipeline({ fuzzyVocabulary: fuzzyEl.checked }));
aiContextEl.addEventListener('change', () => patchMode({ aiContext: aiContextEl.checked }));
aiInstructionsEl.addEventListener('change', () => patchMode({ aiInstructions: aiInstructionsEl.value }));
siteFormEl.addEventListener('submit', (event) => {
  event.preventDefault();
  const domain = siteInputEl.value.trim();
  if (!domain) return;
  mvRun((async () => {
    await mvUpdate('app:modes-add-domain', { modeId: editingId, domain });
    siteInputEl.value = '';
  })(), 'Adding website failed');
});
translateEl.addEventListener('change', () => patchMode({ translateToEnglish: translateEl.checked }));
aiEl.addEventListener('change', () => patchMode({ aiCleanup: aiEl.checked }));
returnEl.addEventListener('change', () => patchMode({ pressReturn: returnEl.checked }));
addAppEl.addEventListener('click', () => mvRun(mvUpdate('app:modes-add-app', { modeId: editingId }), 'Adding app failed'));

mvOnState(render);
})();

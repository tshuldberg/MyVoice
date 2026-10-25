(() => {
// Dictionary: vocabulary terms and replacement rules.

const vocabFormEl = mvElement<HTMLFormElement>('vocab-form');
const vocabInputEl = mvElement<HTMLInputElement>('vocab-input');
const vocabListEl = mvElement<HTMLElement>('vocab-list');
const ruleFormEl = mvElement<HTMLFormElement>('rule-form');
const ruleFromEl = mvElement<HTMLInputElement>('rule-from');
const ruleToEl = mvElement<HTMLTextAreaElement>('rule-to');
const ruleListEl = mvElement<HTMLUListElement>('rule-list');
const importEl = mvElement<HTMLButtonElement>('dictionary-import');
const exportEl = mvElement<HTMLButtonElement>('dictionary-export');

function render(state: MvAppState): void {
  const { vocabulary, replacements } = state.features.dictionary;

  vocabListEl.textContent = '';
  for (const term of vocabulary) {
    const remove = mvEl('button', { type: 'button', textContent: '×' });
    remove.setAttribute('aria-label', `Remove ${term}`);
    remove.addEventListener('click', () => mvRun(mvUpdate('app:dictionary-remove-term', term), 'Removing word failed'));
    vocabListEl.append(mvEl('span', { className: 'chip' }, [term, remove]));
  }
  if (vocabulary.length === 0) vocabListEl.append(mvEl('span', { className: 'hint', textContent: 'No words yet.' }));

  ruleListEl.textContent = '';
  for (const rule of replacements) {
    const remove = mvEl('button', { type: 'button', className: 'btn small', textContent: 'Remove' });
    remove.setAttribute('aria-label', `Remove replacement for ${rule.from}`);
    remove.addEventListener('click', () => mvRun(mvUpdate('app:dictionary-remove-rule', rule.from), 'Removing replacement failed'));
    ruleListEl.append(mvEl('li', {}, [
      mvEl('span', { className: 'rule-from', textContent: rule.from }),
      mvEl('span', { textContent: '→' }),
      mvEl('span', { className: 'rule-to', textContent: rule.to || '(nothing: the words are removed)' }),
      remove,
    ]));
  }
  if (replacements.length === 0) ruleListEl.append(mvEl('li', { className: 'hint', textContent: 'No replacements yet.' }));
}

vocabFormEl.addEventListener('submit', (event) => {
  event.preventDefault();
  const term = vocabInputEl.value.trim();
  if (!term) return;
  mvRun((async () => {
    await mvUpdate('app:dictionary-add-term', term);
    vocabInputEl.value = '';
    vocabInputEl.focus();
  })(), 'Adding word failed');
});

ruleFormEl.addEventListener('submit', (event) => {
  event.preventDefault();
  const from = ruleFromEl.value.trim();
  if (!from) return;
  mvRun((async () => {
    await mvUpdate('app:dictionary-upsert-rule', { from, to: ruleToEl.value });
    ruleFromEl.value = '';
    ruleToEl.value = '';
    ruleFromEl.focus();
  })(), 'Adding replacement failed');
});

importEl.addEventListener('click', () => mvRun(mvUpdate('app:dictionary-import'), 'Import failed'));
exportEl.addEventListener('click', () => mvRun(mvInvoke('app:dictionary-export'), 'Export failed'));

mvOnState(render);
})();

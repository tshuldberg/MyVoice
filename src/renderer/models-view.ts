(() => {
// Models: download, cancel and delete whisper models, with live progress.

const listEl = mvElement<HTMLUListElement>('model-list');
const errors = new Map<string, string>();
let status: MvModelStatus[] = [];

function usedBy(state: MvAppState, modelId: string): string[] {
  return state.features.modes.modes.filter((mode) => mode.modelId === modelId).map((mode) => mode.name);
}

function render(state: MvAppState): void {
  listEl.textContent = '';
  for (const model of state.features.models.catalog) {
    const current = status.find((entry) => entry.id === model.id);
    const modes = usedBy(state, model.id);

    const badges = [
      mvEl('span', { className: 'badge muted', textContent: model.englishOnly ? 'English' : 'Multilingual' }),
      ...(model.canTranslate ? [mvEl('span', { className: 'badge muted', textContent: 'Translates' })] : []),
      ...(current?.installed ? [mvEl('span', { className: 'badge', textContent: 'Downloaded' })] : []),
    ];
    const details = [model.description, mvFormatBytes(model.sizeBytes)];
    if (modes.length > 0) details.push(`Used by ${modes.join(', ')}`);

    const main = mvEl('div', { className: 'model-main' }, [
      mvEl('strong', {}, [model.label, ...badges]),
      mvEl('p', { className: 'hint', textContent: details.join(' · ') }),
    ]);
    const error = errors.get(model.id);
    if (error) main.append(mvEl('p', { className: 'hint', textContent: error }));

    const actions = mvEl('div', { className: 'row' });
    if (current?.downloadPercent !== null && current?.downloadPercent !== undefined) {
      const progress = mvEl('progress', { max: 100, value: current.downloadPercent });
      progress.setAttribute('aria-label', `Downloading ${model.label}`);
      const cancel = mvEl('button', { type: 'button', className: 'btn small', textContent: 'Cancel' });
      cancel.addEventListener('click', () => mvRun(mvInvoke('app:models-cancel', model.id), 'Cancel failed'));
      actions.append(progress, mvEl('span', { className: 'hint', textContent: `${current.downloadPercent}%` }), cancel);
    } else if (current?.installed) {
      if (model.id !== 'base.en') {
        const remove = mvEl('button', { type: 'button', className: 'btn small danger', textContent: 'Delete' });
        remove.setAttribute('aria-label', `Delete ${model.label}`);
        remove.addEventListener('click', () => mvRun(mvUpdate('app:models-delete', model.id), 'Delete failed'));
        actions.append(remove);
      }
    } else {
      const download = mvEl('button', { type: 'button', className: 'btn small', textContent: `Download ${mvFormatBytes(model.sizeBytes)}` });
      download.addEventListener('click', () => mvRun((async () => {
        errors.delete(model.id);
        const result = await mvInvoke<{ ok: boolean; error?: string }>('app:models-download', model.id);
        if (!result.ok && result.error) errors.set(model.id, result.error);
        if (mvState) render(mvState);
      })(), 'Download failed'));
      actions.append(download);
    }

    listEl.append(mvEl('li', {}, [main, actions]));
  }
}

mvOnState((state) => {
  status = state.features.models.status;
  render(state);
});

const installedKey = (list: MvModelStatus[]) => list.filter((entry) => entry.installed).map((entry) => entry.id).join(',');

mvBridge().on('app:models-updated', (payload: unknown) => {
  if (!Array.isArray(payload) || !mvState) return;
  const next = payload as MvModelStatus[];
  const installedChanged = installedKey(next) !== installedKey(status);
  status = next;
  mvState.features.models.status = next;
  // Progress only redraws this list; a finished download or a delete also updates the Modes view.
  if (installedChanged) mvPublishState(mvState);
  else render(mvState);
});
})();

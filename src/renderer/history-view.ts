(() => {
// History: stats, file transcription, search across all days, and per-entry actions.

const statsEl = mvElement<HTMLElement>('stats');
const dropZoneEl = mvElement<HTMLElement>('drop-zone');
const fileChooseEl = mvElement<HTMLButtonElement>('file-choose');
const fileProgressRowEl = mvElement<HTMLElement>('file-progress-row');
const fileProgressEl = mvElement<HTMLProgressElement>('file-progress');
const fileProgressLabelEl = mvElement<HTMLElement>('file-progress-label');
const fileCancelEl = mvElement<HTMLButtonElement>('file-cancel');
const fileResultEl = mvElement<HTMLElement>('file-result');
const searchEl = mvElement<HTMLInputElement>('log-search');
const datePickerEl = mvElement<HTMLInputElement>('log-date-picker');
const logDateEl = mvElement<HTMLElement>('log-date');
const listEl = mvElement<HTMLUListElement>('log-list');
const exportTxtEl = mvElement<HTMLButtonElement>('export-txt');
const exportJsonEl = mvElement<HTMLButtonElement>('export-json');

let activeDate = '';
let entries: MvHistoryEntry[] = [];
let searchTimer: ReturnType<typeof setTimeout> | null = null;

function dateLabel(dateKey: string): string {
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function renderStats(state: MvAppState): void {
  const { week, allTime } = state.features.stats;
  const tile = (value: string, label: string) => mvEl('div', { className: 'stat' }, [mvEl('strong', { textContent: value }), mvEl('span', { textContent: label })]);
  statsEl.textContent = '';
  statsEl.append(
    tile(week.words.toLocaleString(), `words this week (${week.dictations} dictations)`),
    tile(week.wordsPerMinute === null ? 'n/a' : `${week.wordsPerMinute}`, 'words per minute spoken this week'),
    tile(`${week.minutesSaved}`, 'minutes saved this week, compared with typing at 40 wpm'),
    tile(allTime.words.toLocaleString(), `words in all (${allTime.dictations} dictations)`),
  );
}

function entryMeta(entry: MvHistoryEntry, showDate: boolean): string {
  const when = new Date(entry.timestamp);
  const parts = [showDate
    ? when.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })];
  if (entry.source === 'file' && entry.fileName) parts.push(`File: ${entry.fileName}`);
  if (entry.appName) parts.push(entry.appName);
  if (entry.modeName) parts.push(`${entry.modeName} mode`);
  if (entry.durationMs) parts.push(`${Math.round(entry.durationMs / 1000)} s`);
  return parts.join(' · ');
}

function renderList(state: MvAppState | null, showDate: boolean): void {
  listEl.textContent = '';
  if (entries.length === 0) {
    listEl.append(mvEl('li', { textContent: searchEl.value.trim() ? 'Nothing in your history matches that search.' : 'No dictations on this day.' }));
    return;
  }
  const modes = state?.features.modes.modes ?? [];
  for (const entry of entries) {
    const copy = mvEl('button', { type: 'button', className: 'btn small', textContent: 'Copy' });
    copy.addEventListener('click', () => mvRun((async () => {
      await mvInvoke('app:history-copy', entry.transcript);
      copy.textContent = 'Copied';
      setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
    })(), 'Copy failed'));

    const actions = mvEl('div', { className: 'entry-actions' }, [copy]);
    if (entry.raw) {
      const reformat = mvEl('select');
      reformat.setAttribute('aria-label', 'Copy formatted as another mode');
      reformat.append(mvEl('option', { value: '', textContent: 'Copy as mode…' }));
      for (const mode of modes) reformat.append(mvEl('option', { value: mode.id, textContent: mode.name }));
      reformat.addEventListener('change', () => {
        const modeId = reformat.value;
        reformat.value = '';
        if (!modeId) return;
        mvRun((async () => {
          const result = await mvInvoke<{ ok: boolean; text?: string }>('app:history-reformat', { raw: entry.raw, modeId });
          copy.textContent = result.ok ? 'Copied' : 'Nothing to copy';
          setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
        })(), 'Reformat failed');
      });
      actions.append(reformat);
    }

    const remove = mvEl('button', { type: 'button', className: 'btn small danger', textContent: 'Delete' });
    remove.addEventListener('click', () => mvRun((async () => {
      await mvInvoke('app:history-delete', { date: entry.date, id: entry.id });
      entries = entries.filter((item) => item.id !== entry.id);
      renderList(mvState, showDate);
    })(), 'Delete failed'));
    actions.append(remove);

    listEl.append(mvEl('li', {}, [
      mvEl('div', { className: 'entry-meta', textContent: entryMeta(entry, showDate) }),
      mvEl('div', { className: 'entry-text', textContent: entry.transcript }),
      actions,
    ]));
  }
}

async function showDay(dateKey: string): Promise<void> {
  activeDate = dateKey;
  datePickerEl.value = dateKey;
  const day = await mvInvoke<MvHistoryEntry[]>('app:get-log-by-date', dateKey);
  entries = (Array.isArray(day) ? day : []).slice().reverse();
  logDateEl.textContent = `${dateLabel(dateKey)} · ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`;
  renderList(mvState, false);
}

async function runSearch(): Promise<void> {
  const query = searchEl.value.trim();
  if (!query) {
    await showDay(activeDate || mvState?.todayDateKey || '');
    return;
  }
  entries = await mvInvoke<MvHistoryEntry[]>('app:history-search', query);
  logDateEl.textContent = `${entries.length} result${entries.length === 1 ? '' : 's'} across all days`;
  renderList(mvState, true);
}

function exportVisible(format: 'txt' | 'json'): void {
  mvRun(mvInvoke('app:export-log', {
    date: activeDate,
    search: searchEl.value.trim(),
    entries,
    format,
  }), 'Export failed');
}

// --- File transcription

function setFileBusy(busy: boolean): void {
  fileProgressRowEl.classList.toggle('hidden', !busy);
  fileChooseEl.disabled = busy;
}

async function transcribe(run: () => Promise<{ ok: boolean; text?: string; error?: string; cancelled?: boolean }>): Promise<void> {
  fileResultEl.textContent = '';
  setFileBusy(true);
  try {
    const result = await run();
    if (result.cancelled) return;
    fileResultEl.textContent = result.ok
      ? 'Done. The transcript is at the top of your history.'
      : result.error ?? 'The file could not be transcribed.';
    if (result.ok) {
      searchEl.value = '';
      await showDay(mvState?.todayDateKey ?? activeDate);
    }
  } finally {
    setFileBusy(false);
  }
}

fileChooseEl.addEventListener('click', () => mvRun(transcribe(() => mvInvoke('app:file-choose')), 'File transcription failed'));
fileCancelEl.addEventListener('click', () => mvRun(mvInvoke('app:file-cancel'), 'Cancel failed'));

for (const type of ['dragenter', 'dragover']) {
  dropZoneEl.addEventListener(type, (event) => {
    event.preventDefault();
    dropZoneEl.classList.add('over');
  });
}
dropZoneEl.addEventListener('dragleave', () => dropZoneEl.classList.remove('over'));
dropZoneEl.addEventListener('drop', (event) => {
  event.preventDefault();
  dropZoneEl.classList.remove('over');
  const file = (event as DragEvent).dataTransfer?.files?.[0];
  if (!file) return;
  const filePath = (window as unknown as { myvoiceFiles?: { pathForFile(file: File): string } }).myvoiceFiles?.pathForFile(file);
  if (!filePath) return;
  mvRun(transcribe(() => mvInvoke('app:file-transcribe', filePath)), 'File transcription failed');
});
// Dropping anywhere else must not open the file in the window.
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => event.preventDefault());

mvBridge().on('app:file-progress', (payload: unknown) => {
  const data = (payload ?? {}) as { stage?: string; percent?: number; fileName?: string };
  if (data.stage === 'converting') {
    fileProgressEl.removeAttribute('value');
    fileProgressLabelEl.textContent = `Reading ${data.fileName ?? 'file'}…`;
  } else if (data.stage === 'transcribing') {
    fileProgressEl.value = data.percent ?? 0;
    fileProgressLabelEl.textContent = `Transcribing ${data.fileName ?? 'file'}: ${data.percent ?? 0}%`;
  }
});

// --- Wiring

searchEl.addEventListener('input', () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => mvRun(runSearch(), 'Search failed'), 200);
});
datePickerEl.addEventListener('change', () => {
  if (!datePickerEl.value) return;
  searchEl.value = '';
  mvRun(showDay(datePickerEl.value), 'Loading day failed');
});
exportTxtEl.addEventListener('click', () => exportVisible('txt'));
exportJsonEl.addEventListener('click', () => exportVisible('json'));

let initialized = false;
mvOnState((state) => {
  renderStats(state);
  const dates = state.availableLogDates;
  if (dates.length > 0) {
    datePickerEl.min = dates[dates.length - 1];
    datePickerEl.max = dates[0] > state.todayDateKey ? dates[0] : state.todayDateKey;
  }
  if (!initialized) {
    initialized = true;
    activeDate = state.todayDateKey;
    entries = state.todayLog.slice().reverse();
    logDateEl.textContent = `${dateLabel(activeDate)} · ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`;
  }
  if (!searchEl.value.trim()) renderList(state, false);
});

mvBridge().on('app:log-updated', () => mvRun((async () => {
  const state = await mvInvoke<MvAppState>('app:get-state');
  mvState = state;
  renderStats(state);
  if (searchEl.value.trim()) await runSearch();
  else if (activeDate === state.todayDateKey) await showDay(activeDate);
})(), 'Refreshing history failed'));
})();

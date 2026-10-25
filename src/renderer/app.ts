(() => {
// The window shell: tabs, loading state, navigation and the Setup view.
// Each other view lives in its own script and listens for 'myvoice:state'.

const VIEWS: MvView[] = ['settings', 'modes', 'dictionary', 'logs', 'models', 'setup'];

const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-btn[data-view]'));
const sections = Array.from(document.querySelectorAll<HTMLElement>('section[data-view]'));

const microphoneStatusEl = mvElement<HTMLElement>('microphone-status');
const microphoneActionEl = mvElement<HTMLButtonElement>('microphone-action');
const accessibilityStatusEl = mvElement<HTMLElement>('accessibility-status');
const accessibilityActionEl = mvElement<HTMLButtonElement>('accessibility-action');
const accessibilityHelpEl = mvElement<HTMLElement>('accessibility-help');
const finishSetupEl = mvElement<HTMLButtonElement>('finish-setup');
const finishHintEl = mvElement<HTMLElement>('finish-hint');

type PermissionSnapshot = MvAppState['setup']['permissions'];

// Accessibility has no change event, so the Setup view polls while it is open.
const PERMISSION_POLL_MS = 1000;
let permissionPoll: ReturnType<typeof setInterval> | null = null;
let accessibilityRequested = false;

function setActiveView(view: MvView): void {
  for (const tab of tabs) {
    const active = tab.dataset.view === view;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-current', active ? 'page' : 'false');
  }
  for (const section of sections) {
    section.classList.toggle('hidden', section.dataset.view !== view);
  }

  if (view === 'setup') {
    startPermissionPoll();
  } else {
    stopPermissionPoll();
  }
  window.dispatchEvent(new CustomEvent('myvoice:view', { detail: view }));
}

function setStatus(el: HTMLElement, text: string, ok: boolean): void {
  el.textContent = text;
  el.classList.toggle('ok', ok);
  el.classList.toggle('missing', !ok);
}

function renderPermissions(permissions: PermissionSnapshot): void {
  const mic = permissions.microphone;
  if (mic === 'granted') {
    setStatus(microphoneStatusEl, 'Allowed', true);
  } else if (mic === 'not-determined') {
    setStatus(microphoneStatusEl, 'Not asked yet', false);
    microphoneActionEl.textContent = 'Allow Microphone';
  } else {
    setStatus(microphoneStatusEl, 'Turned off', false);
    microphoneActionEl.textContent = 'Open Microphone Settings';
  }
  microphoneActionEl.classList.toggle('hidden', mic === 'granted');

  if (permissions.accessibility) {
    setStatus(accessibilityStatusEl, 'Allowed', true);
  } else {
    setStatus(accessibilityStatusEl, 'Not allowed yet', false);
    accessibilityActionEl.textContent = accessibilityRequested ? 'Open Accessibility Settings' : 'Allow Accessibility';
  }
  accessibilityActionEl.classList.toggle('hidden', permissions.accessibility);
  accessibilityHelpEl.classList.toggle('hidden', permissions.accessibility || !accessibilityRequested);

  const ready = mic === 'granted' && permissions.accessibility;
  finishHintEl.textContent = ready
    ? 'All set. Double-tap fn in any app to dictate.'
    : 'Dictation starts working once both permissions are allowed.';
}

async function refreshPermissions(): Promise<void> {
  renderPermissions(await mvInvoke<PermissionSnapshot>('app:get-permissions'));
}

function startPermissionPoll(): void {
  if (permissionPoll) return;
  permissionPoll = setInterval(() => mvRun(refreshPermissions(), 'Failed to read permissions'), PERMISSION_POLL_MS);
}

function stopPermissionPoll(): void {
  if (!permissionPoll) return;
  clearInterval(permissionPoll);
  permissionPoll = null;
}

async function refreshState(): Promise<void> {
  mvPublishState(await mvInvoke<MvAppState>('app:get-state'));
}

for (const tab of tabs) {
  tab.addEventListener('click', () => setActiveView(tab.dataset.view as MvView));
}

microphoneActionEl.addEventListener('click', () => mvRun((async () => {
  renderPermissions(await mvInvoke<PermissionSnapshot>('app:request-microphone'));
})(), 'Microphone request failed'));

accessibilityActionEl.addEventListener('click', () => mvRun((async () => {
  const permissions = await mvInvoke<PermissionSnapshot>('app:request-accessibility');
  accessibilityRequested = true;
  renderPermissions(permissions);
})(), 'Accessibility request failed'));

finishSetupEl.addEventListener('click', () => mvRun((async () => {
  await mvUpdate('app:complete-setup');
  setActiveView('settings');
})(), 'Finishing setup failed'));

mvOnState((state) => renderPermissions(state.setup.permissions));

mvBridge().on('app:navigate', (payload: unknown) => {
  setActiveView(VIEWS.includes(payload as MvView) ? payload as MvView : 'settings');
});

mvBridge().on('app:state-changed', () => mvRun(refreshState(), 'Failed to reload app state'));

mvRun(refreshState(), 'Failed to load app state');
})();

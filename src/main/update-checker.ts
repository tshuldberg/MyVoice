import { app, dialog, Notification, shell } from 'electron';
import { LATEST_RELEASE_API, REPO_URL, evaluateUpdate, parseLatestRelease, type ReleaseInfo } from './version-check';
import { createJsonStore } from './json-store';
import { getPreferences } from './preferences';
import { isUpdateCheckDue } from './update-schedule';

const RELEASES_PAGE = `${REPO_URL}/releases`;
const AUTOMATIC_CHECK_TICK_MS = 60 * 60 * 1000;

const updateState = createJsonStore<{ lastCheckedAt: number | null }>('update-state.json', (raw) => {
  const value = (raw as { lastCheckedAt?: unknown } | undefined)?.lastCheckedAt;
  return { lastCheckedAt: typeof value === 'number' && Number.isFinite(value) ? value : null };
});

async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  const response = await fetch(LATEST_RELEASE_API, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `MyVoice/${app.getVersion()}`,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 404) return null; // no published release yet
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
  return parseLatestRelease(await response.json());
}

/**
 * `interactive` is the "Check for Updates…" menu item: it always reports the
 * result. The opt-in daily check is silent unless a newer release exists.
 */
export async function checkForUpdates(options: { interactive: boolean } = { interactive: true }): Promise<void> {
  const currentVersion = app.getVersion();

  let latest: ReleaseInfo | null;
  try {
    latest = await fetchLatestRelease();
    updateState.set({ lastCheckedAt: Date.now() });
  } catch (error) {
    console.error('[MyVoice] Update check failed:', error);
    if (!options.interactive) return;
    const choice = await dialog.showMessageBox({
      type: 'warning',
      title: 'Check for Updates',
      message: 'MyVoice could not reach GitHub to check for updates.',
      detail: 'Check your internet connection, or look at the releases page yourself.',
      buttons: ['Open Releases Page', 'OK'],
      defaultId: 1,
      cancelId: 1,
    });
    if (choice.response === 0) await shell.openExternal(RELEASES_PAGE);
    return;
  }

  if (!latest || evaluateUpdate(currentVersion, latest) === 'up-to-date') {
    if (!options.interactive) return;
    await dialog.showMessageBox({
      type: 'info',
      title: 'Check for Updates',
      message: 'MyVoice is up to date.',
      detail: `You have version ${currentVersion}.`,
      buttons: ['OK'],
    });
    return;
  }

  if (!options.interactive) {
    const release = latest;
    const notification = new Notification({
      title: `MyVoice ${release.version} is available`,
      body: 'Click to download it. Your settings and history stay as they are.',
    });
    notification.on('click', () => {
      shell.openExternal(release.downloadUrl ?? release.pageUrl).catch(() => undefined);
    });
    notification.show();
    return;
  }

  const choice = await dialog.showMessageBox({
    type: 'info',
    title: 'Check for Updates',
    message: `MyVoice ${latest.version} is available.`,
    detail: `You have version ${currentVersion}. Download the new version, quit MyVoice, `
      + 'and drag it into Applications to replace this copy. Your settings and history stay as they are.',
    buttons: ['Download', 'Release Notes', 'Later'],
    defaultId: 0,
    cancelId: 2,
  });
  if (choice.response === 0) await shell.openExternal(latest.downloadUrl ?? latest.pageUrl);
  if (choice.response === 1) await shell.openExternal(latest.pageUrl);
}

/** Runs the opt-in daily check. Nothing is sent unless "Check for updates automatically" is on. */
export function startAutomaticUpdateChecks(): void {
  const tick = (): void => {
    if (!getPreferences().autoCheckUpdates) return;
    if (!isUpdateCheckDue(updateState.get().lastCheckedAt, Date.now())) return;
    checkForUpdates({ interactive: false }).catch((error) => console.error('[MyVoice] Automatic update check failed:', error));
  };
  setTimeout(tick, 60_000);
  setInterval(tick, AUTOMATIC_CHECK_TICK_MS);
}

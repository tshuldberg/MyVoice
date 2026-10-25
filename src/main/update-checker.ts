import { app, dialog, shell } from 'electron';
import { LATEST_RELEASE_API, REPO_URL, evaluateUpdate, parseLatestRelease, type ReleaseInfo } from './version-check';

const RELEASES_PAGE = `${REPO_URL}/releases`;

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
 * Runs only when the user picks "Check for Updates…". MyVoice makes no
 * background network requests, so there is no automatic check.
 */
export async function checkForUpdates(): Promise<void> {
  const currentVersion = app.getVersion();

  let latest: ReleaseInfo | null;
  try {
    latest = await fetchLatestRelease();
  } catch (error) {
    console.error('[MyVoice] Update check failed:', error);
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
    await dialog.showMessageBox({
      type: 'info',
      title: 'Check for Updates',
      message: 'MyVoice is up to date.',
      detail: `You have version ${currentVersion}.`,
      buttons: ['OK'],
    });
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

// Pure release-comparison rules for the manual "Check for Updates…" menu item.
// Kept free of Electron imports so they can be unit tested.

export const REPO_URL = 'https://github.com/tshuldberg/MyVoice';
export const LATEST_RELEASE_API = 'https://api.github.com/repos/tshuldberg/MyVoice/releases/latest';

export interface ReleaseInfo {
  version: string;
  pageUrl: string;
  /** The .dmg asset, when the release has one. */
  downloadUrl: string | null;
}

export type UpdateStatus = 'update-available' | 'up-to-date';

type VersionTriple = [number, number, number];

export function parseVersion(value: string): VersionTriple | null {
  const match = String(value).trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Returns a negative number when a < b, 0 when equal, positive when a > b. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) throw new Error(`Cannot compare versions "${a}" and "${b}"`);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

/** Only links inside this repository are ever opened from a release response. */
function isRepoUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(`${REPO_URL}/`);
}

/** Reads the GitHub "latest release" response. Returns null for anything unexpected. */
export function parseLatestRelease(body: unknown): ReleaseInfo | null {
  if (!body || typeof body !== 'object') return null;
  const release = body as {
    tag_name?: unknown;
    html_url?: unknown;
    draft?: unknown;
    prerelease?: unknown;
    assets?: unknown;
  };

  if (release.draft === true || release.prerelease === true) return null;
  if (typeof release.tag_name !== 'string' || !parseVersion(release.tag_name)) return null;
  if (!isRepoUrl(release.html_url)) return null;

  const assets = Array.isArray(release.assets) ? release.assets : [];
  const dmg = assets.find((asset: { name?: unknown; browser_download_url?: unknown }) =>
    typeof asset?.name === 'string'
    && asset.name.toLowerCase().endsWith('.dmg')
    && isRepoUrl(asset.browser_download_url));

  return {
    version: release.tag_name.replace(/^v/, ''),
    pageUrl: release.html_url,
    downloadUrl: dmg ? String(dmg.browser_download_url) : null,
  };
}

export function evaluateUpdate(currentVersion: string, latest: ReleaseInfo): UpdateStatus {
  return compareVersions(latest.version, currentVersion) > 0 ? 'update-available' : 'up-to-date';
}

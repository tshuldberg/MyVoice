// Website-based modes: which browser tab is in front, and which mode its site
// belongs to. Reading a browser's tab needs Apple Events, which macOS asks the
// user to allow per browser, so the feature is off unless the user turns it on.
// Pure, so matching and the scripts are unit tested.

/** Browsers whose front tab URL can be read, and the AppleScript that reads it. */
export const BROWSER_URL_SCRIPTS: Record<string, string> = {
  'com.apple.Safari': 'tell application id "com.apple.Safari" to return URL of front document',
  'com.apple.SafariTechnologyPreview': 'tell application id "com.apple.SafariTechnologyPreview" to return URL of front document',
  'com.google.Chrome': 'tell application id "com.google.Chrome" to return URL of active tab of front window',
  'com.google.Chrome.canary': 'tell application id "com.google.Chrome.canary" to return URL of active tab of front window',
  'com.brave.Browser': 'tell application id "com.brave.Browser" to return URL of active tab of front window',
  'com.microsoft.edgemac': 'tell application id "com.microsoft.edgemac" to return URL of active tab of front window',
  'company.thebrowser.Browser': 'tell application id "company.thebrowser.Browser" to return URL of active tab of front window',
  'com.vivaldi.Vivaldi': 'tell application id "com.vivaldi.Vivaldi" to return URL of active tab of front window',
  'org.chromium.Chromium': 'tell application id "org.chromium.Chromium" to return URL of active tab of front window',
};

export function isSupportedBrowser(bundleId: string | null): bundleId is string {
  return Boolean(bundleId && BROWSER_URL_SCRIPTS[bundleId]);
}

/** "https://mail.google.com/mail/u/0" -> "mail.google.com"; null for non-web URLs. */
export function hostFromUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/**
 * Accepts what people type ("Gmail.com", "https://docs.google.com/x",
 * "*.slack.com") and keeps a bare host name. Returns null for anything else.
 */
export function normalizeDomain(value: unknown): string | null {
  const raw = String(value ?? '').trim().toLowerCase().replace(/^\*\./, '');
  if (!raw) return null;
  const host = raw.includes('://') ? hostFromUrl(raw) : raw.split('/')[0].replace(/^www\./, '');
  if (!host || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || host.length > 253) return null;
  return host;
}

/** A site matches its own host and every subdomain: "google.com" matches "docs.google.com". */
export function domainMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** The most specific match wins: "docs.google.com" beats "google.com". */
export function bestDomainMatch<T extends { domains: string[] }>(items: T[], host: string | null): T | null {
  if (!host) return null;
  let best: { item: T; length: number } | null = null;
  for (const item of items) {
    for (const domain of item.domains) {
      if (domainMatches(host, domain) && (!best || domain.length > best.length)) {
        best = { item, length: domain.length };
      }
    }
  }
  return best?.item ?? null;
}

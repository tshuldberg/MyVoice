// Opt-in automatic update checks: at most once a day, never in the background
// unless the user turned it on. Pure, so the timing is unit tested.

export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function isUpdateCheckDue(lastCheckedAt: number | null, now: number, intervalMs = UPDATE_CHECK_INTERVAL_MS): boolean {
  if (lastCheckedAt === null || !Number.isFinite(lastCheckedAt)) return true;
  // A clock moved backwards counts as due rather than waiting for it to catch up.
  return now - lastCheckedAt >= intervalMs || now < lastCheckedAt;
}

// Built features that wait on a product decision (approvals.md). Each flag
// defaults to the safe "off" state; flipping it is the only step left.
export const FEATURE_FLAGS = {
  /**
   * D3: switch modes by the website in the front browser tab. Also needs
   * com.apple.security.automation.apple-events in entitlements.plist and an
   * NSAppleEventsUsageDescription in electron-builder.json.
   */
  websiteModes: false,
  /** D4: let local AI cleanup see the selected text and the window title. */
  aiScreenContext: false,
} as const;

export type FeatureFlags = typeof FEATURE_FLAGS;

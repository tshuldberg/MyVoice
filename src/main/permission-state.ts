// Pure permission rules, kept free of Electron imports so they can be unit tested.

/** Values returned by Electron's systemPreferences.getMediaAccessStatus on macOS. */
export type MicrophoneStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';

export type PermissionKey = 'microphone' | 'accessibility';

export interface PermissionSnapshot {
  microphone: MicrophoneStatus;
  accessibility: boolean;
}

/** What the Setup button for the microphone should do. */
export type MicrophoneAction = 'request' | 'open-settings' | 'none';

export const PRIVACY_PANE_URLS: Record<PermissionKey, string> = {
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
};

export function missingPermissions(snapshot: PermissionSnapshot): PermissionKey[] {
  const missing: PermissionKey[] = [];
  if (snapshot.microphone !== 'granted') missing.push('microphone');
  if (!snapshot.accessibility) missing.push('accessibility');
  return missing;
}

/** macOS shows its microphone prompt only once; after a denial the user must use System Settings. */
export function microphoneAction(status: MicrophoneStatus): MicrophoneAction {
  if (status === 'granted') return 'none';
  if (status === 'not-determined') return 'request';
  return 'open-settings';
}

/** Setup opens on first launch, and again on any launch where a permission is missing. */
export function shouldShowSetup(snapshot: PermissionSnapshot, setupCompleted: boolean): boolean {
  return !setupCompleted || missingPermissions(snapshot).length > 0;
}

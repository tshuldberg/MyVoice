import { shell, systemPreferences } from 'electron';
import {
  PRIVACY_PANE_URLS,
  microphoneAction,
  type MicrophoneStatus,
  type PermissionKey,
  type PermissionSnapshot,
} from './permission-state';

let lastAccessibility: boolean | null = null;
let accessibilityPrompted = false;
let onAccessibilityGranted: (() => void) | null = null;

/** Called when Accessibility flips from off to on, so the fn listener can be re-armed. */
export function setAccessibilityGrantedHandler(handler: () => void): void {
  onAccessibilityGranted = handler;
}

export function getPermissionSnapshot(): PermissionSnapshot {
  const accessibility = systemPreferences.isTrustedAccessibilityClient(false);
  if (lastAccessibility === false && accessibility) {
    onAccessibilityGranted?.();
  }
  lastAccessibility = accessibility;

  return {
    microphone: systemPreferences.getMediaAccessStatus('microphone') as MicrophoneStatus,
    accessibility,
  };
}

export async function openPrivacyPane(key: PermissionKey): Promise<void> {
  await shell.openExternal(PRIVACY_PANE_URLS[key]);
}

export async function requestMicrophone(): Promise<PermissionSnapshot> {
  const action = microphoneAction(getPermissionSnapshot().microphone);
  if (action === 'request') {
    await systemPreferences.askForMediaAccess('microphone');
  } else if (action === 'open-settings') {
    await openPrivacyPane('microphone');
  }
  return getPermissionSnapshot();
}

export async function requestAccessibility(): Promise<PermissionSnapshot> {
  if (!getPermissionSnapshot().accessibility) {
    if (accessibilityPrompted) {
      await openPrivacyPane('accessibility');
    } else {
      // Adds MyVoice to the Accessibility list and shows the system prompt.
      systemPreferences.isTrustedAccessibilityClient(true);
      accessibilityPrompted = true;
    }
  }
  return getPermissionSnapshot();
}

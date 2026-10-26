import type { AudioInputDevice } from './native-bridge';

// Which microphone to record from. Pure, so the fallback order is unit tested.

export interface InputChoice {
  /** The device the user picked; '' means the macOS default. */
  selectedUID: string;
  /**
   * Skip Bluetooth microphones when another one exists: recording through
   * AirPods switches their playback to low-quality call audio.
   */
  avoidBluetooth: boolean;
}

/** Returns a device UID to use, or '' to follow the macOS default. */
export function chooseInputDevice(devices: AudioInputDevice[], choice: InputChoice): string {
  const usable = (device: AudioInputDevice) => !(choice.avoidBluetooth && device.transport === 'bluetooth');
  const fallback = () => devices.find((device) => device.transport === 'built-in' && usable(device))
    ?? devices.find((device) => usable(device) && device.transport !== 'virtual')
    ?? null;

  if (choice.selectedUID) {
    const selected = devices.find((device) => device.uid === choice.selectedUID);
    // A picked device that is unplugged falls back like the default would.
    if (selected) return selected.uid;
  }

  const current = devices.find((device) => device.isDefault);
  if (!current || usable(current)) return '';
  return fallback()?.uid ?? '';
}

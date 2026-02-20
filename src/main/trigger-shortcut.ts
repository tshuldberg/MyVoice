import { globalShortcut } from 'electron';

let onTrigger: (() => void) | null = null;
let registeredShortcut: string | null = null;
let lastApplyError: string | null = null;

export function setTriggerShortcutHandler(handler: () => void): void {
  onTrigger = handler;
}

export function applyTriggerShortcut(shortcut: string): { ok: boolean; error: string | null } {
  const trimmed = String(shortcut || '').trim();

  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut);
    registeredShortcut = null;
  }

  if (!trimmed) {
    lastApplyError = null;
    return { ok: true, error: null };
  }

  try {
    const didRegister = globalShortcut.register(trimmed, () => {
      onTrigger?.();
    });
    if (!didRegister) {
      lastApplyError = 'Shortcut unavailable. Choose a different key combination.';
      return { ok: false, error: lastApplyError };
    }
    registeredShortcut = trimmed;
    lastApplyError = null;
    return { ok: true, error: null };
  } catch {
    lastApplyError = 'Invalid shortcut format. Example: CommandOrControl+Shift+Space';
    return { ok: false, error: lastApplyError };
  }
}

export function getTriggerShortcutStatus(): { activeShortcut: string | null; error: string | null } {
  return {
    activeShortcut: registeredShortcut,
    error: lastApplyError,
  };
}

export function clearTriggerShortcut(): void {
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut);
    registeredShortcut = null;
  }
  lastApplyError = null;
}

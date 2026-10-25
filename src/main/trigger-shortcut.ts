import { globalShortcut } from 'electron';

export interface ShortcutSlot {
  setHandler(handler: () => void): void;
  apply(shortcut: string): { ok: boolean; error: string | null };
  status(): { activeShortcut: string | null; error: string | null };
  clear(): void;
}

/** One user-configurable global shortcut. */
export function createShortcutSlot(): ShortcutSlot {
  let onTrigger: (() => void) | null = null;
  let registeredShortcut: string | null = null;
  let lastApplyError: string | null = null;

  const unregister = (): void => {
    if (registeredShortcut) {
      globalShortcut.unregister(registeredShortcut);
      registeredShortcut = null;
    }
  };

  return {
    setHandler(handler) {
      onTrigger = handler;
    },
    apply(shortcut) {
      const trimmed = String(shortcut || '').trim();
      unregister();

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
    },
    status() {
      return { activeShortcut: registeredShortcut, error: lastApplyError };
    },
    clear() {
      unregister();
      lastApplyError = null;
    },
  };
}

const triggerSlot = createShortcutSlot();
export const pasteLastShortcut = createShortcutSlot();

export function setTriggerShortcutHandler(handler: () => void): void {
  triggerSlot.setHandler(handler);
}

export function applyTriggerShortcut(shortcut: string): { ok: boolean; error: string | null } {
  return triggerSlot.apply(shortcut);
}

export function getTriggerShortcutStatus(): { activeShortcut: string | null; error: string | null } {
  return triggerSlot.status();
}

export function clearTriggerShortcut(): void {
  triggerSlot.clear();
}

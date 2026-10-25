import { clipboard } from 'electron';
import * as native from './native-bridge';
import type { InsertionMethod } from './modes';
import type { ClipboardBehavior } from './preferences-model';
import { adaptToCaret, type CaretContext } from './insertion-context';

export type DeliveryOutcome = 'pasted' | 'typed' | 'copied';

export interface DeliveryOptions {
  insertion: InsertionMethod;
  pressReturn: boolean;
  clipboard: ClipboardBehavior;
  /** Caret context captured when dictation stopped; null skips smart spacing. */
  caret: CaretContext | null;
  /** Vocabulary terms whose capital letter smart spacing must keep. */
  keepCase: string[];
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Slow apps (some Electron and Java apps) read the pasteboard late, so the
// user's clipboard is put back only after a full second.
const BEFORE_PASTE_MS = 120;
const RESTORE_AFTER_MS = 1000;
const BEFORE_RETURN_MS = 80;

export function readCaretContext(): CaretContext | null {
  try {
    const context = native.focusedTextContext();
    return context ? { secure: context.secure, before: context.before, atStart: context.atStart } : null;
  } catch {
    return null;
  }
}

/** Inserts text at the cursor of the frontmost app, or copies it. */
export async function deliverText(text: string, options: DeliveryOptions): Promise<DeliveryOutcome> {
  if (options.insertion === 'copy') {
    clipboard.writeText(text);
    return 'copied';
  }

  const fitted = adaptToCaret(text, options.caret, options.keepCase);

  if (options.insertion === 'type') {
    native.keyboardType(fitted, 4);
    // keyboardType runs on a background queue at about 4 ms per character.
    await wait(fitted.length * 5 + BEFORE_RETURN_MS);
  } else {
    if (options.clipboard === 'restore') native.pasteboardSave();
    const changeCount = native.pasteboardWriteText(fitted);
    await wait(BEFORE_PASTE_MS);
    native.keyboardPaste();
    if (options.clipboard === 'restore') {
      setTimeout(() => {
        native.pasteboardRestoreIfUnchanged(changeCount);
      }, RESTORE_AFTER_MS);
    }
    await wait(BEFORE_RETURN_MS);
  }

  if (options.pressReturn) native.keyboardPressReturn();
  return options.insertion === 'type' ? 'typed' : 'pasted';
}

import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { createJsonStore } from './json-store';
import { normalizeModesState, type ModesState } from './modes';
import type { FormattingMode } from './transcript-formatter';

/** MyVoice 0.2 kept one global formatting choice in formatting-settings.json; it seeds the Default mode once. */
function legacyFormatting(): FormattingMode | undefined {
  try {
    const file = path.join(app.getPath('userData'), 'formatting-settings.json');
    const mode = JSON.parse(fs.readFileSync(file, 'utf8'))?.mode;
    return mode === 'off' || mode === 'basic' || mode === 'structured' ? mode : undefined;
  } catch {
    return undefined;
  }
}

const store = createJsonStore<ModesState>('modes.json', (raw) => normalizeModesState(raw, raw === undefined ? legacyFormatting() : undefined));

export function getModesState(): ModesState {
  return store.get();
}

export function updateModesState(edit: (current: ModesState) => ModesState): ModesState {
  return store.update(edit);
}

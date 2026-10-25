import { createJsonStore } from './json-store';
import { normalizePreferences, type Preferences } from './preferences-model';

const store = createJsonStore<Preferences>('preferences.json', (raw) => normalizePreferences(raw, process.arch));

export function getPreferences(): Preferences {
  return store.get();
}

export function updatePreferences(patch: Partial<Preferences>): Preferences {
  return store.update((current) => ({
    ...current,
    ...patch,
    localAi: { ...current.localAi, ...(patch.localAi ?? {}) },
  }));
}

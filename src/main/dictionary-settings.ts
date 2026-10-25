import { createJsonStore } from './json-store';
import { normalizeDictionary, type Dictionary } from './dictionary';

const store = createJsonStore<Dictionary>('dictionary.json', normalizeDictionary);

export function getDictionary(): Dictionary {
  return store.get();
}

/** Applies an edit produced by the pure helpers in dictionary.ts and saves it. */
export function updateDictionary(edit: (current: Dictionary) => Dictionary): Dictionary {
  return store.update(edit);
}

import { app } from 'electron';
import fs from 'fs';
import path from 'path';

export interface JsonStore<T> {
  get(): T;
  set(next: T): T;
  update(edit: (current: T) => T): T;
}

/**
 * A settings file in the app's userData folder. Every read goes through
 * `normalize`, so a missing, old or hand-edited file always yields valid data.
 */
export function createJsonStore<T>(fileName: string, normalize: (raw: unknown) => T): JsonStore<T> {
  let cached: T | null = null;

  const filePath = (): string | null => {
    try {
      return path.join(app.getPath('userData'), fileName);
    } catch {
      return null;
    }
  };

  const load = (): T => {
    const file = filePath();
    try {
      if (file && fs.existsSync(file)) return normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (error) {
      console.error(`[MyVoice] Failed to load ${fileName}, using defaults:`, error);
    }
    return normalize(undefined);
  };

  const save = (value: T): void => {
    const file = filePath();
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
    } catch (error) {
      console.error(`[MyVoice] Failed to save ${fileName}:`, error);
    }
  };

  const store: JsonStore<T> = {
    get() {
      if (cached === null) cached = load();
      return structuredClone(cached);
    },
    set(next) {
      cached = normalize(next);
      save(cached);
      return structuredClone(cached);
    },
    update(edit) {
      return store.set(edit(store.get()));
    },
  };
  return store;
}

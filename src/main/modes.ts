import type { FormattingMode } from './transcript-formatter';
import { DEFAULT_PIPELINE_OPTIONS, type PipelineOptions } from './text-pipeline';
import { DEFAULT_MODEL_ID, isLanguageCode, isModelId, type ModelId } from './model-catalog';

// Modes bundle everything that differs between kinds of dictation: model,
// language, text cleanup and how the result is delivered. A mode can switch on
// automatically for chosen apps. Pure, so the rules are unit tested.

export type InsertionMethod = 'paste' | 'type' | 'copy';

export interface AppRef {
  bundleId: string;
  name: string;
}

export interface DictationMode {
  id: string;
  name: string;
  builtIn: boolean;
  pipeline: PipelineOptions;
  modelId: ModelId;
  /** 'auto' or a language code from model-catalog LANGUAGES. */
  language: string;
  translateToEnglish: boolean;
  insertion: InsertionMethod;
  /** Press Return after inserting, for chat apps that send on Return. */
  pressReturn: boolean;
  /** Apps that switch to this mode while they are frontmost. */
  apps: AppRef[];
  /** Run the optional local AI cleanup step (local-ai.ts) when it is configured. */
  aiCleanup: boolean;
}

export interface ModesState {
  modes: DictationMode[];
  selectedModeId: string;
}

export const MODE_LIMITS = { count: 30, nameLength: 40, appsPerMode: 50 };

const TERMINAL_APPS: AppRef[] = [
  { bundleId: 'com.apple.Terminal', name: 'Terminal' },
  { bundleId: 'com.googlecode.iterm2', name: 'iTerm' },
  { bundleId: 'com.mitchellh.ghostty', name: 'Ghostty' },
  { bundleId: 'dev.warp.Warp-Stable', name: 'Warp' },
];

function builtIn(id: string, name: string, overrides: Partial<DictationMode>, pipeline: Partial<PipelineOptions>): DictationMode {
  return {
    id,
    name,
    builtIn: true,
    pipeline: { ...DEFAULT_PIPELINE_OPTIONS, ...pipeline },
    modelId: DEFAULT_MODEL_ID,
    language: 'en',
    translateToEnglish: false,
    insertion: 'paste',
    pressReturn: false,
    apps: [],
    aiCleanup: false,
    ...overrides,
  };
}

export const BUILT_IN_MODES: DictationMode[] = [
  builtIn('default', 'Default', {}, {}),
  // Terminals: exact words, and no spoken line breaks, since a pasted newline runs a command.
  builtIn('verbatim', 'Verbatim', { apps: TERMINAL_APPS }, {
    formatting: 'off',
    removeFillers: false,
    spokenCommands: false,
  }),
  builtIn('notes', 'Notes', {}, { formatting: 'structured', spokenPunctuation: true }),
];

const FORMATTING_MODES: FormattingMode[] = ['off', 'basic', 'structured'];
const INSERTION_METHODS: InsertionMethod[] = ['paste', 'type', 'copy'];

function clipName(value: unknown, fallback: string): string {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MODE_LIMITS.nameLength);
  return name || fallback;
}

function normalizeApps(raw: unknown): AppRef[] {
  const seen = new Set<string>();
  const apps: AppRef[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const data = (entry && typeof entry === 'object' ? entry : {}) as Partial<AppRef>;
    const bundleId = String(data.bundleId ?? '').trim();
    if (!/^[A-Za-z0-9.-]+$/.test(bundleId) || seen.has(bundleId.toLowerCase())) continue;
    seen.add(bundleId.toLowerCase());
    apps.push({ bundleId, name: clipName(data.name, bundleId) });
    if (apps.length >= MODE_LIMITS.appsPerMode) break;
  }
  return apps;
}

function normalizePipeline(raw: unknown, fallback: PipelineOptions): PipelineOptions {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Partial<PipelineOptions>;
  const bool = (value: unknown, defaultValue: boolean): boolean => (typeof value === 'boolean' ? value : defaultValue);
  return {
    formatting: FORMATTING_MODES.includes(data.formatting as FormattingMode) ? data.formatting as FormattingMode : fallback.formatting,
    removeFillers: bool(data.removeFillers, fallback.removeFillers),
    spokenCommands: bool(data.spokenCommands, fallback.spokenCommands),
    spokenPunctuation: bool(data.spokenPunctuation, fallback.spokenPunctuation),
    useDictionary: bool(data.useDictionary, fallback.useDictionary),
  };
}

function normalizeMode(raw: unknown, fallback: DictationMode): DictationMode {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Partial<DictationMode>;
  return {
    id: fallback.id,
    name: clipName(data.name, fallback.name),
    builtIn: fallback.builtIn,
    pipeline: normalizePipeline(data.pipeline, fallback.pipeline),
    modelId: isModelId(data.modelId) ? data.modelId : fallback.modelId,
    language: isLanguageCode(data.language) ? data.language : fallback.language,
    translateToEnglish: typeof data.translateToEnglish === 'boolean' ? data.translateToEnglish : fallback.translateToEnglish,
    insertion: INSERTION_METHODS.includes(data.insertion as InsertionMethod) ? data.insertion as InsertionMethod : fallback.insertion,
    pressReturn: typeof data.pressReturn === 'boolean' ? data.pressReturn : fallback.pressReturn,
    apps: data.apps === undefined ? fallback.apps : normalizeApps(data.apps),
    aiCleanup: typeof data.aiCleanup === 'boolean' ? data.aiCleanup : fallback.aiCleanup,
  };
}

/** An app belongs to at most one mode; the first mode that lists it keeps it. */
function dedupeApps(modes: DictationMode[]): DictationMode[] {
  const claimed = new Set<string>();
  return modes.map((mode) => ({
    ...mode,
    apps: mode.apps.filter((entry) => {
      const key = entry.bundleId.toLowerCase();
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    }),
  }));
}

/**
 * Validates stored modes. Built-in modes always exist (with the user's edits
 * kept); unknown fields fall back to defaults. `legacyFormatting` carries the
 * MyVoice 0.2 global formatting choice into the Default mode on first run.
 */
export function normalizeModesState(raw: unknown, legacyFormatting?: FormattingMode): ModesState {
  const data = (raw && typeof raw === 'object' ? raw : {}) as { modes?: unknown; selectedModeId?: unknown };
  const stored = Array.isArray(data.modes) ? data.modes : [];
  const storedById = new Map<string, unknown>();
  for (const entry of stored) {
    const id = String((entry as { id?: unknown })?.id ?? '');
    if (id && !storedById.has(id)) storedById.set(id, entry);
  }

  const modes: DictationMode[] = BUILT_IN_MODES.map((mode) => {
    const fallback = mode.id === 'default' && legacyFormatting && !Array.isArray(data.modes)
      ? { ...mode, pipeline: { ...mode.pipeline, formatting: legacyFormatting } }
      : mode;
    return normalizeMode(storedById.get(mode.id), fallback);
  });

  for (const [id, entry] of storedById) {
    if (BUILT_IN_MODES.some((mode) => mode.id === id) || !/^[a-z0-9-]{1,64}$/.test(id)) continue;
    if (modes.length >= MODE_LIMITS.count) break;
    modes.push(normalizeMode(entry, { ...BUILT_IN_MODES[0], id, name: 'Custom', builtIn: false, apps: [] }));
  }

  const selectedModeId = modes.some((mode) => mode.id === data.selectedModeId)
    ? String(data.selectedModeId)
    : 'default';
  return { modes: dedupeApps(modes), selectedModeId };
}

export interface ResolvedMode {
  mode: DictationMode;
  /** 'app' when the frontmost app switched modes, 'selected' otherwise. */
  reason: 'app' | 'selected';
}

/** The mode for a dictation: the mode assigned to the frontmost app, else the selected one. */
export function resolveMode(state: ModesState, frontmostBundleId: string | null): ResolvedMode {
  if (frontmostBundleId) {
    const key = frontmostBundleId.toLowerCase();
    const byApp = state.modes.find((mode) => mode.apps.some((entry) => entry.bundleId.toLowerCase() === key));
    if (byApp) return { mode: byApp, reason: 'app' };
  }
  const selected = state.modes.find((mode) => mode.id === state.selectedModeId) ?? state.modes[0];
  return { mode: selected, reason: 'selected' };
}

export function selectMode(state: ModesState, id: string): ModesState {
  return state.modes.some((mode) => mode.id === id) ? { ...state, selectedModeId: id } : state;
}

/** Adds a custom mode that starts as a copy of `basedOn` (or Default), without its apps. */
export function createMode(state: ModesState, name: string, newId: string, basedOnId = 'default'): ModesState {
  if (state.modes.length >= MODE_LIMITS.count) return state;
  const base = state.modes.find((mode) => mode.id === basedOnId) ?? state.modes[0];
  const mode: DictationMode = { ...base, id: newId, name: clipName(name, 'New Mode'), builtIn: false, apps: [] };
  return normalizeModesState({ ...state, modes: [...state.modes, mode], selectedModeId: newId });
}

/** Applies validated edits. The id and built-in flag cannot change. */
export function updateMode(state: ModesState, id: string, patch: Partial<DictationMode>): ModesState {
  const modes = state.modes.map((mode) => {
    if (mode.id !== id) return mode;
    const merged = { ...mode, ...patch, pipeline: { ...mode.pipeline, ...(patch.pipeline ?? {}) } };
    return normalizeMode(merged, mode);
  });
  return normalizeModesState({ ...state, modes });
}

/** Built-in modes can be edited but not deleted. */
export function deleteMode(state: ModesState, id: string): ModesState {
  const target = state.modes.find((mode) => mode.id === id);
  if (!target || target.builtIn) return state;
  const modes = state.modes.filter((mode) => mode.id !== id);
  return normalizeModesState({ modes, selectedModeId: state.selectedModeId === id ? 'default' : state.selectedModeId });
}

/** Assigns an app to one mode, taking it away from any other mode. */
export function assignApp(state: ModesState, modeId: string, app: AppRef): ModesState {
  const key = app.bundleId.toLowerCase();
  const modes = state.modes.map((mode) => {
    const others = mode.apps.filter((entry) => entry.bundleId.toLowerCase() !== key);
    return mode.id === modeId ? { ...mode, apps: [...others, app] } : { ...mode, apps: others };
  });
  return normalizeModesState({ ...state, modes });
}

export function unassignApp(state: ModesState, modeId: string, bundleId: string): ModesState {
  const key = bundleId.toLowerCase();
  const modes = state.modes.map((mode) => (mode.id === modeId
    ? { ...mode, apps: mode.apps.filter((entry) => entry.bundleId.toLowerCase() !== key) }
    : mode));
  return normalizeModesState({ ...state, modes });
}

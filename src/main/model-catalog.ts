// Whisper models MyVoice can download, each pinned to one Hugging Face commit
// and SHA-256. Pure, so the language and fallback rules are unit tested.

const MODEL_REPO_REVISION = '5359861c739e955e79d9a303bcbc70fb988958b1';
const MODEL_BASE_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/${MODEL_REPO_REVISION}`;

export type ModelId =
  | 'tiny.en'
  | 'base.en'
  | 'small.en'
  | 'medium.en-q5_0'
  | 'base'
  | 'small'
  | 'medium-q5_0'
  | 'large-v3-turbo-q5_0';

export interface ModelInfo {
  id: ModelId;
  label: string;
  description: string;
  fileName: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  /** English-only models are smaller and faster but cannot transcribe other languages. */
  englishOnly: boolean;
  /** Whisper's translate task; turbo models were not trained for it. */
  canTranslate: boolean;
}

function model(id: ModelId, label: string, description: string, sha256: string, sizeBytes: number, options: { englishOnly: boolean; canTranslate: boolean }): ModelInfo {
  const fileName = `ggml-${id}.bin`;
  return { id, label, description, fileName, url: `${MODEL_BASE_URL}/${fileName}`, sha256, sizeBytes, ...options };
}

export const MODEL_CATALOG: ModelInfo[] = [
  model('tiny.en', 'Tiny (English)', 'Fastest. Fine for short, clear dictation.',
    '921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f', 77_704_715, { englishOnly: true, canTranslate: false }),
  model('base.en', 'Base (English)', 'Fast and accurate for everyday English. The default.',
    'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002', 147_964_211, { englishOnly: true, canTranslate: false }),
  model('small.en', 'Small (English)', 'More accurate with names and jargon. About three times slower than Base.',
    'c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d', 487_614_201, { englishOnly: true, canTranslate: false }),
  model('medium.en-q5_0', 'Medium (English)', 'Most accurate English model. Best on Apple silicon.',
    '76733e26ad8fe1c7a5bf7531a9d41917b2adc0f20f2e4f5531688a8c6cd88eb0', 539_225_533, { englishOnly: true, canTranslate: false }),
  model('base', 'Base (multilingual)', 'Fast, 99 languages, can translate to English.',
    '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe', 147_951_465, { englishOnly: false, canTranslate: true }),
  model('small', 'Small (multilingual)', 'More accurate in other languages, can translate to English.',
    '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b', 487_601_967, { englishOnly: false, canTranslate: true }),
  model('medium-q5_0', 'Medium (multilingual)', 'High accuracy in other languages, can translate to English.',
    '19fea4b380c3a618ec4723c3eef2eb785ffba0d0538cf43f8f235e7b3b34220f', 539_212_467, { englishOnly: false, canTranslate: true }),
  model('large-v3-turbo-q5_0', 'Large v3 Turbo (multilingual)', 'Best accuracy across languages. Cannot translate.',
    '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2', 574_041_195, { englishOnly: false, canTranslate: false }),
];

export const DEFAULT_MODEL_ID: ModelId = 'base.en';

export function getModel(id: string): ModelInfo | undefined {
  return MODEL_CATALOG.find((entry) => entry.id === id);
}

export function isModelId(value: unknown): value is ModelId {
  return typeof value === 'string' && MODEL_CATALOG.some((entry) => entry.id === value);
}

/** Languages offered in the picker: whisper's best-supported ones. 'auto' detects per dictation. */
export const LANGUAGES: { code: string; name: string }[] = [
  { code: 'auto', name: 'Detect automatically' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'sv', name: 'Swedish' },
  { code: 'da', name: 'Danish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'fi', name: 'Finnish' },
  { code: 'pl', name: 'Polish' },
  { code: 'cs', name: 'Czech' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ru', name: 'Russian' },
  { code: 'tr', name: 'Turkish' },
  { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'id', name: 'Indonesian' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
];

export function isLanguageCode(value: unknown): value is string {
  return typeof value === 'string' && LANGUAGES.some((entry) => entry.code === value);
}

/** The language whisper is told to use: English-only models always get 'en'. */
export function effectiveLanguage(modelInfo: ModelInfo, requested: string): string {
  if (modelInfo.englishOnly) return 'en';
  return isLanguageCode(requested) ? requested : 'auto';
}

/** Translation needs a model that supports it, and is pointless when the speech is already English. */
export function canTranslate(modelInfo: ModelInfo, language: string): boolean {
  return modelInfo.canTranslate && effectiveLanguage(modelInfo, language) !== 'en';
}

/**
 * The model to run when the requested one is not downloaded: the closest
 * installed model of the same kind (English-only or multilingual), else any.
 */
export function pickInstalledModel(requested: ModelId, installed: ModelId[]): ModelId | null {
  if (installed.includes(requested)) return requested;
  if (installed.length === 0) return null;
  const wanted = getModel(requested);
  const order = MODEL_CATALOG.map((entry) => entry.id);
  const sameKind = installed.filter((id) => getModel(id)?.englishOnly === wanted?.englishOnly);
  const pool = sameKind.length > 0 ? sameKind : installed;
  const wantedIndex = order.indexOf(requested);
  return [...pool].sort((a, b) => Math.abs(order.indexOf(a) - wantedIndex) - Math.abs(order.indexOf(b) - wantedIndex))[0];
}

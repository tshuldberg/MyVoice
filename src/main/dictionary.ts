// Personal dictionary: vocabulary that steers whisper and fixes casing, and
// replacement rules applied to the finished text. Pure, so it is unit tested.

export interface Replacement {
  from: string;
  to: string;
}

export interface Dictionary {
  /** Newest first. */
  vocabulary: string[];
  replacements: Replacement[];
}

export const DICTIONARY_LIMITS = {
  vocabularyCount: 200,
  termLength: 64,
  replacementCount: 500,
  replacementOutputLength: 500,
  /** whisper.cpp keeps about 224 prompt tokens; 600 characters stays well inside that. */
  promptCharacters: 600,
};

export const EMPTY_DICTIONARY: Dictionary = { vocabulary: [], replacements: [] };

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole-word, case-insensitive pattern; spaces in the phrase match any run of spaces. */
function wholePhrasePattern(phrase: string): RegExp {
  const body = phrase.trim().split(/\s+/).map(escapeRegExp).join('\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])`, 'giu');
}

// Rule positions are written with private-use characters, never digits, so no
// rule can match inside another rule's placeholder.
const MARK_START = '';
const MARK_END = '';
const DIGIT_BASE = 0xe100;
const encodeIndex = (index: number): string =>
  [...String(index)].map((digit) => String.fromCharCode(DIGIT_BASE + Number(digit))).join('');
const decodeIndex = (encoded: string): number =>
  Number([...encoded].map((char) => char.charCodeAt(0) - DIGIT_BASE).join(''));

// An output that starts with one of these joins the word before it ("dot com" -> ".com").
const ATTACHES_LEFT = /^[.,;:!?%)\]}@/_-]/;
// An output that ends with one of these joins the word after it ("at sign" -> "@").
const ATTACHES_RIGHT = /[@/_(\[{#$-]$/;

/**
 * Applies replacement rules. Matching ignores case and only hits whole words;
 * the output is inserted exactly as typed. Longer phrases win, and an output is
 * never matched again by a later rule.
 */
export function applyReplacements(text: string, replacements: Replacement[]): string {
  const rules = replacements
    .map((rule, index) => ({ ...rule, index }))
    .filter((rule) => rule.from.trim().length > 0)
    .sort((a, b) => b.from.trim().length - a.from.trim().length);
  if (rules.length === 0) return text;

  let marked = text;
  for (const rule of rules) {
    marked = marked.replace(wholePhrasePattern(rule.from), `${MARK_START}${encodeIndex(rule.index)}${MARK_END}`);
  }

  const markPattern = new RegExp(`([ \\t]*)${MARK_START}([\\uE100-\\uE109]+)${MARK_END}([ \\t]*)`, 'g');
  return marked.replace(markPattern, (_match, before: string, encoded: string, after: string) => {
    const output = replacements[decodeIndex(encoded)].to;
    const left = ATTACHES_LEFT.test(output) ? '' : before;
    const right = ATTACHES_RIGHT.test(output) ? '' : after;
    return `${left}${output}${right}`;
  });
}

/** Restores the exact spelling of vocabulary terms ("iphone" -> "iPhone"). */
export function applyVocabularyCasing(text: string, vocabulary: string[]): string {
  const terms = [...vocabulary].sort((a, b) => b.length - a.length);
  let result = text;
  for (const term of terms) {
    if (!term.trim()) continue;
    result = result.replace(wholePhrasePattern(term), term.trim());
  }
  return result;
}

/**
 * The whisper initial prompt. Short lists work best: the vendor guidance in the
 * competitor review is that long lists hurt punctuation and language detection.
 */
export function buildVocabularyPrompt(vocabulary: string[], maxCharacters = DICTIONARY_LIMITS.promptCharacters): string | null {
  const picked: string[] = [];
  let length = 0;
  for (const term of vocabulary) {
    const trimmed = term.trim();
    if (!trimmed) continue;
    const added = picked.length === 0 ? trimmed.length : trimmed.length + 2;
    if (length + added > maxCharacters) break;
    picked.push(trimmed);
    length += added;
  }
  return picked.length > 0 ? picked.join(', ') : null;
}

function clip(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Validates stored or imported data: trims, removes duplicates and applies limits. */
export function normalizeDictionary(raw: unknown): Dictionary {
  const data = (raw && typeof raw === 'object' ? raw : {}) as { vocabulary?: unknown; replacements?: unknown };

  const seenTerms = new Set<string>();
  const vocabulary: string[] = [];
  for (const entry of Array.isArray(data.vocabulary) ? data.vocabulary : []) {
    const term = clip(entry, DICTIONARY_LIMITS.termLength);
    const key = term.toLowerCase();
    if (!term || seenTerms.has(key)) continue;
    seenTerms.add(key);
    vocabulary.push(term);
    if (vocabulary.length >= DICTIONARY_LIMITS.vocabularyCount) break;
  }

  const seenFrom = new Set<string>();
  const replacements: Replacement[] = [];
  for (const entry of Array.isArray(data.replacements) ? data.replacements : []) {
    const rule = (entry && typeof entry === 'object' ? entry : {}) as { from?: unknown; to?: unknown };
    const from = clip(rule.from, DICTIONARY_LIMITS.termLength);
    // Outputs may span lines, so only the ends are trimmed.
    const to = String(rule.to ?? '').trim().slice(0, DICTIONARY_LIMITS.replacementOutputLength);
    const key = from.toLowerCase();
    if (!from || seenFrom.has(key)) continue;
    seenFrom.add(key);
    replacements.push({ from, to });
    if (replacements.length >= DICTIONARY_LIMITS.replacementCount) break;
  }

  return { vocabulary, replacements };
}

export function addVocabularyTerm(dictionary: Dictionary, term: string): Dictionary {
  return normalizeDictionary({ ...dictionary, vocabulary: [term, ...dictionary.vocabulary] });
}

export function removeVocabularyTerm(dictionary: Dictionary, term: string): Dictionary {
  const key = term.trim().toLowerCase();
  return { ...dictionary, vocabulary: dictionary.vocabulary.filter((entry) => entry.toLowerCase() !== key) };
}

/** Adds a rule, or replaces the output of an existing rule with the same "from". */
export function upsertReplacement(dictionary: Dictionary, rule: Replacement): Dictionary {
  const key = rule.from.trim().toLowerCase();
  const others = dictionary.replacements.filter((entry) => entry.from.toLowerCase() !== key);
  return normalizeDictionary({ ...dictionary, replacements: [rule, ...others] });
}

export function removeReplacement(dictionary: Dictionary, from: string): Dictionary {
  const key = from.trim().toLowerCase();
  return { ...dictionary, replacements: dictionary.replacements.filter((entry) => entry.from.toLowerCase() !== key) };
}

/** Splits one CSV line, honoring double-quoted fields with "" escapes. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields.map((value) => value.trim());
}

/**
 * Reads a CSV export: one column is a vocabulary term, two columns are
 * "spoken,written" replacements. A first row of "word" or "from,to" is skipped.
 */
export function parseDictionaryCsv(text: string): Dictionary {
  const vocabulary: string[] = [];
  const replacements: Replacement[] = [];
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0);
  lines.forEach((line, index) => {
    const [first = '', second = ''] = parseCsvLine(line);
    if (index === 0 && /^(word|term|vocabulary|from|spoken)$/i.test(first)) return;
    if (second) {
      replacements.push({ from: first, to: second });
    } else if (first) {
      vocabulary.push(first);
    }
  });
  return normalizeDictionary({ vocabulary, replacements });
}

/** Imported entries go first; existing entries keep their place after them. */
export function mergeDictionaries(current: Dictionary, imported: Dictionary): Dictionary {
  const importedKeys = new Set(imported.replacements.map((rule) => rule.from.toLowerCase()));
  return normalizeDictionary({
    vocabulary: [...imported.vocabulary, ...current.vocabulary],
    replacements: [...imported.replacements, ...current.replacements.filter((rule) => !importedKeys.has(rule.from.toLowerCase()))],
  });
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The same format parseDictionaryCsv reads: terms on their own, then spoken,written pairs. */
export function dictionaryToCsv(dictionary: Dictionary): string {
  const lines = [
    ...dictionary.vocabulary.map(csvField),
    ...dictionary.replacements.map((rule) => `${csvField(rule.from)},${csvField(rule.to)}`),
  ];
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

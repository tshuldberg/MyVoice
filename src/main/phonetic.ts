// Near-miss vocabulary matching: when whisper writes "Kubernetties" or
// "Supa base" for a vocabulary term, swap in the term. Matching needs both a
// sound-alike key and a small spelling distance, so ordinary words are left
// alone. Opt-in per mode. Pure, so the thresholds are unit tested.

const CONSONANT_CLASS: Record<string, string> = {
  b: 'P', p: 'P',
  c: 'K', g: 'K', k: 'K', q: 'K', x: 'K',
  d: 'T', t: 'T',
  f: 'F', v: 'F',
  s: 'S', z: 'S',
  // m and n stay apart: merging them would turn "motion" into "Notion".
  m: 'M', n: 'N',
  l: 'L', r: 'R', j: 'J', h: '', w: '', y: '',
};

/**
 * A coarse sound-alike key: the first letter's class, then consonant classes
 * with vowels dropped and repeats collapsed. "Kubernetes" and "cooper netties"
 * both give KPRNTS.
 */
export function phoneticKey(text: string): string {
  const letters = text.toLowerCase().replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/[^a-z]/g, '');
  if (!letters) return '';
  let key = '';
  let previous = '';
  for (let i = 0; i < letters.length; i++) {
    const char = letters[i];
    const isVowel = 'aeiou'.includes(char);
    const code = isVowel ? (i === 0 ? 'A' : '') : CONSONANT_CLASS[char] ?? '';
    if (code && code !== previous) key += code;
    previous = isVowel ? '' : code || previous;
  }
  return key;
}

export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = Array.from({ length: cols }, (_, j) => j);
  for (let i = 1; i < rows; i++) {
    const current = [i];
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[cols - 1];
}

export interface FuzzyOptions {
  /** Vocabulary terms shorter than this are never fuzzy-matched. */
  minTermLength: number;
  /** Largest allowed edit distance, as a share of the term's length. */
  maxDistanceRatio: number;
}

export const DEFAULT_FUZZY_OPTIONS: FuzzyOptions = { minTermLength: 5, maxDistanceRatio: 0.4 };

/** `joined` is true for two words written together, where an exact spelling also counts. */
function isCloseMatch(candidate: string, term: string, options: FuzzyOptions, joined: boolean): boolean {
  const a = candidate.toLowerCase().replace(/[^a-z]/g, '');
  const b = term.toLowerCase().replace(/[^a-z]/g, '');
  if (!a) return false;
  if (a === b) return joined;
  if (Math.abs(a.length - b.length) > 3) return false;
  if (phoneticKey(a) !== phoneticKey(b)) return false;
  return editDistance(a, b) <= Math.floor(b.length * options.maxDistanceRatio);
}

/**
 * Replaces one word, or two adjacent words, that sound like and nearly spell
 * a single-word vocabulary term. Punctuation around the words is kept.
 */
export function applyFuzzyVocabulary(text: string, vocabulary: string[], options: FuzzyOptions = DEFAULT_FUZZY_OPTIONS): string {
  const terms = vocabulary
    .map((term) => term.trim())
    .filter((term) => /^[A-Za-z][A-Za-z0-9.-]*$/.test(term) && term.length >= options.minTermLength);
  if (terms.length === 0) return text;

  // Tokens alternate word and separator, so separators survive untouched.
  const tokens = text.split(/([^A-Za-z0-9'-]+)/);
  const findTerm = (candidate: string, joined: boolean): string | undefined =>
    terms.find((term) => isCloseMatch(candidate, term, options, joined));

  for (let i = 0; i < tokens.length; i += 2) {
    const word = tokens[i];
    if (!word || word.length < 3) continue;
    const next = tokens[i + 2];
    const between = tokens[i + 1];
    // Two words split by a single space ("supa base") are tried first.
    if (next && between === ' ') {
      const pair = findTerm(`${word}${next}`, true);
      if (pair) {
        tokens.splice(i, 3, pair);
        continue;
      }
    }
    const single = findTerm(word, false);
    if (single) tokens[i] = single;
  }
  return tokens.join('');
}

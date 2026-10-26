import { formatTranscript, type FormattingMode } from './transcript-formatter';
import { applyReplacements, applyVocabularyCasing, type Dictionary } from './dictionary';
import { applyScratchThat, applySpokenPunctuation, joinSegments, splitOnLineBreakCommands } from './spoken-commands';
import { applyFuzzyVocabulary } from './phonetic';
import { applySpelling, type SpellingVariant } from './spelling';

// Turns whisper's raw text into what gets inserted. Pure, so every step is unit tested.

export interface PipelineOptions {
  formatting: FormattingMode;
  /** Drop "um", "uh" and stuttered short words. */
  removeFillers: boolean;
  /** "new line", "new paragraph", "scratch that". */
  spokenCommands: boolean;
  /** "comma", "period", "question mark" and friends. Off by default: "period" is also a word. */
  spokenPunctuation: boolean;
  /** Apply replacement rules and vocabulary spelling. */
  useDictionary: boolean;
  /** Also fix near-misses of vocabulary words ("kubernetties"). Off by default. */
  fuzzyVocabulary: boolean;
  /** American (whisper's default) or British spelling. */
  spelling: SpellingVariant;
}

export const DEFAULT_PIPELINE_OPTIONS: PipelineOptions = {
  formatting: 'basic',
  removeFillers: true,
  spokenCommands: true,
  spokenPunctuation: false,
  useDictionary: true,
  fuzzyVocabulary: false,
  spelling: 'us',
};

// um, umm, uh, uhm, erm, hm, hmm, mm. "er" and "ah" are left alone: too often real words.
const FILLER_PATTERN = /,?\s*(?<![\p{L}\p{N}'])(?:u+m+|u+h+m*|e+r+m+|h+m+|m{2,})(?![\p{L}\p{N}'])\s*,?/giu;
// Repeats of these are never grammatical, unlike "that that" or "had had".
const STUTTER_PATTERN = /\b(i|the|a|an|and|to|it|we|so|but)(?:[\s,]+\1\b)+/gi;

export function removeFillerWords(text: string): string {
  return text
    .replace(FILLER_PATTERN, ' ')
    .replace(STUTTER_PATTERN, '$1')
    // Orphaned punctuation left by a removed filler (". ." or ".,"), but never an ellipsis.
    .replace(/([.!?])(?:\s+[.,;]|[,;])+/g, '$1')
    .replace(/^[\s,.;]+/, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Removes whisper annotations such as "[BLANK_AUDIO]" or "(wind blowing)". */
export function stripAnnotations(text: string): string {
  return text.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
}

export function processTranscript(raw: string, options: PipelineOptions, dictionary: Dictionary): string {
  let text = stripAnnotations(raw);
  if (!text) return '';

  if (options.spokenCommands) text = applyScratchThat(text);
  if (options.spokenPunctuation) text = applySpokenPunctuation(text);
  if (options.removeFillers) text = removeFillerWords(text);

  const segments = options.spokenCommands
    ? splitOnLineBreakCommands(text)
    : [{ text, breakAfter: '' as const }];
  text = joinSegments(segments.map((segment) => ({
    ...segment,
    text: formatTranscript(segment.text, options.formatting),
  })));

  // Before the dictionary, so a replacement can still override a spelling.
  text = applySpelling(text, options.spelling);

  if (options.useDictionary) {
    text = applyReplacements(text, dictionary.replacements);
    if (options.fuzzyVocabulary) text = applyFuzzyVocabulary(text, dictionary.vocabulary);
    text = applyVocabularyCasing(text, dictionary.vocabulary);
  }

  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}

// Spoken editing and punctuation commands, applied to whisper's text.
// Whisper usually punctuates around a spoken command ("Hello. New line. How are
// you?"), so every pattern also absorbs the punctuation and spaces next to it.

const SCRATCH_PATTERN = /\b(?:scratch that|delete that)\b[,.;:!?]*/i;

const LINE_BREAK_PATTERN = /\s*\b(new paragraph|new line|newline|next line)\b[\s,.;:!?]*/gi;

// Private-use markers keep open and close quotes apart until spacing is fixed.
const OPEN_QUOTE = '';
const CLOSE_QUOTE = '';

interface PunctuationWord {
  words: string[];
  symbol: string;
}

// Longer phrases first, so "close quote" is never read as "quote".
const PUNCTUATION_WORDS: PunctuationWord[] = [
  { words: ['question mark'], symbol: '?' },
  { words: ['exclamation point', 'exclamation mark'], symbol: '!' },
  { words: ['full stop', 'period'], symbol: '.' },
  { words: ['semicolon', 'semi colon'], symbol: ';' },
  { words: ['colon'], symbol: ':' },
  { words: ['comma'], symbol: ',' },
  { words: ['ellipsis', 'dot dot dot'], symbol: '...' },
  { words: ['close quote', 'end quote', 'unquote'], symbol: CLOSE_QUOTE },
  { words: ['open quote', 'begin quote'], symbol: OPEN_QUOTE },
  { words: ['close parenthesis', 'close paren'], symbol: ')' },
  { words: ['open parenthesis', 'open paren'], symbol: '(' },
];

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * "scratch that" and "delete that" remove the sentence or clause spoken just
 * before them. Several in a row remove several sentences.
 */
export function applyScratchThat(text: string): string {
  let result = text;
  let match = result.match(SCRATCH_PATTERN);
  while (match && match.index !== undefined) {
    const before = result.slice(0, match.index).replace(/[\s,;:]+$/, '');
    const after = result.slice(match.index + match[0].length);
    // Keep everything up to the end of the sentence before the one being removed.
    const body = before.replace(/[.!?]+$/, '');
    const lastBoundary = Math.max(
      body.lastIndexOf('.'),
      body.lastIndexOf('!'),
      body.lastIndexOf('?'),
      body.lastIndexOf('\n'),
    );
    const kept = lastBoundary >= 0 ? before.slice(0, lastBoundary + 1) : '';
    result = `${kept} ${after.trimStart()}`.trim();
    match = result.match(SCRATCH_PATTERN);
  }
  return result;
}

/** Turns spoken punctuation words into symbols ("comma" becomes ","). */
export function applySpokenPunctuation(text: string): string {
  let result = text;
  for (const { words, symbol } of PUNCTUATION_WORDS) {
    const alternatives = words.map((word) => escapeRegExp(word).replace(/ /g, '\\s+')).join('|');
    const pattern = new RegExp(`[\\s,.;:!?]*\\b(?:${alternatives})\\b[,.;:!?]*`, 'gi');
    result = result.replace(pattern, ` ${symbol} `);
  }
  return fixPunctuationSpacing(result);
}

// Symbols were inserted as " symbol ", so only the space on the attached side is removed.
// Whisper's own text (for example "example.com") is never re-spaced.
function fixPunctuationSpacing(text: string): string {
  return text
    .replace(/[ \t]+(\.\.\.|[,.;:!?)])/g, '$1')
    .replace(new RegExp(`[ \\t]+${CLOSE_QUOTE}`, 'g'), CLOSE_QUOTE)
    .replace(new RegExp(`${OPEN_QUOTE}[ \\t]+`, 'g'), OPEN_QUOTE)
    .replace(/\([ \t]+/g, '(')
    .replace(new RegExp(`[${OPEN_QUOTE}${CLOSE_QUOTE}]`, 'g'), '"')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export interface TextSegment {
  text: string;
  /** Line break that follows this segment. */
  breakAfter: '' | '\n' | '\n\n';
}

/** Splits on "new line" and "new paragraph" so each piece can be formatted on its own. */
export function splitOnLineBreakCommands(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(LINE_BREAK_PATTERN)) {
    const index = match.index ?? 0;
    segments.push({
      text: text.slice(lastIndex, index).trim(),
      breakAfter: match[1].toLowerCase() === 'new paragraph' ? '\n\n' : '\n',
    });
    lastIndex = index + match[0].length;
  }
  segments.push({ text: text.slice(lastIndex).trim(), breakAfter: '' });
  return segments;
}

export function joinSegments(segments: TextSegment[]): string {
  return segments
    .map((segment) => `${segment.text}${segment.breakAfter}`)
    .join('')
    .replace(/^\n+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

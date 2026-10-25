// Smart spacing and capitalization: makes inserted text fit the characters
// just before the caret. Pure, so the rules are unit tested.

export interface CaretContext {
  secure: boolean;
  /** Up to two characters before the caret. */
  before: string;
  atStart: boolean;
}

const ATTACHES_LEFT = /^[.,;:!?%)\]}'"]/;

function lowercaseFirstWord(text: string, keepCase: Set<string>): string {
  const match = text.match(/^([A-Za-z][\w'-]*)/);
  if (!match) return text;
  const word = match[1];
  if (word === 'I' || word.startsWith("I'")) return text;
  if (/^[A-Z0-9]{2,}$/.test(word)) return text; // acronyms: NASA, API
  if (/[A-Z]/.test(word.slice(1))) return text; // iPhone, MyVoice
  if (keepCase.has(word.toLowerCase())) return text;
  return `${word[0].toLowerCase()}${text.slice(1)}`;
}

/**
 * - After a word or punctuation, add a space before the text.
 * - Mid-sentence (after a word or comma), start in lowercase.
 * - At the start of a field, after a newline or after ". ", leave it as it is.
 * `keepCase` holds vocabulary terms whose capital letter must stay.
 */
export function adaptToCaret(text: string, context: CaretContext | null, keepCase: string[] = []): string {
  if (!context || context.secure || !text) return text;
  if (context.atStart || context.before.length === 0) return text;

  const last = context.before[context.before.length - 1];
  const needsSpace = !/\s/.test(last) && !/[([{"'\/@#-]/.test(last) && !ATTACHES_LEFT.test(text);

  const lastNonSpace = context.before.trimEnd().slice(-1);
  const afterNewline = /\n[ \t]*$/.test(context.before);
  const midSentence = !afterNewline && lastNonSpace !== '' && /[\p{L}\p{N},;:(]/u.test(lastNonSpace) && !text.includes('\n');
  const adjusted = midSentence
    ? lowercaseFirstWord(text, new Set(keepCase.map((term) => term.toLowerCase())))
    : text;

  return needsSpace ? ` ${adjusted}` : adjusted;
}

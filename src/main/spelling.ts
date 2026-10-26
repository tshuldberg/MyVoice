// British spelling for a mode: whisper writes American English, and some
// people need "colour" and "organise". Whole words only, keeping the case of
// what whisper wrote. Pure, so the word list and casing are unit tested.

export type SpellingVariant = 'us' | 'uk';

// Stems that take the same ending change in every form: color, colors,
// colored, coloring, colorful. Only unambiguous words are listed.
const STEMS: [string, string][] = [
  ['color', 'colour'], ['favor', 'favour'], ['honor', 'honour'], ['humor', 'humour'], ['labor', 'labour'],
  ['neighbor', 'neighbour'], ['behavior', 'behaviour'], ['flavor', 'flavour'], ['harbor', 'harbour'],
  ['rumor', 'rumour'], ['vapor', 'vapour'], ['savor', 'savour'], ['endeavor', 'endeavour'], ['armor', 'armour'],
  ['organiz', 'organis'], ['realiz', 'realis'], ['recogniz', 'recognis'], ['apologiz', 'apologis'],
  ['prioritiz', 'prioritis'], ['optimiz', 'optimis'], ['summariz', 'summaris'], ['minimiz', 'minimis'],
  ['maximiz', 'maximis'], ['customiz', 'customis'], ['categoriz', 'categoris'], ['emphasiz', 'emphasis'],
  ['finaliz', 'finalis'], ['memoriz', 'memoris'], ['standardiz', 'standardis'], ['utiliz', 'utilis'],
  ['visualiz', 'visualis'], ['personaliz', 'personalis'], ['normaliz', 'normalis'], ['authoriz', 'authoris'],
  ['analyz', 'analys'], ['paralyz', 'paralys'], ['catalog', 'catalogue'],
];

const SUFFIXES = ['', 's', 'ed', 'ing', 'ful', 'able', 'al', 'ally', 'ation', 'ations', 'er', 'ers', 'e', 'es', 'ite', 'ites'];

// Whole words that do not follow a stem pattern. Words whose British spelling
// depends on meaning (license, meter, tire, program, dialog, check) are left out.
const WORDS: [string, string][] = [
  ['center', 'centre'], ['centers', 'centres'], ['centered', 'centred'], ['theater', 'theatre'], ['theaters', 'theatres'],
  ['liter', 'litre'], ['liters', 'litres'], ['fiber', 'fibre'],
  ['defense', 'defence'], ['offense', 'offence'], ['gray', 'grey'], ['traveled', 'travelled'],
  ['traveling', 'travelling'], ['traveler', 'traveller'], ['travelers', 'travellers'], ['canceled', 'cancelled'],
  ['canceling', 'cancelling'], ['modeled', 'modelled'], ['modeling', 'modelling'], ['labeled', 'labelled'],
  ['labeling', 'labelling'], ['fulfill', 'fulfil'], ['enrollment', 'enrolment'], ['jewelry', 'jewellery'],
  ['aluminum', 'aluminium'], ['airplane', 'aeroplane'], ['pajamas', 'pyjamas'],
];

function buildMap(): Map<string, string> {
  const map = new Map<string, string>(WORDS);
  for (const [us, uk] of STEMS) {
    for (const suffix of SUFFIXES) {
      const usWord = `${us}${suffix}`;
      // "catalogue" only takes the plain and plural forms here ("cataloguing" is irregular).
      if (us.endsWith('g') && suffix !== '' && suffix !== 's') continue;
      map.set(usWord, `${uk}${suffix}`);
    }
  }
  return map;
}

const US_TO_UK = buildMap();

function matchCase(source: string, replacement: string): string {
  if (source === source.toUpperCase() && source.length > 1) return replacement.toUpperCase();
  if (source[0] === source[0].toUpperCase()) return `${replacement[0].toUpperCase()}${replacement.slice(1)}`;
  return replacement;
}

export function applySpelling(text: string, variant: SpellingVariant): string {
  if (variant === 'us') return text;
  return text.replace(/[A-Za-z]+/g, (word) => {
    const uk = US_TO_UK.get(word.toLowerCase());
    return uk ? matchCase(word, uk) : word;
  });
}

export function britishSpellingFor(word: string): string | undefined {
  return US_TO_UK.get(word.toLowerCase());
}

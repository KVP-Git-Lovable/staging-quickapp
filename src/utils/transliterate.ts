// Minimal Devanagari → Latin transliteration for Order Scribe.
//
// Purpose-built safety net: when Hindi speech recognition yields Devanagari
// ("अदरक", "रेड लेबल") the Latin-script catalog matcher scores it ~0, so the
// Order Scribe retries matching with these deterministic transliterations.
// Calibrated against the real fuzzyMatch scoring: the naive inherent-'a'
// form ("adaraka") clears the existing medium threshold, and the schwa-
// dropped form ("adarak" / "red lebal") typically scores high — both are
// offered as candidates and the UNCHANGED matcher stays authoritative.
// No dependencies; non-Devanagari characters pass through untouched.

const CONSONANTS: Record<string, string> = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh',
  'ष': 'sh', 'स': 's', 'ह': 'h',
  'क़': 'q', 'ख़': 'kh', 'ग़': 'g', 'ज़': 'z', 'ड़': 'r', 'ढ़': 'rh', 'फ़': 'f', 'य़': 'y',
};

const VOWELS: Record<string, string> = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
  'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o',
};

const MATRAS: Record<string, string> = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo',
  'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o',
};

const DIGITS: Record<string, string> = {
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
};

const VIRAMA = '्';
const NUKTA = '़';
const ANUSVARA = 'ं';
const CHANDRABINDU = 'ँ';
const VISARGA = 'ः';

const DEVANAGARI_RE = /[ऀ-ॿ]/;

export const containsDevanagari = (text: string): boolean => DEVANAGARI_RE.test(text || '');

/** Replace Devanagari numerals with ASCII digits; everything else untouched. */
export function normalizeDevanagariDigits(text: string): string {
  return String(text || '').replace(/[०-९]/g, (d) => DIGITS[d] ?? d);
}

/** Naive syllabic transliteration: consonants carry an inherent 'a' unless
 * followed by a virama or a vowel sign. */
export function transliterateToLatin(text: string): string {
  const src = String(text || '').normalize('NFC');
  let out = '';
  for (let i = 0; i < src.length; i++) {
    let ch = src[i];
    // Fold a following nukta into the base consonant where a mapping exists.
    if (src[i + 1] === NUKTA) {
      const withNukta = ch + NUKTA;
      if (CONSONANTS[withNukta]) {
        ch = withNukta;
        i++;
      } else {
        // Unknown nukta combo: use the base consonant, skip the nukta.
        i++;
      }
    }
    if (CONSONANTS[ch]) {
      out += CONSONANTS[ch];
      const next = src[i + 1];
      if (next === VIRAMA) {
        i++; // conjunct: suppress the inherent vowel
      } else if (next && MATRAS[next]) {
        out += MATRAS[next];
        i++;
      } else {
        out += 'a'; // inherent vowel
      }
    } else if (VOWELS[ch]) {
      out += VOWELS[ch];
    } else if (DIGITS[ch]) {
      out += DIGITS[ch];
    } else if (ch === ANUSVARA || ch === CHANDRABINDU) {
      out += 'n';
    } else if (ch === VISARGA) {
      out += 'h';
    } else if (ch === NUKTA || ch === VIRAMA) {
      // stray combining mark — drop
    } else {
      out += ch; // Latin letters, spaces, punctuation pass through
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Candidate spellings for catalog matching, best-first:
 *  1. schwa-dropped form (Hindi word-final inherent 'a' is usually silent:
 *     "adaraka" → "adarak", "reda lebala" → "red lebal") — calibrated to
 *     score highest against Latin catalog names;
 *  2. the full naive form.
 *  Deduplicated; empty when the input has no Devanagari. */
export function transliterationCandidates(text: string): string[] {
  if (!containsDevanagari(text)) return [];
  const full = transliterateToLatin(text);
  const schwaDropped = full
    .split(' ')
    .map((w) => (w.length > 2 && w.endsWith('a') ? w.slice(0, -1) : w))
    .join(' ');
  return [...new Set([schwaDropped, full])].filter(Boolean);
}

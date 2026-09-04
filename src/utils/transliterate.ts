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
  // Devanagari
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh',
  'ष': 'sh', 'स': 's', 'ह': 'h',
  'क़': 'q', 'ख़': 'kh', 'ग़': 'g', 'ज़': 'z', 'ड़': 'r', 'ढ़': 'rh', 'फ़': 'f', 'य़': 'y',
  // Kannada (same abugida structure)
  'ಕ': 'k', 'ಖ': 'kh', 'ಗ': 'g', 'ಘ': 'gh', 'ಙ': 'n',
  'ಚ': 'ch', 'ಛ': 'chh', 'ಜ': 'j', 'ಝ': 'jh', 'ಞ': 'n',
  'ಟ': 't', 'ಠ': 'th', 'ಡ': 'd', 'ಢ': 'dh', 'ಣ': 'n',
  'ತ': 't', 'ಥ': 'th', 'ದ': 'd', 'ಧ': 'dh', 'ನ': 'n',
  'ಪ': 'p', 'ಫ': 'ph', 'ಬ': 'b', 'ಭ': 'bh', 'ಮ': 'm',
  'ಯ': 'y', 'ರ': 'r', 'ಱ': 'r', 'ಲ': 'l', 'ಳ': 'l',
  'ವ': 'v', 'ಶ': 'sh', 'ಷ': 'sh', 'ಸ': 's', 'ಹ': 'h', 'ೞ': 'l',
};

const VOWELS: Record<string, string> = {
  // Devanagari
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
  'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o',
  // Kannada — long e/o map to single Latin letters, matching how English
  // brand words are written in Kannada (ಲೇಬಲ್ = lebal, ಗೋಲ್ಡ್ = gold)
  'ಅ': 'a', 'ಆ': 'aa', 'ಇ': 'i', 'ಈ': 'ee', 'ಉ': 'u', 'ಊ': 'oo',
  'ಋ': 'ri', 'ಎ': 'e', 'ಏ': 'e', 'ಐ': 'ai', 'ಒ': 'o', 'ಓ': 'o', 'ಔ': 'au',
};

const MATRAS: Record<string, string> = {
  // Devanagari
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo',
  'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o',
  // Kannada
  'ಾ': 'aa', 'ಿ': 'i', 'ೀ': 'ee', 'ು': 'u', 'ೂ': 'oo',
  'ೃ': 'ri', 'ೆ': 'e', 'ೇ': 'e', 'ೈ': 'ai', 'ೊ': 'o', 'ೋ': 'o', 'ೌ': 'au',
};

const DIGITS: Record<string, string> = {
  // Devanagari
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
  // Kannada
  '೦': '0', '೧': '1', '೨': '2', '೩': '3', '೪': '4',
  '೫': '5', '೬': '6', '೭': '7', '೮': '8', '೯': '9',
};

const VIRAMAS = new Set(['्', '್']);
const NUKTA = '़';
const ANUSVARAS = new Set(['ं', 'ಂ', 'ँ']);
const VISARGAS = new Set(['ः', 'ಃ']);

const DEVANAGARI_RE = /[ऀ-ॿ]/;
const INDIC_RE = /[ऀ-ॿ]|[ಀ-೿]/;

export const containsDevanagari = (text: string): boolean => DEVANAGARI_RE.test(text || '');
/** Devanagari OR Kannada — the scripts the Order Scribe pipeline understands. */
export const containsIndicScript = (text: string): boolean => INDIC_RE.test(text || '');

/** Replace Devanagari/Kannada numerals with ASCII digits; rest untouched. */
export function normalizeDevanagariDigits(text: string): string {
  return String(text || '').replace(/[०-९]|[೦-೯]/g, (d) => DIGITS[d] ?? d);
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
      if (next && VIRAMAS.has(next)) {
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
    } else if (ANUSVARAS.has(ch)) {
      out += 'n';
    } else if (VISARGAS.has(ch)) {
      out += 'h';
    } else if (ch === NUKTA || VIRAMAS.has(ch)) {
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
  if (!containsIndicScript(text)) return [];
  const full = transliterateToLatin(text);
  const schwaDropped = full
    .split(' ')
    .map((w) => (w.length > 2 && w.endsWith('a') ? w.slice(0, -1) : w))
    .join(' ');
  return [...new Set([schwaDropped, full])].filter(Boolean);
}

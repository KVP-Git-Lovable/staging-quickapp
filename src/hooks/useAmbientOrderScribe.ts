// Ambient Order Scribe — passive speech-to-text for the order-entry page.
//
// PRIVACY CONTRACT (do not weaken):
// - Listening starts ONLY on an explicit user action, never on mount.
// - The transcript lives in memory (state/refs) only: no DB writes, no
//   local/sessionStorage of conversation content, no audio recording.
// - The transcript is sent to the backend (ambient-order-parser, Together.ai)
//   ONLY when the user explicitly accepts — never per interim update.
// - localStorage holds nothing but the language preference.
// Note: Web Speech API recognition itself may be processed by the browser
// vendor's service; the card surfaces this to the user.
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  normalizeUnit,
  collapseWhitespace,
  findBestMatch,
  buildProductShortlist,
  type FuzzyProduct,
} from '@/utils/productFuzzyMatch';
import { parseTranscriptHeuristic } from '@/utils/transcriptHeuristic';
import { containsDevanagari, transliterateToLatin, transliterationCandidates, normalizeDevanagariDigits } from '@/utils/transliterate';
import type { VoiceAutoFillResult } from '@/components/TableOrderForm';

const SpeechRecognitionImpl =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : undefined;

const LANG_KEY = 'order_scribe_voice_lang'; // language preference ONLY, never content
const PARSER_TIMEOUT_MS = 8000;
const MAX_TRANSCRIPT_CHARS = 4000;
// Deterministic sanity bound on any single parsed line quantity.
const MAX_LINE_QUANTITY = 999;
// Units the app understands after normalizeUnit; anything else is rejected.
const KNOWN_UNITS = new Set(['', 'kg', 'g', 'piece', 'pieces', 'pc', 'packet', 'packets']);

export type ScribeStatus = 'idle' | 'listening' | 'paused' | 'processing' | 'error';

// ── Transcript-evidence guard ───────────────────────────────────────────────
// Invariant: NO order row unless the transcript itself supports that product.
// The parser model, given the catalog list, can substitute a *different real
// catalog product* for a spoken one (e.g. spoken "taj mahal" → returned
// "KANAN DEVAN"); such a name sails through findBestMatch with high
// confidence, so catalog matching alone is not enough. This deterministic
// layer is the final authority. The shared matcher and its thresholds are
// deliberately untouched.

// Tokens that can never identify a product on their own.
const HARD_GENERIC_TOKENS = new Set([
  'tea', 'chai', 'pack', 'packet', 'packets', 'blend', 'special', 'premium',
  'extra', 'fresh', 'sample', 'super', 'powder', 'the', 'and', 'aur',
  'kg', 'kilo', 'kilogram', 'gram', 'grams', 'piece', 'pieces',
]);
// Shared brand-ish words: real evidence only in combination or as the whole
// primary name (so "red label" counts, bare "red" cannot pick RED ME).
const SOFT_GENERIC_TOKENS = new Set(['gold', 'red', 'blue', 'green', 'yellow', 'label', 'white', 'black']);

const SIZE_TOKEN_RE = /^\d+(g|kg|gm|ml|l|s)?$/i;

const evidenceWords = (text: string): string[] =>
  String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !SIZE_TOKEN_RE.test(w));

const wordSimilarity = (a: string, b: string): number => {
  if (a === b) return 1;
  if (a.length >= 4 && (a.includes(b) || b.includes(a))) return 0.8;
  // Small local Levenshtein (word-level only; shared util stays untouched).
  const m: number[][] = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] = b[i - 1] === a[j - 1]
        ? m[i - 1][j - 1]
        : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
    }
  }
  return 1 - m[b.length][a.length] / Math.max(a.length, b.length);
};

const isSupported = (token: string, corpus: string[]): boolean =>
  corpus.some((w) => wordSimilarity(token, w) >= 0.75);

/** A term has transcript evidence when at least one non-generic,
 * product-identifying token of it is supported by the corpus; soft-generic
 * tokens (gold/red/label…) count only when every token of the term is
 * supported AND the term has 2+ tokens or is exactly the product's primary
 * word. Hard-generic and size tokens never count. */
function hasTranscriptEvidence(term: string, corpus: string[], primaryName?: string): boolean {
  const tokens = evidenceWords(term).filter((t) => !HARD_GENERIC_TOKENS.has(t));
  if (!tokens.length) return false;
  const identifying = tokens.filter((t) => !SOFT_GENERIC_TOKENS.has(t));
  if (identifying.some((t) => isSupported(t, corpus))) return true;
  // Soft-generic-only terms: demand full support plus real specificity.
  if (tokens.every((t) => isSupported(t, corpus))) {
    if (tokens.length >= 2) return true;
    const primary = evidenceWords(primaryName ?? '').filter((t) => !HARD_GENERIC_TOKENS.has(t));
    if (primary.length === 1 && primary[0] === tokens[0]) return true;
  }
  return false;
}

export interface ScribeAcceptOutcome {
  applied: VoiceAutoFillResult[];
  /** productSearch terms that were parsed but could not be validated/matched. */
  skipped: string[];
  /** True when the transcript was consumed (>=1 applied) and cleared. */
  cleared: boolean;
}

/** Return shape of useAmbientOrderScribe — the shared capture session both
 * the Order Scribe card and the Retailer Meet Summary card consume. */
export type AmbientOrderScribe = ReturnType<typeof useAmbientOrderScribe>;

export function useAmbientOrderScribe(products: FuzzyProduct[]) {
  const isSupported = !!SpeechRecognitionImpl;

  const [status, setStatus] = useState<ScribeStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguageState] = useState<string>(() => {
    try {
      return localStorage.getItem(LANG_KEY) || 'en-IN';
    } catch {
      return 'en-IN';
    }
  });

  // Generation guard: bumped on every start/stop/pause/lang-change/unmount.
  // Every recognizer callback checks its captured generation before acting,
  // so a stale onend can never restart recognition and two recognizers can
  // never run at once.
  const sessionRef = useRef(0);
  const recognitionRef = useRef<any>(null);
  const committedTextRef = useRef('');
  const partialTextRef = useRef('');
  const statusRef = useRef<ScribeStatus>('idle');
  statusRef.current = status;

  const productsRef = useRef(products);
  productsRef.current = products;

  const teardownRecognizer = useCallback(() => {
    sessionRef.current += 1; // invalidate all pending callbacks/restarts
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      try { rec.stop(); } catch { /* already stopped */ }
    }
  }, []);

  const startRecognizer = useCallback((lang: string) => {
    if (!SpeechRecognitionImpl) return;
    teardownRecognizer();
    const gen = ++sessionRef.current;

    const recognition = new SpeechRecognitionImpl();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      if (gen !== sessionRef.current) return;
      let interimText = '';
      let newCommitted = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const spoken = result[0]?.transcript || '';
        if (result.isFinal) newCommitted += `${spoken} `;
        else interimText += spoken;
      }
      if (newCommitted.trim()) {
        committedTextRef.current = collapseWhitespace(`${committedTextRef.current} ${newCommitted}`);
      }
      partialTextRef.current = collapseWhitespace(interimText);
      setTranscript(committedTextRef.current);
      setInterim(partialTextRef.current);
    };

    recognition.onerror = (event: any) => {
      if (gen !== sessionRef.current) return;
      if (event.error === 'no-speech' || event.error === 'aborted') return; // benign; onend restarts
      if (
        event.error === 'not-allowed' ||
        event.error === 'service-not-allowed' ||
        event.error === 'audio-capture'
      ) {
        // Terminal: never auto-retried.
        teardownRecognizer();
        setError(
          event.error === 'audio-capture'
            ? 'No microphone was found. Check your audio input.'
            : 'Microphone access denied. Allow microphone access and press Start again.',
        );
        setStatus('error');
      }
    };

    recognition.onend = () => {
      if (gen !== sessionRef.current) return;
      // Continuous sessions get cut by the browser; restart under the SAME
      // generation. Pause/Stop/Accept/unmount bump the generation, which
      // makes this a no-op there.
      setTimeout(() => {
        if (gen !== sessionRef.current) return;
        try { recognition.start(); } catch { /* mid-teardown */ }
      }, 250);
    };

    try {
      recognition.start();
      setError(null);
      setStatus('listening');
    } catch (e) {
      console.error('[OrderScribe] failed to start recognition:', e);
      teardownRecognizer();
      setError('Could not start voice capture. Try again.');
      setStatus('error');
    }
  }, [teardownRecognizer]);

  /** Explicit user action only — never called on mount. */
  const start = useCallback(() => {
    if (!isSupported) return;
    if (statusRef.current === 'listening' || statusRef.current === 'processing') return;
    startRecognizer(language);
  }, [isSupported, language, startRecognizer]);

  const pause = useCallback(() => {
    if (statusRef.current !== 'listening') return;
    teardownRecognizer();
    setStatus('paused');
  }, [teardownRecognizer]);

  const stop = useCallback(() => {
    teardownRecognizer();
    setStatus('idle');
  }, [teardownRecognizer]);

  const clearTranscript = useCallback(() => {
    committedTextRef.current = '';
    partialTextRef.current = '';
    setTranscript('');
    setInterim('');
  }, []);

  const setLanguage = useCallback((lang: string) => {
    setLanguageState(lang);
    try { localStorage.setItem(LANG_KEY, lang); } catch { /* ignore */ }
    // Mid-listening switch: keep committed text, restart cleanly with the
    // new language. The old recognizer's un-committed interim fragment is
    // necessarily dropped (Web Speech offers no handover).
    if (statusRef.current === 'listening') {
      partialTextRef.current = '';
      setInterim('');
      startRecognizer(lang);
    }
  }, [startRecognizer]);

  // Unmount: invalidate generation + stop — no restart callback survives.
  useEffect(() => () => { teardownRecognizer(); }, [teardownRecognizer]);

  /** Parse+validate the model/heuristic orders into apply-ready results.
   * `snapshot` is the accepted transcript — the evidence authority. */
  const resolveOrders = useCallback((orders: unknown[], snapshot: string): { results: VoiceAutoFillResult[]; skipped: string[] } => {
    const skipped: string[] = [];
    const resolved: VoiceAutoFillResult[] = [];
    // Evidence corpus: spoken words plus their transliterations, so Hindi
    // Devanagari speech supports Latin catalog names.
    const corpus = [
      ...evidenceWords(snapshot),
      ...transliterationCandidates(snapshot).flatMap(evidenceWords),
    ];
    for (const raw of Array.isArray(orders) ? orders : []) {
      const o = raw as Record<string, unknown>;
      // Deterministic validation — the model is never trusted:
      const searchTerm = typeof o?.productSearch === 'string' ? o.productSearch.trim().slice(0, 120) : '';
      const quantity = Number(o?.quantity);
      const unitNorm = normalizeUnit(typeof o?.unit === 'string' ? o.unit : '');
      if (!searchTerm) continue;
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_LINE_QUANTITY || !KNOWN_UNITS.has(unitNorm)) {
        skipped.push(searchTerm);
        continue;
      }
      // Catalog authority is the existing fuzzy matcher; below-threshold
      // terms create no rows.
      let { product, variant, confidence } = findBestMatch(searchTerm, productsRef.current);
      // Hindi speech yields Devanagari which scores ~0 against the Latin
      // catalog — retry the UNCHANGED matcher with deterministic
      // transliteration candidates (thresholds untouched). If none passes,
      // the item is skipped, never guessed.
      if (!product && containsDevanagari(searchTerm)) {
        for (const candidate of transliterationCandidates(searchTerm)) {
          const retry = findBestMatch(candidate, productsRef.current);
          if (retry.product) {
            ({ product, variant, confidence } = retry);
            break;
          }
        }
      }
      if (!product) {
        skipped.push(searchTerm);
        continue;
      }
      // Transcript-evidence guard (final authority): both the claimed spoken
      // term AND the resolved catalog product must be supported by what was
      // actually said — a substituted-but-real catalog name fails here.
      // A Devanagari term is judged via its transliteration candidates,
      // since evidence tokens are Latin.
      const matchedName = variant?.variant_name
        ? `${product.name} ${variant.variant_name}`
        : product.name;
      const termForms = [searchTerm, ...transliterationCandidates(searchTerm)];
      const termSupported = termForms.some((t) => hasTranscriptEvidence(t, corpus, product.name));
      // The matched catalog name itself must show transcript evidence too,
      // but only for LOW-confidence matches — that's where matcher drift can
      // land on an unrelated product. At medium/high the matcher already
      // ties the (transcript-supported) term tightly to the name, and
      // demanding the catalog's exact spelling in the corpus would wrongly
      // reject transliterated speech ("lebal" vs "LABEL").
      const nameSupported =
        confidence !== 'low' || hasTranscriptEvidence(matchedName, corpus, product.name);
      if (!termSupported || !nameSupported) {
        skipped.push(searchTerm);
        continue;
      }
      resolved.push({
        productId: product.id,
        productName: product.name,
        variantId: variant?.id,
        variantName: variant?.variant_name,
        quantity,
        // Empty unit = "not clearly spoken": leave '' so the table resolves
        // the product's own default order unit instead of guessing.
        unit: unitNorm === 'g' ? 'Grams' : unitNorm === 'kg' ? 'KG' : unitNorm ? 'Pieces' : '',
        confidence,
        searchTerm,
      });
    }
    // Pre-aggregate duplicate mentions ("3 kg adarak aur 2 kg adarak") into
    // one entry so applyVoiceAutoFill's add-to-existing-row semantics see a
    // single deterministic quantity.
    const byKey = new Map<string, VoiceAutoFillResult>();
    for (const r of resolved) {
      const key = `${r.productId}|${r.variantId ?? ''}`;
      const existing = byKey.get(key);
      if (existing) existing.quantity += r.quantity;
      else byKey.set(key, { ...r });
    }
    return { results: [...byKey.values()], skipped };
  }, []);

  /**
   * Accept: snapshot committed + interim, stop capture, parse via the
   * Together-backed ambient-order-parser (genuinely aborted after 8s), fall
   * back to the shared on-device heuristic, validate + match, hand results
   * to the caller. Transcript is cleared only when >=1 row applied; capture
   * resumes afterwards only if it was live before Accept.
   */
  const acceptTranscript = useCallback(async (
    apply: (results: VoiceAutoFillResult[]) => void,
  ): Promise<ScribeAcceptOutcome> => {
    const wasListening = statusRef.current === 'listening';
    // Snapshot includes the current interim fragment so the latest phrase
    // is never lost when accepting mid-sentence.
    const snapshot = collapseWhitespace(`${committedTextRef.current} ${partialTextRef.current}`)
      .slice(-MAX_TRANSCRIPT_CHARS);
    teardownRecognizer(); // freeze the transcript while we work
    setStatus('processing');

    const outcome: ScribeAcceptOutcome = { applied: [], skipped: [], cleared: false };
    try {
      if (!snapshot) return outcome;

      let parsedOrders: unknown[] = [];
      if (productsRef.current.length) {
        // Shortlist keeps the payload bounded while deterministically
        // prioritising names relevant to what was actually said; feeding the
        // transliteration too lets Devanagari speech surface Latin names.
        const shortlistText = collapseWhitespace(`${snapshot} ${transliterateToLatin(snapshot)}`);
        const productNames = buildProductShortlist(shortlistText, productsRef.current);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PARSER_TIMEOUT_MS);
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token;
          if (token) {
            const resp = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ambient-order-parser`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ transcript: snapshot, productNames }),
                signal: controller.signal,
              },
            );
            if (resp.ok) {
              const data = await resp.json();
              if (Array.isArray(data?.orders)) parsedOrders = data.orders;
            } else {
              console.warn('[OrderScribe] parser HTTP', resp.status);
            }
          }
        } catch (err: any) {
          if (err?.name === 'AbortError') console.warn('[OrderScribe] parser timed out, using local heuristic');
          else console.warn('[OrderScribe] parser failed, using local heuristic:', err);
        } finally {
          clearTimeout(timer);
        }
      }

      if (parsedOrders.length === 0) {
        // Devanagari numerals ("३ किलो") must become ASCII before the
        // heuristic's quantity regex; the parsing logic itself is the
        // shared, unchanged implementation.
        parsedOrders = parseTranscriptHeuristic(normalizeDevanagariDigits(snapshot));
      }

      const { results, skipped } = resolveOrders(parsedOrders, snapshot);
      outcome.skipped = skipped;
      if (results.length) {
        apply(results);
        outcome.applied = results;
        clearTranscript();
        outcome.cleared = true;
      }
      // Nothing applied → transcript stays intact for correction/retry.
      return outcome;
    } finally {
      if (wasListening) startRecognizer(language);
      else setStatus('idle');
    }
  }, [teardownRecognizer, resolveOrders, clearTranscript, startRecognizer, language]);

  return {
    isSupported,
    status,
    transcript,
    interim,
    error,
    language,
    setLanguage,
    start,
    pause,
    stop,
    clearTranscript,
    acceptTranscript,
  };
}

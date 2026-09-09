// Phonetic Latin → Devanagari transliteration for worker names that arrive from
// the backend in the Roman script. It is intentionally simple and rule-based:
// good enough to render common North-Indian names (Rahul, Suresh, Vijay, Anita…)
// in Hindi when the language toggle is set to हिन्दी. It is a best-effort display
// aid — the canonical name sent to the server is never changed.

const VIRAMA = '्'; // ् — suppresses a consonant's inherent "a"

// Independent vowel + its matra (the sign attached to a preceding consonant).
// The inherent vowel "a" has an empty matra because every bare consonant already
// carries it.
const VOWELS = {
  a: {ind: 'अ', sign: ''},
  aa: {ind: 'आ', sign: 'ा'},
  i: {ind: 'इ', sign: 'ि'},
  ii: {ind: 'ई', sign: 'ी'},
  ee: {ind: 'ई', sign: 'ी'},
  u: {ind: 'उ', sign: 'ु'},
  uu: {ind: 'ऊ', sign: 'ू'},
  oo: {ind: 'ऊ', sign: 'ू'},
  e: {ind: 'ए', sign: 'े'},
  ai: {ind: 'ऐ', sign: 'ै'},
  ei: {ind: 'ऐ', sign: 'ै'},
  o: {ind: 'ओ', sign: 'ो'},
  au: {ind: 'औ', sign: 'ौ'},
  ou: {ind: 'औ', sign: 'ौ'},
};

// Consonants — the base glyph carries an inherent "a". Longer keys are tried
// first so digraphs (sh, ch, th…) win over their single-letter prefixes.
const CONSONANTS = {
  chh: 'छ',
  shh: 'ष',
  kh: 'ख',
  gh: 'घ',
  ng: 'ङ',
  ch: 'च',
  jh: 'झ',
  th: 'थ',
  dh: 'ध',
  ph: 'फ',
  bh: 'भ',
  sh: 'श',
  ksh: 'क्ष',
  gy: 'ज्ञ',
  k: 'क',
  q: 'क',
  c: 'क',
  g: 'ग',
  j: 'ज',
  z: 'ज़',
  t: 'त',
  d: 'द',
  n: 'न',
  p: 'प',
  f: 'फ',
  b: 'ब',
  m: 'म',
  y: 'य',
  r: 'र',
  l: 'ल',
  v: 'व',
  w: 'व',
  s: 'स',
  h: 'ह',
  x: 'क्स',
};

const isAsciiLetter = ch => ch >= 'a' && ch <= 'z';

/** Longest-match lookup in `table` at position `i`, trying up to `maxLen` chars. */
function match(word, i, table, maxLen) {
  for (let len = maxLen; len >= 1; len--) {
    const seg = word.substr(i, len);
    if (table[seg]) {
      return {value: table[seg], len};
    }
  }
  return null;
}

/** Transliterate a single Roman word into Devanagari. */
function word(input) {
  const w = input.toLowerCase();
  let out = '';
  let i = 0;
  let pendingConsonant = false; // a consonant was just emitted, awaiting a vowel

  while (i < w.length) {
    if (!isAsciiLetter(w[i])) {
      out += w[i]; // keep hyphens, dots, digits as-is
      pendingConsonant = false;
      i++;
      continue;
    }

    const cons = match(w, i, CONSONANTS, 3);
    if (cons) {
      // Two consonants in a row form a cluster: bind them with a virama.
      if (pendingConsonant) {
        out += VIRAMA;
      }
      out += cons.value;
      pendingConsonant = true;
      i += cons.len;
      continue;
    }

    const vowel = match(w, i, VOWELS, 2);
    if (vowel) {
      // After a consonant a vowel is a matra (inherent "a" adds nothing);
      // otherwise it is written in its independent form.
      out += pendingConsonant ? vowel.value.sign : vowel.value.ind;
      pendingConsonant = false;
      i += vowel.len;
      continue;
    }

    out += w[i]; // unknown letter — pass through
    pendingConsonant = false;
    i++;
  }
  // A trailing consonant keeps its bare form (Hindi drops the final schwa), so no
  // closing virama is added.
  return out;
}

/**
 * Transliterate a full name (possibly several words) to Devanagari. Returns the
 * input unchanged when it is empty or already contains Devanagari characters.
 */
export function latinToDevanagari(name) {
  const raw = String(name == null ? '' : name);
  if (!raw.trim()) {
    return raw;
  }
  if (/[ऀ-ॿ]/.test(raw)) {
    return raw; // already Devanagari
  }
  return raw.replace(/[A-Za-z]+/g, m => word(m));
}

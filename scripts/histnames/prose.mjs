/* ============================================================================
 *  IntMap · WHEN THE UPSTREAM WROTE A SENTENCE, NOT A NAME                (#R695)
 * ----------------------------------------------------------------------------
 *  #R686 measured the ceiling of the Wikidata lane honestly and said why part of it can never be
 *  reached: aourednik's cartographer writes ENGLISH PROSE where there is no polity to name —
 *  「Savanna hunter-gatherers」「Plain bison hunters」「West African cereal farmers」 — and
 *  「どの言語のどの出典にも存在しない。1 人の製図者の英語の文だからである」. That is exactly
 *  right about a SOURCE, and it is the reason the strings were left in English.
 *
 *  ⚠ BUT A DESCRIPTION IS NOT A NAME, AND TRANSLATING ONE INVENTS NOTHING. IntMap writes every
 *  string it shows the reader in the reader's language (AGENTS.md §3-5); what it must never do is
 *  invent an authority — assert that some people CALLED themselves something. 「サバンナの狩猟
 *  採集民」 asserts nothing about what anyone called themselves; it says in Japanese what the
 *  upstream said in English. Refusing to translate it does not protect the reader from a claim,
 *  it just serves them the claim in a language they may not read.
 *
 *  ⚠ SO THE WHOLE RULE IS THE CLASSIFIER, AND IT IS A MEASURE, NOT A LIST (#R515). A string is
 *  prose only when BOTH hold:
 *    · Wikidata carries NO item bearing it as an English label or alias. A string that names
 *      something is a name — 「Guanches」「Khoiasan」「Đại Việt」 are refused here even though the
 *      first two are the only spelling the map has, because they are somebody's name and the
 *      right answer to them is the Wikidata lane or nothing.
 *    · it contains a token written in lower case that the CORPUS ITSELF uses in two or more
 *      different names. `hunter-gatherers`, `culture`, `farmers`, `states` recur; `malak` in
 *      「Malak malak」 occurs once, so that string stays a name. The word list is discovered from
 *      the 3,028 spellings the bundle actually ships — nothing is typed here but the particles,
 *      which are grammar rather than vocabulary.
 *  Measured on data/hist-eras.js (2026-09-11): 108 spellings, 819 drawn features.
 *
 *  ⚠ AND THE RESULT IS MARKED. A prose row ships with `d:1`, so the map, the sources page and any
 *  later reader can say which strings are the upstream's description rather than a polity's name.
 *  #R682 put that distinction on the map for the deep snapshots; this keeps it true for the text.
 * ==========================================================================*/

/* Grammar, not vocabulary: a particle carries no description on its own, and several of these are
   what makes 「Comté de Toulouse」「Kichwa del Río Napo」 names rather than sentences. */
const PARTICLES = new Set(['of', 'the', 'and', 'in', 'on', 'at', 'a', 'an', 'or', 'to',
  'de', 'del', 'du', 'di', 'da', 'la', 'le', 'el', 'los', 'las', 'van', 'von', 'der', 'den', 'y']);

const words = (s) => String(s || '').split(/[\s,]+/).filter(Boolean);
const isLower = (w) => /^[a-z][a-z'-]*$/.test(w);

/**
 * The lower-case tokens this corpus uses as ordinary English — those written lower case in two or
 * more DIFFERENT names. Derived from the names themselves; nothing is listed.
 * @param {string[]} names every spelling the record ships
 */
export function commonWords(names) {
  const seen = new Map();
  for (const n of names) for (const w of words(n)) {
    if (!isLower(w) || PARTICLES.has(w)) continue;
    if (!seen.has(w)) seen.set(w, new Set());
    seen.get(w).add(n);
  }
  return new Set([...seen].filter(([, s]) => s.size >= 2).map(([w]) => w));
}

/**
 * Is this string the upstream describing, rather than naming?
 * @param {string} name         the upstream spelling
 * @param {boolean} hasItem     whether Wikidata carries any item bearing it
 * @param {Set<string>} common  from `commonWords`
 */
export function isProse(name, hasItem, common) {
  if (hasItem) return false;
  return words(name).some((w) => isLower(w) && !PARTICLES.has(w) && common.has(w));
}

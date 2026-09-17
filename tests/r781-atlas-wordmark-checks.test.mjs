/* ============================================================================
 *  R781 · THE PRODUCT'S NAME IS A WRITTEN MARK, NOT A PHRASE EACH LANGUAGE RENDERS
 * ----------------------------------------------------------------------------
 *  Reported: asked 「あなたは誰？」 in Japanese, Atlas answered that it works beneath
 *  「インターマップ」. That name is in 0 tracked files and on 0 screens — the model invented a
 *  Japanese rendering of an English-looking name, which is the ordinary thing to do with an
 *  English phrase. Nothing had ever told it that this particular string is the name itself.
 *
 *  So the defect is not the katakana spelling; pinning that one spelling would leave hangul,
 *  Cyrillic and Chinese free to invent their own. The defect is that js/atlas-persona.js fixed
 *  ATLAS's name across languages (`name`) and said nothing about the PRODUCT's. What is checked
 *  here is therefore the property and its reach, not a list of wrong spellings:
 *
 *    ① the persona states the mark, and the mark it states is the string the interface shows
 *    ② it states the property (no translated / transliterated / expanded form), not examples only
 *    ③ there is no mode that writes prose without it — order AND internal both carry it, and a
 *       built prompt of each mode contains it
 *    ④ the Edge Function mirror carries the same sentence (three server prompts speak as Atlas)
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { personaPrompt } from '../js/atlas-persona.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

/* The mark is not typed into this test: it is taken from what the reader actually sees in the
   browser tab, so a rename of the product would move both the UI and this measurement together. */
const MARK = (() => {
  const m = read('index.html').match(/<title>\s*([^\s—·<]+)/);
  assert.ok(m, 'index.html has no <title> to read the product name out of');
  return m[1];
})();

test('R781 ① the persona names the product with the same mark the interface shows', () => {
  const clause = personaPrompt.spec.clauses.wordmark;
  assert.ok(clause && clause.length > 40, 'the persona has no wordmark clause');
  assert.equal(MARK, 'IntMap', 'the product name read out of index.html is not the expected mark');
  assert.ok(clause.includes(MARK), `the wordmark clause never writes the mark itself (${MARK})`);
  /* and the mark is stated as the spelling, letter by letter — "capital I and capital M" is what
     rules out intmap / Intmap / INTMAP as much as a translation does */
  assert.match(clause, /capital I and\s*capital M/i, 'the clause does not fix the capitalisation of the mark');
});

test('R781 ② it states the property, so a language the clause never mentions is still covered', () => {
  const clause = personaPrompt.spec.clauses.wordmark;
  assert.match(clause, /no translated, transliterated or expanded form/i,
    'the clause lists scripts but never says the name HAS no other form — a script it forgot is then free');
  assert.match(clause, /in any language/i, 'the property is not stated as holding for every language');
  /* the two failure modes actually observed in the wild: a rendering in another script, and the
     letters read as an abbreviation to be spelled out */
  assert.match(clause, /kana/i, 'the clause does not name the script the reported failure used');
  assert.match(clause, /short for|spelled out/i, 'the clause does not rule out expanding the letters');
  /* and it says what to do instead, which is the only instruction that can be followed */
  assert.match(clause, /alongside the name rather than instead of it/i,
    'the clause forbids without saying how to describe the product in another language');
});

test('R781 ③ no mode writes prose without the clause', () => {
  const S = personaPrompt.spec;
  assert.ok(S.order.includes('wordmark'), 'the full preamble does not carry the wordmark clause');
  assert.ok(S.internal.includes('wordmark'),
    'internal mode drops it — yet internal mode is the one that translates an article (js/news-ui.js)');

  const full = personaPrompt('the general intelligence and operating layer of IntMap, an interactive world map');
  const internal = personaPrompt('translating a news article for IntMap', { mode: 'internal' });
  for (const [label, text] of [['full', full], ['internal', internal]]) {
    assert.ok(text.includes(S.clauses.wordmark), `${label} mode builds a prompt without the wordmark clause`);
  }
});

test('R781 ④ the Edge Function mirror carries the same sentence', async () => {
  /* Three server-side prompts (monitor-run / refresh-news / news-ingest) cannot import js/, so
     they read the generated copy. scripts/static-checks.mjs fails on drift as a byte diff; this
     asks the copy itself, so what is measured is the clause the server prompts actually receive. */
  const mirror = await import('../supabase/functions/_shared/atlas-persona.js');
  assert.equal(mirror.personaPrompt.spec.clauses.wordmark, personaPrompt.spec.clauses.wordmark,
    'the mirror does not carry the wordmark clause — run: node scripts/sync-atlas-persona.mjs');
  assert.ok(mirror.personaPrompt('x', { mode: 'internal' }).includes(personaPrompt.spec.clauses.wordmark),
    'the mirror builds a server prompt without it');
});

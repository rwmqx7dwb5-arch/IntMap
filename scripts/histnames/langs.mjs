/* ============================================================================
 *  IntMap · WHICH LANGUAGES THE HISTORICAL NAME TABLE SHIPS               (#R695)
 * ----------------------------------------------------------------------------
 *  ⚠ THIS IS THE ONE PLACE THE POLICY IS WRITTEN, and it is a POLICY, not a measurement.
 *  Until this round every reader-visible string in IntMap was held to the nine languages of
 *  js/locales/_langs.js (AGENTS.md §3-5). The user amended that for THIS DATA on 2026-09-11:
 *
 *      「9言語化という憲法は改正。いったん、英語と日本語だけやる方針に変更で。
 *        いつでもワン指示で多言語体制に戻せるようにはしておくこと。」
 *
 *  So the pipeline still KNOWS all nine — every query asks for all nine, every cache holds all
 *  nine — and only the shipped table is narrowed. Restoring the full set is the one edit below:
 *  `export const SHIP = ALL;`. Nothing else in the build, the gate or js/time-borders.js names a
 *  language, so nothing else has to change.
 *
 *  ⚠ NARROWING THE TABLE DOES NOT NARROW THE MAP. data/hist-borders.js carries name:xx that
 *  OpenHistoricalMap itself wrote in all nine, and js/time-borders.js's hand tables answer in
 *  five to eight. Those are the upstream's own words and this round removes none of them
 *  (AGENTS.md §3-1) — the policy here governs what THIS TABLE adds, which is why a French reader
 *  keeps every French name that already reached them.
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every language the app has, from the app's own generated registry — never typed here. */
export function appLangs(root = ROOT) {
  const w = {};
  new Function('window', readFileSync(join(root, 'js', 'locales', '_langs.js'), 'utf8'))(w);
  const codes = w.INTMAP_LANGS || w.IntMapLangCodes;
  if (!Array.isArray(codes) || !codes.length) throw new Error('js/locales/_langs.js published no language list');
  return codes.slice();
}

/** The languages the harvest asks Wikidata for. ALWAYS all of them — the cache is not the policy. */
export function harvestLangs(root = ROOT) { return appLangs(root); }

/* ── the line the amendment actually draws ───────────────────────────────────
   ⚠ THE FIRST VERSION OF THIS FILE NARROWED EVERYTHING, AND MEASURING IT SHOWED THAT WAS A
   REDUCTION, NOT A POLICY. #R686 already ships 242-421 Wikidata rows per language for German,
   Spanish, French, Korean, Russian and both Chinese scripts; a table narrowed to en+jp would have
   DELETED those from the reader's download — 「いったん英語と日本語だけ」 is about what IntMap is
   asked to WRITE, and AGENTS.md §3-1 forbids removing what is already there without asking.

   So the line is drawn by WHO WROTE THE WORDS, which is the same distinction the licence lane
   draws (#R689):
     · a label a SOURCE wrote (Wikidata, OpenHistoricalMap) costs nothing to carry — it is already
       fetched, already attested, already shipped — and is carried in every language a source
       wrote it in. `attestedLangs`.
     · a string INTMAP writes (the translations of the upstream's own English descriptions in
       scripts/histnames/prose-text.mjs) is authoring, and authoring is what the amendment
       narrowed. `shipLangs`. */

/** Languages in which a SOURCE's own label is carried. Every language the app has. */
export function attestedLangs(root = ROOT) { return appLangs(root); }

/**
 * Languages IntMap itself writes text in for this table.
 * ⚠ ONE EDIT RESTORES THE FULL SET: return `all` instead of the narrowed list. Nothing else in
 * the build, the gate or js/time-borders.js names a language.
 */
export function shipLangs(root = ROOT) {
  const all = appLangs(root);
  const NARROWED = ['en', 'jp'];                 /* ← the amended policy; `return all;` undoes it */
  return all.filter((l) => NARROWED.includes(l));
}

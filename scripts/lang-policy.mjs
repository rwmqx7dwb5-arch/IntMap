/* ============================================================================
 *  IntMap · ⚠⚠⚠ WHICH LANGUAGES INTMAP WRITES IN — THE ONE PLACE            (#R700)
 * ----------------------------------------------------------------------------
 *  This is a POLICY, not a measurement. The nine languages are a MEASUREMENT and they come from
 *  js/locales/_langs.js, which is generated from the locale directory; nothing here types a code
 *  except the narrowed set below.
 *
 *  The user amended the constitution on 2026-09-11:
 *
 *      「9言語化という憲法は改正。いったん、英語と日本語だけやる方針に変更で。
 *        いつでもワン指示で多言語体制に戻せるようにはしておくこと。」
 *
 *  ⚠⚠⚠ AND THE LINE IS DRAWN BY WHO WROTE THE WORDS, NOT BY WHICH SCREEN THEY LAND ON.
 *  #R695 measured this on the historical name table and the measurement is what decided the shape:
 *  a table narrowed to en+jp would have DELETED 242-421 Wikidata rows PER LANGUAGE that #R686
 *  already ships for German, Spanish, French, Korean, Russian and both Chinese scripts. Narrowing
 *  what is already there is a REDUCTION, and CONSTITUTION.md §0-3 forbids one without asking.
 *  So:
 *    · a label a SOURCE wrote (Wikidata, OpenHistoricalMap, a licence, a place name) costs nothing
 *      to carry — already fetched, already attested — and is carried in EVERY language a source
 *      wrote it in, forever. `attestedLangs`.
 *    · a string INTMAP writes — UI labels, panel prose, answers, the translations of an upstream's
 *      own English description — is AUTHORING, and authoring is what the amendment narrowed.
 *      `authoredLangs`.
 *
 *  ⚠⚠⚠ NARROWING WHAT IS AUTHORED NEXT IS NOT THE SAME AS DROPPING WHAT IS AUTHORED ALREADY.
 *  Every one of the nine is complete today (MEASURED #R700: keyed 421/421, pages 463/463,
 *  positional 7,336/7,336, inline 6,000/6,000 for all nine). A gate that simply stopped asking
 *  about the seven would let those rows rot out one deletion at a time with nothing red, which is
 *  the reduction this policy is explicitly NOT. scripts/i18n-audit.mjs therefore holds the seven to
 *  a FLOOR (tests/i18n-coverage-floor.json) instead of a ceiling of 100 %: a new English-only
 *  string is allowed because it does not lower any count, and deleting a Korean row is not.
 *
 *  ⚠ ONE EDIT RESTORES THE FULL SET: make `authoredLangs` return `all`. Nothing else in the build,
 *  in the gate, in scripts/histnames/ or in js/ names a language.
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every language the app has, from the app's own generated registry — never typed here. */
export function appLangs(root = ROOT) {
  const w = {};
  new Function('window', readFileSync(join(root, 'js', 'locales', '_langs.js'), 'utf8'))(w);
  const codes = w.INTMAP_LANGS || w.IntMapLangCodes;
  if (!Array.isArray(codes) || !codes.length) throw new Error('js/locales/_langs.js published no language list');
  return codes.slice();
}

/* ── the line the amendment actually draws ─────────────────────────────────────────────────────
   ⚠ THE ONLY TYPED CODES IN THE REPOSITORY'S LANGUAGE POLICY. `return all;` undoes the amendment
   in one edit, which is the 「いつでもワン指示で多言語体制に戻せる」 the instruction asked for. */
const NARROWED = ['en', 'jp'];

/**
 * Languages IntMap itself writes NEW text in. Held to 100 % on every surface by the i18n gate.
 * ⚠ ONE EDIT RESTORES THE FULL SET: `return all;`.
 */
export function authoredLangs(root = ROOT) {
  const all = appLangs(root);
  const narrowed = all.filter((l) => NARROWED.includes(l));
  /* ⚠ A POLICY THAT NAMES A LANGUAGE THE APP DOES NOT HAVE IS A POLICY NOBODY IS FOLLOWING. */
  const missing = NARROWED.filter((l) => !all.includes(l));
  if (missing.length) throw new Error(`scripts/lang-policy.mjs narrows to [${NARROWED}] but js/locales/ has no ${missing.join(', ')}`);
  return narrowed;
}

/**
 * Languages whose existing text is CARRIED, never authored into and never deleted.
 * Empty the day `authoredLangs` returns all of them — which is what makes the restore one edit.
 */
export function carriedLangs(root = ROOT) {
  const authored = new Set(authoredLangs(root));
  return appLangs(root).filter((l) => !authored.has(l));
}

/** Languages in which a SOURCE's own label is carried. Every language the app has — see the header. */
export function attestedLangs(root = ROOT) { return appLangs(root); }

/** The languages a harvest ASKS an upstream for. Always all of them — the cache is not the policy. */
export function harvestLangs(root = ROOT) { return appLangs(root); }

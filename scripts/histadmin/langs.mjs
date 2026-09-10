/* ============================================================================
 *  IntMap · the three alphabets a historical name has to cross               (#R695)
 * ----------------------------------------------------------------------------
 *  data/hist-admin<N>.js keys its `names` column by OSM's `name:<tag>` SUFFIX (`ja`, `zh-Hant`),
 *  the app keys its language by its own code (`jp`, `zh`), and Wikidata keys its labels by a third
 *  set again (`ja`, `zh-hant`). Three alphabets, and every hand-written table that crosses two of
 *  them is a place the crossing can be got backwards with nothing to say so — #R686 wrote that down
 *  for the Chinese pair and js/time-admin1.js had a second copy of the same table for the same map.
 *
 *  So none of it is typed here:
 *    · the app code ⇄ OSM suffix crossing IS js/lang-registry.js's `html` column, and this file
 *      EVALUATES that registry the way scripts/build-whs.mjs evaluates it (#R660);
 *    · the app code → Wikidata code crossing is scripts/histeras/match.mjs `LANG_SOURCES`;
 *    · WHICH languages ship is scripts/histnames/langs.mjs, the one place that policy is written.
 *  Add a language to the app and every one of those follows; none of them is edited here.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { shipLangs, harvestLangs } from '../histnames/langs.mjs';
import { LANG_SOURCES } from '../histeras/match.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** js/lang-registry.js, evaluated — the app's own list, with each language's real tag. */
export function registry(root = ROOT) {
  const sb = { window: {}, console, Number, Array, Math, JSON, String, Object, Intl, Date, RegExp };
  sb.window.window = sb.window;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'locales', '_langs.js'), 'utf8'), sb, { filename: '_langs.js' });
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'lang-registry.js'), 'utf8'), sb, { filename: 'lang-registry.js' });
  const L = sb.window.IntMapLang;
  if (!L || typeof L.htmlTag !== 'function' || typeof L.list !== 'function') throw new Error('js/lang-registry.js did not define IntMapLang');
  return L;
}

/**
 * app code → the OSM `name:` suffix the bundle keys that language by.
 * ⚠ This is the same function js/time-admin1.js calls to READ the bundle (`IntMapLang.htmlTag`),
 * which is why the two sides cannot drift: there is one implementation and both evaluate it.
 */
export function osmTag(code, reg) { return (reg || registry()).htmlTag(code); }

/** Every language the app has, as OSM suffixes — what the build HARVESTS from upstream tags. */
export function harvestTags(root = ROOT, reg = registry(root)) {
  return harvestLangs(root).map((c) => reg.htmlTag(c));
}

/** The languages the build may ADD a name in, as OSM suffixes. Narrowed by the policy module. */
export function shipTags(root = ROOT, reg = registry(root)) {
  return shipLangs(root).map((c) => reg.htmlTag(c));
}

/** app code → the Wikidata label codes to try, in order. `zh` is Traditional here (#R686). */
export function wikidataCodes(code) { return (LANG_SOURCES[code] || [code]).slice(); }

/** Every Wikidata label code the harvest asks for — all nine, whatever ships. */
export function harvestWikidataCodes(root = ROOT) {
  const out = [];
  for (const c of harvestLangs(root)) for (const w of wikidataCodes(c)) if (!out.includes(w)) out.push(w);
  return out;
}

/** OSM suffix → the app code that reads it (the inverse of `htmlTag`, from the same list). */
export function codeForTag(tag, reg = registry()) {
  const row = reg.list().find((l) => l.html === tag);
  return row ? row.code : null;
}

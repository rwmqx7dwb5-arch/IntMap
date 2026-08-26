/* ============================================================================
 *  IntMap · tests/helpers/layer-groups.mjs — the layer taxonomy, as a VALUE
 * ----------------------------------------------------------------------------
 *  `js/data-layers.js` declares `const GROUPS=[…]`: which shelf each layer row
 *  is on, in which order, and (since #R469) how many of each shelf's rows the
 *  reader named — the rest fold behind 「その他N件」 inside the category.
 *
 *  ⚠⚠⚠ EVERY CHECK THAT WANTED THIS ASKED IT WITH A REGEX, AND #R469 BROKE ALL
 *  OF THEM AT ONCE. The pattern was `/\['(lyrGrp\w+)',\[([^\]]*)\]\]/g` — it
 *  requires the id list to be followed immediately by `]]`, so adding a third
 *  element to the tuple made it match ZERO shelves. The tests did not report
 *  「the tuple changed shape」; they reported 「the panel has more than a handful
 *  of shelves」 and 「sats is in its own group」, i.e. they described the product
 *  as broken when nothing about the product had moved.
 *
 *  A regex over a literal is a check on SPELLING. This module evaluates the
 *  literal instead, so a check can ask what the taxonomy CONTAINS. The array is
 *  plain data — no identifiers, no calls — so evaluating it is reading it.
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* the brace-balanced literal, so the parse does not depend on where the author
   put the newlines or how many elements a tuple has */
function literal(src, needle, open, close) {
  const start = src.indexOf(needle);
  if (start < 0) throw new Error('js/data-layers.js no longer declares ' + needle);
  const from = src.indexOf(open, start);
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close) { depth--; if (!depth) return src.slice(from, i + 1); }
  }
  throw new Error('unbalanced ' + open + ' after ' + needle);
}

const SRC = readFileSync(resolve(ROOT, 'js/data-layers.js'), 'utf8')
  /* the comments in this file QUOTE ids that were moved or deleted, so they have to go before the
     literal is read — otherwise a shelf's history counts as its contents */
  .replace(/\/\*[\s\S]*?\*\//g, ' ');

/** every shelf, in panel order: `[key, ids, namedCount]` */
export const GROUPS = (0, eval)('(' + literal(SRC, 'const GROUPS=', '[', ']') + ')');

/** the ids explicitly routed to Beta before the safety sweep runs */
export const OTHERS_IDS = (0, eval)('(' + literal(SRC, 'const OTHERS_IDS=', '[', ']') + ')');

/* ⚠ (#R478) THE HEADING AN UNLISTED ROW LANDS UNDER — and it is NOT one of the shelves above.
   「その他 (beta)」 is not in `GROUPS`; `reorganizeLayerPanel`'s safety sweep builds it for every
   row no shelf claimed (#R271 is 🕒 タイムゾーン actually landing there). A check that wants to say
   「this row is where the declaration files it」 needs both halves, so both come from the same file:
   asking for the spelling instead is how tests/r439.spec.js kept a copy that went stale in #R469
   and stayed stale until the next nightly. */
export const BETA_KEY = (() => {
  const sweep = SRC.slice(SRC.indexOf('if(otherRows.length){'));
  const m = /setAttribute\('data-i18n','([^']+)'\)/.exec(sweep);
  if (!m) throw new Error('js/data-layers.js no longer builds the beta heading in the safety sweep');
  return m[1];
})();

/** `{ lyrGrpClimate: ['climate', …], … }` — the shape the older checks expected */
export const byKey = Object.fromEntries(GROUPS.map(([k, ids]) => [k, ids]));

/** which shelf a row is on, or `undefined` */
export const where = (id) => (GROUPS.find(([, ids]) => ids.indexOf(id) >= 0) || [])[0];

/** the rows of a shelf that the reader named — they stand open */
export const named = (key) => {
  const g = GROUPS.find(([k]) => k === key);
  if (!g) return [];
  return g[1].slice(0, g[2] == null ? g[1].length : g[2]);
};

/** the rows of a shelf behind its 「その他N件」 disclosure */
export const rest = (key) => {
  const g = GROUPS.find(([k]) => k === key);
  if (!g) return [];
  return g[1].slice(g[2] == null ? g[1].length : g[2]);
};

/** a `window.<name>=[…]` list from the same file, evaluated the same way */
export const publishedList = (name) => (0, eval)('(' + literal(SRC, 'window.' + name + '=', '[', ']') + ')');

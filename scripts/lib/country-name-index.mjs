/* ============================================================================
 *  IntMap · scripts/lib/country-name-index.mjs — A COUNTRY NAME, AS AN UPSTREAM WROTE IT → ISO 3166-1 alpha-3
 * ----------------------------------------------------------------------------
 *  (geopolitics-layers) The sanctions lists name countries in prose: the UK list writes «Russia», OFAC writes «Korea,
 *  North», «Burma». A builder that has to put such a party on the map needs the country's code, and the only honest way
 *  to get one is to ask records that STATE names and codes side by side — never a list of spellings typed here
 *  (.agents/rules/no-ad-hoc-hardcoding.md §2.4: a list is discovered, not written).
 *
 *  THE RECORDS ASKED, both already in the repository's reach:
 *    · Natural Earth Admin-0 (data/ne-countries, public domain — the shapes the map draws): NAME, NAME_LONG, ADMIN,
 *      FORMAL_EN, NAME_SORT, NAME_ALT, BRK_NAME, GEOUNIT, SUBUNIT, NAME_EN against ISO_A3_EH / ISO_A3 / ADM0_A3.
 *    · CLDR, through the engine's Intl.DisplayNames (en): the English name of every ISO 3166-1 alpha-2 code, joined to
 *      alpha-3 through Natural Earth's ISO_A2_EH.
 *  A name both records give to different codes is AMBIGUOUS and resolves to nothing — never to whichever was read first.
 *  A name neither record states is returned as unresolved: the builder counts it and prints it, it is never guessed.
 *
 *  The comparison form: NFKD without diacritics, lower case, «&» as «and», punctuation as space, and the
 *  «Surname, Given» inversion OFAC and Natural Earth's NAME_SORT both use («Korea, North» ⇄ «North Korea») tried both ways.
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

export const norm = (s) => String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

const NAME_FIELDS = ['NAME', 'NAME_LONG', 'ADMIN', 'FORMAL_EN', 'NAME_SORT', 'NAME_ALT', 'BRK_NAME', 'GEOUNIT', 'SUBUNIT', 'NAME_EN'];

/** the code a Natural Earth feature declares in the ISO namespace (the map's own countries reader asks the same
    columns in the same order: js/countries-ui.js) */
export function neCode(p) {
  for (const k of ['ISO_A3_EH', 'ISO_A3', 'ADM0_A3']) if (p[k] && p[k] !== '-99') return p[k];
  return null;
}

/** build the index from a Natural Earth bundle of the repository → { resolve(name) → alpha-3 | null, codes:Set } */
export function countryNameIndex(neFile, extra) {
  const d = JSON.parse(gunzipSync(readFileSync(neFile)));
  const props = (d.features || []).map((f) => f.p || f.properties || {});
  /** @type {Map<string, Set<string>>} */ const by = new Map();
  const put = function put(name, code, split = true) {
    /* a name written «A (B)» states two names (CLDR: «Myanmar (Burma)», Wikidata: «Congo (Kinshasa)»): each is indexed too */
    const pm = String(name || '').match(/^(.+?)\s*\((.+)\)\s*$/);
    if (pm && split) { put(pm[1], code); put(pm[2], code); }
    const k = norm(name);
    if (!k || !code) return;
    if (!by.has(k)) by.set(k, new Set());
    by.get(k).add(code);
  };
  const a2to3 = new Map();
  const codes = new Set();
  for (const p of props) {
    const c = neCode(p);
    if (!c) continue;
    codes.add(c);
    for (const f of NAME_FIELDS) if (p[f]) put(p[f], c);
    /* alpha-2 → alpha-3 only where the feature states BOTH in the ISO namespace (a disputed area has ISO_A3_EH «-99» and
       an ADM0_A3 of its own, and must not take its sovereign's alpha-2); a code shared by a country and its dependencies:
       the feature that IS the country (ADM0_A3 = ISO_A3_EH) keeps it */
    const a2 = p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : null;
    const a3 = p.ISO_A3_EH && p.ISO_A3_EH !== '-99' ? p.ISO_A3_EH : null;
    if (a2 && a3 && (!a2to3.has(a2) || p.ADM0_A3 === a3)) a2to3.set(a2, a3);
  }
  const dn = new Intl.DisplayNames(['en'], { type: 'region' });
  for (const [a2, c] of a2to3) { try { put(dn.of(a2), c); } catch (_) { /* a code CLDR does not name */ } }
  /* Wikidata's English label and aliases of every item that states an ISO 3166-1 alpha-3 code (P298) — handed in by the
     builder that read them, [[name, alpha3]], so this module stays offline */
  /* ⚠ ONLY FOR NAMES THE TWO RECORDS ABOVE DO NOT STATE. Measured 2026-11-17: merged on equal terms, Wikidata's aliases made
     «Russia» and «China» ambiguous (an alias of another coded item), and 7,500 parties fell off the map. An alias fills a
     gap; it never overrules a name Natural Earth or CLDR gives. Ambiguity among the aliases themselves still resolves to
     nothing. */
  const primary = new Set(by.keys());
  for (const [name, c] of extra || []) {
    if (!codes.has(c)) continue;
    const parts = [name, ...((String(name).match(/^(.+?)\s*\((.+)\)\s*$/) || []).slice(1))];
    for (const n of parts) if (!primary.has(norm(n))) put(n, c, false);
  }
  const one = (k) => { const s = by.get(k); return s && s.size === 1 ? [...s][0] : null; };
  function resolve(name) {
    const k = norm(name);
    if (!k) return null;
    const hit = one(k);
    if (hit) return hit;
    /* «Korea, North» ⇄ «North Korea» */
    const m = String(name).split(',');
    if (m.length === 2) { const flip = one(norm(m[1] + ' ' + m[0])); if (flip) return flip; }
    return null;
  }
  return { resolve, codes, a2to3 };
}

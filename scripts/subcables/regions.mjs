/* ============================================================================
 *  IntMap · subcables — WHICH ISO 3166-1 COUNTRY IS THIS NAME?           (#R384)
 * ----------------------------------------------------------------------------
 *  「クリックしたら出てくるカードの情報が翻訳されていない。」
 *
 *  The cable card printed 「接続国・地域 Cyprus · Syria」 to a Japanese reader
 *  and 「国・地域 Indonesia」 on every landing point, because TeleGeography
 *  hands country NAMES, in English, and a name cannot be translated — a CODE
 *  can. This resolves the 186 distinct spellings the inventory uses to ISO
 *  3166-1 alpha-2, at BUILD time, and the app then asks CLDR for the reader's
 *  own word through `window._imCldrRegion` (js/countries-ui.js).
 *
 *  ⚠ AND THE ANSWER IS NOT A TABLE OF 186 × 9 STRINGS. That is #R240's rule for
 *  the Countries tab and it is the same rule here: the canonical translation of
 *  every ISO region already ships inside the browser. What this file produces is
 *  only the JOIN KEY.
 *
 *  ── HOW THE INDEX IS BUILT ────────────────────────────────────────────────
 *  Node's own ICU is asked to name all 676 two-letter combinations; the ones it
 *  can name are the regions, and the name it gives is indexed back to the code.
 *  MEASURED: 263 codes, and 178 of the inventory's 186 spellings land on one.
 *
 *  ⚠ DEPRECATED ALPHA-2 CODES ARE SKIPPED, and skipping them is what makes the
 *  index usable at all. ICU still resolves DD, SU, TP, VD, YD, UK, FX, NH, AN …
 *  to the same display names as DE, RU, TL, VN, YE, GB, FR, VU, CW — so without
 *  this, 「United Kingdom」, 「France」, 「Germany」, 「Russia」, 「Vietnam」,
 *  「Yemen」, 「Vanuatu」, 「Timor-Leste」, 「Benin」 and 「Curaçao」 were all
 *  AMBIGUOUS and resolved to nothing. `Intl.Locale('und-XX').maximize().region`
 *  names the canonical code, so an alias is recognisable without a list.
 *
 *  ── AND WHAT IS NOT GUESSED ───────────────────────────────────────────────
 *  A spelling that reaches no code returns null, the row keeps the English name
 *  the data actually carries, and the build REPORTS the unresolved spellings so
 *  a new one cannot arrive silently (the brief's §11). The eight CLDR spells
 *  differently — 「Congo, Dem. Rep.」 vs 「Congo - Kinshasa」, 「Turkey」 vs
 *  「Türkiye」, 「Virgin Islands (U.S.)」 vs 「U.S. Virgin Islands」 … — are in
 *  data/subcable-overrides.json as `countryCodes`, with a `why`, like every
 *  other hand-made decision about this dataset.
 * ==========================================================================*/

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/* ⚠ THE CONNECTOR WORDS COME OUT, not just the punctuation. CLDR writes
   「Antigua & Barbuda」, 「St. Vincent & Grenadines」, 「São Tomé & Príncipe」
   where TeleGeography writes them out in full and with «and»/«the»; dropping
   `and`/`the` and expanding `St.` makes those seven agree without an entry
   apiece in the corrections file. */
export function normaliseRegionName(s) {
  return String(s || '')
    .toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\bst\b\.?/g, 'saint')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ').filter(w => w && w !== 'and' && w !== 'the').join(' ');
}

let INDEX = null;

/* normalised English display name → canonical alpha-2 (or the string 'AMBIG') */
export function regionIndex() {
  if (INDEX) return INDEX;
  const idx = new Map();
  let dn = null, dnShort = null;
  try { dn = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' }); } catch (_) { dn = null; }
  try { dnShort = new Intl.DisplayNames(['en'], { type: 'region', style: 'short', fallback: 'none' }); } catch (_) { dnShort = null; }
  if (!dn) { INDEX = idx; return idx; }
  for (const a of ALPHA) for (const b of ALPHA) {
    const cc = a + b;
    let canonical = cc;
    try { canonical = new Intl.Locale('und-' + cc).maximize().region || cc; } catch (_) { canonical = cc; }
    if (canonical !== cc) continue;                       /* a deprecated alias — see the header */
    let name = null; try { name = dn.of(cc); } catch (_) { name = null; }
    if (!name || name === cc) continue;
    const forms = [name];
    if (dnShort) { try { const s = dnShort.of(cc); if (s && s !== cc) forms.push(s); } catch (_) {} }
    for (const f of forms) {
      const k = normaliseRegionName(f);
      if (!k) continue;
      if (idx.has(k) && idx.get(k) !== cc) idx.set(k, 'AMBIG');
      else if (!idx.has(k)) idx.set(k, cc);
    }
  }
  INDEX = idx;
  return idx;
}

/* `overrides` is data/subcable-overrides.json's `countryCodes`: the exact name
   as the inventory writes it → alpha-2. It wins over CLDR, because it exists
   only for spellings CLDR does not have. */
export function resolveRegion(name, overrides) {
  const raw = String(name || '').trim();
  if (!raw) return null;
  if (overrides) {
    const o = overrides[raw] || overrides[normaliseRegionName(raw)];
    if (typeof o === 'string' && /^[A-Za-z]{2}$/.test(o)) return o.toUpperCase();
    if (o === null) return null;                          /* an explicit "there is no code for this" */
  }
  const hit = regionIndex().get(normaliseRegionName(raw));
  return (hit && hit !== 'AMBIG') ? hit : null;
}

/* every distinct spelling that reached no code — the build prints this, so a
   spelling TeleGeography changes tomorrow cannot quietly become English again */
export function unresolvedRegions(names, overrides) {
  const out = [];
  for (const n of new Set(names)) if (n && !resolveRegion(n, overrides)) out.push(n);
  return out.sort();
}

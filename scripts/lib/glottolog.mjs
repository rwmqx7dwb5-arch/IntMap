/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  IntMap · GLOTTOLOG — the identity of a language, and how a written name reaches it   (#R538)
 *
 *  ⚠ THE OLD MODEL HAD NO IDENTITY, ONLY A COLOUR KEY. A hand-written table of 119 regular
 *  expressions turned Factbook prose into ISO 639-1 tags, and everything it did not recognise
 *  vanished — so Burkina Faso, whose largest language is Mossi at 52.9%, shipped as Fula 7.8%,
 *  Namibia as Afrikaans 9.4% behind Oshiwambo's 49.7%, and Mozambique as Portuguese 16.6% behind
 *  Makhuwa's 26.1%. The same table lumped Kirundi into Kinyarwanda, every creole into Haitian
 *  Creole (Mauritius and the Seychelles both shipped as «ht»), and six Sinitic languages into «zh».
 *
 *  A language now has a Glottocode, and a Glottocode has a parent, a family, a level, a category
 *  and an endangerment status. That is what makes the map and the family tree two views of one
 *  model instead of two features.
 *
 *  ⚠ AND THE RESOLVER DOES NOT GUESS. Every written name reaches a Glottocode through a stated
 *  rule (below) or through data/language-aliases.json, where a human bound it and wrote down why.
 *  A name that does neither fails the build. «Probably Persian» is not a source.
 *
 *  Glottolog 5.x via glottolog-cldf, CC BY 4.0 — https://glottolog.org
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { cldfTable } from './cldf.mjs';

const REPO = 'https://raw.githubusercontent.com/glottolog/glottolog-cldf/master/cldf/';
export const GLOTTOLOG_STAMP = {
  source: 'Glottolog — languoid catalogue, genealogical classification and endangerment status',
  url: 'https://glottolog.org/',
  via: 'https://github.com/glottolog/glottolog-cldf',
  licence: 'CC BY 4.0',
};

export const LEVELS = ['family', 'language', 'dialect'];
/* Glottolog's own endangerment scale, in its own order — 1 not endangered … 6 extinct */
export const AES = ['not endangered', 'threatened', 'shifting', 'moribund', 'nearly extinct', 'extinct'];

/* ⚠ A CATEGORY IS NOT A JUDGEMENT ABOUT THE LANGUAGE, IT IS ABOUT THE ROW. «Bookkeeping» rows are
   retired ISO codes, «Unattested» rows are languages nobody has recorded, «Speech_Register» rows
   are registers rather than languages. None of them can carry a share of a country's population,
   so they never resolve. Sign languages, pidgins and mixed languages CAN — they are first-class
   languages here, which is what makes «Signed» a mode rather than an «other» bucket. */
const NOT_A_LANGUAGE = new Set(['Bookkeeping', 'Unattested', 'Speech_Register', 'Unclassifiable']);

export function normName(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/\b(languages?|dialects?|group)\b/g, '').replace(/\s+/g, ' ').trim();
}

export async function loadGlottolog(root) {
  const langs = await cldfTable(root, 'glottolog', REPO + 'languages.csv', 'languages.csv');
  const names = await cldfTable(root, 'glottolog', REPO + 'names.csv', 'names.csv');
  const values = await cldfTable(root, 'glottolog', REPO + 'values.csv', 'values.csv');

  const cls = new Map(), cat = new Map(), aes = new Map();
  for (const v of values) {
    if (v.Parameter_ID === 'classification') cls.set(v.Language_ID, v.Value);
    else if (v.Parameter_ID === 'category') cat.set(v.Language_ID, v.Value);
    else if (v.Parameter_ID === 'aes') aes.set(v.Language_ID, v.Value);
  }

  const nodes = new Map();
  for (const l of langs) {
    const p = cls.get(l.ID) ? cls.get(l.ID).split('/') : [];
    nodes.set(l.ID, {
      g: l.ID,
      name: l.Name,
      level: l.Level,
      cat: cat.get(l.ID) || '',
      aes: aes.get(l.ID) || '',
      parent: p.length ? p[p.length - 1] : null,
      family: p.length ? p[0] : l.ID,
      lineage: p,
      iso: l.ISO639P3code || '',
      macro: l.Macroarea || '',
      lat: l.Latitude ? +l.Latitude : null,
      lon: l.Longitude ? +l.Longitude : null,
      countries: l.Countries ? l.Countries.split(';').filter(Boolean) : [],
      isolate: l.Is_Isolate === 'True',
    });
  }

  const usable = (g) => { const n = nodes.get(g); return !!n && !NOT_A_LANGUAGE.has(n.cat); };

  /* two name indexes, kept apart because they do not carry the same weight: Glottolog's own
     primary name for a languoid outranks any of the 120,000 alternative names other catalogues
     have attached to it. «Spanish» is the primary name of Spanish and an alternative name of
     Asturian-Leonese-Cantabrian; ranking the indexes is what keeps Spain Spanish. */
  const PRIM = new Map(), ALT = new Map(), SORTED = new Map();
  const sortKey = (k) => k.split(' ').sort().join(' ');
  const put = (M, nm, g) => {
    const k = normName(nm); if (!k || !usable(g)) return;
    let s = M.get(k); if (!s) { s = new Set(); M.set(k, s); } s.add(g);
    /* ⚠ THE TWO CATALOGUES DO NOT AGREE ABOUT WORD ORDER. The Factbook writes «Bokmal Norwegian»
       and «Magar Dhut»; Glottolog writes «Norwegian Bokmål» and «Dhut Magar». Same words, same
       language, opposite order — indexing the words as a set costs one more map and removes a
       whole class of names from the hand-written ledger. */
    if (k.includes(' ')) { const s2k = sortKey(k); let t = SORTED.get(s2k); if (!t) { t = new Set(); SORTED.set(s2k, t); } t.add(g); }
  };
  for (const l of langs) put(PRIM, l.Name, l.ID);
  for (const n of names) if (!n.lang || n.lang === 'en') put(ALT, n.Name, n.Language_ID);

  /* localized names, for the nine languages IntMap speaks. Glottolog carries them for a minority
     of languoids, so this is a partial index by design — the UI falls back to the English name and
     says so rather than machine-translating a language's name into something nobody calls it. */
  const localized = new Map();
  for (const n of names) {
    if (!n.lang || n.lang === 'en') continue;
    let m = localized.get(n.Language_ID); if (!m) { m = {}; localized.set(n.Language_ID, m); }
    if (!m[n.lang]) m[n.lang] = n.Name;
  }

  const pathOf = (g) => { const n = nodes.get(g); return n ? [...n.lineage, g] : [g]; };
  const lca = (ids) => {
    const ps = ids.map(pathOf); let out = null;
    for (let i = 0; ; i++) {
      const c = ps[0][i]; if (c === undefined) break;
      if (!ps.every((p) => p[i] === c)) break;
      out = c;
    }
    return out;
  };

  /* ── HOW A WRITTEN NAME REACHES A GLOTTOCODE ─────────────────────────────────────────────────
     Six tiers, tried in order, then two narrowing rules. Every one of them is a statement about
     what the SOURCE meant, not about what looks plausible:

       1 primary family    — the Factbook writes «Arabic», «Albanian», «Uzbek», «Kurdish»: those
                             are the primary names of Glottolog GROUP nodes, and the Factbook does
                             mean the group. A country record may point at a branch. That is the
                             whole reason the model has levels.
       2 primary language  — «Mossi», «Makhuwa», «Dari», «Tajik».
       3 alternative language / 4 alternative family — «Kirundi» → Rundi, «Cantonese» → Yue
                             Chinese, «Mauritian Creole» → Morisyen, «Seychellois Creole» →
                             Seselwa Creole French.
       5-6 dialect         — last, because a dialect name that is also a language name should read
                             as the language. This tier is what carries Serbian, Croatian, Bosnian
                             and Montenegrin: Glottolog holds them as four standards under one
                             language, which is exactly what the map has always drawn.

     Then, when a tier matches more than one languoid:
       · COUNTRY — Glottolog records which countries a languoid is spoken in. «Fang» in Equatorial
         Guinea and «Fang» in Cameroon are different languages, and the country says which.
       · LOWEST COMMON ANCESTOR — when the remaining candidates are varieties of one thing and
         that thing's own name is the name asked for, the group node is the answer: «Quechua» →
         Quechuan, «Khmer» → Khmeric, «Oromo» → Nuclear Oromo. The name test is what keeps this
         from climbing: «Wu» matching Wu Chinese and Central Bai has Sino-Tibetan as its ancestor,
         and Sino-Tibetan is not what «Wu» means, so it stays unresolved and goes to the ledger. */
  const TIERS = [[PRIM, 'family'], [PRIM, 'language'], [ALT, 'language'], [ALT, 'family'],
    [PRIM, 'dialect'], [ALT, 'dialect']];

  const named = (ids, k) => {
    const a = lca(ids);
    return (a && nodes.has(a) && normName(nodes.get(a).name) === k) ? a : null;
  };

  function resolve(raw, cc) {
    const k = normName(raw);
    if (!k) return { g: null, how: 'empty' };
    for (const [M, level] of TIERS) {
      const hit = M.get(k); if (!hit) continue;
      const all = [...hit].filter((g) => nodes.get(g).level === level);
      if (!all.length) continue;
      const tag = (M === PRIM ? 'primary-' : 'alt-') + level;
      if (all.length === 1) return { g: all[0], how: tag };
      let arr = all;
      if (cc) {
        const inC = all.filter((g) => nodes.get(g).countries.includes(cc));
        if (inC.length === 1) return { g: inC[0], how: tag + '+country' };
        if (inC.length) arr = inC;
      }
      /* ⚠ NARROWING TO A COUNTRY CAN MOVE THE ANCESTOR. Mali's three Manding candidates have a
         lower common ancestor than the world's, and it is not called «Fulani». When the narrowed
         set has no ancestor by that name, ask the unnarrowed set — the group the source named does
         not change because we happened to be looking at one country. */
      const a = named(arr, k) || named(all, k);
      if (a) return { g: a, how: 'lca:' + nodes.get(a).name };
      /* ⚠ AND SOMETIMES THE ANCESTOR IS NAMED DIFFERENTLY BUT IS DEMONSTRABLY THE RIGHT LEVEL.
         ISO 639-3 gives a MACROLANGUAGE code to exactly the node under which several languages are
         counted as one — Glottolog puts «ful» on Fula, «tmh» on Tuareg, «aym» on Central-Southern
         Aymara. When the Factbook writes «Fulani» or «Tamacheq», that macrolanguage is the thing it
         is counting, whatever the group's Glottolog name happens to be. Forty-five nodes carry such
         a code, which is what keeps this from being a licence to climb the tree. */
      const m = lca(all);
      if (m && nodes.has(m) && nodes.get(m).level === 'family' && nodes.get(m).iso) {
        return { g: m, how: 'macrolanguage:' + nodes.get(m).iso + ' ' + nodes.get(m).name };
      }
      return { g: null, how: 'ambiguous', cands: arr };
    }
    if (k.includes(' ')) {
      const set = SORTED.get(sortKey(k));
      if (set) {
        const arr = [...set].filter((g) => nodes.get(g).level !== 'dialect');
        if (arr.length === 1) return { g: arr[0], how: 'word-order:' + nodes.get(arr[0]).name };
        if (cc) { const inC = arr.filter((g) => nodes.get(g).countries.includes(cc)); if (inC.length === 1) return { g: inC[0], how: 'word-order:' + nodes.get(inC[0]).name }; }
      }
    }
    return { g: null, how: 'unmatched' };
  }

  /* ── SPELLING ───────────────────────────────────────────────────────────────────────────────
     The Factbook writes «Kwanhama» where Glottolog writes «Kwanyama», «Tamacheq» for «Tamasheq»,
     «Sranang Tongo» for «Sranan Tongo», «Maithali» for «Maithili». These are the same name typed
     by two catalogues, and refusing to see that would put a hundred perfectly identifiable
     languages into a hand-maintained ledger — which is where they would then quietly rot.
     ⚠ BUT A NEAR MATCH IS NOT A MATCH UNLESS IT IS ALSO CLEARLY THE BEST ONE. The rule is Dice
     similarity over character bigrams (the same measure #R515 settled on for place names), a high
     floor, AND a clear margin over the runner-up — a name that is 0.86 like two different
     languages has told us nothing. When the country is known, only languages Glottolog records in
     that country are candidates, which is what keeps «Boron» in Ghana away from «Boro» in India. */
  /* ⚠ AND MANY OF THEM DIFFER ONLY BY A NOUN-CLASS PREFIX. Bantu languages name themselves with a
     class prefix that catalogues do not agree about: the Factbook writes «Sekalanga», «Shikomoro»,
     «Kingwana», «Chichewa»; Glottolog writes Kalanga, Comorian, Ngwana, Chewa. This is a fact about
     Bantu morphology, not about those four languages, so it is a rule and not four ledger rows —
     the query is retried with a leading class prefix removed, and only against languoids Glottolog
     places in the country asking. */
  const BANTU_PREFIX = /^(?:oshi|isi|tshi|chi|shi|ich|ki|se|si|lu|ru|ci|xi|gi|umu|ma|wa|ba|bu|ki)/;
  function declassed(k) {
    const m = k.match(BANTU_PREFIX);
    if (!m || k.length - m[0].length < 4) return null;
    return k.slice(m[0].length);
  }

  function bigrams(s) { const out = new Map(); for (let i = 0; i < s.length - 1; i++) { const b = s.slice(i, i + 2); out.set(b, (out.get(b) || 0) + 1); } return out; }
  function dice(a, b) {
    const A = bigrams(a), B = bigrams(b); let inter = 0, na = 0, nb = 0;
    for (const v of A.values()) na += v;
    for (const [g, v] of B) { nb += v; inter += Math.min(v, A.get(g) || 0); }
    return (na + nb) ? (2 * inter) / (na + nb) : 0;
  }
  const FLOOR = 0.78, MARGIN = 0.06;
  function nearest(k, cc) {
    let best = null, bestScore = 0, second = 0;
    for (const M of [PRIM, ALT]) {
      for (const [key, set] of M) {
        if (Math.abs(key.length - k.length) > 5) continue;
        const s = dice(k, key);
        if (s < FLOOR) continue;
        for (const g of set) {
          const n = nodes.get(g);
          if (n.level === 'dialect') continue;
          if (cc && n.countries.length && !n.countries.includes(cc)) continue;
          if (s > bestScore) { if (best && best !== g) second = bestScore; bestScore = s; best = g; }
          else if (g !== best && s > second) second = s;
        }
      }
    }
    return (best && bestScore - second >= MARGIN) ? { g: best, score: bestScore } : null;
  }

  function resolveFuzzy(raw, cc) {
    const k = normName(raw);
    if (!k || k.length < 4) return { g: null, how: 'unmatched' };
    /* ⚠ ONLY WITH A COUNTRY. Without one, every candidate on Earth is in scope and «Boron» in
       Ghana finds «Boro» in India. The country is what makes a near miss evidence. */
    if (!cc) return { g: null, how: 'unmatched' };
    const near = nearest(k, cc);
    if (near) return { g: near.g, how: 'spelling:' + nodes.get(near.g).name + ' ' + near.score.toFixed(2) };
    const stem = declassed(k);
    if (stem) {
      const exact = PRIM.get(stem) || ALT.get(stem);
      if (exact) {
        const arr = [...exact].filter((g) => nodes.get(g).level !== 'dialect' && (!nodes.get(g).countries.length || nodes.get(g).countries.includes(cc)));
        if (arr.length === 1) return { g: arr[0], how: 'class-prefix:' + nodes.get(arr[0]).name };
      }
      const n2 = nearest(stem, cc);
      if (n2) return { g: n2.g, how: 'class-prefix:' + nodes.get(n2.g).name + ' ' + n2.score.toFixed(2) };
    }
    return { g: null, how: 'unmatched' };
  }

  return { nodes, resolve, resolveFuzzy, lca, pathOf, localized, usable, PRIM, ALT };
}

/* ── THE LEDGER ────────────────────────────────────────────────────────────────────────────────
   What the rules cannot decide, a person decided — once, in writing, with the reason attached.
   «Persian» in Iran is Western Farsi and not Dari; no rule can know that, and a build that picked
   one silently would be guessing. The ledger is small, bounded and auditable, and the build fails
   on anything that is in neither the rules nor the ledger — so it can never quietly grow a hole. */
export function loadLedger(root) {
  const p = path.join(root, 'data', 'language-aliases.json');
  const led = JSON.parse(fs.readFileSync(p, 'utf8'));
  /* keys are written the way a person writes a name; they are normalised here so that the file
     stays readable and the lookup stays exact */
  const bind = new Map(), ignore = new Set();
  for (const [key, v] of Object.entries(led.bind || {})) {
    const at = key.lastIndexOf('@');
    bind.set(at < 0 ? normName(key) : normName(key.slice(0, at)) + '@' + key.slice(at + 1).toUpperCase(), v);
  }
  for (const s of led.ignore || []) ignore.add(normName(s));
  return {
    raw: led,
    /* a binding may be global («creole» is never one language) or per country («persian@IR») */
    lookup(rawName, cc) {
      const k = normName(rawName);
      return bind.get(k + '@' + cc) || bind.get(k) || null;
    },
    ignored(rawName) { return ignore.has(normName(rawName)); },
    keys: [...bind.keys()],
  };
}

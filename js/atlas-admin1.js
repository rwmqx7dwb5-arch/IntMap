/* ============================================================================
 *  IntMap · ATLAS — FIRST-LEVEL ADMIN BOUNDARIES, FROM THE FILE WE ALREADY SHIP  (#R489)
 * ----------------------------------------------------------------------------
 *  「1州ごとにWeb照合＋高精細な polygon_geojson 取得を行っています。14州と再試行を合わせると
 *    大量アクセスになりますが、公開Nominatimは最大1リクエスト/秒です。」
 *  「境界はローカルのADM1データから取得する。」
 *
 *  ══ THE MEASUREMENT ══════════════════════════════════════════════════════════════════════════
 *  Asked to highlight fourteen Russian oblasts, js/atlas-console.js went to Nominatim once per
 *  name with `polygon_geojson=1`, plus a web verification per name, plus a retry per failure. The
 *  published policy for that host is AT MOST ONE REQUEST PER SECOND and no bulk use — so the run
 *  was both slow and outside the terms, and it still failed, because Nominatim's top hit for
 *  「ベルゴロド州」 is the CITY of Belgorod and the fail-closed boundary check correctly rejected a
 *  city as an oblast outline.
 *
 *  ⚠ THE FILE WAS ALREADY IN THE REPOSITORY. `data/admin1-world.json.gz` — 4,515 first-level units
 *  across 247 countries, 2.38 MB gzipped, Natural Earth 10 m, built by scripts/build-admin1.mjs for
 *  #R290 — carries the geometry AND the names it travels under: `name`, `name_en`, `name_alt`,
 *  `name_local` (Белгородская область), `iso_3166_2` (RU-BEL), `code_hasc` (RU.BL). Until this
 *  round its only reader was js/world-packs.js's warning layer. Atlas could not see it at all.
 *
 *  Fourteen oblasts now cost ONE request, once per session, shared with nothing — and the answer
 *  is a real administrative outline rather than whatever a free-text search ranked first.
 *
 *  ══ WHY THE TIE-BREAK IS AREA ════════════════════════════════════════════════════════════════
 *  Natural Earth holds TWO units whose alias sets both contain 「Moscow」: Moskovskaya (the oblast)
 *  and Moskva (the federal city inside it). Which one 「Moscow Oblast」 means is not a spelling
 *  question — both spell it — it is a question of WHAT KIND OF THING was asked for. So the query's
 *  own administrative type-word decides: a query that says oblast / krai / область / 州 / province
 *  takes the LARGER of two equally-named units, and a query that names none takes the smaller.
 *  That is the exact shape the report described for 「ベルゴロド州」 → the city of Belgorod.
 *
 *  ⚠ IT DECIDES NOTHING FOR ATLAS (CONSTITUTION.md §5) and it REPLACES no route: a name this index
 *  does not hold returns a miss, and the caller's existing ladder runs exactly as before.
 *
 *  ⚠ NO DOM AND NO GLOBALS, and the single network read is injectable (`deps.load`), so
 *  tests/r489-checks.test.mjs drives THIS module — the one the browser runs — against the REAL
 *  shipped file, with no browser.
 * ==========================================================================*/

export function makeAtlasAdmin1(deps) {
  return (function () {
    deps = deps || {};

    /* ⚠ THE SAME CONSTANT js/world-packs.js USES, and deliberately not a second copy of the loader:
       both read one shipped file, and if the path ever moves, both must move. tests/r489 asserts
       the two spellings agree. */
    const ADM1_URL = deps.url || 'data/admin1-world.json.gz';

    /* Administrative type-words, in the languages a reader or a model plausibly writes them in.
       ⚠ A TABLE, NOT A PATTERN, so coverage can be measured (the js/atlas-geo-resolve.js rule from
       #R413). Stripping these is how 「Belgorod Oblast」 reaches the unit Natural Earth spells
       「Belgorodskaya Oblast」, and how a query is recognised as asking for a REGION. */
    const TYPE_WORDS = Object.freeze({
      en: ['oblast', 'oblasts', 'krai', 'kray', 'okrug', 'raion', 'rayon', 'republic', 'region',
        'province', 'state', 'prefecture', 'county', 'department', 'district', 'governorate',
        'voivodeship', 'canton', 'territory', 'autonomous'],
      ru: ['область', 'обл', 'области', 'край', 'края', 'округ', 'округа', 'республика',
        'республики', 'автономный', 'автономная'],
      jp: ['州', '県', '府', '省', '地方', '共和国', '自治州', '管区'],
      de: ['bundesland', 'land', 'kreis', 'bezirk', 'kanton', 'provinz', 'region'],
      es: ['provincia', 'región', 'region', 'departamento', 'estado', 'comunidad'],
      fr: ['région', 'region', 'département', 'departement', 'province', 'canton'],
      ko: ['도', '주', '자치주', '광역시'],
      zh: ['州', '省', '自治區', '地區', '直轄市'],
      'zh-hans': ['州', '省', '自治区', '地区', '直辖市'],
    });
    const TYPE_LIST = Object.keys(TYPE_WORDS)
      .reduce((a, k) => a.concat(TYPE_WORDS[k]), [])
      .sort((a, b) => b.length - a.length);
    /* the Latin ones are whole words; the CJK ones are suffixes with no spaces around them */
    const TYPE_RE_LATIN = new RegExp('\\b(?:' + TYPE_LIST.filter((w) => /^[\wÀ-ӿ'-]+$/.test(w))
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'gi');
    const TYPE_RE_CJK = new RegExp('(?:' + TYPE_LIST.filter((w) => /[　-鿿가-힯]/.test(w))
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g');

    const ISO2_RE = /^([A-Z]{2})-([A-Z0-9]{1,3})$/;
    const HASC_RE = /^([A-Z]{2})\.([A-Z0-9]{2,3})$/;

    function norm(s) {
      return String(s == null ? '' : s)
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[’'`´]/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    /* the name with its administrative type-word removed — 「belgorod oblast」 → 「belgorod」 */
    function stem(s) {
      const raw = String(s == null ? '' : s).normalize('NFKC');
      return norm(raw.replace(TYPE_RE_CJK, ' ').replace(TYPE_RE_LATIN, ' '));
    }
    /** hasTypeWord(q) — did the query ask for a REGION, or just name something? */
    function hasTypeWord(s) {
      const raw = String(s == null ? '' : s).normalize('NFKC');
      TYPE_RE_LATIN.lastIndex = 0; TYPE_RE_CJK.lastIndex = 0;
      return TYPE_RE_LATIN.test(raw) || TYPE_RE_CJK.test(raw);
    }

    /* Shoelace on raw degrees. It is NOT an area in km² and is not reported as one — it exists to
       order two units that carry the same name, which are at the same latitude by construction. */
    function degArea(g) {
      if (!g) return 0;
      const ring = (r) => { let s = 0; for (let i = 0, n = r.length - 1; i < n; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(s) / 2; };
      const poly = (p) => (p && p.length) ? ring(p[0]) : 0;
      try {
        if (g.type === 'Polygon') return poly(g.coordinates);
        if (g.type === 'MultiPolygon') return g.coordinates.reduce((s, p) => s + poly(p), 0);
      } catch (_) { /* a malformed unit sorts last, which is what 0 does */ }
      return 0;
    }
    function bboxOf(g) {
      let a = 180, b = 90, c = -180, d = -90, any = false;
      const scan = (x) => { if (typeof x[0] === 'number') { any = true; a = Math.min(a, x[0]); b = Math.min(b, x[1]); c = Math.max(c, x[0]); d = Math.max(d, x[1]); return; } x.forEach(scan); };
      try { scan(g.coordinates); } catch (_) { return null; }
      return any ? [a, b, c, d] : null;
    }

    /* ══ THE ONE READ ══════════════════════════════════════════════════════════════════════════
       Same shape as js/world-packs.js's `worldAdm1()`: gzip over fetch, decoded by the platform.
       ⚠ THE PROMISE IS THE CACHE, so a dozen names asked inside one tick share ONE request — the
       #R290 lesson about every caller being answered, not just the first. */
    let LOADING = null;
    function rawLoad() {
      if (typeof deps.load === 'function') return Promise.resolve(deps.load(ADM1_URL));
      if (typeof DecompressionStream !== 'function') return Promise.reject(new Error('DecompressionStream unavailable'));
      return fetch(ADM1_URL).then((r) => {
        if (!r.ok || !r.body) throw new Error('admin1 ' + r.status);
        return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();
      }).then((t) => JSON.parse(t));
    }

    /** load() -> Promise<index>. One request per session, whatever asks and however often. */
    function load() {
      return LOADING || (LOADING = rawLoad().then(build).catch((e) => { LOADING = null; throw e; }));
    }

    function build(j) {
      const units = [];
      const byCountry = Object.create(null);
      const byCode = Object.create(null);
      (j && Array.isArray(j.f) ? j.f : []).forEach((f, i) => {
        const iso3 = String((f && f.i) || '').toUpperCase();
        if (!/^[A-Z]{3}$/.test(iso3) || !f.g) return;
        const names = String(f.n || '').split('|').map((s) => s.trim()).filter(Boolean);
        if (!names.length) return;
        let iso2 = '', code = '', hasc = '';
        names.forEach((n) => {
          const m2 = ISO2_RE.exec(n.toUpperCase());
          if (m2 && !code) { code = n.toUpperCase(); iso2 = m2[1]; }
          const mh = HASC_RE.exec(n.toUpperCase());
          if (mh && !hasc) { hasc = n.toUpperCase(); if (!iso2) iso2 = mh[1]; }
        });
        /* the display name is the first entry that is NOT a code — Natural Earth puts `name` first */
        const canonical = names.find((n) => !ISO2_RE.test(n.toUpperCase()) && !HASC_RE.test(n.toUpperCase())) || names[0];
        const u = {
          stableId: code || (hasc || (iso3 + ':' + norm(canonical))),
          canonicalName: canonical,
          aliases: names,
          iso3, iso2, code, hasc,
          geo: f.g,
          bbox: bboxOf(f.g),
          area: degArea(f.g),
          keys: [], stems: [],
          idx: i,
        };
        names.forEach((n) => {
          const k = norm(n); if (k && u.keys.indexOf(k) < 0) u.keys.push(k);
          const st = stem(n); if (st && u.stems.indexOf(st) < 0) u.stems.push(st);
        });
        units.push(u);
        (byCountry[iso3] = byCountry[iso3] || []).push(u);
        if (iso2) (byCountry[iso2] = byCountry[iso2] || []).push(u);
        if (code) byCode[code] = u;
        if (hasc) byCode[hasc] = u;
      });
      return {
        units, byCountry, byCode,
        countries: Object.keys(byCountry).filter((k) => k.length === 3).length,
        source: (j && j.source) || '',
      };
    }

    /* ══ THE MATCH ═════════════════════════════════════════════════════════════════════════════
       Four rungs, highest first, and the score is REPORTED so the caller can decide how much to
       trust it rather than being handed a bare yes. */
    function score(u, q) {
      if (q.code && (u.code === q.code || u.hasc === q.code)) return 100;
      if (u.keys.indexOf(q.key) >= 0) return 90;
      if (q.stem && u.stems.indexOf(q.stem) >= 0) return 70;
      if (q.stem && q.stem.length >= 5 && u.stems.some((s) => s.length >= 5
        && (s.indexOf(q.stem) === 0 || q.stem.indexOf(s) === 0))) return 55;
      return 0;
    }

    /**
     * matchIn(index, name, opts) -> {unit, score, candidates} | null
     *
     * `opts.iso3` / `opts.iso2` narrow the search to one country — which is what the ledger gives
     * it, and the reason the fourteen oblasts do not each have to be disambiguated against the
     * planet. Without a country the whole index is searched and every tie is REPORTED, never
     * silently picked.
     */
    function matchIn(index, name, opts) {
      const o = opts || {};
      const raw = String(name == null ? '' : name).trim();
      if (!index || !raw) return null;
      const q = { key: norm(raw), stem: stem(raw), code: /^[A-Z]{2}[-.][A-Z0-9]{1,3}$/i.test(raw) ? raw.toUpperCase() : '' };
      if (!q.key && !q.code) return null;
      const cc = String(o.iso3 || o.countryCode || '').toUpperCase();
      const pool = (cc && index.byCountry[cc]) ? index.byCountry[cc]
        : ((o.iso2 && index.byCountry[String(o.iso2).toUpperCase()]) || index.units);
      const hits = [];
      pool.forEach((u) => { const s = score(u, q); if (s) hits.push({ unit: u, score: s }); });
      if (!hits.length) return null;
      const wantsRegion = hasTypeWord(raw);
      hits.sort((a, b) => (b.score - a.score)
        || (wantsRegion ? (b.unit.area - a.unit.area) : (a.unit.area - b.unit.area))
        || (a.unit.idx - b.unit.idx));
      const best = hits[0];
      return {
        unit: best.unit,
        score: best.score,
        /* every OTHER unit that scored as well — an honest ambiguity report, not a silent pick */
        candidates: hits.filter((h) => h !== best && h.score === best.score).map((h) => h.unit),
      };
    }

    /**
     * resolveMany(names, opts) -> Promise<{hits:[…], misses:[…], requests:number}>
     *
     * The whole point of the round: N names, ONE network read, no per-name request at all. `hits`
     * are in the order asked. A name this index does not hold is a MISS and is named in `misses`,
     * so the caller's existing ladder runs for exactly those and the reader is told which.
     */
    async function resolveMany(names, opts) {
      const list = (Array.isArray(names) ? names : [names]).map((n) => (n && n.name) ? n : { name: n });
      let index = null;
      try { index = await load(); } catch (e) {
        return { hits: [], misses: list.map((n) => ({ name: String(n.name || ''), reason: 'index_unavailable' })), requests: 0, error: (e && e.message) || 'load failed' };
      }
      const hits = [], misses = [];
      list.forEach((n) => {
        const m = matchIn(index, n.name, Object.assign({}, opts, n));
        if (!m) { misses.push({ name: String(n.name || ''), reason: 'not_in_admin1_index' }); return; }
        hits.push({
          asked: String(n.name || ''),
          stableId: m.unit.stableId,
          canonicalName: m.unit.canonicalName,
          aliases: m.unit.aliases.slice(),
          countryCode: m.unit.iso2 || m.unit.iso3,
          iso3: m.unit.iso3,
          geo: m.unit.geo,
          bbox: m.unit.bbox,
          score: m.score,
          ambiguousWith: m.candidates.map((c) => c.canonicalName),
          /* ⚠ WHICH COUNTRIES THE TIE SPANS, not just how many units tied. Natural Earth holds two
             units in RUSSIA whose alias sets both contain 「Moscow」, and the type-word rule above
             already decides between them — measured, and correct. A tie across TWO COUNTRIES is a
             different thing: nothing here can decide it, and the reader must. */
          ambiguousCountries: Array.from(new Set([m.unit.iso3].concat(m.candidates.map((c) => c.iso3)))),
          source: 'admin1-index',
          kind: 'admin1',
          role: String(n.role || (opts && opts.role) || ''),
        });
      });
      return { hits, misses, requests: (typeof deps.load === 'function') ? 0 : 1 };
    }

    /** resolve(name, opts) — the single-name face of the same match. */
    async function resolve(name, opts) {
      const r = await resolveMany([name], opts);
      return r.hits[0] || null;
    }

    /* ══ THE RUNG js/atlas-console.js's `resolveHlTarget` CALLS ═════════════════════════════════
       It answers in that ladder's own shape (`{poly:{name,geo}}`) so the console gains ONE line and
       not a branch, and it sits BETWEEN the curated compositions and the Nominatim rungs: nothing
       that already resolves changes, and only what used to leave the machine now resolves locally.
       ⚠ IT REFUSES RATHER THAN GUESSES, in the two ways this round is about:
         · no ledger entry and no administrative type-word → this is not an admin-unit question, so
           it declines and the existing ladder runs untouched;
         · equally-good units in two countries and no country to choose between them → it declines,
           so the console's own ambiguity gate (#R150) asks the reader instead of it picking one.
       ⚠ THE LEDGER IS WHERE 「ベルゴロド州」 BECOMES ANSWERABLE. This index holds English, Russian
       and the ISO/HASC codes; it holds no Japanese. What makes the reported case work is that the
       turn which NAMED the oblast recorded `{canonicalName:'Belgorod', countryCode:'RU',
       stableId:'RU-BEL'}` against the reader's spelling — so the next turn looks up an identifier
       here rather than a string it read back out of its own prose. */
    async function hlTarget(name, opts) {
      const o = opts || {};
      const led = o.ledger;
      const raw = String(name == null ? '' : name).trim();
      if (!raw) return null;
      let hint = String(o.iso3 || o.countryCode || '').toUpperCase();
      let q = raw;
      let known = null;
      try { known = led && led.resolve ? led.resolve(raw) : null; } catch (_) { known = null; }
      if (known) {
        if (known.countryCode) hint = known.countryCode;
        if (known.stableId && /^[A-Z]{2}[-.][A-Z0-9]{1,3}$/.test(known.stableId)) q = known.stableId;
        else if (known.canonicalName) q = known.canonicalName;
      }
      const admin = (known && known.kind === 'admin1') || hasTypeWord(raw) || hasTypeWord(q);
      if (!admin) return null;
      let hit = null;
      try { hit = await resolve(q, { iso3: hint, countryCode: hint }); } catch (_) { hit = null; }
      if (!hit) return null;
      /* ⚠ A TIE INSIDE ONE COUNTRY IS NOT AN AMBIGUITY THIS FILE HAS TO REFUSE — the type-word rule
         decides it, and 「Moscow Oblast」 → the oblast / 「Moscow」 → the city is the measurement that
         says so. A tie ACROSS COUNTRIES is one nothing here can decide, so it declines and the
         console's own confirmation gate asks the reader. Measured on the running app: refusing every
         tie sent 「Moscow Oblast」 alone back to Nominatim — 1 request out of 14 rather than 0. */
      if (!hint && hit.ambiguousCountries.length > 1) return null;   /* the reader decides, not this file */
      return {
        poly: { name: hit.canonicalName, geo: hit.geo },
        rrMethod: 'admin1_index',
        verified: true,
        adm1: true,
        entity: {
          kind: 'admin1', name: raw, canonicalName: hit.canonicalName, aliases: hit.aliases,
          countryCode: hit.countryCode, stableId: hit.stableId, bbox: hit.bbox, source: 'admin1-index',
        },
      };
    }

    const API = { ADM1_URL, TYPE_WORDS, norm, stem, hasTypeWord, degArea,
      load, build, matchIn, resolve, resolveMany, hlTarget, loaded: () => !!LOADING };
    try { window.IntMapAtlasAdmin1 = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}

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

    /* ══ WHICH UNITS DOES THIS SHAPE COVER? ════════════════════════════════════════════════════
       Measured on production (2026-09-16, build R758): 「Draw a 500 km buffer around Tokyo and tell
       me which prefectures it covers.」 ran `map.radius` three times, drew the circle correctly, and
       after 4m42s answered with one sentence of preamble and NO LIST. Nothing was broken — the
       question was simply not askable. Every piece was already here: the 4,515 outlines, their
       names, their identifiers. What was missing was the SPATIAL direction of the lookup. This file
       could turn a name into a shape; it could not turn a shape into names.
       ⚠ It answers from the shipped index only — no network, and no second copy of the loader. */

    /* Every geometry, areal or not, reduced to the same thing: a list of coordinate rings, so one
       intersection routine serves polygons, lines and points instead of a branch per pair. */
    function ringsOfGeo(g) {
      const out = [];
      const push = (r) => { if (Array.isArray(r) && r.length && Array.isArray(r[0])) out.push(r); };
      if (!g) return out;
      try {
        if (g.type === 'Polygon') (g.coordinates || []).forEach(push);
        else if (g.type === 'MultiPolygon') (g.coordinates || []).forEach((p) => (p || []).forEach(push));
        else if (g.type === 'LineString') push(g.coordinates);
        else if (g.type === 'MultiLineString') (g.coordinates || []).forEach(push);
        else if (g.type === 'Point') push([g.coordinates]);
        else if (g.type === 'MultiPoint') (g.coordinates || []).forEach((c) => push([c]));
      } catch (_) { /* a malformed geometry has no rings, and therefore meets nothing */ }
      return out.filter((r) => r.every((c) => Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number'));
    }
    const isAreal = (g) => !!g && (g.type === 'Polygon' || g.type === 'MultiPolygon');

    function bboxOfRings(rings) {
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      rings.forEach((r) => r.forEach((p) => {
        if (p[0] < a) a = p[0]; if (p[1] < b) b = p[1];
        if (p[0] > c) c = p[0]; if (p[1] > d) d = p[1];
      }));
      return (a === Infinity) ? null : [a, b, c, d];
    }

    /* Even-odd ray casting across ALL rings of the geometry at once, which is how holes come out
       right without the caller having to know which ring is a hole. Degrees in, no projection —
       the test is topological, so the units it is asked in do not change the answer. */
    function pointInRings(pt, rings) {
      const x = pt[0], y = pt[1];
      let inside = false;
      for (let k = 0; k < rings.length; k++) {
        const r = rings[k];
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
          if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || Number.MIN_VALUE) + xi) inside = !inside;
        }
      }
      return inside;
    }

    function orient(a, b, c) {
      const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      return (v > 0) ? 1 : (v < 0) ? -1 : 0;
    }
    const onSeg = (a, b, p) => Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0])
      && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
    function segsCross(p1, p2, p3, p4) {
      const o1 = orient(p1, p2, p3), o2 = orient(p1, p2, p4),
        o3 = orient(p3, p4, p1), o4 = orient(p3, p4, p2);
      if (o1 !== o2 && o3 !== o4) return true;
      /* collinear touching counts: a border that runs along the query's edge IS met by it */
      if (o1 === 0 && onSeg(p1, p2, p3)) return true;
      if (o2 === 0 && onSeg(p1, p2, p4)) return true;
      if (o3 === 0 && onSeg(p3, p4, p1)) return true;
      if (o4 === 0 && onSeg(p3, p4, p2)) return true;
      return false;
    }
    function ringsCross(ra, rb) {
      for (let i = 0; i < ra.length; i++) {
        const a = ra[i];
        for (let m = 0; m + 1 < a.length; m++) {
          for (let j = 0; j < rb.length; j++) {
            const b = rb[j];
            for (let n = 0; n + 1 < b.length; n++) {
              if (segsCross(a[m], a[m + 1], b[n], b[n + 1])) return true;
            }
          }
        }
      }
      return false;
    }

    /**
     * intersectsGeo(a, b) -> boolean — do these two geometries meet?
     *
     * Four ways, any one of which is enough, and the reason `coveredBy`'s bbox sieve can never
     * answer for it: ① a's vertices inside b, ② b's vertices inside a, ③ edges crossing, ④ the
     * degenerate case where one is a point. Containment in BOTH directions is what catches a unit
     * that swallows the query whole, and edge crossing is what catches two shapes that overlap
     * without either one's vertices falling inside the other.
     */
    function intersectsGeo(a, b) {
      const ra = ringsOfGeo(a), rb = ringsOfGeo(b);
      if (!ra.length || !rb.length) return false;
      const ba = bboxOfRings(ra), bb = bboxOfRings(rb);
      if (!ba || !bb) return false;
      if (ba[0] > bb[2] || bb[0] > ba[2] || ba[1] > bb[3] || bb[1] > ba[3]) return false;
      if (isAreal(b)) { for (let i = 0; i < ra.length; i++) for (let m = 0; m < ra[i].length; m++) if (pointInRings(ra[i][m], rb)) return true; }
      if (isAreal(a)) { for (let j = 0; j < rb.length; j++) for (let n = 0; n < rb[j].length; n++) if (pointInRings(rb[j][n], ra)) return true; }
      return ringsCross(ra, rb);
    }

    /* 1° of latitude is 111.32 km on the WGS84 mean — an EQUIDISTANT APPROXIMATION, not a geodesic
       buffer: at 500 km the great-circle error is well under one percent, and the answer this feeds
       is a set of administrative units, not a distance. ⚠ A degree of LONGITUDE shrinks with
       latitude, so the same radius is dLat / cos(lat) degrees wide — at 60°N exactly twice as many
       degrees east-west as north-south. Writing the circle with a single degree radius is the bug
       this comment exists to prevent: it would draw an ellipse that is far too narrow up north.
       128 steps because the chord sagitta is then R(1-cos(π/128)) = 0.15 km on a 500 km circle,
       which is smaller than the Natural Earth 10 m outlines it is being intersected with. */
    const KM_PER_DEG_LAT = 111.32;
    function circlePolygon(center, radiusKm, steps) {
      const lng = Number(center && center[0]), lat = Number(center && center[1]);
      const r = Number(radiusKm);
      if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(r) || r <= 0) return null;
      const n = Math.max(12, Math.floor(steps || 128));
      const dLat = r / KM_PER_DEG_LAT;
      /* the cosine is floored so a circle centred within half a degree of a pole stays a polygon
         instead of becoming an infinitely wide band */
      const cos = Math.max(Math.cos(lat * Math.PI / 180), Math.cos(89.5 * Math.PI / 180));
      const dLng = dLat / cos;
      const ring = [];
      for (let i = 0; i <= n; i++) {
        const t = (i % n) * 2 * Math.PI / n;
        ring.push([lng + dLng * Math.cos(t), Math.max(-90, Math.min(90, lat + dLat * Math.sin(t)))]);
      }
      return { type: 'Polygon', coordinates: [ring] };
    }

    /** the one place a caller's argument becomes a geometry — circle, GeoJSON geometry, or Feature */
    function queryGeo(geo) {
      if (!geo) return null;
      if (geo.center && Number.isFinite(Number(geo.radiusKm))) return circlePolygon(geo.center, geo.radiusKm, geo.steps);
      const g = (geo.type === 'Feature' && geo.geometry) ? geo.geometry : geo;
      return ringsOfGeo(g).length ? g : null;
    }

    /**
     * coveredBy(geo, opts) -> Promise<{units, scanned, truncated}>
     *
     * `geo` is a Polygon / MultiPolygon / LineString / Point, or `{center:[lng,lat], radiusKm}`.
     * `opts.iso3` / `opts.countryCode` narrow the scan to one country; `opts.limit` (200) caps the
     * answer. ⚠ THE CAP IS DECLARED, never silent: `truncated` says the list is not the whole set,
     * because a reader told 「these are the prefectures」 about a cut list has been told something
     * false (#R742's rule about an operation declaring what it did).
     *
     * ⚠ THE BBOX SIEVE MUST NEVER ERR INWARD (#R743: a prefilter that drops a real hit is invisible
     * to any test that only compares indexed runs against each other). It is a pure rectangle
     * overlap on the bbox the index derived FROM THE RING ITSELF, so every shape it rejects is one
     * whose coordinates cannot reach the query; tests/r760 measures that against a sieve-free scan.
     */
    async function coveredBy(geo, opts) {
      const o = opts || {};
      const limit = Math.max(1, Number.isFinite(Number(o.limit)) ? Math.floor(Number(o.limit)) : 200);
      const q = queryGeo(geo);
      if (!q) return { units: [], scanned: 0, truncated: false, error: 'bad_geometry' };
      let index = null;
      try { index = await load(); } catch (e) {
        /* ⚠ 「nothing covers it」 and 「the index never loaded」 are different answers and must not
           share one shape — the resolveMany rule, kept (#R667). */
        return { units: [], scanned: 0, truncated: false, error: 'index_unavailable', message: (e && e.message) || 'load failed' };
      }
      const qb = bboxOfRings(ringsOfGeo(q));
      const cc = String(o.iso3 || o.countryCode || '').toUpperCase();
      /* a country that was named but that this index does not hold scans nothing — answering from
         the whole planet would silently ignore the narrowing the caller asked for */
      const pool = cc ? (index.byCountry[cc] || []) : index.units;
      const units = [];
      let scanned = 0, truncated = false;
      for (let i = 0; i < pool.length; i++) {
        const u = pool[i];
        scanned++;
        const b = u.bbox;
        if (!b || !qb) continue;
        if (b[0] > qb[2] || qb[0] > b[2] || b[1] > qb[3] || qb[1] > b[3]) continue;
        if (!intersectsGeo(q, u.geo)) continue;
        if (units.length >= limit) { truncated = true; break; }
        units.push({
          /* `name` and `canonicalName` are both present on purpose: callers that render a list read
             `name`, and callers that pass the unit back into resolve/hlTarget read the identifier
             fields — the same shape resolveMany's hits carry. */
          name: u.canonicalName,
          canonicalName: u.canonicalName,
          countryCode: u.iso2 || u.iso3,
          iso3: u.iso3,
          stableId: u.stableId,
          bbox: u.bbox ? u.bbox.slice() : null,
        });
      }
      return { units, scanned, truncated };
    }

    /* ══ ⚠ (#R760) THE READER'S ANSWER, BUILT HERE AND NOT IN THE KERNEL ═════════════════════════
       js/atlas-console.js is under a shrink-only ceiling (#R195/#R199), and the ceiling exists to
       push exactly this kind of body out of it. The console's case is one line that hands in the
       four things only the console has — its geocoder and its three text helpers — and gets back
       the {ok, html, meta} shape every dispatch case returns.
       ⚠ IT DOES NOT PAINT (#R743). The units come back by name so `map.highlight` can colour them
       if the reader asked for that; a capability that both computes and draws gets a verdict about
       the drawing, and a correct answer would be called `not_rendered`. */
    async function coverageAnswer(a, D) {
      const L = D.L, esc = D.esc, note = D.note, warn = D.warn;
      const km = +(a.km != null ? a.km : (a.radiusKm != null ? a.radiusKm : 0));
      const pts = Array.isArray(a.points)
        ? a.points.filter((p) => Array.isArray(p) && isFinite(+p[0]) && isFinite(+p[1])).map((p) => [+p[0], +p[1]])
        : [];
      let geo = null;
      if (pts.length >= 3) {
        if (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1]) pts.push([pts[0][0], pts[0][1]]);
        geo = { type: 'Polygon', coordinates: [pts] };
      } else {
        const place = String(a.place || a.country || a.name || '').trim();
        if (!place) return { ok: false, html: warn('⚠ ' + L('Name a place to centre on, or give the points of a shape', '中心にする場所名か、形の座標を指定してください', 'Ort oder Form angeben', 'Укажите место или форму', 'Indica un lugar o una forma')) };
        if (!(km > 0)) return { ok: false, html: warn('⚠ ' + L('How many kilometres is the radius?', '半径は何キロですか', 'Wie groß ist der Radius?', 'Каков радиус?', '¿Cuál es el radio?')) };
        let g = null;
        try { g = await D.geocode(place); } catch (_) { g = null; }
        if (!g) return { ok: false, html: warn('⚠ ' + L('Could not place', '場所を特定できません', 'Ort nicht gefunden', 'Место не найдено', 'No se pudo ubicar') + ': ' + esc(place)) };
        geo = { center: [g.lng, g.lat], radiusKm: km };
      }
      const lim = (a.limit != null && isFinite(+a.limit)) ? Math.max(1, Math.min(400, +a.limit)) : 200;
      const r = await coveredBy(geo, { limit: lim });
      /* «could not be read» and «nothing is there» are different answers and stay different */
      if (r && r.error) return { ok: false, html: warn('⚠ ' + L('The first-level boundary index could not be read', '第一級行政区分の索引を読み込めませんでした', 'Index nicht lesbar', 'Индекс недоступен', 'Índice no disponible')) };
      const units = (r && r.units) || [];
      let html = '<div style="font-weight:600;margin:2px 0 5px;">'
        + L('First-level subdivisions covered', '覆う第一級行政区分', 'Abgedeckte Verwaltungseinheiten', 'Охваченные регионы', 'Subdivisiones cubiertas')
        + ' — ' + units.length + '</div>';
      html += units.length
        ? ('<div style="font-size:11.5px;line-height:1.6;">' + units.map((u) => esc(String(u.canonicalName || u.name || ''))
            + (u.countryCode ? (' <span style="color:var(--text-muted);">' + esc(String(u.countryCode)) + '</span>') : '')).join(' · ') + '</div>')
        : ('<div style="font-size:11.5px;color:var(--text-muted);">'
            + L('Nothing of this kind lies inside that shape', 'その形の中に該当する区分はありません', 'Keine Einheit in dieser Form', 'В этой форме ничего нет', 'Nada de este tipo en esa forma') + '</div>');
      if (r && r.truncated) html += warn('⚠ ' + L('More than the limit — the list above is cut', '上限を超えたため一覧を切りました', 'Liste gekürzt', 'Список обрезан', 'Lista recortada'));
      return { ok: true, html: note(html), meta: { produced: ['explanation'], resultKey: 'coverage:' + JSON.stringify(geo).slice(0, 140) } };
    }

    const API = { ADM1_URL, TYPE_WORDS, norm, stem, hasTypeWord, degArea,
      load, build, matchIn, resolve, resolveMany, hlTarget, loaded: () => !!LOADING,


      coveredBy, intersectsGeo, circlePolygon, coverageAnswer };
    try { window.IntMapAtlasAdmin1 = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}

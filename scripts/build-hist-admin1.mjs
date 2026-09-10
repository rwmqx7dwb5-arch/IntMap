#!/usr/bin/env node
/* ============================================================================
 *  build-hist-admin1.mjs — data/hist-admin1.js  (#R530)
 * ----------------------------------------------------------------------------
 *  The FIRST-LEVEL SUBDIVISIONS of the world, with the DATES they were in force —
 *  the admin-1 twin of data/cshapes.js, so that moving the clock changes the
 *  provinces the same way it already changes the countries.
 *
 *  ── WHY THIS FILE EXISTS (measured, #R530) ─────────────────────────────────
 *  Before this round the province layer (`ref-admin1`) drew OpenFreeMap/OSM's
 *  PRESENT-DAY boundaries and read no clock at all, so a reader who travelled to
 *  1900 got the 1900 countries with the 2026 provinces drawn on top of them.
 *
 *  Nothing on the open web ships a finished world admin-1 time series. Measured
 *  2026-09-07, every candidate and what it actually is:
 *    · aourednik/historical-basemaps — 54 files, all sovereign states. Zero admin-1.
 *    · Who's On First `region`       — 5,315 records, `edtf:inception` = "uuuu"
 *                                      on every one sampled. A present-day ledger.
 *    · Natural Earth 10m admin-1     — 4,596 units, ZERO date fields.
 *    · CHGIS (China)                 — province time series ends 1911; only 9 of
 *                                      its records reach 1850. EULA is non-commercial.
 *    · HGIS de las Indias            — 1701-1808 only, and a 752 MB .rar.
 *    · Eurostat GISCO NUTS           — oldest vintage is 2003.
 *    · Newberry AHCB                 — day-exact and excellent, but ONE country.
 *    · MPIDR / Mosaic                — host does not answer on 80 or 443.
 *  ⇒ **OpenHistoricalMap is the only global, dated, openly-licensed one**, and it
 *  is CC0 with `start_date`/`end_date` on 4,221 / 3,524 of its 4,268 admin-1
 *  relations, to the DAY where the day is known.
 *
 *  ⚠ THE COVERAGE IS REAL AND PARTIAL, AND THE MAP MUST SAY SO. OHM holds ~614
 *  units in force in 1900 against 4,596 present-day ones. That is not a bug to
 *  paper over: drawing a present-day province under a 1900 date — or clipping one
 *  to the era's country — would be inventing a boundary nobody surveyed. This
 *  build ships what exists; js/time-admin1.js reports what is missing.
 *
 *  Output format: the SAME ring-pooled JS literal as data/cshapes.js, because the
 *  two files are read by twin modules and one shape means one set of habits.
 *      window.__HISTADM1 = { v, src, built, rings:[ring…], feats:[feat…] }
 *      feat = [ name, lvl, sy,sm,sd, ey,em,ed, [[ringIdx…]…], names ]
 *      names = { en, ja, de, ru, es, fr, ko, 'zh-Hant', 'zh-Hans' }  (present keys only)
 *  Dates are inclusive on both ends, exactly like CShapes, so js/time-admin1.js
 *  reuses the epoch index verbatim.
 *
 *  Source & licence: OpenHistoricalMap, CC0 1.0 (openhistoricalmap.org/copyright).
 *  Declared in sources.html / js/reference-data.js like every other bundled set.
 *
 *  ⚠ THE SIMPLIFICATION IS PRICED AGAINST THE COUNTRY BUNDLE, NOT GUESSED. Measured
 *  on this exact extract (3,061 relations), Douglas-Peucker tolerance x coordinate
 *  decimals -> shipped bytes, raw / brotli:
 *      0.008 deg, 4 dec  15.46 MB / 1.54 MB     <- the first build; 3x cshapes to PARSE
 *      0.015 deg, 3 dec   8.33 MB / --
 *      0.020 deg, 3 dec   6.55 MB / 0.67 MB     <- shipped
 *      0.025 deg, 3 dec   5.50 MB / 0.59 MB     (13 units fall under MIN_AREA)
 *  data/cshapes.js is 5.33 MB / 0.38 MB, and #R192 measured that a bundle this size is
 *  paid mostly in main-thread PARSE, not in transfer — which is why the raw column is
 *  the one that decided it. 0.02 deg keeps every unit the coarser step drops.
 *
 *  Usage:  node scripts/build-hist-admin1.mjs [--out data/hist-admin1.js]
 *                                            [--tol 0.02] [--dec 3] [--since 1850] [--batch 20]
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EP = 'https://overpass-api.openhistoricalmap.org/api/interpreter';

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT   = path.resolve(ROOT, argOf('--out', 'data/hist-admin1.js'));
const TOL   = parseFloat(argOf('--tol', '0.02'));        /* ~2.2 km — see the size note in the header */
const SINCE = parseInt(argOf('--since', '1850'), 10);    /* the clock's own floor (js/chronos.js) */
const BATCH = parseInt(argOf('--batch', '20'), 10);
/* (#R564) THE LEVELS ARE AN ARGUMENT, AND THERE IS ONE FILE PER TIER. The first-level tier (3,4) is
   what the province row draws at every zoom; the deeper tier is fetched only when the reader zooms
   past it (js/time-admin1.js). ONE script, because the two bundles are the SAME record read with the
   same rules - a second script would be a second place to change the day OHM changes a tag. The cache
   is keyed by the level set for the reason the tag sweep is cached at all: re-simplifying must cost
   nothing but CPU. */
const LEVELS = String(argOf('--levels', '3,4')).split(',').map(v => parseInt(v, 10)).filter(Number.isFinite);
const LVLRE  = '^(' + LEVELS.join('|') + ')$';
/* == (#R604) THE GLOBAL IS DERIVED FROM THE OUTPUT FILE, NOT DEFAULTED TO THE FIRST TIER =========
   `--global` used to default to `__HISTADM1` whatever `--out` said, so building the deeper tier
   without remembering that flag wrote data/hist-admin2.js containing `window.__HISTADM1=` - a file
   that loads, parses, reports no error, and REPLACES the first tier's record with the second's the
   moment js/time-admin1.js injects it. Measured here on 2026-09-10: a 15 MB bundle whose every
   assertion about itself was true and whose name was wrong. The two are not independent facts -
   data/hist-adminN.js holds `__HISTADMN` by convention - so the name is READ OFF the convention and
   `--global` stays only as an override for an output the convention does not cover. */
const GLOBAL = argOf('--global', (function () {
  const m = /hist-admin(\d+)\.js$/i.exec(OUT);
  return m ? '__HISTADM' + m[1] : '__HISTADM1';
})());
const CACHE = path.resolve(ROOT, argOf('--cache', path.join(process.env.TEMP || '/tmp', 'ohm-adm' + LEVELS.join('') + '-cache')));
const QUANT = Math.pow(10, parseInt(argOf('--dec', '3'), 10));   /* --dec 3 = ~110 m at the equator */
const MIN_AREA = 1e-5;                                   /* deg^2 — drop slivers, keep small city-states */

/* IntMap's nine (AGENTS.md section 3.5). OHM tags them `name:<code>`. */
const LANGS = { en:'name:en', ja:'name:ja', de:'name:de', ru:'name:ru', es:'name:es',
                fr:'name:fr', ko:'name:ko', 'zh-Hant':'name:zh-Hant', 'zh-Hans':'name:zh-Hans' };

/* ── EDTF-lite → [y,m,d] ────────────────────────────────────────────────────
   OHM writes ISO-ish dates with EDTF qualifiers: `1871-05-04`, `1871-05`, `1871`,
   `-0500` (BCE), and the uncertainty marks `~ ? %` plus open ranges `..`. Anything
   that is not a plain year-first date (`C18`, `18xx`, `unknown`) is UNKNOWN — the
   caller then treats the edge as open rather than inventing a day. */
function edtf(raw, edge) {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/[~?%]/g, '').replace(/\.\.$/, '').trim();
  if (!s || /^(unknown|present|now)$/i.test(s)) return null;
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const m = /^(\d{1,6})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(s);
  if (!m) return null;
  let y = parseInt(m[1], 10); if (neg) y = -y;
  const hasM = m[2] != null, hasD = m[3] != null;
  const mo = hasM ? parseInt(m[2], 10) : (edge === 'end' ? 12 : 1);
  if (!(mo >= 1 && mo <= 12)) return null;
  let d;
  if (hasD) { d = parseInt(m[3], 10); if (!(d >= 1 && d <= 31)) return null; }
  else d = (edge === 'end') ? new Date(Date.UTC(y, mo, 0)).getUTCDate() : 1;
  return [y, mo, d];
}

/* ── Douglas–Peucker, iterative (a recursive one blows the stack on a 40k-point ring) ── */
function simplifyRing(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const seg = stack.pop(), a = seg[0], b = seg[1];
    const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1];
    const dx = bx - ax, dy = by - ay, den = dx * dx + dy * dy;
    let far = -1, fd = 0;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0], py = pts[i][1];
      let t = den ? ((px - ax) * dx + (py - ay) * dy) / den : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + t * dx, qy = ay + t * dy;
      const dd = (px - qx) * (px - qx) + (py - qy) * (py - qy);
      if (dd > fd) { fd = dd; far = i; }
    }
    if (fd > tol2 && far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}
const quant = r => {
  const o = []; let px = NaN, py = NaN;
  for (const p of r) {
    const x = Math.round(p[0] * QUANT) / QUANT, y = Math.round(p[1] * QUANT) / QUANT;
    if (x !== px || y !== py) { o.push([x, y]); px = x; py = y; }
  }
  if (o.length && (o[0][0] !== o[o.length - 1][0] || o[0][1] !== o[o.length - 1][1])) o.push([o[0][0], o[0][1]]);
  return o;
};

/* ── Overpass ──────────────────────────────────────────────────────────────
   ⚠ ONE REQUEST FOR THE WHOLE PLANET IS NOT AN OPTION: `out geom` on Europe alone
   measured 763 MB / 14.4 M vertices. Tags come first (5.6 MB), the ids we actually
   need are chosen here, and geometry arrives in small id batches that are cached on
   disk and resumed — a build that dies at 80 % must not start over. */
async function overpass(ql, tries = 5) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(EP, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'User-Agent': 'IntMap/build-hist-admin1 (+https://github.com/rwmqx7dwb5-arch/IntMap)' },
        body: ql
      });
      if (r.status === 429 || r.status === 504 || r.status >= 500) { await new Promise(s => setTimeout(s, 5000 * (i + 1))); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return JSON.parse(await r.text());
    } catch (e) { last = e; await new Promise(s => setTimeout(s, 4000 * (i + 1))); }
  }
  throw last || new Error('overpass exhausted');
}

/* ══ (#R668) THE RING ASSEMBLER IS js/ohm-rings.js, EVALUATED — NOT COPIED HERE ═══════════════
   The click highlight now fetches ONE relation from the same Overpass and has to turn the same
   unordered open member ways into the same polygon (js/time-admin1.js). Two implementations of
   «which runs of these ways are the same ring» are two answers to one question the first day one of
   them is touched, so this build evaluates the browser's file the way scripts/build-whs.mjs
   evaluates js/lang-registry.js. */
const OHMR = (function () {
  const sandbox = { window: {}, console, Number, Array, Math, JSON };
  sandbox.window.window = sandbox.window;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'ohm-rings.js'), 'utf8'), ctx, { filename: 'ohm-rings.js' });
  const R = sandbox.window.IntMapOhmRings;
  if (!R || typeof R.ringsOf !== 'function' || typeof R.polysOf !== 'function') throw new Error('js/ohm-rings.js did not define IntMapOhmRings');
  return R;
})();
const ringsOf  = el => OHMR.ringsOf(el);
const ringArea = r => OHMR.ringArea(r);
const polysOf  = rings => OHMR.polysOf(rings, MIN_AREA);

(async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  /* ⚠ THE TAG SWEEP IS CACHED TOO. It was not, and a rebuild at a different --tol
     therefore had to re-ask Overpass for the whole 5.6 MB index — which is the one
     request in this script with no id to retry on, so a rate-limited answer killed a
     build whose 153 geometry batches were all already on disk. Re-simplifying must
     cost nothing but CPU. Delete the cache directory to re-pull from upstream. */
  const tf = path.join(CACHE, 'tags.json');
  let tagJson;
  if (fs.existsSync(tf)) { console.error('· tags (cached)'); tagJson = JSON.parse(fs.readFileSync(tf, 'utf8')); }
  else {
    console.error('· tags …');
    /* ══ (#R668) THE CLAIM IS THE LEVEL, AND A MISSING `boundary` TAG IS A MISSING TAG ══════════
       Measured on OHM 2026-09-10: 28,211 relations carry admin_level 3-6 and 27,662 of them are
       `boundary=administrative`. Of the 549 that are not, 538 are a DIFFERENT KIND OF OBJECT that
       merely borrows the level column — religious_administration (431), census (79), statistical
       (18), election, disputed — and those are correctly none of this layer's business. The other
       ELEVEN are first-level subdivisions with the tag simply absent, and they were being dropped
       for it: 直隸 Chihli (admin_level 4, 1644-1911), CdZ-Gebiet Elsaß, «Augustan Italian provinces»
       among them. `type=boundary` with a level and no competing `boundary` value is an
       administrative boundary whose tagger did not write the word down. */
    tagJson = await overpass('[out:json][timeout:600];('
      + 'relation["boundary"="administrative"]["admin_level"~"' + LVLRE + '"];'
      + 'relation["type"="boundary"][!"boundary"]["admin_level"~"' + LVLRE + '"];'
      + ');out tags;');
    fs.writeFileSync(tf, JSON.stringify(tagJson));
  }
  const all = (tagJson.elements || []).filter(e => e.type === 'relation' && e.tags);
  console.error('  relations', all.length);

  /* Which of them can EVER be on screen? The clock floor is `--since`, so a unit that
     ended before it can never be shown.
     ══ ⚠⚠⚠ (#R668) AN UNDATED RECORD IS NOT A PRESENT-DAY RECORD ═══════════════════════════════
     This loop used to `continue` on `!s && !e`, and the reason written here was that a relation
     with no dates «is a present-day unit that `ref-admin1` already draws from the live vector
     tiles». Measured 2026-09-10, that is false of every one of the thirteen it dropped: 安房国 and
     壱岐国 (provinces abolished in 1871), 東海道 · 山陰道 · 西海道 (the circuits they belonged to),
     Ziemia Płocka, Ziemia Wyszogrodzka, Stockholm, Dahme-Spreewald, Bodenwerder, Столінскі раён,
     граница and one unnamed row. None of them is a present-day first-level unit and `ref-admin1`
     draws none of them.
     ⚠ AND THE LINE WAS ALREADY DRAWING THEM. js/hist-scale.js `ohmFilter` lets a tile feature with
     no `start_decdate` through at EVERY date — deliberately, because a record that states no span
     cannot be excluded from one. So the era line has been striking 安房国 all along while the
     bundle held no label for it, no answer to a click on it and no count of it: the drop did not
     remove the unit from the map, it removed the map's ability to say what the unit was.
     An absent edge is already handled below — `w.s || [SINCE - 200, …]`, `w.e || [9999, …]` — so
     an undated record is simply one with BOTH edges open, which is what upstream is saying. */
  const want = [];
  let backwards = 0;
  for (const el of all) {
    const t = el.tags;
    if (!LEVELS.includes(parseInt(t.admin_level, 10))) continue;   /* (#R564) the cache is per level set, but the filter is stated where it is read */
    const s = edtf(t.start_date, 'start'), e = edtf(t.end_date, 'end');
    if (e && e[0] < SINCE) continue;
    /* ⚠ (#R564) A SPAN THAT ENDS BEFORE IT STARTS IS NOT A SPAN, and upstream has some: measured
       2026-09-09, two at levels 3-4 (名東県 1881-12-26 → 1873-02-20; Mexican Cession 1850-12-12 →
       1850-09-09) and five at 5-6 (four Burnett County rows and Merionethshire, each ending the day
       before it starts). Such a record can never be in force, so it draws nothing — but it was
       shipped, and every one of its two dates entered the EPOCH INDEX, which is what decides when the
       map re-renders. Dropping them here is not a special case for those seven: it is the rule that a
       record must describe an interval, applied where the interval is read. */
    if (s && e && (s[0] * 10000 + s[1] * 100 + s[2]) > (e[0] * 10000 + e[1] * 100 + e[2])) { backwards++; continue; }
    want.push({ el, s, e });
  }
  console.error('  datable & reachable from', SINCE, '→', want.length, '| dropped for a backwards span:', backwards);

  /* ring pool: identical rings are shared, which is where most of the saving is -
     a province and its neighbour trace the same line from opposite sides. */
  const pool = [], poolIx = new Map();
  const put = r => { const k = JSON.stringify(r); let ix = poolIx.get(k); if (ix === undefined) { ix = pool.length; pool.push(r); poolIx.set(k, ix); } return ix; };

  /* == (#R604) EACH BATCH IS SIMPLIFIED AS IT ARRIVES, AND THE RAW GEOMETRY IS DROPPED =========
     This loop used to fill a `Map` with every relation's RAW Overpass geometry and simplify the whole
     planet afterwards. That is bounded by how much UPSTREAM holds, not by how much this script needs,
     and at `--since 1 --levels 5,6` upstream holds 22,807 relations: measured 2026-09-10, the build
     died at 14,000 of them with "Ineffective mark-compacts near heap limit" against V8's ~4 GB
     default, after eighteen minutes of downloading that all had to be thrown away.
     WARNING - THE FIX IS NOT A BIGGER `--max-old-space-size`. That is a number somebody has to raise
     again the next time OHM grows, on every machine that runs this, and has to remember to. Nothing
     here ever needs two relations at once: a batch is fetched, each relation in it becomes pooled
     ring indices, and its raw geometry arrives and leaves inside ONE iteration. What is retained is
     the OUTPUT (the ring pool and the feature rows), which is the size of the file being written.
     The disk cache is untouched and still resumable, which is what made those eighteen minutes
     recoverable rather than lost. */
  const feats = [];
  let dropped = 0, fetched = 0;
  const owed = new Map(want.map(w => [w.el.id, w]));
  const ids = want.map(w => w.el.id);
  /* ══ ⚠⚠⚠ (#R668) THE CACHE IS KEYED BY THE RECORD, NOT BY ITS POSITION IN THIS RUN'S LIST ══════
     It used to be keyed by the batch — `g<first id>-<length>.json` — which addresses a relation's
     geometry by WHERE that relation happened to fall in the id list of the run that downloaded it.
     Admitting ONE more relation (which is exactly what the two coverage fixes above do) shifts every
     later batch boundary by one, so every later file becomes unfindable and a resumable build that
     already holds 4,699 of 4,776 relations on disk re-downloads all of them: measured on this
     machine, 3.4 GB and about forty minutes of Overpass for a change that needed eighteen records.
     A relation's geometry is a fact about that relation, so it is stored under that relation's id.
     Existing batch files are exploded into per-id files once and removed, so nothing already paid
     for is lost, and the build stays resumable for the reason it always was. */
  const RELDIR = path.join(CACHE, 'rel');
  fs.mkdirSync(RELDIR, { recursive: true });
  const relFile = id => path.join(RELDIR, id + '.json');
  (function seedFromBatches() {
    const olds = fs.readdirSync(CACHE).filter(f => /^g\d+-\d+\.json$/.test(f));
    if (!olds.length) return;
    console.error('· re-keying ' + olds.length + ' cached batches by relation id …');
    let n = 0;
    for (const f of olds) {
      const full = path.join(CACHE, f);
      try {
        const j = JSON.parse(fs.readFileSync(full, 'utf8'));
        for (const el of (j.elements || [])) {
          if (el.type !== 'relation') continue;
          const rf = relFile(el.id);
          if (!fs.existsSync(rf)) { fs.writeFileSync(rf, JSON.stringify(el)); n++; }
        }
      } catch (_) { /* a truncated batch is simply re-fetched below */ }
      try { fs.unlinkSync(full); } catch (_) { }
    }
    console.error('  ' + n + ' relations re-keyed');
  })();
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const missing = chunk.filter(id => !fs.existsSync(relFile(id)));
    if (missing.length) {
      const j = await overpass('[out:json][timeout:900];relation(id:' + missing.join(',') + ');out geom;');
      for (const el of (j.elements || [])) if (el.type === 'relation') fs.writeFileSync(relFile(el.id), JSON.stringify(el));
      /* an id upstream no longer answers for is recorded as answered-with-nothing, so a resumed
         build does not ask for it again forever. It stays `owed`, so it is still counted as dropped. */
      for (const id of missing) if (!fs.existsSync(relFile(id))) fs.writeFileSync(relFile(id), 'null');
      fetched++;
    }
    for (const id of chunk) {
      const w = owed.get(id); if (!w) continue;
      let el = null;
      try { el = JSON.parse(fs.readFileSync(relFile(id), 'utf8')); } catch (_) { el = null; }
      if (!el || el.type !== 'relation') continue;
      owed.delete(id);
      absorb(w, el);
      el = null;   /* the record's raw geometry is dead HERE, not at the end of the planet */
    }
    process.stderr.write('\r  geom ' + Math.min(i + BATCH, ids.length) + '/' + ids.length + ' (net ' + fetched + ', kept ' + feats.length + ')   ');
  }
  /* asked for and never returned - counted exactly as the old loop counted a missing id, so the
     "dropped" figure the build prints still means the same thing. */
  dropped += owed.size;
  process.stderr.write('\n');

  function absorb(w, el) {
    const polys = polysOf(ringsOf(el));
    const idx = [];
    for (const poly of polys) {
      const ringIx = [];
      for (const ring of poly) {
        const q = quant(simplifyRing(ring, TOL));
        if (q.length >= 4 && ringArea(q) >= MIN_AREA) ringIx.push(put(q));
      }
      if (ringIx.length) idx.push(ringIx);
    }
    if (!idx.length) { dropped++; return; }
    const t = w.el.tags;
    const s = w.s || [SINCE - 200, 1, 1];    /* open start = already there when the clock begins */
    const e = w.e || [9999, 12, 31];         /* open end  = still in force */
    const names = {};
    for (const code of Object.keys(LANGS)) { const v = t[LANGS[code]]; if (v) names[code] = v; }
    /* ══ (#R668) COLUMN 10 IS THE OHM RELATION ID, AND IT IS WHAT MAKES THE CLICK SHARP ═════════
       The shipped ring is simplified at `--tol` because a planet-wide bundle has to be; the unit a
       reader just tapped is ONE record, and one record can be fetched whole. js/time-admin1.js asks
       Overpass for this id and re-draws the highlight at upstream's own geometry (伊豆国: 29
       vertices here, 2,800 there). Without the id the click would have to find the record by NAME,
       which is the mistake #R515 forbade. */
    feats.push([String(t.name || t['name:en'] || '').trim(), parseInt(t.admin_level, 10) || 4,
                s[0], s[1], s[2], e[0], e[1], e[2], idx, names, w.el.id]);
  }

  const src = 'OpenHistoricalMap contributors (CC0) · openhistoricalmap.org';
  const body = 'window.' + GLOBAL + '=' + JSON.stringify({
    v: 1, src, built: new Date().toISOString().slice(0, 10), since: SINCE, tolerance: TOL,
    levels: LEVELS, rings: pool, feats
  }) + ';\n';
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, body);

  const years = [1850, 1870, 1900, 1914, 1938, 1950, 1990, 2020];
  const alive = y => { const t = y * 10000 + 615;
    return feats.filter(f => (f[2] * 10000 + f[3] * 100 + f[4]) <= t && (f[5] * 10000 + f[6] * 100 + f[7]) >= t).length; };
  console.error('· wrote', path.relative(ROOT, OUT), (body.length / 1048576).toFixed(2) + ' MB',
                '| feats', feats.length, '| rings', pool.length, '| dropped', dropped);
  console.error('· in force:', years.map(y => y + '=' + alive(y)).join(' '));
})().catch(e => { console.error('FAILED', e); process.exit(1); });

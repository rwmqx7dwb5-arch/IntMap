/* ============================================================================
 *  IntMap · ATLAS QUALITY LAB — IS THE MAP RIGHT?  (the map axis; grading is pure)
 * ----------------------------------------------------------------------------
 *  PRODUCT.md §2.2-2: 「地図の上で答えが完結すること——答えは地図の状態として現れる」. Until this file,
 *  the quality lab graded all 74 answer-key questions by the WORDS of the reply alone
 *  (scripts/atlas-eval/grade.mjs): a turn that wrote 「515.4 km」 and left the map on the start-up view
 *  was a correct answer to 「ルートを地図に出して。何 km？」. This is the other half, and it is kept a
 *  SEPARATE AXIS — the text grade and the map grade are never folded into one number, because 「said the
 *  right thing」 and 「showed the right thing」 fail for different reasons.
 *
 *  A question in either problem set may carry `mapState` — what the FINAL MAP must hold when the turn
 *  ends. Every criterion is optional; only the ones written are graded:
 *
 *    view        { contains:[{name,lng,lat,source}], why }   each point is inside the visible frame (`viewport`)
 *    layers      { on:[id], off:[id], why }                  the layer rows of js/layers/ (`activeLayers`);
 *                                                            a ticked row that is not painted is NOT on
 *    clock       { year | date:'YYYY-MM-DD' | live:true, why }  the master clock (`time`)
 *    comparison  { open, codes:[…], indicators:[…], why }   the statistics-comparison panel (`comparison`)
 *    drawn       [{ path, min, max, why } | { anyOf:[{path,min,max}], why }]
 *                                                            a count read off the snapshot: `atlas.lines`,
 *                                                            `objects.kind:route` … (the product's own sections)
 *    era         { year, in:[w,s,e,n], includes:[name], excludes:{pattern,why}, source, why }
 *                                                            the historical units in force that year, there
 *
 *  ⚠ THE VOCABULARY IS DISCOVERED, NOT LISTED (.agents/rules/no-ad-hoc-hardcoding.md §2-4). A layer id is
 *    checked against the declarations in js/layers/, a snapshot section against the providers that are
 *    actually registered in js/, an `atlas.*` key against the provider that builds it, an object kind
 *    against js/map-tools.js's inventory, and an era's names against what scripts/hist-fidelity.mjs
 *    enumerates for that year and place. A key that names something none of them has is RED in the key
 *    check — a criterion that can never be met would otherwise read as Atlas failing it forever.
 *
 *  ⚠ 「COULD NOT OBSERVE」 IS NOT 「MISMATCH」 (.agents/rules/one-pass-or-a-reason.md §5). A criterion whose
 *    section the snapshot does not carry — the page has no provider for it, the harness did not capture
 *    it, the replay diverged and the recorded map is not this run's — is `unobserved`, and it is counted
 *    apart. Only a section that WAS read and says otherwise is a `mismatch`.
 *
 *  ⚠ HISTORY IS GRADED AS HISTORY (.agents/rules/historical-verification.md). An `era` criterion is not
 *    「the clock says 1750」: the units the bundle draws are a function of the clock and the frame, so the
 *    units the reader saw (enumerated at the OBSERVED year, in the OBSERVED frame) are compared with the
 *    units that year should show (enumerated at the asked year) — and the key itself is checked against
 *    the enumeration and the institution's dates (`includes` / `excludes`), so a key cannot ask for a map
 *    the record says never existed. ⚠ That enumeration is the BUNDLE reader; the line the reader sees is
 *    also drawn from OHM's vector tiles (§2b), which no node process can read — the report says so.
 * ==========================================================================*/
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { codeOnly } from '../code-only.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const str = (v) => (v == null ? '' : String(v));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/* ── the vocabulary, discovered ───────────────────────────────────────────────────────────────── */

const code = (root, rel) => codeOnly(readFileSync(join(root, rel), 'utf8'));

/** the body of `function <name>(){ … }` in a source text, by brace depth (literals are left as written,
 *  which is enough for the two providers read here — neither holds a brace inside a string) */
function bodyOf(src, name) {
  const at = src.search(new RegExp('function\\s+' + name + '\\s*\\('));
  if (at < 0) return '';
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  return '';
}

const VOCAB = new Map();
/**
 * mapVocabulary(root) → { layers, sections, atlasKeys, objectKinds, era } — what a `mapState` may name.
 *   layers      the `id` of every declaration in js/layers/ (the files scripts/layer-descriptors.mjs
 *               discovers: `*.js` not starting with `_`) — the same ids the layer rows' checkboxes carry,
 *               which is what the `activeLayers` section reports
 *   sections    every snapshot section a provider is registered for in js/ (js/atlas-state.js `reg('…'`,
 *               and `registerStateProvider('…'` anywhere — the console registers `atlas` itself)
 *   atlasKeys   the fields of the function the console registers as the `atlas` section
 *   objectKinds the kinds js/map-tools.js's object inventory (`collect()`, read by the `objects` section) emits
 *   era         (year, box) → [unit] — scripts/hist-fidelity.mjs's enumeration (see eraReference)
 */
export function mapVocabulary(root = ROOT) {
  if (VOCAB.has(root)) return VOCAB.get(root);
  const layers = new Set();
  const dir = join(root, 'js', 'layers');
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.js') && !x.startsWith('_')).sort()) {
      const m = /\bid\s*:\s*'([^']+)'/.exec(code(root, 'js/layers/' + f));
      if (m) layers.add(m[1]);
    }
  }
  const sections = new Set();
  const atlasState = code(root, 'js/atlas-state.js');
  for (const m of atlasState.matchAll(/\breg\(\s*'([A-Za-z]+)'/g)) sections.add(m[1]);
  let atlasFn = '';
  let consoleSrc = '';
  for (const f of readdirSync(join(root, 'js')).filter((x) => x.endsWith('.js'))) {
    const s = code(root, 'js/' + f);
    for (const m of s.matchAll(/registerStateProvider\(\s*'([A-Za-z]+)'\s*,\s*([A-Za-z_$][\w$]*)?/g)) {
      sections.add(m[1]);
      if (m[1] === 'atlas' && m[2]) { atlasFn = m[2]; consoleSrc = s; }
    }
  }
  const atlasKeys = new Set();
  const ab = atlasFn ? bodyOf(consoleSrc, atlasFn) : '';
  const lit = /const\s+o\s*=\s*\{([^}]*)\}/.exec(ab);
  if (lit) for (const m of lit[1].matchAll(/([A-Za-z]+)\s*:/g)) atlasKeys.add(m[1]);
  for (const m of ab.matchAll(/\bo\.([A-Za-z]+)\s*=/g)) atlasKeys.add(m[1]);
  const objectKinds = new Set();
  for (const m of bodyOf(code(root, 'js/map-tools.js'), 'collect').matchAll(/\bkind\s*:\s*'([a-z]+)'/g)) objectKinds.add(m[1]);
  const v = { root, layers, sections, atlasKeys, objectKinds, era: eraReference(root) };
  VOCAB.set(root, v);
  return v;
}

/**
 * eraReference(root) → (year, box) → [{ key, name, level, from, to, file }]
 * What the shipped historical bundles draw in force on 1 July of `year` with the unit's centroid inside
 * `box` — scripts/hist-fidelity.mjs `--year --in`, the instrument historical-verification.md §2-1 names.
 * It is run as that script (it reads the bundles the way the browser does, and is the one place that
 * knows which bundles exist); this reads its listing. Cached per (year, box): one run reads every bundle.
 */
export function eraReference(root = ROOT) {
  const cache = new Map();
  return function (year, box) {
    const k = year + '@' + box.join(',');
    if (cache.has(k)) return cache.get(k);
    const r = spawnSync(process.execPath, [join(root, 'scripts', 'hist-fidelity.mjs'), '--year', String(year), '--in', box.join(',')],
      { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error('scripts/hist-fidelity.mjs --year ' + year + ' --in ' + box.join(',') + ' failed: ' + str(r.stderr).slice(0, 300));
    const out = [];
    let file = '';
    for (const line of str(r.stdout).split(/\r?\n/)) {
      const f = /^(data\/[^:]+):\s*\d+\s*$/.exec(line);
      if (f) { file = f[1]; continue; }
      const u = /^\s{4}(.+?) \(L(\d+) (-?\d+-\d+-\d+) → (-?\d+-\d+-\d+)\)/.exec(line);
      if (u) out.push({ key: file + ':' + u[1] + ':L' + u[2] + ':' + u[3], name: u[1], level: +u[2], from: u[3], to: u[4], file });
    }
    cache.set(k, out);
    return out;
  };
}

/* ── the key's own schema ─────────────────────────────────────────────────────────────────────── */

const KNOWN = new Set(['view', 'layers', 'clock', 'comparison', 'drawn', 'era', 'why']);
const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[0] < b[2] && b[1] < b[3];

/** the problems with one path of a `drawn` criterion against the discovered sections */
function pathProblems(p, vocab) {
  const parts = str(p).split('.');
  if (!parts[0] || !vocab.sections.has(parts[0])) return ['«' + p + '» reads section «' + parts[0] + '», which no provider in js/ registers'];
  if (parts[0] === 'atlas' && parts[1] && !vocab.atlasKeys.has(parts[1])) return ['«' + p + '»: the `atlas` section has no field «' + parts[1] + '»'];
  if (parts[0] === 'objects' && parts[1]) {
    const k = /^kind:(.+)$/.exec(parts[1]);
    if (k && !vocab.objectKinds.has(k[1])) return ['«' + p + '»: js/map-tools.js puts no object of kind «' + k[1] + '» on the map'];
    if (!k && parts[1] !== 'n') return ['«' + p + '»: the `objects` section is read as `objects.n` or `objects.kind:<kind>`'];
  }
  return [];
}

/**
 * validateMapState(ms, vocab, id) → [problem…] — one question's `mapState` against the vocabulary.
 * `vocab.era` is called only for an `era` criterion (it runs the enumeration).
 */
export function validateMapState(ms, vocab, id = '(question)') {
  const bad = [];
  const say = (m) => bad.push(id + ': mapState ' + m);
  if (!isObj(ms)) { say('is not an object'); return bad; }
  for (const k of Object.keys(ms)) if (!KNOWN.has(k)) say('has an unknown criterion «' + k + '» — map-state.mjs would ignore it');
  const crit = Object.keys(ms).filter((k) => k !== 'why');
  if (!crit.length) say('names no criterion');
  const needWhy = (k, c) => { if (!str(c && c.why).trim()) say(k + ' carries no «why» — which words of the question ask for it'); };
  if (ms.view) {
    needWhy('view', ms.view);
    const pts = ms.view.contains;
    if (!Array.isArray(pts) || !pts.length) say('view.contains needs at least one point');
    for (const p of pts || []) {
      if (!str(p && p.name).trim() || !Number.isFinite(p && p.lng) || !Number.isFinite(p && p.lat) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) say('view.contains has a point without a name and a lng/lat: ' + JSON.stringify(p));
      else if (!/^https?:\/\//.test(str(p.source))) say('view.contains «' + p.name + '» names no source url for its coordinate');
    }
  }
  if (ms.layers) {
    needWhy('layers', ms.layers);
    const all = [...(ms.layers.on || []), ...(ms.layers.off || [])];
    if (!all.length) say('layers names no layer');
    for (const l of all) if (!vocab.layers.has(l)) say('layers names «' + l + '», which no declaration in js/layers/ has');
  }
  if (ms.clock) {
    needWhy('clock', ms.clock);
    const c = ms.clock;
    const forms = ['year', 'date', 'live'].filter((k) => c[k] != null);
    if (forms.length !== 1) say('clock states exactly one of year / date / live');
    if (c.year != null && !Number.isInteger(c.year)) say('clock.year is an integer');
    if (c.date != null && !/^-?\d{4,6}-\d{2}-\d{2}$/.test(str(c.date))) say('clock.date is YYYY-MM-DD');
    if (c.live != null && c.live !== true) say('clock.live is true or absent');
  }
  if (ms.comparison) {
    needWhy('comparison', ms.comparison);
    const c = ms.comparison;
    if (c.open == null && !c.codes && !c.indicators) say('comparison names nothing to compare');
    for (const k of ['codes', 'indicators']) if (c[k] != null && !(Array.isArray(c[k]) && c[k].every((x) => str(x).trim()))) say('comparison.' + k + ' is a list of names');
  }
  if (ms.drawn != null) {
    if (!Array.isArray(ms.drawn) || !ms.drawn.length) say('drawn is a non-empty list');
    for (const d of ms.drawn || []) {
      needWhy('drawn', d);
      const alts = Array.isArray(d && d.anyOf) ? d.anyOf : [d];
      if (!alts.length) say('drawn has an empty anyOf');
      for (const a of alts) {
        for (const p of pathProblems(a && a.path, vocab)) say('drawn ' + p);
        if (!(Number.isInteger(a && a.min) && a.min >= 0) && !Number.isInteger(a && a.max)) say('drawn «' + str(a && a.path) + '» states a min or a max count');
        if (Number.isInteger(a && a.min) && Number.isInteger(a && a.max) && a.min > a.max) say('drawn «' + a.path + '» has min > max');
      }
    }
  }
  if (ms.era) {
    const e = ms.era;
    needWhy('era', e);
    if (!Number.isInteger(e.year)) say('era.year is an integer');
    if (!isBox(e.in)) say('era.in is [west, south, east, north]');
    const s = e.source || {};
    if (!/^https?:\/\//.test(str(s.url)) || !str(s.states).trim()) say('era names the source of the institution\'s dates (url, what it states) — historical-verification.md §2-2');
    if (Number.isInteger(e.year) && isBox(e.in) && vocab.era) {
      let units = null;
      try { units = vocab.era(e.year, e.in); } catch (err) { say('era: the enumeration could not be run — ' + str(err && err.message)); }
      if (units) {
        if (!units.length) say('era: scripts/hist-fidelity.mjs draws no unit in ' + e.year + ' inside [' + e.in.join(', ') + '] — the map this asks for does not exist in the record');
        for (const n of e.includes || []) if (!units.some((u) => u.name === n)) say('era.includes «' + n + '», which the record does not draw in ' + e.year + ' there');
        if (e.excludes) {
          let re = null;
          try { re = new RegExp(e.excludes.pattern); } catch (_) { say('era.excludes has a bad pattern'); }
          if (!str(e.excludes.why).trim()) say('era.excludes says why (the institution\'s end)');
          const hit = re ? units.filter((u) => re.test(u.name)) : [];
          if (hit.length) say('era.excludes /' + e.excludes.pattern + '/ but the record draws ' + hit.slice(0, 4).map((u) => u.name + ' (' + u.from + ' → ' + u.to + ')').join(', ') + ' in ' + e.year);
        }
      }
    }
  }
  return bad;
}

/* ── grading (pure) ───────────────────────────────────────────────────────────────────────────── */

/** the section of the snapshot, or undefined when it was not read (absent, or `null` = no provider) */
function sectionOf(snap, name) {
  const v = isObj(snap) ? snap[name] : undefined;
  return v == null ? undefined : v;
}

/** a count read off a snapshot path. `undefined` when its SECTION was not read; inside a section that
 *  was read, an absent or null field is 0 (the `atlas` section initialises every drawing to null). */
export function countAt(snap, path) {
  const parts = str(path).split('.');
  const sec = sectionOf(snap, parts[0]);
  if (sec === undefined) return undefined;
  if (parts[0] === 'objects' && parts[1]) {
    const k = /^kind:(.+)$/.exec(parts[1]);
    const items = Array.isArray(sec.items) ? sec.items : [];
    if (k) return items.filter((o) => o && o.kind === k[1]).length;
  }
  let v = sec;
  for (const p of parts.slice(1)) { if (v == null || typeof v !== 'object') { v = undefined; break; } v = v[p]; }
  if (v == null || v === false) return 0;
  if (v === true) return 1;
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return v.length;
  if (isObj(v)) return Number.isFinite(+v.n) ? +v.n : 1;
  return str(v) ? 1 : 0;
}

/** is (lng, lat) inside the frame? The frame of a globe may cross the antimeridian (west > east) or span
 *  more than the whole circle; longitude is compared modulo 360. */
export function inFrame(vp, lng, lat) {
  if (!(lat >= vp.south && lat <= vp.north)) return false;
  const span = vp.east - vp.west;
  if (span >= 360) return true;
  const w = ((vp.west % 360) + 540) % 360 - 180;
  const width = ((span % 360) + 360) % 360;
  const d = (((lng - w) % 360) + 360) % 360;
  return d <= width;
}

/** the year and date on the clock, from the `time` section: travelDate is UTC `YYYY-MM-DD` (js/chronos.js
 *  ymdISO, signed six digits outside 0–9999) */
function clockOf(t) {
  if (t.live) return { live: true };
  const m = /^([+-]?\d{4,6})-(\d{2})-(\d{2})/.exec(str(t.travelDate || t.instant));
  return m ? { live: false, year: +m[1], date: m[1] + '-' + m[2] + '-' + m[3] } : { live: false };
}

/** the frame ∩ box as one or two boxes (two when the frame crosses the antimeridian) */
function frameBoxes(vp, box) {
  const south = Math.max(vp.south, box[1]), north = Math.min(vp.north, box[3]);
  if (!(south < north)) return [];
  const span = vp.east - vp.west;
  const lngs = span >= 360 ? [[-180, 180]] : (() => {
    const w = ((vp.west % 360) + 540) % 360 - 180, e = w + (((span % 360) + 360) % 360);
    return e <= 180 ? [[w, e]] : [[w, 180], [-180, e - 360]];
  })();
  const out = [];
  for (const [w, e] of lngs) { const a = Math.max(w, box[0]), b = Math.min(e, box[2]); if (a < b) out.push([a, south, b, north]); }
  return out;
}
const round = (b) => b.map((x) => Math.round(x * 1e4) / 1e4);

/**
 * gradeMap(ms, snapshot, ctx) → { verdict:'match'|'mismatch'|'unobserved', criteria:[{criterion, verdict, detail}], match, mismatch, unobserved }
 *   ms        a question's `mapState`
 *   snapshot  the final map, as IntMapAtlasState.snapshot() publishes it (a section absent = not read)
 *   ctx       { eraReference?: (year, box) → [unit] } — handed in; without it the era's units are unobserved
 * The turn's verdict: any mismatch → mismatch; else any unobserved → unobserved; else match.
 */
export function gradeMap(ms, snapshot, ctx = {}) {
  const criteria = [];
  const put = (criterion, verdict, detail) => criteria.push({ criterion, verdict, detail });
  const snap = isObj(snapshot) ? snapshot : {};
  const notRead = (sec) => 'the final map\'s `' + sec + '` section was not read';

  if (ms.view) {
    const vp = sectionOf(snap, 'viewport');
    if (!vp || !Number.isFinite(+vp.west)) put('view', 'unobserved', notRead('viewport'));
    else {
      const out = (ms.view.contains || []).filter((p) => !inFrame(vp, p.lng, p.lat));
      put('view', out.length ? 'mismatch' : 'match', out.length
        ? out.map((p) => p.name).join(', ') + ' outside the frame W ' + (+vp.west).toFixed(2) + ' S ' + (+vp.south).toFixed(2) + ' E ' + (+vp.east).toFixed(2) + ' N ' + (+vp.north).toFixed(2)
        : (ms.view.contains || []).map((p) => p.name).join(', ') + ' in the frame');
    }
  }
  if (ms.layers) {
    const al = sectionOf(snap, 'activeLayers');
    if (!Array.isArray(al)) put('layers', 'unobserved', notRead('activeLayers'));
    else {
      const row = (id) => al.find((l) => l && l.id === id && !l.readable);
      const miss = [];
      for (const id of ms.layers.on || []) { const r = row(id); if (!r) miss.push(id + ' is off'); else if (r.painted === false) miss.push(id + ' is ticked but not painted'); }
      for (const id of ms.layers.off || []) if (row(id)) miss.push(id + ' is on');
      put('layers', miss.length ? 'mismatch' : 'match', miss.length ? miss.join('; ') : 'as expected');
    }
  }
  const t = sectionOf(snap, 'time');
  const clock = t ? clockOf(t) : null;
  if (ms.clock) {
    if (!clock) put('clock', 'unobserved', notRead('time'));
    else {
      const c = ms.clock;
      const ok = c.live ? clock.live : c.year != null ? (!clock.live && clock.year === c.year) : (!clock.live && clock.date === c.date);
      put('clock', ok ? 'match' : 'mismatch', 'the clock is ' + (clock.live ? 'live' : (clock.date || 'travelling (no date read)')) + '; expected ' + (c.live ? 'live' : (c.year != null ? 'the year ' + c.year : c.date)));
    }
  }
  if (ms.comparison) {
    const cp = sectionOf(snap, 'comparison');
    if (!cp) put('comparison', 'unobserved', notRead('comparison'));
    else {
      const c = ms.comparison, miss = [];
      if (c.open != null && !!cp.open !== !!c.open) miss.push('the panel is ' + (cp.open ? 'open' : 'closed'));
      for (const k of ['codes', 'indicators']) for (const x of c[k] || []) if (!(cp[k] || []).map(str).includes(str(x))) miss.push(k + ' lacks ' + x);
      put('comparison', miss.length ? 'mismatch' : 'match', miss.length ? miss.join('; ') : 'as expected');
    }
  }
  (ms.drawn || []).forEach((d, i) => {
    const alts = Array.isArray(d.anyOf) ? d.anyOf : [d];
    const seen = alts.map((a) => ({ a, n: countAt(snap, a.path) }));
    const read = seen.filter((s) => s.n !== undefined);
    const fits = (s) => (s.a.min == null || s.n >= s.a.min) && (s.a.max == null || s.n <= s.a.max);
    const range = (a) => (a.min != null ? '≥ ' + a.min : '') + (a.min != null && a.max != null ? ', ' : '') + (a.max != null ? '≤ ' + a.max : '');
    const label = 'drawn' + (ms.drawn.length > 1 ? '[' + i + ']' : '');
    if (read.some(fits)) { const s = read.find(fits); put(label, 'match', s.a.path + ' = ' + s.n); }
    /* any-of: a mismatch only when EVERY alternative was read — an unread one might have held it */
    else if (read.length < seen.length) put(label, 'unobserved', seen.filter((s) => s.n === undefined).map((s) => s.a.path).join(', ') + ' not read' + (read.length ? '; ' + read.map((s) => s.a.path + ' = ' + s.n).join(', ') : ''));
    else put(label, 'mismatch', read.map((s) => s.a.path + ' = ' + s.n + ' (' + range(s.a) + ')').join(' · '));
  });
  if (ms.era) {
    const e = ms.era;
    const vp = sectionOf(snap, 'viewport');
    if (!clock) put('era', 'unobserved', notRead('time'));
    else if (!vp || !Number.isFinite(+vp.west)) put('era', 'unobserved', notRead('viewport'));
    else if (typeof ctx.eraReference !== 'function') put('era', 'unobserved', 'no enumeration of the historical bundles was handed in (scripts/hist-fidelity.mjs)');
    else {
      const boxes = frameBoxes(vp, e.in);
      if (!boxes.length) put('era', 'mismatch', 'the frame does not reach [' + e.in.join(', ') + ']');
      else if (clock.live) put('era', 'mismatch', 'the clock is live: the reader sees today\'s subdivisions, not ' + e.year + '\'s');
      else if (clock.year == null) put('era', 'unobserved', 'the clock is travelling but its date was not read');
      else {
        const units = (y) => { const m = new Map(); for (const b of boxes) for (const u of ctx.eraReference(y, round(b))) m.set(u.key, u); return m; };
        const want = units(e.year), shown = clock.year === e.year ? want : units(clock.year);
        const missing = [...want.values()].filter((u) => !shown.has(u.key)), extra = [...shown.values()].filter((u) => !want.has(u.key));
        const names = (l) => l.slice(0, 5).map((u) => u.name).join(', ') + (l.length > 5 ? ' …' : '');
        if (!want.size) put('era', 'mismatch', 'the frame shows none of the units the record draws in ' + e.year);
        else if (missing.length || extra.length) put('era', 'mismatch', 'at ' + clock.year + ' the frame shows ' + shown.size + ' unit(s); ' + e.year + ' shows ' + want.size + (missing.length ? ' — missing ' + names(missing) : '') + (extra.length ? ' — not of ' + e.year + ': ' + names(extra) : ''));
        else put('era', 'match', want.size + ' unit(s) of ' + e.year + ' in the frame (the bundle reader; the OHM tile lines are not readable here)');
      }
    }
  }
  const n = (v) => criteria.filter((c) => c.verdict === v).length;
  const verdict = n('mismatch') ? 'mismatch' : n('unobserved') ? 'unobserved' : 'match';
  return { verdict, criteria, match: n('match'), mismatch: n('mismatch'), unobserved: n('unobserved') };
}

/**
 * sectionsRead(questions) → [section] — the snapshot sections gradeMap reads for these questions' `mapState`,
 * derived from the criteria written (not listed): what a harness must capture so that none of them is
 * unobserved merely because it was never asked for.
 */
export function sectionsRead(questions) {
  const s = new Set();
  for (const q of questions || []) {
    const ms = q && q.mapState;
    if (!isObj(ms)) continue;
    if (ms.view) s.add('viewport');
    if (ms.layers) s.add('activeLayers');
    if (ms.clock) s.add('time');
    if (ms.comparison) s.add('comparison');
    if (ms.era) { s.add('time'); s.add('viewport'); }
    for (const d of ms.drawn || []) for (const a of (Array.isArray(d.anyOf) ? d.anyOf : [d])) s.add(str(a && a.path).split('.')[0]);
  }
  return [...s].filter(Boolean).sort();
}

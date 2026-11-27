/* ============================================================================
 *  IntMap · ATLAS QUALITY LAB — IS THE MAP RIGHT?  (the map axis; grading is pure)
 * ----------------------------------------------------------------------------
 *  PRODUCT.md §2.2-2: 「地図の上で答えが完結すること——答えは地図の状態として現れる」. Until this file,
 *  the quality lab graded every answer-key question by the WORDS of the reply alone
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
 *    drawn       [{ path, min, max, why, named? } | { anyOf:[{path,min,max}], why, named? }] — `named`: spellings of the ONE thing the
 *                shapes counted must be (read off `atlas.shapes.names`; only on `atlas.shapes.*` paths)
 *                                                            a count read off the snapshot: `atlas.lines`,
 *                                                            `objects.kind:route` … (the product's own sections);
 *                                                            `atlas.shapes.<kind>:<basis>` counts the SHAPES by what
 *                                                            they are and where they came from (`line:real` = an
 *                                                            upstream's course; `line:unstated` = a line nobody
 *                                                            vouches for) — the criterion for 「the thing itself」
 *    objects     [{ kind, count:{min,max}, style:{ color:{near,deltaE}, width:{min,max}, opacity:{min,max} }, why }] — the drawn OBJECTS themselves,
 *                read off the `objects` section's items (id · kind · colour · width · opacity): HOW MANY of a kind the map holds and what each one LOOKS
 *                LIKE. Every item of that kind must satisfy every stated style bound, so a second line drawn beside the old one (count) or the
 *                old one left blue (colour) is a mismatch, where `drawn` only counts «a line exists». A style field the object does not carry
 *                is unobserved, never a pass.
 *    restyle     { kind, ends:[{name,lng,lat,source}×2], withinKm, style:{…as objects}, why } — a CHANGE, graded against the map an
 *                EARLIER turn of the same conversation left (`ctx.before`, the question's `earlier` turns): the one object of that kind
 *                whose course ended at both `ends` (within the key's own `withinKm`) must still be there under the SAME id with the SAME
 *                course (`shape`), and take the style; every other object that map held must be unchanged (id, course, look); and no
 *                object may appear that it did not hold. So 「delete it and draw a red one」, 「redraw it elsewhere」 and 「recolour every
 *                line」 are each a mismatch, where `objects` alone (one map) cannot tell a restyle from a replacement. Without the
 *                earlier map, or without the courses, it is unobserved.
 *    era        { year, in:[w,s,e,n], includes:[name], excludes:{pattern,why}, source, why }
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
import { deltaE00 } from '../../tests/helpers/colour-difference.js';

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
/** the `export const <name> = Object.freeze([...])` word list of the one js/ module that declares it — the shape vocabulary
 *  (js/atlas-shape-resolve.js SHAPE_KINDS / SHAPE_BASES) is read where the product declares it, not typed here */
function declaredList(root, name) {
  for (const f of readdirSync(join(root, 'js')).filter((x) => x.endsWith('.js'))) {
    const m = new RegExp('export\\s+const\\s+' + name + '\\s*=\\s*(?:Object\\.freeze\\()?\\[([^\\]]*)\\]').exec(readFileSync(join(root, 'js', f), 'utf8'));
    if (m) return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  }
  return [];
}

/**
 * mapVocabulary(root) → { layers, sections, atlasKeys, shapeKeys, objectKinds, era } — what a `mapState` may name.
 *   layers      the `id` of every declaration in js/layers/ (the files scripts/layer-descriptors.mjs
 *               discovers: `*.js` not starting with `_`) — the same ids the layer rows' checkboxes carry,
 *               which is what the `activeLayers` section reports
 *   sections    every snapshot section a provider is registered for in js/ (js/atlas-state.js `reg('…'`,
 *               and `registerStateProvider('…'` anywhere — the console registers `atlas` itself)
 *   atlasKeys   the fields of the function the console registers as the `atlas` section
 *   shapeKeys   the tallies of `atlas.shapes`: `n` and every `<kind>:<basis>` of SHAPE_KINDS × SHAPE_BASES
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
  const shapeKeys = new Set(['n']);
  for (const k of declaredList(root, 'SHAPE_KINDS')) for (const b of declaredList(root, 'SHAPE_BASES')) shapeKeys.add(k + ':' + b);
  const v = { root, layers, sections, atlasKeys, shapeKeys, objectKinds, era: eraReference(root) };
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

const KNOWN = new Set(['view', 'layers', 'clock', 'comparison', 'drawn', 'objects', 'restyle', 'era', 'why']);
const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[0] < b[2] && b[1] < b[3];

/** the problems with one path of a `drawn` criterion against the discovered sections */
function pathProblems(p, vocab) {
  const parts = str(p).split('.');
  if (!parts[0] || !vocab.sections.has(parts[0])) return ['«' + p + '» reads section «' + parts[0] + '», which no provider in js/ registers'];
  if (parts[0] === 'atlas' && parts[1] && !vocab.atlasKeys.has(parts[1])) return ['«' + p + '»: the `atlas` section has no field «' + parts[1] + '»'];
  if (parts[0] === 'atlas' && parts[1] === 'shapes' && (parts.length !== 3 || !(vocab.shapeKeys || new Set()).has(parts[2]))) {
    return ['«' + p + '»: `atlas.shapes` is read as one of ' + [...(vocab.shapeKeys || [])].join(' / ') + ' (js/atlas-shape-resolve.js SHAPE_KINDS × SHAPE_BASES)'];
  }
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
  if (ms.objects) {
    if (!Array.isArray(ms.objects) || !ms.objects.length) say('objects is a non-empty list of { kind, count?, style? }');
    for (const o of Array.isArray(ms.objects) ? ms.objects : []) {
      needWhy('objects', o);
      if (!vocab.objectKinds.has(str(o && o.kind))) say('objects names kind «' + str(o && o.kind) + '», which js/map-tools.js puts no object of on the map');
      const st = (o && o.style) || {};
      if (!o.count && !Object.keys(st).length) say('objects «' + str(o.kind) + '» states neither a count nor a style');
      for (const k of Object.keys(st)) if (!['color', 'width', 'opacity'].includes(k)) say('objects style has an unknown field «' + k + '» (the snapshot carries colour, width, opacity)');
      if (st.color && !(parseColour(st.color.near))) say('objects style.color.near is a #rrggbb or rgb(r,g,b) colour');
    }
  }
  if (ms.restyle) {
    const r = ms.restyle;
    needWhy('restyle', r);
    if (!vocab.objectKinds.has(str(r && r.kind))) say('restyle names kind «' + str(r && r.kind) + '», which js/map-tools.js puts no object of on the map');
    const ends = r && r.ends;
    if (!Array.isArray(ends) || ends.length !== 2) say('restyle.ends is the two points the object\'s course ends at');
    for (const p of Array.isArray(ends) ? ends : []) {
      if (!str(p && p.name).trim() || !Number.isFinite(p && p.lng) || !Number.isFinite(p && p.lat) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) say('restyle.ends has a point without a name and a lng/lat: ' + JSON.stringify(p));
      else if (!/^https?:\/\//.test(str(p.source))) say('restyle.ends «' + p.name + '» names no source url for its coordinate');
    }
    if (!(Number.isFinite(r && r.withinKm) && r.withinKm > 0)) say('restyle.withinKm — how far from each end the course may stop, stated by the key (no default: it is the key\'s claim about its own points)');
    const st = (r && r.style) || {};
    if (!Object.keys(st).length) say('restyle states no style to change to');
    for (const k of Object.keys(st)) if (!['color', 'width', 'opacity'].includes(k)) say('restyle style has an unknown field «' + k + '» (the snapshot carries colour, width, opacity)');
    if (st.color && !(parseColour(st.color.near))) say('restyle style.color.near is a #rrggbb or rgb(r,g,b) colour');
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
      if (d && d.named != null) {
        if (!Array.isArray(d.named) || !d.named.length || d.named.some((n) => !normName(n))) say('drawn `named` is a non-empty list of names');
        else if (alts.some((a) => !/^atlas.shapes./.test(str(a && a.path)))) say('drawn `named` reads the names of atlas.shapes, so every path of it is an atlas.shapes tally');
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

/** a colour as [r,g,b] bytes — #rgb / #rrggbb / rgb(…) / rgba(…); null when it is none of those (a name the snapshot did not resolve) */
export function parseColour(c) {
  const t = str(c).trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(t);
  if (m) return [...m[1]].map((h) => parseInt(h + h, 16));
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(t);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^rgba?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/.exec(t);
  return m ? [+m[1], +m[2], +m[3]] : null;
}
/** CIEDE2000 within which two colours are «the same colour» to a map reader: 1 is one just-noticeable difference (tests/helpers/colour-difference.js), 10 is the same hue family at another lightness */
const SAME_COLOUR_DE = 10;

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

/** a name as compared: case-folded, without spaces or punctuation (so 'Shinano River' and 'shinano-river' agree) */
const normName = (v) => str(v).toLowerCase().replace(/[sp{P}p{S}]+/gu, '');
/** the names the final map's shapes carry (`atlas.shapes.names`), normalised; null when the map did not list any */
export function shapeNamesOf(snap) {
  const a = sectionOf(snap, 'atlas');
  const l = a && a.shapes && Array.isArray(a.shapes.names) ? a.shapes.names : null;
  return l && l.length ? l.map(normName).filter(Boolean) : null;
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

/** one object's look against stated bounds — misses and unseen fields are pushed onto the caller's lists */
function styleAgainst(it, st, miss, unseen) {
  if (st.color) {
    const want = parseColour(st.color.near), have = parseColour(it.color);
    if (it.color == null) unseen.push(it.id + ' carries no colour');
    else if (!have) unseen.push(it.id + ' colour «' + it.color + '» is not a hex/rgb value');
    else { const de = deltaE00(have, want); if (de > (st.color.deltaE != null ? st.color.deltaE : SAME_COLOUR_DE)) miss.push(it.id + ' is ' + it.color + ', ΔE00 ' + de.toFixed(1) + ' from ' + st.color.near); }
  }
  for (const k of ['width', 'opacity']) {
    if (!st[k]) continue;
    const v = it[k];
    if (v == null || !Number.isFinite(+v)) { unseen.push(it.id + ' carries no ' + k); continue; }
    if (st[k].min != null && +v < st[k].min) miss.push(it.id + ' ' + k + ' ' + v + ' < ' + st[k].min);
    if (st[k].max != null && +v > st[k].max) miss.push(it.id + ' ' + k + ' ' + v + ' > ' + st[k].max);
  }
}

/** great-circle distance in km (mean Earth radius 6371.0088 km, IUGG) */
function kmBetween(a, b) {
  const r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLng = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
}
const isPt = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(+p[0]) && Number.isFinite(+p[1]);
/** an object's course as the `objects` section states it (`shape`: vertex count, first/last vertex, bbox, a key over every
 *  vertex); null when the item does not carry one — then its course is not observed, never assumed unchanged */
const shapeOf = (it) => (it && isObj(it.shape) && isPt(it.shape.first) && isPt(it.shape.last) ? it.shape : null);
const sameShape = (a, b) => JSON.stringify([a.n, a.first, a.last, a.bbox, a.key]) === JSON.stringify([b.n, b.first, b.last, b.bbox, b.key]);
/* the look a reader can see change; `name` is not a look (renaming is not restyling, and it is not graded here) */
const LOOK = ['color', 'width', 'opacity', 'hidden'];

/**
 * gradeRestyle(r, after, before) → { verdict, detail } — the `restyle` criterion (see the header). `before` is the snapshot an
 * earlier turn of the same conversation left; `after` the one this turn left.
 */
export function gradeRestyle(r, after, before) {
  const bSec = sectionOf(isObj(before) ? before : {}, 'objects'), aSec = sectionOf(after, 'objects');
  if (!isObj(before)) return { verdict: 'unobserved', detail: 'the map an earlier turn left was not read (no earlier turn, or it was not measured)' };
  if (!bSec || !Array.isArray(bSec.items)) return { verdict: 'unobserved', detail: 'the earlier map\'s `objects` section was not read' };
  if (!aSec || !Array.isArray(aSec.items)) return { verdict: 'unobserved', detail: 'the final map\'s `objects` section was not read' };
  const was = bSec.items.filter(Boolean), now = aSec.items.filter(Boolean);
  /* which object of the earlier map the request is about: identified by its COURSE, never by a name or id the model chose */
  const kin = was.filter((x) => x.kind === r.kind);
  if (kin.some((x) => !shapeOf(x))) return { verdict: 'unobserved', detail: 'the earlier map\'s ' + r.kind + ' objects carry no course (`shape`) — which one the request is about cannot be read' };
  const ends = r.ends.map((p) => [p.lng, p.lat]);
  const fits = (x) => { const s = shapeOf(x); const d = (i, j) => Math.max(kmBetween(s.first, ends[i]), kmBetween(s.last, ends[j])); return Math.min(d(0, 1), d(1, 0)) <= r.withinKm; };
  const cands = kin.filter(fits);
  const names = r.ends.map((p) => p.name).join('–');
  if (cands.length !== 1) return { verdict: 'unobserved', detail: 'the earlier map holds ' + cands.length + ' ' + r.kind + '(s) running ' + names + ' within ' + r.withinKm + ' km (' + (kin.map((x) => x.id).join(', ') || 'none of that kind') + ') — the change has nothing single to be graded against' };
  const target = cands[0];
  const miss = [], unseen = [];
  const byId = new Map(now.map((x) => [String(x.id), x]));
  const t = byId.get(String(target.id));
  if (!t) miss.push(target.id + ' (the ' + names + ' ' + r.kind + ') is gone from the map');
  else {
    const s0 = shapeOf(target), s1 = shapeOf(t);
    if (!s1) unseen.push(target.id + ' carries no course now');
    else if (!sameShape(s0, s1)) miss.push(target.id + '\'s course changed (' + JSON.stringify([s0.first, s0.last, s0.n]) + ' → ' + JSON.stringify([s1.first, s1.last, s1.n]) + ')');
    styleAgainst(t, r.style || {}, miss, unseen);
  }
  /* everything else the earlier map held is left as it was */
  for (const x of was) {
    if (String(x.id) === String(target.id)) continue;
    const y = byId.get(String(x.id));
    if (!y) { miss.push(x.id + ' (not the one asked about) is gone'); continue; }
    const changed = LOOK.filter((k) => JSON.stringify(x[k] == null ? null : x[k]) !== JSON.stringify(y[k] == null ? null : y[k]));
    if (changed.length) miss.push(x.id + ' (not the one asked about) changed ' + changed.map((k) => k + ' ' + JSON.stringify(x[k]) + ' → ' + JSON.stringify(y[k])).join(', '));
    const sx = shapeOf(x), sy = shapeOf(y);
    if (sx && sy) { if (!sameShape(sx, sy)) miss.push(x.id + ' (not the one asked about) changed course'); }
    else if (sx || x.kind === r.kind) unseen.push(x.id + '\'s course was not read on both maps');
  }
  /* …and nothing was added: a new object is a drawing, not a change */
  const known = new Set(was.map((x) => String(x.id)));
  const added = now.filter((x) => !known.has(String(x.id)));
  if (added.length) miss.push('new object(s) appeared: ' + added.map((x) => x.id + ' (' + x.kind + ')').join(', '));
  if (miss.length) return { verdict: 'mismatch', detail: miss.join('; ') };
  if (unseen.length) return { verdict: 'unobserved', detail: unseen.join('; ') };
  return { verdict: 'match', detail: target.id + ' (' + names + ') restyled in place; ' + (was.length - 1) + ' other object(s) unchanged' };
}

/**
 * gradeMap(ms, snapshot, ctx) → { verdict:'match'|'mismatch'|'unobserved', criteria:[{criterion, verdict, detail}], match, mismatch, unobserved }
 *   ms        a question's `mapState`
 *   snapshot  the final map, as IntMapAtlasState.snapshot() publishes it (a section absent = not read)
 *   ctx       { eraReference?: (year, box) → [unit], before?: snapshot } — handed in; without eraReference the era's units are
 *             unobserved; `before` is the map an earlier turn of the same conversation left (a `restyle` reads it)
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
  /* the drawn objects THEMSELVES: how many of a kind, and what each looks like (js/atlas-state.js `objects` items) */
  (Array.isArray(ms.objects) ? ms.objects : []).forEach((o, i) => {
    const label = 'objects' + (ms.objects.length > 1 ? '[' + i + ']' : '') + ':' + o.kind;
    const sec = sectionOf(snap, 'objects');
    if (!sec || !Array.isArray(sec.items)) { put(label, 'unobserved', notRead('objects')); return; }
    const items = sec.items.filter((x) => x && x.kind === o.kind);
    const miss = [], unseen = [];
    if (o.count) {
      if (o.count.min != null && items.length < o.count.min) miss.push(items.length + ' ' + o.kind + '(s), expected at least ' + o.count.min);
      if (o.count.max != null && items.length > o.count.max) miss.push(items.length + ' ' + o.kind + '(s), expected at most ' + o.count.max + ' (' + items.map((x) => x.id).join(', ') + ')');
    }
    for (const it of items) styleAgainst(it, o.style || {}, miss, unseen);
    if (miss.length) put(label, 'mismatch', miss.join('; '));
    else if (unseen.length) put(label, 'unobserved', unseen.join('; '));
    else put(label, 'match', items.length + ' ' + o.kind + '(s)' + (items.length ? ': ' + items.map((x) => x.id).join(', ') : ''));
  });
  if (ms.restyle) { const g = gradeRestyle(ms.restyle, snap, ctx.before); put('restyle:' + ms.restyle.kind, g.verdict, g.detail); }
  (ms.drawn || []).forEach((d, i) => {
    const alts = Array.isArray(d.anyOf) ? d.anyOf : [d];
    const seen = alts.map((a) => ({ a, n: countAt(snap, a.path) }));
    const read = seen.filter((s) => s.n !== undefined);
    const fits = (s) => (s.a.min == null || s.n >= s.a.min) && (s.a.max == null || s.n <= s.a.max);
    const range = (a) => (a.min != null ? '≥ ' + a.min : '') + (a.min != null && a.max != null ? ', ' : '') + (a.max != null ? '≤ ' + a.max : '');
    const label = 'drawn' + (ms.drawn.length > 1 ? '[' + i + ']' : '');
    if (read.some(fits)) {
      const s = read.find(fits);
      /* (atlas-shape-identity) `named`: the shape(s) counted must be THE ONE asked for — any listed spelling, read off the
         names the final map's shapes carry. A map that predates the names (no list) is unobserved, never a pass. */
      const want = Array.isArray(d.named) ? d.named.map(normName).filter(Boolean) : [];
      if (want.length) {
        const have = shapeNamesOf(snap);
        if (!have) put(label, 'unobserved', s.a.path + ' = ' + s.n + ', but the final map did not say which shapes they are');
        else if (have.some((h) => want.some((w) => h.includes(w) || w.includes(h)))) put(label, 'match', s.a.path + ' = ' + s.n + ' (' + have.join(', ') + ')');
        else put(label, 'mismatch', s.a.path + ' = ' + s.n + ' but the shapes are ' + have.join(', ') + ' — not ' + d.named.join(' / '));
      } else put(label, 'match', s.a.path + ' = ' + s.n);
    }
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
    if (Array.isArray(ms.objects) && ms.objects.length) s.add('objects');
    if (ms.restyle) s.add('objects');
    for (const d of ms.drawn || []) for (const a of (Array.isArray(d.anyOf) ? d.anyOf : [d])) s.add(str(a && a.path).split('.')[0]);
  }
  return [...s].filter(Boolean).sort();
}

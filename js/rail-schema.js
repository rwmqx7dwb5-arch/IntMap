/* ============================================================================
 *  IntMap · WORLD RAILWAYS — the vocabulary (#R388)
 * ----------------------------------------------------------------------------
 *  One file, imported by the build AND by the browser, so a class can never mean
 *  one thing in `data/railways/` and another in the legend. The layer it replaces
 *  had its colour table written out twice (`_rail_convert.py` and
 *  js/layer-packs.js) and they had already drifted: the Python emitted a `col`
 *  property the docstring promised and the code never used.
 *
 *  ══ THE RULE EVERY FUNCTION HERE OBEYS ══════════════════════════════════════
 *  A value OpenStreetMap does not state comes back as `null`, never as 0, never
 *  as a default, never as the country's usual answer. `Number('')` is 0 and
 *  `isFinite(0)` is true — that pair has shipped a wrong number in this project
 *  three times in one round (#R354), so every parser here returns null explicitly
 *  before it is ever asked to produce a number.
 * ==========================================================================*/
/* ⚠ ONE EXPORT, A NAMESPACE — the shape js/war-geom.js uses and for the same reason. Every name below
   is needed by scripts/rail/*.mjs and only a third of them by the browser, and tests/r175 ③ requires
   that every export of a js/ module be imported BY NAME by another js/ module: twenty individually
   exported helpers would be twenty names it calls dead. Wrapping them keeps the build and the layer
   reading one file — which is the whole point of the file — without making the module gate lie. */
export const RailSchema = (function () {


/* ── line classes ───────────────────────────────────────────────────────── */
const CLASS = {
  rail: 'rail', narrow_gauge: 'narrow_gauge', light_rail: 'light_rail',
  subway: 'subway', tram: 'tram', construction: 'construction',
};
/* Heavy rail is what "World railways" has always meant; urban rail is drawn from
   z9 because at z5 a tram network is one pixel of noise on top of the mainline. */
const HEAVY = new Set(['rail', 'narrow_gauge', 'construction']);
const URBAN = new Set(['light_rail', 'subway', 'tram']);

/* ── parsers ───────────────────────────────────────────────────────────────
   Every one of these returns null for "OSM did not say". */
const str = (v) => (typeof v === 'string' && v !== '' ? v : null);

/** "1435" → 1435 · "1000;1435" → 1000 (the first stated) · "" → null */
function gaugeOf(t) {
  const raw = str(t.b) || str(t.c);
  if (!raw) return null;
  const m = /(\d+(?:\.\d+)?)/.exec(raw);
  if (!m) return null;
  const n = Math.round(Number(m[1]));
  return Number.isFinite(n) && n > 100 && n < 3000 ? n : null;
}
/** A second stated gauge means dual-gauge track, which is a real thing and not a typo. */
function dualGauge(t) {
  const raw = str(t.b) || '';
  const two = str(t.c) && str(t.d);
  return two || /[;|]/.test(raw) ? 1 : 0;
}

/** OSM's `electrified` vocabulary, reduced to what a map can show. */
function elecOf(t) {
  const v = str(t.e);
  if (!v) return null;
  if (v === 'no') return 'no';
  if (/contact_line|overhead/.test(v)) return 'contact_line';
  if (/4th_rail/.test(v)) return 'rail4';
  if (/^rail\b|3rd_rail|third_rail/.test(v)) return 'rail3';
  if (v === 'yes') return 'yes';
  return 'other';
}
function voltageOf(t) {
  const raw = str(t.f);
  if (!raw) return null;
  const m = /(\d+(?:\.\d+)?)/.exec(raw);
  if (!m) return null;
  const n = Math.round(Number(m[1]));
  return Number.isFinite(n) && n > 0 ? n : null;
}
/** 0 Hz IS a value — it means DC — so this must not confuse it with "not stated". */
function freqOf(t) {
  const raw = str(t.g);
  if (!raw) return null;
  const m = /^(\d+(?:\.\d+)?)/.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}
/** Current type follows from frequency, and only from frequency. */
function currentOf(t) {
  const e = elecOf(t);
  if (e === 'no') return 'none';
  const f = freqOf(t);
  if (f === null) return null;
  return f === 0 ? 'dc' : 'ac';
}

/** "160" · "80 mph" · "DE:urban" → km/h, or null when OSM stated no number. */
function speedOf(t) {
  const raw = str(t.h);
  if (!raw) return null;
  const m = /(\d+(?:\.\d+)?)/.exec(raw);
  if (!m) return null;
  let n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (/mph/i.test(raw)) n *= 1.609344;
  n = Math.round(n);
  return n > 0 && n <= 700 ? n : null;
}
function tracksOf(t) {
  const raw = str(t.i);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}
function usageOf(t) {
  const v = str(t.j);
  if (!v) return null;
  return ['main', 'branch', 'industrial', 'tourism', 'military', 'test'].includes(v) ? v : 'other';
}
function highspeedOf(t) { return str(t.k) === 'yes' ? 1 : 0; }
function modeOf(t) {
  const v = str(t.l);
  if (!v) return null;
  if (v === 'passenger' || v === 'freight' || v === 'mixed') return v;
  return null;
}
function yearOf(t) {
  const raw = str(t.v);
  if (!raw) return null;
  const m = /(\d{4})/.exec(raw);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1800 && n <= 2100 ? n : null;
}
/** `railway=construction` carries its eventual class in `construction`. */
function classOf(t) {
  const v = str(t.a);
  if (!v) return null;
  if (v === 'construction') return 'construction';
  return CLASS[v] || null;
}
function statusOf(t) { return str(t.a) === 'construction' ? 'construction' : 'operational'; }

/* ── colour axes ───────────────────────────────────────────────────────────
   ⚠ EVERY AXIS HAS AN EXPLICIT "not stated" BUCKET AND IT IS NEVER THE SAME
   COLOUR AS A REAL ANSWER. The layer this replaces had one grey bucket labelled
   "Unknown / other" holding 342 lines, and the other 24,900 were coloured by a
   guess — a map where the honest answer is the rarest one is a map that lies
   confidently. Grey here means "OpenStreetMap does not say", nothing else. */
const UNKNOWN_COLOUR = '#7b8794';

/** gauge (mm) → bucket id. The buckets are the world's real gauge families. */
function gaugeBucket(g) {
  if (g === null) return 'na';
  if (g >= 1500) return g === 1520 ? 'g1520' : (g === 1524 ? 'g1524' : (g >= 1660 && g <= 1680 ? 'g1668' : (g === 1600 ? 'g1600' : (g >= 1670 ? 'g1676' : 'gbroad'))));
  if (g === 1435) return 'g1435';
  if (g >= 1400) return 'g1435';
  if (g >= 1050) return 'g1067';
  if (g >= 1000) return 'g1000';
  if (g >= 850) return 'g900';
  if (g >= 700) return 'g762';
  return 'gminor';
}

const AXES = {
  gauge: {
    prop: 'g',
    buckets: [
      ['g1435', '#3a7bd5'], ['g1520', '#e03131'], ['g1524', '#f08080'],
      ['g1676', '#9c36b5'], ['g1668', '#f08c00'], ['g1600', '#d6336c'],
      ['gbroad', '#ae3ec9'], ['g1067', '#2f9e44'], ['g1000', '#12b886'],
      ['g900', '#66a80f'], ['g762', '#f59f00'], ['gminor', '#c2255c'], ['na', UNKNOWN_COLOUR],
    ],
  },
  electrification: {
    prop: 'e',
    buckets: [
      ['ac25', '#e8590c'], ['ac15', '#f76707'], ['acOther', '#ffa94d'],
      ['dc3', '#1971c2'], ['dc15', '#3b8ac4'], ['dcOther', '#74c0fc'],
      ['elecYes', '#7048e8'], ['no', '#495057'], ['na', UNKNOWN_COLOUR],
    ],
  },
  speed: {
    prop: 's',
    buckets: [
      ['v300', '#d6336c'], ['v250', '#f03e3e'], ['v200', '#f76707'],
      ['v160', '#f59f00'], ['v120', '#94d82d'], ['v80', '#20c997'],
      ['v40', '#4dabf7'], ['vslow', '#748ffc'], ['na', UNKNOWN_COLOUR],
    ],
  },
  tracks: {
    prop: 't',
    buckets: [
      ['t1', '#f59f00'], ['t2', '#3a7bd5'], ['t3', '#7048e8'], ['t4', '#d6336c'], ['na', UNKNOWN_COLOUR],
    ],
  },
  traffic: {
    prop: 'm',
    buckets: [
      ['passenger', '#3a7bd5'], ['freight', '#e8590c'], ['mixed', '#7048e8'], ['na', UNKNOWN_COLOUR],
    ],
  },
  status: {
    prop: 'x',
    buckets: [
      ['operational', '#2f9e44'], ['construction', '#f59f00'],
    ],
  },
  kind: {
    prop: 'k',
    buckets: [
      ['rail', '#3a7bd5'], ['narrow_gauge', '#2f9e44'], ['light_rail', '#f59f00'],
      ['subway', '#d6336c'], ['tram', '#7048e8'], ['construction', '#adb5bd'],
    ],
  },
};

/** electrification bucket from the stored props — the same function on both sides. */
function elecBucket(e, v, c) {
  if (e === 'no') return 'no';
  if (e === null || e === undefined) return 'na';
  if (c === 'ac') {
    if (v >= 24000) return 'ac25';
    if (v >= 14000) return 'ac15';
    return 'acOther';
  }
  if (c === 'dc') {
    if (v >= 2400) return 'dc3';
    if (v >= 1400) return 'dc15';
    return 'dcOther';
  }
  return 'elecYes';
}
function speedBucket(s2) {
  if (s2 === null || s2 === undefined) return 'na';
  if (s2 >= 300) return 'v300';
  if (s2 >= 250) return 'v250';
  if (s2 >= 200) return 'v200';
  if (s2 >= 160) return 'v160';
  if (s2 >= 120) return 'v120';
  if (s2 >= 80) return 'v80';
  if (s2 >= 40) return 'v40';
  return 'vslow';
}
function tracksBucket(n) {
  if (n === null || n === undefined) return 'na';
  if (n >= 4) return 't4';
  if (n === 3) return 't3';
  if (n === 2) return 't2';
  return 't1';
}

/* ══ THE WIRE FORMAT ═════════════════════════════════════════════════════════
   Both levels are written by scripts/rail/build.mjs and read by js/railways.js,
   so the encoder and the decoder are here, next to each other, and there is one
   place to change if the format changes.

   ⚠ THE PAYLOAD WAS NEVER THE GEOMETRY. MEASURED on a 286-cell partial sweep,
   the world level as plain GeoJSON was 3.28 MB for 15,981 lines and 57,043
   vertices: the vertices are about 0.9 MB of that, and the rest is
   `{"type":"Feature","geometry":{"type":"LineString","coordinates":` repeated
   once per line, plus the same handful of property objects written out sixteen
   thousand times. Railways are not like most layers here — a line's whole
   identity is a short tuple drawn from a small vocabulary, and adjacent lines
   share it. So:

     · the distinct property tuples go in a dictionary and each line names an
       INDEX into it (16k lines, MEASURED ~3k distinct tuples);
     · coordinates are integers at a fixed scale, delta-encoded along the line,
       which turns a smooth route into a run of very small numbers.

   Neither is lossy beyond the rounding the level already applies. */
const WIRE_VERSION = 1;

/* ⚠ A VALUE THAT IS UNIQUE PER LINE MUST NOT ENTER THE TUPLE. The OSM way id is exactly that:
   putting it in the dictionary key would make every tuple distinct and turn the dictionary into a
   longer copy of the data. It rides beside the index instead, named by `xk`. */
/** @param {Array<{props:Object, pts:Array<[number,number]>}>} lines */
function encodeLines(lines, keys, scale, extraKey) {
  const dict = [], index = new Map();
  const out = [];
  for (const ln of lines) {
    const tuple = keys.map((k) => (ln.props[k] === undefined ? null : ln.props[k]));
    const sig = JSON.stringify(tuple);
    let ti = index.get(sig);
    if (ti === undefined) { ti = dict.length; dict.push(tuple); index.set(sig, ti); }
    const enc = extraKey ? [ti, ln.props[extraKey] === undefined ? 0 : ln.props[extraKey]] : [ti];
    let px = 0, py = 0;
    for (const p of ln.pts) {
      const x = Math.round(p[0] * scale), y = Math.round(p[1] * scale);
      enc.push(x - px, y - py);
      px = x; py = y;
    }
    out.push(enc);
  }
  return { v: WIRE_VERSION, s: scale, k: keys, d: dict, l: out, xk: extraKey || undefined };
}

/** The inverse, as a GeoJSON FeatureCollection the renderer can take as-is. */
function decodeLines(enc) {
  if (!enc || enc.v !== WIRE_VERSION) return { type: 'FeatureCollection', features: [] };
  const { s, k, d, l, xk } = enc;
  const head = xk ? 2 : 1;
  const features = new Array(l.length);
  for (let i = 0; i < l.length; i++) {
    const a = l[i];
    const tuple = d[a[0]] || [];
    const props = {};
    for (let j = 0; j < k.length; j++) if (tuple[j] !== null && tuple[j] !== undefined) props[k[j]] = tuple[j];
    if (xk && a[1]) props[xk] = a[1];
    const coords = new Array((a.length - head) / 2);
    let x = 0, y = 0;
    for (let j = head, n = 0; j < a.length; j += 2, n++) {
      x += a[j]; y += a[j + 1];
      coords[n] = [x / s, y / s];
    }
    features[i] = { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: props };
  }
  return { type: 'FeatureCollection', features };
}

/** Points (stations) — the same dictionary trick, no deltas worth taking. */
function encodePoints(points, keys, scale, extraKey) {
  const dict = [], index = new Map();
  const out = [];
  for (const pt of points) {
    const tuple = keys.map((k) => (pt.props[k] === undefined ? null : pt.props[k]));
    const sig = JSON.stringify(tuple);
    let ti = index.get(sig);
    if (ti === undefined) { ti = dict.length; dict.push(tuple); index.set(sig, ti); }
    const row = [ti, Math.round(pt.pt[0] * scale), Math.round(pt.pt[1] * scale)];
    /* the OSM id, like a way's, is unique per row and must stay OUT of the dictionary */
    if (extraKey) row.push(pt.props[extraKey] === undefined ? 0 : pt.props[extraKey]);
    out.push(row);
  }
  return { v: WIRE_VERSION, s: scale, k: keys, d: dict, p: out, xk: extraKey || undefined };
}
function decodePoints(enc) {
  if (!enc || enc.v !== WIRE_VERSION) return { type: 'FeatureCollection', features: [] };
  const { s, k, d, p, xk } = enc;
  const features = new Array(p.length);
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const tuple = d[a[0]] || [];
    const props = {};
    for (let j = 0; j < k.length; j++) if (tuple[j] !== null && tuple[j] !== undefined) props[k[j]] = tuple[j];
    if (xk && a[3]) props[xk] = a[3];
    features[i] = { type: 'Feature', geometry: { type: 'Point', coordinates: [a[1] / s, a[2] / s] }, properties: props };
  }
  return { type: 'FeatureCollection', features };
}

  return { CLASS, HEAVY, URBAN, str, gaugeOf, dualGauge, elecOf, voltageOf, freqOf, currentOf, speedOf, tracksOf, usageOf, highspeedOf, modeOf, yearOf, classOf, statusOf, UNKNOWN_COLOUR, gaugeBucket, AXES, elecBucket, speedBucket, tracksBucket, WIRE_VERSION, encodeLines, decodeLines, encodePoints, decodePoints };
})();

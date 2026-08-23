/* ============================================================================
 *  IntMap · THE RENDERER COMMAND CENSUS — how many of them say nothing new  (#R322)
 * ----------------------------------------------------------------------------
 *  Lifted out of js/geo-engine.js, and the reason is a ceiling rather than tidiness:
 *  tests/r168-checks.test.mjs holds the SHELL — index.html plus the five files the whole program
 *  passes through — under 8,200 lines, and that ceiling only ever goes DOWN. Adding the census to
 *  the adapter put the shell at 8,535. The check says what to do about that in its own words:
 *  「a subject moves out instead」, which is what #R313 did with the Atlas stylesheet.
 *
 *  ⚠ NOTHING HERE NAMES THE RENDERER, which is what makes the move legal at all (npm run
 *  check:engine, #R178). These are comparisons and counters: they take a value and another value
 *  and answer whether the second says anything new. The one function that touches a renderer
 *  object, `_sourceHolds`, is handed the source and reads the payload the source is already
 *  holding — it names no class, no constructor and no global.
 *
 *  ⚠ AND IT IS AN INSTRUMENT, NOT A FEATURE. `CMD.on` is false unless a URL asks; the per-id
 *  tables and the timing probes are behind `CMD.detail`. What ships switched ON is one entry of
 *  `CMD.skip`, and the measurement that decided it is written where it is decided.
 * ==========================================================================*/
/* ⚠ ONE EXPORTED DECLARATION — see the same note in js/camera-math.js. `_deepEq`, `_eqBudget`, */
/*    `_shapeSig` and `_contentSig` are private to the census and must not be top-level. */
/*    ⚠ AND CALLING IT ONCE IS PART OF THE CONTRACT: `CMD` is the ONE policy every view shares, so */
/*    the adapter destructures a single call rather than making a census per view. The TALLIES are */
/*    per view (makeCommandLog), which is the half that must not be shared. */
export function makeCommandCensus() {
/* ══ (#R322) THE SAME COMMAND, SENT AGAIN — counted BEFORE anything is skipped ═══════════════
   ---------------------------------------------------------------------------------------
   「MapLibreへ同じ命令を繰り返す無駄を、実測に基づいて消す」. The instrument comes first, because
   three of the five candidate operations turn out not to be waste at all and a cache in front of
   them would be pure overhead. MEASURED in node_modules/maplibre-gl/dist/maplibre-gl-dev.js:

     Style.setPaintProperty   :60727   if (deepEqual(layer.getPaintProperty(name), value)) return;
     Style.setLayoutProperty  :60701   if (deepEqual(layer.getLayoutProperty(name), value)) return;
     Style.setFilter          :60672   if (deepEqual(layer.filter, filter)) return;

   — the renderer ALREADY refuses a repeat on those three, so "applied renderer calls" cannot go
   down by adding a second equality test in front of the first. What a repeat still costs there is
   our own getLayer() plus MapLibre's deepEqual over the value, and that is a number rather than a
   guess, so it gets measured instead of assumed.

   The two with no such guard are the expensive ones:
     GeoJSONSource.setData    no comparison anywhere — the whole collection goes to the worker
                              for a full reparse, every time it is called.
     Style.setFeatureState    extend()s into stateChanges and dirties the source whether or not
                              the keys already hold those values.

   `attempted` counts every call that reaches the adapter. `same` counts the ones whose value the
   renderer ALREADY holds — that is the waste — and is computed with the same comparison MapLibre
   uses, off the StyleLayer object the existence check already fetched (no clone, no second
   lookup). `absent` is a call naming a layer or source that is not there. Per-id and per-phase
   tables are strings and are only built when the flag asks for them.

   ⚠ COUNTING AND SKIPPING ARE SEPARATE SWITCHES. The instrument may run without changing a single
   call, which is what makes an A/B possible at all: one build measures both arms. */
const CMD_OPS = ['sourceData', 'filter', 'paint', 'layout', 'featureState'];
const CMD = {
  /* on:      tally every call (cost when off: one boolean test per call)
     detail:  also build the per-id / per-phase string tables (debug only)
     skip:    per-operation permission to RETURN EARLY when the value is already there
     phase:   a label the harness sets — boot / pan / zoom / chronos / language / theme. It is
              DECLARED rather than guessed; the adapter cannot know why it was called. */
  on: false, detail: false, phase: 'boot',
  /* ══ ⚠⚠⚠ (#R322) ONLY ONE OF THE FIVE IS ON, AND THE MEASUREMENT IS WHY ═════════════════════
     MEASURED over boot + pan + zoom + layer panel + hover + Chronos + language + theme, desktop,
     one build, both arms (scripts/frame-profile.mjs --commands):

       operation      attempted   redundant            main-thread ms, off → on
       setSourceData        168    156 (92.9%)   call 3.2 → 1.0   cmp 0 → 3.1
       setPaint             986    978 (99.2%)   call 1.6 → 0.3   cmp 0 → 1.7
       setLayout           1946   1892 (96.6%)   call 3.9 → 2.9   cmp 0 → 2.9
       setFilter              0          —       never called in any scenario
       setFeatureState        0          —       never called in any scenario

     Nearly everything this app tells the renderer, it has already told it. But the SYNCHRONOUS
     cost of saying it again is 16.2 ms across a whole session, and refusing 96 % of it saves
     4.3 ms — which is why neither arm moved a single user-visible number: first map pixel
     −61.75 ms against an A/A noise floor of ±167.47, interaction-ready +406.5 against ±1188.92,
     and on throttled mobile −2199 against ±7535. 「差は測定できない」 is the honest verdict, and it
     is written here rather than in a commit message because the NEXT round to look at this table
     needs to know the answer was measured, not assumed.

     So the switch follows what the renderer does, not what the counter says:
       · setPaint / setLayout / setFilter — MapLibre already refuses a repeat (deepEqual, see the
         header). Skipping in front of it moves one comparison earlier and adds another; measured,
         `cmp` costs about what `call` saves. A cache here would be a second mechanism for a job
         already done, so it stays OFF and only counts.
       · setSourceData — MapLibre does NOT compare, and every repeat is a whole collection posted
         to the worker for a reparse plus the tile rebuild that follows. That work is off the main
         thread, which is exactly why the main-thread clock above cannot see it and is not the
         right instrument for it: 156 avoided reparses and 1.16 MB of re-serialised GeoJSON are
         the number, and they are real whether or not this laptop's boot clock notices. ON.
       · setFilter / setFeatureState — zero calls in every scenario driven. Nothing to cache; a
         cache for an operation nobody calls asserts nothing. OFF. */
  skip: { sourceData: true, filter: false, paint: false, layout: false, featureState: false },
};
try {
  const q = (typeof location !== 'undefined' && location.search) || '';
  if (/[?&](cmdlog|perf)=1\b/.test(q)) { CMD.on = true; CMD.detail = true; }
  if (typeof window !== 'undefined' && window.__imCmdLog) CMD.on = true;
  /* `?cmdskip=off` and `?cmdskip=sourceData,paint` — the A/B lever. One build measures both arms,
     which is the only way two arms can differ by the change and by nothing else. */
  const m = /[?&]cmdskip=([a-zA-Z,]*)/.exec(q);
  if (m) { for (const k of CMD_OPS) CMD.skip[k] = false; for (const k of m[1].split(',')) if (CMD_OPS.indexOf(k) >= 0) CMD.skip[k] = true; }
} catch (_) { }

/* MapLibre's own deepEqual, restated — it is not exported, and the comparison has to be the SAME
   one on both sides of the call or "already holds this" would mean two different things. */
function _deepEq(a, b) {
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!_deepEq(a[i], b[i])) return false;
    return true;
  }
  if (typeof a === 'object' && a !== null && b !== null) {
    if (typeof b !== 'object') return false;
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    for (const k in a) if (!_deepEq(a[k], b[k])) return false;
    return true;
  }
  return a === b;
}
/* feature state MERGES, so "no change" is not "the whole object is equal" — it is "every key this
   call names is already equal". Anything else has to be applied. */
function _stateSubsetEq(cur, next) {
  if (!next || typeof next !== 'object') return false;
  if (!cur || typeof cur !== 'object') return false;
  for (const k in next) if (!_deepEq(cur[k], next[k])) return false;
  return true;
}
/* A NECESSARY condition for two source payloads to be equal, computed without walking the
   geometry: the feature count plus a fingerprint of the first and last feature. It can say
   "definitely different"; it can never prove "the same". The instrument reports it as what it is
   — an UPPER BOUND on what a content-addressed cache could ever skip. */
function _shapeSig(d) {
  try {
    if (typeof d === 'string') return 'url:' + d;
    if (!d || typeof d !== 'object') return typeof d + ':' + String(d);
    if (d.type === 'FeatureCollection' && Array.isArray(d.features)) {
      const f = d.features, n = f.length;
      const one = (x) => {
        if (!x) return '-';
        const g = x.geometry || {}, c = g.coordinates;
        return (x.id !== undefined ? x.id : '') + '/' + (g.type || '') + '/' +
               (Array.isArray(c) ? c.length : 0) + '/' + (x.properties ? Object.keys(x.properties).length : 0);
      };
      return 'FC:' + n + ':' + one(f[0]) + ':' + one(f[n - 1]);
    }
    return (d.type || '?') + ':' + (Array.isArray(d.coordinates) ? d.coordinates.length : 0);
  } catch (_) { return '?'; }
}

/* ── (#R322) the comparison a SOURCE payload is allowed to be skipped on ──────────────────────
   Deep-equal against what the renderer is already holding — MapLibre keeps the payload verbatim
   (GeoJSONSource.setData :48755 `this._data = typeof data === 'string' ? {url:data} : {geojson:data}`),
   so nothing has to be retained here and nothing can go stale.

   ⚠ TWO RULES MAKE IT SAFE, and both are the reason identity is not enough on its own:
     ① a payload that is the SAME OBJECT the source already holds proves nothing — the caller may
        have mutated it in place — so that case is APPLIED, never skipped.
     ② the walk has a WORK BUDGET. A collection too large to prove equal cheaply returns «did not
        finish», which is applied exactly as before. A skip is taken only on a proven `true`, so
        the worst case is the old behaviour plus a bounded comparison.
   Returns true / false / null(unknown). */
const _EQ_BUDGET = 200000;
function _eqBudget(a, b, st) {
  if (--st.n < 0) { st.out = true; return false; }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) { if (!_eqBudget(a[i], b[i], st)) return false; if (st.out) return false; }
    return true;
  }
  if (typeof a === 'object' && a !== null && b !== null) {
    if (typeof b !== 'object') return false;
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    for (const k in a) { if (!_eqBudget(a[k], b[k], st)) return false; if (st.out) return false; }
    return true;
  }
  return a === b;
}
function _sourceHolds(s, data) {
  const cur = s && s._data;
  if (!cur) return false;
  if (typeof data === 'string') return cur.url === data;
  if (cur.geojson === undefined) return false;
  if (cur.geojson === data) return false;          /* rule ① — identity cannot prove equality */
  const st = { n: _EQ_BUDGET, out: false };
  const eq = _eqBudget(cur.geojson, data, st);
  return st.out ? null : eq;                        /* rule ② — «did not finish» is not «equal» */
}

/* …and the answer the shape signature can only bound: the payload actually serialised and hashed.
   O(n) per call, so it runs in DETAIL mode only — but it is the number that decides whether a
   content-addressed skip is worth building, and «113 of 123 had the same feature count» is not
   that number. Returns `len:hash` so the repeated BYTES can be added up as well as the calls. */
function _contentSig(d) {
  try {
    const s = (typeof d === 'string') ? d : JSON.stringify(d);
    if (typeof s !== 'string') return null;
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    return s.length + ':' + h.toString(16);
  } catch (_) { return null; }
}

/* ══ THE DECISION, SO THE ADAPTER'S METHODS STAY ONE-LINERS ═══════════════════════════════════
   js/geo-engine.js is part of the SHELL, and the shell has a line ceiling that only ever goes down
   (tests/r168-checks.test.mjs). Inlining «compare, tally, time, maybe skip» five times put it 118
   lines over. It is also the same four steps five times, which is a second reason to write it once.

   `skipProp` answers 「may this call be skipped」 for a layer property — paint, layout or filter. It
   is handed the value the renderer is ALREADY holding and the value being set, so the comparison is
   the one MapLibre would make (see the header) and no state is kept anywhere.
   `t0`/`t1` bracket the renderer call itself. Two performance.now() per command is exactly the kind
   of cost that must not ship, so both are no-ops unless DETAIL mode asked for the timing. */
function absent(cmd, op, id) { if (CMD.on) cmd.note(op, id, 'absent'); }
function t0() { return CMD.detail ? performance.now() : 0; }
function t1(cmd, op, started) { if (CMD.detail) cmd.time(op, performance.now() - started); }
function skipProp(cmd, op, id, cur, next) {
  let same = false;
  const started = CMD.detail ? performance.now() : 0;
  try { same = _deepEq(cur, next); } catch (_) { }
  if (CMD.detail) cmd.time(op, performance.now() - started, 'cmp');
  if (CMD.on) cmd.note(op, id, same ? 'same' : 'applied', { skipped: same && CMD.skip[op] });
  return same && CMD.skip[op];
}
/* feature state is the one that does NOT use the value comparison: it MERGES, so «no change» is
   «every key this call names is already equal», not «the whole object is equal». Its own comparator
   is above; the tally and the switch are the same as every other operation's. */
function skipState(cmd, id, cur, next) {
  let same = false;
  try { same = _stateSubsetEq(cur, next); } catch (_) { }
  if (CMD.on) cmd.note('featureState', id, same ? 'same' : 'applied', { skipped: same && CMD.skip.featureState });
  return same && CMD.skip.featureState;
}

/* …and the same question for a SOURCE payload, which needs more than a value comparison: the
   caller's optional revision, the shape signature and the content hash the measurement reports, and
   the per-adapter memory those two are compared against. `mem` is that memory — one object per
   adapter, so two views never answer for each other. */
function skipData(cmd, id, s, data, opts, mem) {
  const started = CMD.detail ? performance.now() : 0;
  let held = false;
  try { held = _sourceHolds(s, data) === true; } catch (_) { held = false; }
  if (CMD.detail) cmd.time('sourceData', performance.now() - started, 'cmp');
  /* a caller that keeps ONE object and edits it in place can still say so — but it has to say so;
     nothing infers it, because an object that was mutated is the same object. */
  const rev = !!(opts && opts.revision !== undefined && mem.rev[id] !== undefined && mem.rev[id] === opts.revision);
  const skippable = held || rev;
  if (CMD.on) {
    const ref = !!(s._data && s._data.geojson === data);
    let shape = false;
    try { shape = (mem.sig[id] !== undefined && mem.sig[id] === _shapeSig(data)); } catch (_) { }
    let content = false, bytes = 0;
    if (CMD.detail) {
      const csig = _contentSig(data);
      if (csig) { bytes = parseInt(csig, 10) || 0; content = (mem.hash[id] === csig); mem.hash[id] = csig; }
    }
    try { mem.sig[id] = _shapeSig(data); } catch (_) { }
    cmd.note('sourceData', id, skippable ? 'same' : 'applied', { ref, shape, content, bytes, skipped: skippable && CMD.skip.sourceData });
  }
  if (skippable && CMD.skip.sourceData) return true;
  if (opts && opts.revision !== undefined) mem.rev[id] = opts.revision; else delete mem.rev[id];
  return false;
}
function makeSourceMemory() {
  /* (#R344) `diff` is per-source permission to send {add,remove} instead of the whole collection:
     the whole write that declared itself `diffable` sets it and `forget` clears it, so a source that
     was re-added (a style reload, a swap) always takes a complete write before any diff. */
  const mem = { sig: Object.create(null), rev: Object.create(null), hash: Object.create(null), diff: Object.create(null) };
  mem.forget = (id) => { delete mem.sig[id]; delete mem.rev[id]; delete mem.hash[id]; delete mem.diff[id]; };
  return mem;
}

/* One tally per adapter — the compare pane and the flight simulator's minimap each get their own,
   for the same reason every other piece of adapter state is per-adapter (#R179). */
function makeCommandLog() {
  const tot = Object.create(null);
  for (const k of CMD_OPS) tot[k] = { attempted: 0, sent: 0, applied: 0, same: 0, absent: 0, sameRef: 0, sameShape: 0, sameContent: 0, repeatBytes: 0, msCall: 0, msCmp: 0 };
  let byId = Object.create(null), byPhase = Object.create(null);
  function note(op, id, outcome, extra) {
    const t = tot[op];
    /* `applied` classifies (this value is NEW); `sent` counts what actually reached the
       renderer. They differ exactly when a skip is switched on, which is the whole table. */
    t.attempted++; t[outcome]++; if (outcome !== "absent" && !(extra && extra.skipped)) t.sent++;
    if (extra) { if (extra.ref) t.sameRef++; if (extra.shape) t.sameShape++; if (extra.content) { t.sameContent++; t.repeatBytes += (extra.bytes || 0); } }
    if (!CMD.detail) return;
    const ki = op + ' ' + id;
    const r = byId[ki] || (byId[ki] = { op, id: String(id), attempted: 0, applied: 0, same: 0, absent: 0 });
    r.attempted++; r[outcome]++;
    const kp = CMD.phase + ' ' + op;
    const q = byPhase[kp] || (byPhase[kp] = { phase: CMD.phase, op, attempted: 0, applied: 0, same: 0, absent: 0 });
    q.attempted++; q[outcome]++;
  }
  /* (#R322) the number a boot clock is too noisy to show: main-thread milliseconds actually spent
     inside the renderer call (msCall), and inside the comparison that may replace it (msCmp).
     An A/B on these two is deterministic where a wall clock is not. DETAIL mode only — two
     performance.now() per call is exactly the kind of cost that must not ship. */
  function time(op, ms, kind) { tot[op][kind === 'cmp' ? 'msCmp' : 'msCall'] += ms; }
  /* (#R344) …and WHICH WRITE IT WAS. `sent` cannot tell a whole collection from a {add,remove}, and
     the difference is the whole point of the diff path: a caller that thinks it is diffing while the
     adapter quietly falls back would look identical in every other number here. Ungated on purpose —
     one integer per source update, readable with the census off, which is where it matters. */
  function diffed(op) { tot[op].diffed = (tot[op].diffed || 0) + 1; }
  return {
    note, time, diffed,
    read() {
      const out = { totals: {}, byId: null, byPhase: null };
      for (const k of CMD_OPS) out.totals[k] = Object.assign({}, tot[k]);
      if (CMD.detail) {
        out.byId = Object.keys(byId).map((k) => byId[k]).sort((a, b) => b.same - a.same || b.attempted - a.attempted);
        out.byPhase = Object.keys(byPhase).map((k) => byPhase[k]);
      }
      return out;
    },
    reset() {
      for (const k of CMD_OPS) { const t = tot[k]; t.attempted = t.sent = t.applied = t.same = t.absent = t.sameRef = t.sameShape = t.sameContent = t.repeatBytes = t.msCall = t.msCmp = t.diffed = 0; }
      byId = Object.create(null); byPhase = Object.create(null);
    },
  };
}
  return { CMD, CMD_OPS, makeCommandLog, makeSourceMemory, absent, t0, t1, skipProp, skipState, skipData };
}

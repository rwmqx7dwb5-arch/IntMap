/* ============================================================================
 *  stalled-fetch-and-surface-gauge — two holes the previous round found, EVALUATED
 * ----------------------------------------------------------------------------
 *  ① js/data-layers.js `rvFetch` — the radar row's request (the RainViewer frame index) — had no
 *     clock. heal-waits-for-inflight made the reconciler leave a box alone while its request is
 *     pending, so a read that never ends left the box «in flight» for ever: never judged, never
 *     toasted, and every later tick handed the SAME dead promise back (`_rvPending` is shared).
 *     The shipped rvFetch, its state and toggleLayer are lifted and RUN against the real
 *     js/fetch-deadline.js, the real js/layer-rows.js registry and a host that never answers.
 *  ② scripts/global-surface.mjs (check:surface) blanked comments and strings with a character loop
 *     that did not know regular-expression literals. `/named '([^']+)'/` in js/data-layers.js has
 *     three quotes, so the «string» it opened ran on into code and hid every `window.X =` after it.
 *     The fixture below is judged by the shipped codeOnly AND by the loop it replaced — the check has
 *     to be red on the replaced one, or it proves nothing.
 *  ③ the register agrees with the grammar: every `window.X = …` an AST walk finds in js/ and src/ is
 *     a name windowPublications() reports, and nothing else is.
 *  ④ the same shape everywhere it can occur: every branch of toggleLayer (read from the function),
 *     running every declaration of the layer closure it reaches (found by the parser), against a
 *     host that never answers and a mocked clock — each request a row hands the registry must end,
 *     and the four reads clocked this round (radar, fire probe, cables, fertility) must land in their
 *     branch's existing failure path. Mutated back to a bare `fetch`, each of the four goes red.
 *  ⑤ js/fetch-deadline.js's idle clock bounds SILENCE: a body still arriving outlives it, a body that
 *     stopped is cut one clock after its last chunk.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as acorn from 'acorn';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly as stripComments } from '../scripts/code-only.mjs';
import { codeOnly, windowPublications } from '../scripts/global-surface.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { jsonWithin, readWithin } from '../js/fetch-deadline.js';
import { clockFor, ownRelayUrl } from '../js/proxy-fetch.js';
import { inFlight } from '../js/layer-rows.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DL = stripComments(readLF(join(ROOT, 'js/data-layers.js')));
/* microtasks AND the macrotask queue — setImmediate is not among the mocked timers */
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

/* ── ① rvFetch, as shipped ─────────────────────────────────────────────────────────────────────── */
/* the radar state and constants, exactly as they stand above rvFetch in the shipped file */
const RV_STATE = (() => {
  const a = DL.indexOf('let _rvData='), b = DL.indexOf('function rvFetch(');
  assert.ok(a >= 0 && b > a, 'the radar state was not found above rvFetch');
  return DL.slice(a, b);
})();
const RV_FNS = ['rvFetch', 'rvRefreshFrames', 'rvTiles', 'addRainViewer', 'toggleLayer'].map((n) => liftFunction(DL, n)).join('\n');

function inert() {
  const memo = new Map();
  return new Proxy(function () {}, {
    get(_, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k === 'then' || typeof k === 'symbol') return undefined;
      if (!memo.has(k)) memo.set(k, inert()); return memo.get(k);
    },
    set() { return true; },
    apply() { return inert(); },
  });
}

function rig() {
  const toasts = [];
  const row = { removed: [], classList: { remove: (c) => row.removed.push(c) } };
  const cb = { id: 'dl-radar', checked: true, closest: () => row };
  const lgdRadar = { style: { display: '' }, querySelector: () => null };
  const over = {
    jsonWithin, clockFor,                          /* the real clock, and the real per-host table */
    whenStyleReady: () => Promise.resolve(),
    satToast: (m) => toasts.push(m),
    tileLegends: () => {},
    lgdRadar,
    document: { getElementById: (id) => (id === 'dl-radar' ? cb : null) },
    window: { IntMapLang: { t: (_l, en) => en } },
    HOST: { lang: 'en' },
    setTimeout: () => 0,                           /* toggleLayer's shared tail (#R30 orphan guard) */
    requestAnimationFrame: () => 0,
  };
  const scope = new Proxy(over, {
    has: (t, k) => typeof k === 'string' && (k in t || !(k in globalThis)),
    get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : (t[k] = inert()))),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  /* eslint-disable no-new-func */
  const fns = new Function('scope', 'with (scope) { ' + RV_STATE + '\n' + RV_FNS
    + '\nreturn { rvFetch, toggleLayer, deadline: clockFor(RV_INDEX_URL) }; }')(scope);
  return { ...fns, toasts, cb, row, lgdRadar };
}

/* a host that accepts the connection and never answers — it ends only when the caller aborts */
function stalledHost() {
  const calls = [];
  const fetch = (url, opt) => {
    const call = { url, signal: opt && opt.signal, answer: null };
    calls.push(call);
    return new Promise((res, rej) => {
      call.answer = res;
      if (call.signal) call.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
  };
  return { fetch, calls };
}

test('① a stalled frame index ends at its deadline, takes the failure path, leaves the registry, and the next tick reads again', async (t) => {
  const host = stalledHost();
  const realFetch = globalThis.fetch;
  globalThis.fetch = host.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  t.mock.timers.enable({ apis: ['setTimeout'] });

  const R = rig();
  assert.ok(Number.isFinite(R.deadline) && R.deadline > 0, 'rvFetch has no deadline of its own');
  const F = inFlight();
  /* what the change handler does: layerInflight.track(cb.id, toggleLayer(id, checked)) */
  F.track('dl-radar', R.toggleLayer('radar', true));
  await settle();
  assert.equal(host.calls.length, 1, 'the radar row did not read the frame index');
  assert.match(host.calls[0].url, /api\.rainviewer\.com\/public\/weather-maps\.json$/);
  assert.ok(host.calls[0].signal, 'the read carries no signal — nothing can end it');
  assert.equal(F.has('dl-radar'), true);

  /* a second caller while the read is on its way is handed the same read, not a new one */
  const shared = R.rvFetch();
  assert.equal(host.calls.length, 1, 'a second caller started a second read of an index already on its way');

  /* the clock is a chain of steps (js/fetch-deadline.js counts the host's silence, not the page's own
     freezes) and node's mock timers do not run a timer scheduled from inside the same tick() */
  for (let i = 0; i < R.deadline - 1; i++) t.mock.timers.tick(1);
  await settle();
  assert.equal(F.has('dl-radar'), true, 'the read ended before its deadline');
  assert.deepEqual(R.toasts, []);

  t.mock.timers.tick(1);   /* the last millisecond */
  await settle();
  assert.equal(host.calls[0].signal.aborted, true, 'the deadline passed and the read was not aborted');
  assert.equal(await shared, null, 'the shared read did not end when its deadline did');
  assert.deepEqual(R.toasts, ['Live weather data unavailable'], 'a read that never came back was not reported to the reader');
  assert.equal(R.cb.checked, false, 'the row stayed ticked over a layer that cannot draw');
  assert.deepEqual(R.row.removed, ['on']);
  assert.equal(R.lgdRadar.style.display, 'none');
  assert.equal(F.has('dl-radar'), false, 'the stalled request is still registered — the box would never be judged again');

  /* the reader ticks it again: a NEW read starts — not the dead promise — and this time it answers */
  R.cb.checked = true;
  F.track('dl-radar', R.toggleLayer('radar', true));
  await settle();
  assert.equal(host.calls.length, 2, 'the next request was handed the dead read instead of starting a new one');
  const index = { host: 'https://tilecache.rainviewer.com', radar: { past: [{ time: 1, path: '/v2/radar/1' }], nowcast: [] } };
  host.calls[1].answer({ ok: true, status: 200, text: async () => JSON.stringify(index) });
  await settle();
  assert.deepEqual(R.toasts, ['Live weather data unavailable'], 'an index that arrived in time was reported as unavailable');
  assert.equal(R.cb.checked, true);
  assert.equal(F.has('dl-radar'), false);
  assert.equal(await R.rvFetch(), await R.rvFetch(), 'the arrived index is not the one handed back');
  assert.equal(host.calls.length, 2, 'a fresh index was read again inside its five minutes');
});

/* ── ② codeOnly and regular-expression literals ────────────────────────────────────────────────── */
/* THE LOOP THIS ROUND REPLACED, kept verbatim as the mutant: the fixture must be red on it. */
function replacedCodeOnly(src) {
  let out = '', i = 0, inBlock = false;
  while (i < src.length) {
    const c = src[i], c2 = src[i + 1];
    if (inBlock) { if (c === '*' && c2 === '/') { inBlock = false; out += '  '; i += 2; } else { out += c === '\n' ? '\n' : ' '; i++; } continue; }
    if (c === '/' && c2 === '*') { inBlock = true; out += '  '; i += 2; continue; }
    if (c === '/' && c2 === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += ' '; i++;
      while (i < src.length) {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        if (src[i] === q) { out += ' '; i++; break; }
        out += src[i] === '\n' ? '\n' : ' '; i++;
      }
      continue;
    }
    out += c; i++;
  }
  return out;
}

/* each line: a regular expression (or a division) that a lexer can misread, then a publication after it */
const FIXTURE = [
  "const named = /named '([^']+)'/.exec(s);",            /* js/data-layers.js — three quotes */
  'window.AfterThreeQuotes = 1;',
  'const dq = s.replace(/"/g, "&quot;");',                /* js/app-body.js / js/weather.js — one quote */
  'window.AfterOneQuote = 2;',
  'const esc = /[&<>"\']/g;',                            /* a class holding both quotes */
  'window.AfterClass = 3;',
  'const cm = /\\/\\*|[/*]/;',                            /* a comment opener inside a pattern */
  'window.AfterCommentOpener = 4;',
  'const half = a / b; const third = c / d;',              /* division: must NOT be read as a pattern */
  'window.AfterDivision = 5;',
  'if (ok) /x\'/.test(s);',                               /* a pattern after `)` — the grammar decides */
  'window.AfterParen = 6;',
  "const note = 'window.InsideAString = 7';",             /* still not a publication */
  '/* window.InsideAComment = 8 */',
  'const pat = /window.InsideAPattern = 9/;',
  'window.Last = 10;',
].join('\n');
const WANT = ['AfterClass', 'AfterCommentOpener', 'AfterDivision', 'AfterOneQuote', 'AfterParen', 'AfterThreeQuotes', 'Last'];
const publications = (text) => [...new Set([...text.matchAll(/(?<![\w$.])window\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)].map((m) => m[1]))].sort();

test('② codeOnly keeps its place across regular-expression literals — and the replaced loop did not', () => {
  const out = codeOnly(FIXTURE);
  assert.equal(out.length, FIXTURE.length, 'offsets moved — the bracket form reads names back at the same offsets');
  assert.equal(out.split('\n').length, FIXTURE.split('\n').length, 'line structure was not kept');
  assert.deepEqual(publications(out), WANT);
  /* the mutant: the replaced loop is red on the same fixture */
  assert.notDeepEqual(publications(replacedCodeOnly(FIXTURE)), WANT, 'the fixture does not tell the replaced loop from the fix');
});

test('② (cont.) the gauge reads a tree through the same codeOnly — regex literals included', () => {
  const dir = mkdtempSync(join(tmpdir(), 'surface-regex-'));
  try {
    mkdirSync(join(dir, 'js'));
    writeFileSync(join(dir, 'js', 'x.js'), FIXTURE + "\nwindow['Bracketed'] = 11;\nwindow[`Templated`] = 12;\n");
    assert.deepEqual(Array.from(windowPublications(dir).keys()).sort(), [...WANT, 'Bracketed', 'Templated'].sort());
    /* a file the parser cannot read is an error that names it, not a guess */
    writeFileSync(join(dir, 'js', 'y.js'), 'window.Broken = (;\n');
    assert.throws(() => windowPublications(dir), /js\/y\.js/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ── ③ the register agrees with the grammar ────────────────────────────────────────────────────── */
test('③ every window.X assignment in js/ and src/ is in the register, and the register holds nothing else', () => {
  const ast = new Set();
  for (const d of ['js', 'src']) {
    if (!existsSync(join(ROOT, d))) continue;
    for (const f of readdirSync(join(ROOT, d)).filter((x) => x.endsWith('.js'))) {
      const src = readFileSync(join(ROOT, d, f), 'utf8');
      let tree;
      try { tree = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true }); } catch (_) { tree = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script' }); }
      (function walk(n) {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(walk); return; }
        if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.object.type === 'Identifier' && n.left.object.name === 'window') {
          const p = n.left.property;
          const name = !n.left.computed ? p.name : (p.type === 'Literal' && typeof p.value === 'string' ? p.value : null);
          if (name && /^[A-Za-z_$][\w$]*$/.test(name)) ast.add(name);
        }
        for (const k of Object.keys(n)) if (k !== 'type' && k !== 'start' && k !== 'end') walk(n[k]);
      })(tree);
    }
  }
  const reg = new Set(windowPublications(ROOT).keys());
  assert.deepEqual([...ast].filter((n) => !reg.has(n)).sort(), [], 'published by an assignment the gauge did not see');
  assert.deepEqual([...reg].filter((n) => !ast.has(n)).sort(), [], 'in the register with no assignment behind it');
  const base = JSON.parse(readFileSync(join(ROOT, 'tests', 'global-surface-baseline.json'), 'utf8')).window;
  assert.ok(base.includes('_refreshThermal') && base.includes('_setThermalOpacity'), 'the two names the replaced loop hid are not in the baseline');
});

/* ── ④ every request a row hands the registry ends against a host that never answers ─────────────── */
/* The branches are read from toggleLayer; the code each one runs is every declaration of the layer
   closure that toggleLayer reaches, found by the parser and evaluated as shipped. Nothing that makes
   a request is stubbed: `fetch` is a host that accepts the connection and never answers, the clocks
   are js/fetch-deadline.js and js/proxy-fetch.js themselves, and time is the mocked clock. */
const RAW = readLF(join(ROOT, 'js/data-layers.js'));
const CLOSURE = (() => {
  const tree = acorn.parse(RAW, { ecmaVersion: 'latest', sourceType: 'module' });
  let block = null;
  (function find(n) {
    if (block || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(find); return; }
    if (n.type === 'BlockStatement' && n.body.some((s) => s.type === 'FunctionDeclaration' && s.id && s.id.name === 'toggleLayer')) { block = n; return; }
    for (const k of Object.keys(n)) if (k !== 'type' && k !== 'start' && k !== 'end') find(n[k]);
  })(tree);
  assert.ok(block, 'the closure that declares toggleLayer was not found');
  const idents = (n, out) => {
    if (!n || typeof n !== 'object') return out;
    if (Array.isArray(n)) { n.forEach((c) => idents(c, out)); return out; }
    if (n.type === 'Identifier') out.add(n.name);
    for (const k of Object.keys(n)) if (k !== 'type' && k !== 'start' && k !== 'end') idents(n[k], out);
    return out;
  };
  /* `window.NAME = …` at the top of the closure is a declaration too — the file publishing its own
     tables (window.KOPPEN_PERIODS) — and is kept when kept code reads that name */
  const published = (s) => {
    const e = s.type === 'ExpressionStatement' && s.expression;
    const l = e && e.type === 'AssignmentExpression' && e.left;
    return (l && l.type === 'MemberExpression' && !l.computed && l.object.type === 'Identifier' && l.object.name === 'window') ? [l.property.name] : [];
  };
  const decls = block.body.map((s) => {
    const names = s.type === 'FunctionDeclaration' ? [s.id.name]
      : s.type === 'VariableDeclaration' ? [...idents(s.declarations.map((d) => d.id), new Set())] : published(s);
    return { s, names, uses: names.length ? idents(s, new Set()) : null };
  });
  /* one name may have several declarers — `window.KCOL = […]` and `const KCOL = window.KCOL` */
  const byName = new Map();
  decls.forEach((d, i) => d.names.forEach((n) => byName.set(n, (byName.get(n) || []).concat(i))));
  const keep = new Set(byName.get('toggleLayer'));
  for (const todo = [...keep]; todo.length;) {
    for (const n of decls[todo.pop()].uses) for (const j of (byName.get(n) || [])) if (!keep.has(j)) { keep.add(j); todo.push(j); }
  }
  const kept = [...keep].sort((a, b) => a - b).map((i) => decls[i].s);
  /* a name declared without a value is assigned by statements this rig does not run (the legend boxes
     are built by the file's setup code) — it stands in as an element, the only thing those hold */
  const unset = kept.filter((d) => d.type === 'VariableDeclaration')
    .flatMap((d) => d.declarations.filter((x) => !x.init && x.id.type === 'Identifier').map((x) => x.id.name));
  return kept.map((d) => RAW.slice(d.start, d.end)).join('\n') + '\n'
    + unset.map((n) => `if (${n} === undefined) ${n} = __standIn('${n}');`).join('\n');
})();
const OWN_GLOBALS = new Set([...codeOnly(RAW, 'js/data-layers.js').matchAll(/(?<![\w$.])window\.([A-Za-z_$][\w$]*)\s*(?:\|\||\?\?)?=(?!=)/g)].map((m) => m[1]));
const TOGGLE_BRANCHES = [...new Set([...liftFunction(DL, 'toggleLayer').matchAll(/\bid===\s*'([^']+)'/g)].map((m) => m[1]))];

function layerEnv() {
  const toasts = [], added = [], els = new Map();
  const quiet = new Proxy({}, { get: () => () => {} });
  /* anything outside the layer closure (the lazy loader, other modules' globals) ANSWERS AT ONCE, with
     nothing: a stand-in here is a promise already resolved, so the only thing that can hold a request
     open is the network — which is what this check is about */
  /* a tree of stand-ins has no end, so a walk up or along it (`while (n) n = n.parentElement`) would
     never stop: the DOM's links answer «none» */
  const LINKS = new Set(['parentElement', 'parentNode', 'offsetParent', 'nextSibling', 'previousSibling', 'nextElementSibling',
    'previousElementSibling', 'firstChild', 'lastChild', 'firstElementChild', 'lastElementChild']);
  const answering = () => {
    const memo = new Map();
    return new Proxy(function () {}, {
      get(_, k) {
        if (k === Symbol.toPrimitive) return () => '';
        if (k === 'then') return (a, b) => Promise.resolve(undefined).then(a, b);
        if (typeof k === 'symbol') return undefined;
        if (LINKS.has(k)) return null;
        if (!memo.has(k)) memo.set(k, answering()); return memo.get(k);
      },
      set() { return true; },
      apply() { return answering(); },
      construct() { return answering(); },
    });
  };
  const soft = (base) => new Proxy(base, { get: (t, k) => (k in t ? t[k] : ((typeof k === 'symbol' || k === 'then') ? undefined : LINKS.has(k) ? null : answering())), set: (t, k, v) => { t[k] = v; return true; } });
  const el = (id) => {
    if (els.has(id)) return els.get(id);
    const base = { id, checked: true, dataset: {}, style: {}, value: '', textContent: '',
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      querySelector: () => null, querySelectorAll: () => [], appendChild() {}, addEventListener() {}, removeEventListener() {} };
    const e = soft(base);
    base.closest = () => e;
    els.set(id, e); return e;
  };
  let anon = 0;
  const layers = soft({ has: () => false, hasSource: (id) => id === 'countries', getLayout: () => 'none', setSourceTiles: () => false,
    addSource: (id) => { added.push(id); }, add: (l) => { added.push(l && l.id); } });
  const engine = soft({ layers, events: soft({ on() {}, off() {} }), whenCanDraw: () => Promise.resolve(), hasRenderer: () => true, canDraw: () => true, ready: () => true });
  const lang = { t: (_l, en) => en, locale: () => 'en', pick: () => () => '', pickArgs: () => () => '' };
  /* a global THIS FILE publishes is not published yet — its setup code does not run in the rig, and a
     stand-in there would answer `if (window._tfrData)` with «already have it», so the branch would never
     ask the network at all. A global some other module publishes is a stand-in that answers at once. */
  const win = new Proxy({ IntMapLang: lang, SUPABASE_URL: 'https://relay.invalid' }, {
    get: (t, k) => (k in t ? t[k] : ((typeof k === 'symbol' || k === 'then' || OWN_GLOBALS.has(k)) ? undefined : answering())),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const over = {
    jsonWithin, readWithin, clockFor, ownRelayUrl,
    GE: () => engine, HOST: { lang: 'en', countryGeo: {}, canDraw: () => true },
    loadCountryData: () => Promise.resolve(), countryStats: {},
    satToast: (m) => toasts.push(m), imToast: (m) => toasts.push(m),
    document: soft({ hidden: false, getElementById: el, querySelector: () => null, querySelectorAll: () => [], createElement: () => el('anon-' + (anon++)), baseURI: 'https://intmap.invalid/' }),
    window: win, self: {}, console: quiet, __standIn: el,
  };
  const scope = new Proxy(over, {
    has: (t, k) => typeof k === 'string' && (k in t || !(k in globalThis)),
    get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : (t[k] = answering()))),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  /* eslint-disable no-new-func */
  const toggleLayer = new Function('scope', 'with (scope) { ' + CLOSURE + '\nreturn toggleLayer; }')(scope);
  return { toggleLayer, toasts, added, el, win };
}

test('④ every asynchronous branch of toggleLayer settles against a host that never answers — the reads carry their own clocks', async (t) => {
  const realFetch = globalThis.fetch, hadWindow = 'window' in globalThis, realWindow = globalThis.window;
  t.after(() => { globalThis.fetch = realFetch; if (hadWindow) globalThis.window = realWindow; else delete globalThis.window; });
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const CAP_S = 3600;   /* mocked seconds — a cap on this test's loop, not a claim about any layer */
  const networked = {}, stuck = [];
  for (const id of TOGGLE_BRANCHES) {
    const host = stalledHost();
    globalThis.fetch = host.fetch;
    const E = layerEnv();
    globalThis.window = E.win;   /* js/proxy-fetch.js reads the relay base from the page */
    let req;
    try { req = E.toggleLayer(id, true); } catch (e) { assert.fail(`${id}: toggleLayer threw in the rig — ${e && String(e.stack).split('\n').slice(0, 3).join(' / ')}`); }
    if (!req || typeof req.then !== 'function') continue;
    let done = false;
    req.then(() => { done = true; }, () => { done = true; });
    await settle();
    let s = 0;
    for (; !done && s < CAP_S; s++) { t.mock.timers.tick(1000); await settle(); }
    if (host.calls.length) networked[id] = { calls: host.calls.length, seconds: s, toasts: E.toasts.slice(), added: E.added.slice(), unticked: E.el('dl-' + id).checked === false };
    if (!done) stuck.push(`${id} (${host.calls.length} reads: ${host.calls.map((c) => c.url.slice(0, 60) + (c.signal ? '' : ' — NO CLOCK')).join(', ')})`);
  }
  assert.deepEqual(stuck, [], 'a row\'s request never ended against a silent host — its box would stay «in flight» for the session:\n' + stuck.join('\n'));
  /* the rig must actually reach the reads it is about — the four this round clocked */
  for (const id of ['radar', 'thermal', 'subcables', 'tfr']) assert.ok(networked[id], `${id}: the rig did not reach its network read`);
  /* …and each timed-out read landed in the failure path its branch already had */
  assert.deepEqual(networked.radar.toasts, ['Live weather data unavailable']);
  assert.equal(networked.radar.unticked, true);
  assert.deepEqual(networked.tfr.toasts, ['Could not load fertility data']);
  assert.deepEqual(networked.subcables.toasts, ['Submarine cable data unavailable']);
  assert.equal(networked.subcables.unticked, true);
  assert.ok(networked.thermal.added.some((x) => /^src-thermal-/.test(String(x))), 'a timed-out fire probe no longer lets the layer try to draw');
  t.diagnostic(JSON.stringify(Object.fromEntries(Object.entries(networked).map(([k, v]) => [k, v.calls + ' reads, settled at ' + v.seconds + ' s']))));
});

/* ── ⑤ the idle clock measures silence, not length ─────────────────────────────────────────────── */
/* a body that keeps arriving outlives `ms` many times over; a body that stops is cut `ms` after its last chunk */
function trickle(chunks, gapMs, stallAfter) {
  return async (_url, opt) => {
    let i = 0, pull = null;
    const body = new ReadableStream({
      pull(ctl) {
        return new Promise((res, rej) => {
          if (opt && opt.signal) opt.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
          if (i >= chunks.length) { ctl.close(); res(); return; }
          if (stallAfter != null && i >= stallAfter) return;   /* never another byte */
          pull = setTimeout(() => { ctl.enqueue(new TextEncoder().encode(chunks[i++])); res(); }, gapMs);
        });
      },
    });
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, body, text: async () => chunks.join('') };
  };
}

test('⑤ readWithin with the idle clock keeps a slow body that is moving, and cuts one that went silent', async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const parts = ['{"features":[', '1,', '2,', '3,', '4,', '5', ']}'];
  const MS = 1000;
  /* seven chunks, 900 ms apart: 6.3 s in all against a 1 s clock — alive the whole way */
  globalThis.fetch = trickle(parts, MS - 100);
  let got = null, err = null;
  jsonWithin('https://intmap.invalid/data/x.json', MS, undefined, { idle: true }).then((v) => { got = v; }, (e) => { err = e; });
  for (let i = 0; i < 20 && got === null && err === null; i++) { t.mock.timers.tick(MS - 100); await settle(); }
  assert.equal(err, null, 'a body that kept arriving was cut: ' + (err && err.message));
  assert.deepEqual(got, { features: [1, 2, 3, 4, 5] });
  /* the same body stopping after three chunks is cut one clock after the third */
  const stalled = trickle(parts, MS - 100, 3);
  globalThis.fetch = stalled;
  got = null; err = null;
  jsonWithin('https://intmap.invalid/data/x.json', MS, undefined, { idle: true }).then((v) => { got = v; }, (e) => { err = e; });
  let now = 0;
  const STEP = 50;
  for (; now < 20 * MS && err === null && got === null; now += STEP) { t.mock.timers.tick(STEP); await settle(); }
  assert.ok(err && /deadline/.test(err.message), 'a body that went silent was not cut at its clock');
  assert.equal(got, null);
  /* three chunks 900 ms apart, then one clock of silence: cut at ~3.7 s, not before the third chunk */
  assert.ok(now > 3 * (MS - 100) + MS - STEP && now <= 3 * (MS - 100) + MS + 2 * STEP, `cut at ${now} ms`);
});

/* ── ⑥ the per-host clocks the layer reads ask for ──────────────────────────────────────────────── */
test('⑥ clockFor answers per host from js/proxy-fetch.js — the World Bank outlives its slowest measured cold read', () => {
  /* measured 2026-09-28: the first read of SP.DYN.TFRT.IN took 8,230 ms (the other seven 0.34-2.99 s) */
  const WORLDBANK_SLOWEST_OBSERVED_MS = 8230;
  const wb = clockFor('https://api.worldbank.org/v2/country/all/indicator/SP.DYN.TFRT.IN?format=json&date=2022&per_page=400');
  assert.ok(wb > WORLDBANK_SLOWEST_OBSERVED_MS, `a ${wb} ms clock cannot reach a host measured answering in ${WORLDBANK_SLOWEST_OBSERVED_MS} ms`);
  /* hosts that answer quickly keep the one generic clock — the World Bank's row did not raise it */
  const quick = clockFor('https://api.rainviewer.com/public/weather-maps.json');
  assert.ok(quick < wb, 'the World Bank row raised the clock of every other host');
  assert.equal(clockFor('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?x=1'), quick);
  /* a relay rung is timed as the ladder races that relay, not as the host */
  assert.ok(clockFor('https://www.submarinecablemap.com/api/v3/cable/cable-geo.json', 'relay') > 0);
});

/* ── ⑦ a host js/proxy-fetch.js gives its own clock is read under THAT clock, wherever it is read ─── */
/* The hosts are not listed here: a URL is «a host with its own clock» when clockFor() answers it with
   something other than what it answers an unknown host. Every js/ and src/ file is parsed; a call whose
   URL argument begins with such a host must not be a bare fetch, and a jsonWithin/readWithin of it must
   take its clock from clockFor() rather than from a number written beside the call. */
const DEFAULT_CLOCK = clockFor('https://clock.invalid/');
const urlPrefix = (n) => {
  if (!n) return null;
  if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
  if (n.type === 'TemplateLiteral') return n.quasis[0].value.cooked;
  if (n.type === 'BinaryExpression' && n.operator === '+') return urlPrefix(n.left);
  return null;
};
function clockedHostReads(root) {
  const out = { reads: [], problems: [] };
  for (const d of ['js', 'src']) {
    if (!existsSync(join(root, d))) continue;
    for (const f of readdirSync(join(root, d)).filter((x) => x.endsWith('.js')).sort()) {
      const src = readFileSync(join(root, d, f), 'utf8');
      let tree;
      try { tree = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, locations: true }); } catch (_) { tree = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true }); }
      /* the URLs an argument can stand for: its own string parts, and the values of the names it uses
         where those names are declared in the same function (`const u = '…'; fetch(u)`) */
      const special = (arg, fnScope) => {
        const found = [];
        const seen = new Set();
        const visit = (n) => {
          if (!n || typeof n !== 'object' || seen.has(n)) return; seen.add(n);
          if (Array.isArray(n)) { n.forEach(visit); return; }
          const p = urlPrefix(n);
          if (p && /^https:\/\//.test(p) && clockFor(p) !== DEFAULT_CLOCK) found.push(p);
          if (n.type === 'Identifier' && fnScope && fnScope.has(n.name)) visit(fnScope.get(n.name));
          for (const k of Object.keys(n)) if (!['type', 'start', 'end', 'loc'].includes(k)) visit(n[k]);
        };
        visit(arg);
        return found;
      };
      const calleeName = (c) => (c.type === 'Identifier' ? c.name
        : (c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier' && /^(window|globalThis|self)$/.test(c.object.name)) ? c.property.name : null);
      (function walk(n, scope) {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach((c) => walk(c, scope)); return; }
        let s = scope;
        if (/Function/.test(n.type)) {
          s = new Map(scope);
          (function decls(m) {
            if (!m || typeof m !== 'object') return;
            if (Array.isArray(m)) { m.forEach(decls); return; }
            if (m !== n && /Function/.test(m.type)) return;
            if (m.type === 'VariableDeclarator' && m.id.type === 'Identifier' && m.init) s.set(m.id.name, m.init);
            for (const k of Object.keys(m)) if (!['type', 'start', 'end', 'loc'].includes(k)) decls(m[k]);
          })(n.body);
        }
        if (n.type === 'CallExpression') {
          const name = calleeName(n.callee);
          const hosts = (name === 'fetch' || name === 'jsonWithin' || name === 'readWithin') ? special(n.arguments[0], s) : [];
          if (hosts.length) {
            const at = `${d}/${f}:${n.loc.start.line}`;
            out.reads.push(at);
            const clock = n.arguments[1];
            if (name === 'fetch') out.problems.push(`${at} reads ${hosts[0].slice(0, 48)} with a bare fetch — no clock at all`);
            else if (!(clock && clock.type === 'CallExpression' && calleeName(clock.callee) === 'clockFor')) out.problems.push(`${at} reads ${hosts[0].slice(0, 48)} under a clock that is not clockFor()`);
          }
        }
        for (const k of Object.keys(n)) if (!['type', 'start', 'end', 'loc'].includes(k)) walk(n[k], s);
      })(tree, new Map());
    }
  }
  return out;
}

test('⑦ every read of a host proxy-fetch gives its own clock takes that clock from clockFor()', (t) => {
  const r = clockedHostReads(ROOT);
  t.diagnostic('reads of a clocked host: ' + r.reads.join(', '));
  assert.ok(r.reads.length >= 5, 'the check found almost no reads of a clocked host — it is measuring nothing (' + r.reads.join(', ') + ')');
  assert.deepEqual(r.problems, [], 'a read of a host with its own clock does not carry it:\n' + r.problems.join('\n'));
});

test('⑦ (cont.) the scan tells a bare fetch and a hand-written clock from a clocked read', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clocked-hosts-'));
  try {
    mkdirSync(join(dir, 'js'));
    writeFileSync(join(dir, 'js', 'a.js'), [
      "async function a(ind){ const r = await fetch('https://api.worldbank.org/v2/country/all/indicator/' + ind); return r.json(); }",
      "async function b(ind){ const u = `https://api.worldbank.org/v2/country/${ind}`; return jsonWithin(u, 20000); }",
      "async function c(ind){ const u = 'https://api.worldbank.org/v2/x?i=' + ind; return jsonWithin(u, clockFor(u)); }",
      "async function d(){ return fetch('https://example.org/data.json'); }",   /* a host with no clock of its own: not this check's business */
    ].join('\n'));
    const r = clockedHostReads(dir);
    assert.equal(r.reads.length, 3);
    assert.equal(r.problems.length, 2);
    assert.match(r.problems[0], /js\/a\.js:1 .*bare fetch/);
    assert.match(r.problems[1], /js\/a\.js:2 .*not clockFor/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

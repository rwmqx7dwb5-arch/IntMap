/* ============================================================================
 *  layer-failure-state — «could not draw» is a STATE, told once, readable by Atlas — EVALUATED
 * ----------------------------------------------------------------------------
 *  The audit (2026-09-30) that this answers:
 *    · js/layer-rows.js `inFlight().track` ended a request with `p.then(clear, clear)` — a rejected
 *      request left no trace, so a row that failed looked exactly like one that drew;
 *    · six toast functions, two elements at the same spot on two clocks, neither a live region;
 *    · the reconcilers ran on 2,500 ms and 10,000 ms heartbeats on a map nobody was touching;
 *    · the satellite legend said «Loading the catalog…» over 15,969 drawn objects.
 *  Every claim below is asked of the shipped code — the modules imported, the functions lifted out of
 *  the shipped files and RUN — not of how they are spelled.
 *    ① classify(): the shared readers' `reason` decides failed / unobserved / nothing
 *    ② inFlight(watch) → makeLayerState: a rejected request is KEPT; the newest request wins
 *    ③ one announcement per transition; `told` means the row already said it
 *    ④ the row's mark: en + jp, and the box's next change removes it
 *    ⑤ js/notify.js: one region, polite + assertive voices present before any text, a repeat folded
 *    ⑥ the toast functions (aiToast, satToast, navigation's toast, majorToast) delegate to it
 *    ⑦ the reconcilers: no heartbeat; a suspect gets exactly one second look; bursts coalesce
 *    ⑧ the satellite legend counts what is drawn while the live feed is still loading
 *    ⑨ the radar row's failure arm reports the read's own error, told once
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { inFlight } from '../js/layer-rows.js';
import { makeLayerState, classify, layerState } from '../js/layer-state.js';
import { makeNotify } from '../js/notify.js';
import * as acorn from 'acorn';
import { packageOf } from '../js/layer-manifest.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = (f) => codeOnly(readLF(join(ROOT, f)));
const DL = code('js/data-layers.js');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; };
const err = (reason, extra) => Object.assign(new Error(reason), { reason }, extra || {});

/* ── a document just large enough for the two modules: elements, classes, attributes, simple selectors ── */
function fakeDoc() {
  const listeners = [];
  const doc = { byId: new Map(), body: null };
  const matchOne = (n, sel) => {
    const m = /^([a-z]+)?(?:#([\w-]+))?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/i.exec(sel.trim());
    if (!m) return false;
    if (m[1] && n.tagName !== m[1].toUpperCase()) return false;
    if (m[2] && n.id !== m[2]) return false;
    for (const c of (m[3] || '').split('.').filter(Boolean)) if (!n.classList.contains(c)) return false;
    for (const a of (m[4] || '').match(/\[[^\]]+\]/g) || []) {
      const am = /^\[([\w-]+)(?:([$^]?=)"([^"]*)")?\]$/.exec(a);
      if (!am) return false;
      const v = am[1] === 'id' ? n.id : (am[1] === 'type' ? n.type : n.attrs[am[1]]);
      if (v == null || v === '') return false;
      if (am[2] === '=' && v !== am[3]) return false;
      if (am[2] === '$=' && !String(v).endsWith(am[3])) return false;
    }
    return true;
  };
  const match = (n, sel) => sel.split(',').some((s) => matchOne(n, s));
  class El {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null; this.attrs = {}; this.dataset = {}; this._c = new Set(); this._t = ''; this.id = ''; this.title = ''; this.type = ''; this.checked = false; this.nodeType = 1; }
    get className() { return Array.from(this._c).join(' '); }
    set className(v) { this._c = new Set(String(v).split(/\s+/).filter(Boolean)); }
    get classList() { const c = this._c; return { add: (x) => c.add(x), remove: (x) => c.delete(x), contains: (x) => c.has(x), toggle: (x, on) => (on === undefined ? (c.has(x) ? c.delete(x) : c.add(x)) : (on ? c.add(x) : c.delete(x))) }; }
    get textContent() { return this._t + this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this._t = String(v); this.children.forEach((c) => { c.parentNode = null; }); this.children = []; }
    appendChild(c) { if (c.parentNode) c.remove(); c.parentNode = this; this.children.push(c); if (c.id) doc.byId.set(c.id, c); return c; }
    remove() { const p = this.parentNode; if (!p) return; p.children.splice(p.children.indexOf(this), 1); this.parentNode = null; }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === doc.body; }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    matches(sel) { return match(this, sel); }
    closest(sel) { for (let n = this; n; n = n.parentNode) if (n !== doc && n.tagName && match(n, sel)) return n; return null; }
    querySelector(sel) {
      if (sel.startsWith(':scope >')) { const s = sel.replace(':scope >', ''); return this.children.find((c) => match(c, s)) || null; }
      const walk = (n) => { for (const c of n.children) { if (match(c, sel)) return c; const d = walk(c); if (d) return d; } return null; };
      return walk(this);
    }
  }
  doc.createElement = (t) => new El(t);
  doc.getElementById = (id) => { const find = (n) => { for (const c of n.children) { if (c.id === id) return c; const d = find(c); if (d) return d; } return null; }; return doc.body ? find(doc.body) : null; };
  doc.querySelectorAll = (sel) => { const out = []; const walk = (n) => { for (const c of n.children) { if (match(c, sel)) out.push(c); walk(c); } }; if (doc.body) walk(doc.body); return out; };
  doc.addEventListener = (type, fn, capture) => listeners.push({ type, fn, capture });
  doc.change = (target) => { for (const l of listeners) if (l.type === 'change') l.fn({ target }); };
  doc.body = new El('body');
  /* one Layers row, the shape js/layer-manifest.js writes: <label class="layer-option"><input><span data-i18n> */
  doc.row = (id, name) => {
    let dd = doc.getElementById('layer-dropdown');
    if (!dd) { dd = new El('div'); dd.id = 'layer-dropdown'; doc.body.appendChild(dd); }
    const label = new El('label'); label.className = 'layer-option';
    const cb = new El('input'); cb.type = 'checkbox'; cb.id = id; cb.checked = true;
    const sp = new El('span'); sp.setAttribute('data-i18n', 'k'); sp.textContent = name;
    label.appendChild(cb); label.appendChild(sp); dd.appendChild(label);
    return cb;
  };
  return doc;
}
const recorder = () => { const said = []; return { said, show: (m, o) => { said.push([m, o || null]); return true; } }; };

/* ── ① ─────────────────────────────────────────────────────────────────────────────────────────────── */
test('① classify: the shared readers\' `reason` decides — timeout is unobserved, a caller\'s Stop is nothing, an answer is failed', () => {
  assert.deepEqual(classify(err('timeout')), { state: 'unobserved', reason: 'timeout', retries: undefined });
  assert.equal(classify(err('aborted')), null, 'the caller\'s own Stop became a state');
  assert.equal(classify(Object.assign(new Error('x'), { name: 'AbortError' })), null);
  assert.deepEqual(classify(err('http', { status: 503 })), { state: 'failed', reason: 'http', status: 503 });
  /* js/data-door.js's own vocabulary reaches the same branch without a word of it written here */
  for (const r of ['network', 'parse', 'unsupported', 'worker']) assert.equal(classify(err(r)).state, 'failed', r);
  assert.equal(classify(new Error('renderer said no')).state, 'failed', 'a plain exception is an answer too');
  assert.equal(classify(undefined).state, 'failed');
});

/* ── ② ─────────────────────────────────────────────────────────────────────────────────────────────── */
test('② a rejected request is KEPT as failed — the registry still forgets it, the owner does not', async () => {
  const S = makeLayerState({});
  const F = inFlight(S);
  const a = deferred();
  F.track('dl-radar', a.p);
  assert.equal(S.get('dl-radar').state, 'loading');
  a.reject(err('http', { status: 404 })); await flush();
  assert.equal(F.has('dl-radar'), false, 'in-flight semantics changed — the reconciler would never judge the box again');
  const r = S.get('dl-radar');
  assert.equal(r.state, 'failed', 'the rejection left no trace — the audit\'s defect');
  assert.equal(r.reason, 'http'); assert.equal(r.status, 404);

  const b = deferred();
  F.track('dl-sst', b.p);
  b.reject(err('timeout')); await flush();
  assert.equal(S.get('dl-sst').state, 'unobserved', '«could not observe» was recorded as «failed»');

  const c = deferred();
  F.track('dl-aod', c.p);
  c.resolve(true); await flush();
  assert.equal(S.get('dl-aod').state, 'ok');

  const d = deferred();
  F.track('dl-x', d.p);
  d.reject(err('aborted')); await flush();
  assert.equal(S.get('dl-x'), null, 'a Stop left a state behind');
});

test('② (cont.) the newest request for a box decides; an older one settling late does not overwrite it', async () => {
  const S = makeLayerState({});
  const F = inFlight(S);
  const old = deferred(), neu = deferred();
  F.track('dl-radar', old.p);
  F.track('dl-radar', neu.p);
  old.reject(err('http', { status: 500 })); await flush();
  assert.equal(S.get('dl-radar').state, 'loading', 'a superseded request\'s failure was pinned on the new one');
  neu.resolve(); await flush();
  assert.equal(S.get('dl-radar').state, 'ok');
  /* a row's own report inside the request (told) is not overwritten when that request then resolves */
  const e = deferred();
  F.track('dl-contours', e.p);
  S.report('dl-contours', { reason: 'not-drawn' }, { told: true });
  e.resolve(); await flush();
  assert.equal(S.get('dl-contours').state, 'failed', 'the fulfilment overwrote the row\'s own failure');
  /* a retry after an unobserved read is still loading, and ends ok when the answer comes */
  const f = deferred();
  F.track('dl-tfr', f.p);
  S.report('dl-tfr', 'loading', { reason: 'timeout', retries: 1 });
  f.resolve(); await flush();
  assert.equal(S.get('dl-tfr').state, 'ok');
  /* the app's instance is the one js/layer-rows.js wires — same API */
  assert.equal(typeof layerState.request, 'function');
});

/* ── ③ ─────────────────────────────────────────────────────────────────────────────────────────────── */
test('③ one announcement per transition; a repeat of the same failure is not a second one; `told` is silent', () => {
  const N = recorder();
  const S = makeLayerState({ notify: N, name: (id) => ({ 'dl-radar': 'Weather radar', 'dl-sst': 'Sea temperature' })[id] });
  S.report('dl-radar', err('network'));
  S.report('dl-radar', err('network'));
  assert.equal(N.said.length, 1, 'the same failure was announced twice');
  assert.match(N.said[0][0], /^Weather radar — The source could not be reached$/);
  S.report('dl-radar', err('http', { status: 503 }));
  assert.equal(N.said.length, 2, 'a different reason is a new fact and is told');
  assert.match(N.said[1][0], /HTTP 503/);
  S.report('dl-sst', err('timeout'), { told: true });
  assert.equal(N.said.length, 2, 'a row that already toasted was told a second time');
  assert.equal(S.get('dl-sst').state, 'unobserved');
  S.report('dl-sst', 'ok');
  assert.equal(N.said.length, 2, 'success was announced');
  /* the repair log the reconciler writes is kept here and readable */
  S.healed('dl-radar', 'rearm');
  assert.deepEqual(S.heals().map((h) => [h.id, h.fix]), [['dl-radar', 'rearm']]);
  assert.equal(S.get('dl-radar').healed.fix, 'rearm');
  /* Atlas's read: plain data, no DOM */
  const snap = S.snapshot();
  assert.deepEqual(snap.map((r) => [r.id, r.state, r.label]), [['dl-radar', 'failed', 'Weather radar'], ['dl-sst', 'ok', 'Sea temperature']]);
  assert.doesNotThrow(() => JSON.stringify(snap));
});

/* ── ④ ─────────────────────────────────────────────────────────────────────────────────────────────── */
test('④ the row says it — en and jp — and the box\'s next change removes the mark', () => {
  const doc = fakeDoc();
  const cb = doc.row('dl-radar', 'Weather radar');
  const N = recorder();
  let lang = 'en';
  const saved = globalThis.window;
  globalThis.window = { IntMapLang: { t: (l, en, jp) => (l === 'jp' ? jp : en), normalise: (x) => x } };
  try {
    /* the tile js/map-ui.js builds for the same box — the face the desktop sidebar shows instead of the row */
    const tile = doc.createElement('div'); tile.className = 'lst-tile'; tile.dataset.lid = 'dl-radar'; tile.setAttribute('data-lid', 'dl-radar');
    doc.body.appendChild(tile);
    const S = makeLayerState({ doc, notify: N, lang: () => lang });
    S.listen(doc);
    S.report('dl-radar', err('http', { status: 404 }));
    const label = cb.closest('label');
    let mark = label.querySelector(':scope > .lyr-state');
    assert.ok(mark, 'the failed row carries no mark');
    assert.equal(mark.textContent, "Couldn't load");
    assert.equal(mark.dataset.state, 'failed');
    assert.equal(cb.dataset.imState, 'failed');
    assert.match(mark.title, /refused the request \(HTTP 404\)/);
    assert.equal(N.said[0][0], 'Weather radar — The source refused the request (HTTP 404)', 'the announcement named the layer by its row');
    assert.equal(tile.dataset.imState, 'failed', 'the tile — the only face the desktop sidebar shows — was not marked');
    assert.equal(tile.querySelector(':scope > .lyr-state').textContent, "Couldn't load");
    lang = 'jp'; S.repaint();
    assert.equal(label.querySelector(':scope > .lyr-state').textContent, '読み込めません');
    S.report('dl-radar', err('timeout'), { told: true });
    assert.equal(label.querySelector(':scope > .lyr-state').textContent, '応答なし', '«could not confirm» wore the «failed» words');
    /* the reader switches it on again (or off): the old outcome no longer describes the box */
    doc.change(cb);
    assert.equal(label.querySelector(':scope > .lyr-state'), null, 'the mark outlived the next change');
    assert.equal(tile.querySelector(':scope > .lyr-state'), null, 'the mark on the tile outlived the next change');
    assert.equal(tile.dataset.imState, undefined);
    assert.equal(cb.dataset.imState, undefined);
    assert.equal(S.get('dl-radar'), null);
    /* loading and ok draw nothing on the row */
    S.report('dl-radar', 'loading'); S.report('dl-radar', 'ok');
    assert.equal(label.querySelector(':scope > .lyr-state'), null);
  } finally { globalThis.window = saved; }
});

/* ── ⑤ ─────────────────────────────────────────────────────────────────────────────────────────────── */
test('⑤ one region, both voices present before the first message; a repeat while showing is folded, not re-spoken', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const doc = fakeDoc();
  const N = makeNotify(doc);
  const el = N.region();
  const polite = el.querySelector('.im-toast-polite'), loud = el.querySelector('.im-toast-assertive');
  assert.equal(el.id, 'ai-toast'); assert.ok(el.classList.contains('sat-toast'));
  assert.deepEqual([polite.getAttribute('role'), polite.getAttribute('aria-live')], ['status', 'polite']);
  assert.deepEqual([loud.getAttribute('role'), loud.getAttribute('aria-live')], ['alert', 'assertive']);
  assert.equal(polite.textContent + loud.textContent, '', 'the region was born with text — its first message would not be announced');

  assert.equal(N.show('Live weather data unavailable'), true);
  assert.equal(polite.textContent, 'Live weather data unavailable');
  assert.ok(el.classList.contains('show'));
  let writes = 0; const P = polite; const orig = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(P), 'textContent');
  Object.defineProperty(P, 'textContent', { get() { return orig.get.call(this); }, set(v) { writes++; orig.set.call(this, v); }, configurable: true });
  assert.equal(N.show('Live weather data unavailable'), false, 'a repeat was announced again');
  assert.equal(writes, 0, 'a repeat rewrote the live region (that IS a second announcement)');
  assert.deepEqual(N.log().map((e) => e.folded), [false, true]);

  N.show('Route lost — recalculating failed', { urgent: true });
  assert.equal(loud.textContent, 'Route lost — recalculating failed');
  assert.equal(polite.textContent, '', 'two voices spoke at once');
  assert.equal(doc.body.children.filter((c) => c.classList.contains('sat-toast')).length, 1, 'a second toast box was drawn');

  t.mock.timers.tick(4600);
  assert.equal(el.classList.contains('show'), false, 'the toast did not leave on the one clock');
  t.mock.timers.tick(300);
  assert.equal(loud.textContent, '', 'the text stayed in the region after the box faded');
  /* announced, not drawn */
  N.show('Variant named', { visual: false });
  assert.equal(polite.textContent, 'Variant named');
  assert.equal(el.classList.contains('show'), false);
  assert.equal(N.show(''), false);
});

/* ── ⑥ ─────────────────────────────────────────────────────────────────────────────────────────────── */
test('⑥ aiToast, satToast, navigation\'s toast and majorToast all end in the one region', () => {
  const said = [];
  const window = { IntMapNotify: { show: (m, o) => { said.push([m, o || null]); return true; } } };
  /* eslint-disable no-new-func */
  const run = (file, name, args, extra) => {
    const fnSrc = liftFunction(code(file), name);
    const names = ['window', ...Object.keys(extra || {})];
    return new Function(...names, fnSrc + '\nreturn ' + name + ';')(window, ...Object.values(extra || {}))(...args);
  };
  run('js/ai-core.js', 'aiToast', ['a']);
  run('js/satellite.js', 'satToast', ['b']);
  run('js/navigation.js', 'toast', ['c']);
  const host = { children: [], lastElementChild: { dataset: {} } };
  const document = { getElementById: () => host };
  run('js/playground.js', 'majorToast', ['<b>Variant</b> named', 'alert'], { document, pgNews: () => {} });
  assert.deepEqual(said, [['a', null], ['b', null], ['c', { urgent: true }], ['Variant named', { visual: false }]]);
  /* …and none of them draws a box of its own any more */
  for (const [f, n] of [['js/ai-core.js', 'aiToast'], ['js/satellite.js', 'satToast']]) {
    assert.doesNotMatch(liftFunction(code(f), n), /createElement|setTimeout/, `${n} still owns an element or a clock`);
  }
});

/* ── ⑦ ─────────────────────────────────────────────────────────────────────────────────────────────── */
test('⑦ no heartbeat: neither reconciler is registered on the timer wheel', () => {
  /* every everyTick( … ) call in the shipped file, with its key as written — a key naming either reconciler is the defect */
  const keys = [...DL.matchAll(/everyTick\(\s*(['"`])([^'"`]+)\1/g)].map((m) => m[2]);
  assert.ok(keys.length > 0, 'the scan found no everyTick call at all — it is not reading the file');
  assert.deepEqual(keys.filter((k) => /orphan-sweep|layer-audit/.test(k)), []);
});

test('⑦ (cont.) a suspect gets exactly ONE second look; no suspect, no timer', async () => {
  const src = liftFunction(DL, 'auditBy');
  const env = { sus: {}, audits: 0, ticks: [], armed: false };
  const scope = {
    document: { hidden: false },
    _counted: (_k, _why, fn) => fn(),
    audit: () => { env.audits++; },
    sus: env.sus,
    afterTick: (key, ms) => { const d = deferred(); env.ticks.push({ key, ms, fire: d.resolve }); return d.p; },
  };
  /* the cadence is the shipped declaration, evaluated with the function — not a number restated here */
  const cadence = /const AUDIT_RECHECK_MS=\d+;/.exec(DL);
  assert.ok(cadence, 'AUDIT_RECHECK_MS is not declared');
  const make = new Function('scope', 'with (scope) { let _recheckArmed=false; ' + cadence[0] + '\n' + src + '\nreturn [auditBy, AUDIT_RECHECK_MS]; }');
  const [auditBy, RECHECK] = make(scope);
  auditBy('idle');
  assert.equal(env.audits, 1);
  assert.equal(env.ticks.length, 0, 'a clean audit armed a timer — that is the heartbeat back');
  env.sus['dl-radar'] = 1;
  auditBy('styledata'); auditBy('styledata');
  assert.equal(env.ticks.length, 1, 'more than one second look was armed for one suspect');
  assert.equal(env.ticks[0].ms, RECHECK, 'the second look is not armed at the declared cadence');
  env.sus['dl-radar'] = 0;
  env.ticks[0].fire(); await flush();
  assert.equal(env.audits, 4, 'the second look did not run');
  assert.equal(env.ticks.length, 1, 'the second look re-armed itself with nothing suspect');
  /* a box already past its second hit (healed, or its heal on cooldown) is a finding, not a suspect */
  env.sus['dl-radar'] = 3;
  auditBy('styledata');
  assert.equal(env.ticks.length, 1, 'a finding on its heal cooldown re-armed the second look — a heartbeat under another name');
  const seen = env.audits;
  scope.document.hidden = true; auditBy('visible');
  assert.equal(env.audits, seen, 'a hidden tab was audited');
});

test('⑦ (cont.) a burst of style changes is swept at once and then at most once per gap', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const _coalesce = new Function(liftFunction(DL, '_coalesce') + '\nreturn _coalesce;')();
  let n = 0;
  const fire = _coalesce(2500, () => { n++; });
  for (let i = 0; i < 50; i++) fire();   /* one frame's worth of styledata and then some */
  t.mock.timers.tick(0);
  assert.equal(n, 1, 'the first change of a burst was not swept promptly');
  for (let i = 0; i < 50; i++) { fire(); t.mock.timers.tick(20); }   /* 1 s of per-frame changes */
  assert.equal(n, 1, 'swept more often than the old heartbeat would have');
  t.mock.timers.tick(1500);
  assert.equal(n, 2, 'the trailing change was never swept');
  t.mock.timers.tick(60000);
  assert.equal(n, 2, 'a quiet style was swept — there is no event, so there must be no run');
});

/* ── ⑧ ─────────────────────────────────────────────────────────────────────────────────────────────── */
test('⑧ the satellite legend counts what is drawn while the live feed is still loading', () => {
  const box = { textContent: '' };
  const legend = { querySelector: () => box };
  const document = { getElementById: () => legend };
  const HOST = { lang: 'en' };
  let st = null;
  const window = { IntMapSatellites: { state: () => st }, IntMapLang: { t: (l, en, jp) => (l === 'jp' ? (jp === undefined ? en : jp) : en) } };
  const f = new Function('document', 'window', 'HOST', liftFunction(DL, '_satLegendCount') + '\nreturn _satLegendCount;')(document, window, HOST);
  st = { loading: true, catalogue: 15969, drawn: 15969, sunlit: 0 };
  f();
  assert.match(box.textContent, /^15,969 \/ 15,969 shown · updating from the live feed…$/, 'the drawn count was hidden behind «Loading»');
  st = { loading: true, catalogue: 0, drawn: 0 };
  f();
  assert.equal(box.textContent, 'Loading the catalog…');
  st = { loading: false, catalogue: 16000, drawn: 12000, sunlit: 3 };
  f();
  assert.equal(box.textContent, '12,000 / 16,000 shown · 3 sunlit');
  HOST.lang = 'jp'; st = { loading: true, catalogue: 15969, drawn: 100, sunlit: 0 };
  f();
  assert.match(box.textContent, /^100 \/ 15,969 機を表示中・ライブ配信から更新中…$/);
});

/* ── ⑨ ─────────────────────────────────────────────────────────────────────────────────────────────── */
/* (layer-packages) the radar package's factory, found by the parser in the shipped file */
const RADAR_FACTORY = (() => {
  const text = code('js/layer-pkg-radar.js');
  const d = acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module' }).body
    .find((n) => n.type === 'ExportNamedDeclaration' && n.declaration && n.declaration.id && n.declaration.id.name === 'radarPackage');
  assert.ok(d, 'js/layer-pkg-radar.js does not export function radarPackage');
  return text.slice(d.declaration.start, d.declaration.end);
})();
test('⑨ the radar row\'s failure arm hands the read\'s own error to the owner, and the reader is told once', async () => {
  for (const [thrown, want] of [[err('http', { status: 404 }), 'failed'], [err('timeout'), 'unobserved']]) {
    const toasts = [], reports = [];
    const row = { classList: { remove() {} } };
    const cb = { id: 'dl-radar', checked: true, closest: () => row };
    const over = {
      whenStyleReady: () => Promise.resolve(),
      rowUntilObserved: () => Promise.reject(thrown),
      clockFor: () => 1000, RV_INDEX_URL: 'x', rvRead: () => {}, addRainViewer: () => true, rvAutoRefresh: () => {},
      satToast: (m) => toasts.push(m),
      layerState: { report: (id, e, o) => { reports.push([id, e, o]); } },
      lgdRadar: { style: {} }, tileLegends: () => {},
      document: { getElementById: (id) => (id === 'dl-radar' ? cb : null) },
      window: { IntMapLang: { t: (_l, en) => en } }, HOST: { lang: 'en' },
      setTimeout: () => 0, requestAnimationFrame: () => 0, ensureGenericLegend: () => null,
      /* (layer-packages) the radar row is its layer package (dl-radar `pkg`): toggleLayer reaches it through its one path,
         and «fetching» the package hands the factory lifted below — the row's switch is the package's, as shipped */
      packageOf, loadPackage: () => Promise.resolve(F.radarPackage),
    };
    let F = null;
    const scope = new Proxy(over, {
      has: (tg, k) => typeof k === 'string' && (k in tg || !(k in globalThis)),
      get: (tg, k) => (k in tg ? tg[k] : (typeof k === 'symbol' ? undefined : () => undefined)),
    });
    F = new Function('scope', 'with (scope) { const _pkgs=Object.create(null); let _kit=null;\n'
      + ['toggleLayer', 'packageKit', '_pkgLoad', '_pkgSwitch'].map((n) => liftFunction(DL, n)).join('\n') + '\n' + RADAR_FACTORY
      + '\nreturn { toggleLayer, radarPackage }; }')(scope);
    const toggleLayer = F.toggleLayer;
    await toggleLayer('radar', true);
    assert.equal(reports.length, 1, `${want}: the failure was not reported to the owner`);
    assert.equal(reports[0][0], 'dl-radar');
    assert.equal(reports[0][1], thrown, `${want}: the read's own error did not reach the owner — its reason would be lost`);
    assert.deepEqual(reports[0][2], { told: true });
    assert.equal(classify(reports[0][1]).state, want);
    assert.deepEqual(toasts, ['Live weather data unavailable'], `${want}: the reader was told other than once`);
  }
});

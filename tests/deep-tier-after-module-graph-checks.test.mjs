// deep-tier-after-module-graph — WHO MAY MOVE THE CLOCK WHEN A WAR ROW IS SWITCHED ON.
//
// MEASURED (CI nightly 2026-10-01, reproduced locally): a share link with every layer and no `tt` (= now)
// restores the war rows; «now» is outside every war's record, so each war draws nothing on purpose.
// js/data-layers.js's heal saw «ticked and blank» and pulsed each row off→on with `__syn` raised;
// js/war-fronts.js read only the restore's mark (`__imRestored`), took the pulse's «on» for the READER's,
// and js/war-layer.js moved the clock to the war's first day (1939-08-23 → 1914-06-28 → …). The
// world-at-time hold then took 39 present-day layers off the map.
//
// The rule (docs/architecture/08-ui.md): only the reader's own tick moves the clock into a war. A
// restore's tick and the map's own re-dispatch do not — the same line js/layer-time-kernel.js draws
// (`!cb.__syn && !cb.__imRestored`).
//
// EVALUATED, NOT READ: both real modules run, wired as the browser wires them — the row's checkbox
// `change` goes through js/war-fronts.js's listener into js/war-layer.js's real toggle, which loads the
// shipped data/wars.json and decides. Only the renderer (js/geo-engine.js), the master clock
// (js/chronos.js) and the timer runtime are import edges replaced by stubs; the clock stub records writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importModule, fileUrl } from './helpers/import-module.mjs';

/* ── the browser: just enough DOM for the rows js/war-fronts.js builds ─────────────────────────── */
const byId = new Map();
class FakeInput extends EventTarget {
  constructor(id) { super(); this.id = id; this.type = 'checkbox'; this.checked = false; }
  closest() { return { classList: { toggle() { }, add() { }, remove() { } } }; }
}
const fakeEl = () => {
  const el = { style: {}, classList: { toggle() { }, add() { }, remove() { } }, textContent: '', children: [],
    appendChild(c) { this.children.push(c); return c; }, querySelector(sel) { return sel === 'input' ? this._input || null : null; },
    addEventListener() { }, setAttribute() { }, remove() { } };
  Object.defineProperty(el, 'innerHTML', { set(html) {
    const m = /<input type="checkbox" id="([^"]+)"/.exec(String(html));
    if (m) { el._input = new FakeInput(m[1]); byId.set(m[1], el._input); }
  }, get() { return ''; } });
  return el;
};
byId.set('layer-dropdown', fakeEl());
const document = { readyState: 'complete', baseURI: 'http://intmap.test/', hidden: false, head: fakeEl(), activeElement: null,
  getElementById: (id) => byId.get(id) || null, createElement: () => fakeEl(), addEventListener() { }, querySelectorAll: () => [] };
const window = globalThis;
if (typeof window.addEventListener !== 'function') window.addEventListener = () => { };   /* node's global is not an EventTarget */

/* ── the edges replaced: the renderer (every call answers, a source «exists»), the timer runtime, the clock ── */
const anything = new Proxy(function () { }, { get: (_, k) => (k === 'then' ? undefined : anything), apply: () => anything });
const writes = [];
const clock = { live: true };
const IntMapTime = new Proxy({
  isLive: () => clock.live, iso: () => '2026-10-02', when: () => new Date('2026-10-02T00:00:00Z'),
  set: (d, o) => { writes.push({ d: new Date(d).toISOString().slice(0, 10), o }); clock.live = false; },
  on: () => () => { },
}, { get: (t, k) => (k in t ? t[k] : anything) });

const WARS = readFileSync(new URL('../data/wars.json', import.meta.url), 'utf8');
const globals = {
  window, document, location: { href: 'http://intmap.test/' },
  fetch: async (u) => (String(u).endsWith('data/wars.json') ? { ok: true, json: async () => JSON.parse(WARS) } : { ok: false, json: async () => null }),
};
const HOST = { lang: 'en', canDraw: () => true, escapeHtml: (s) => s, imToast() { } };

const { warLayer } = await importModule('js/war-layer.js', { globals, mocks: {
  'js/geo-engine.js': { IntMapGeoEngine: anything },
  'js/chronos.js': { IntMapTime },
  'js/runtime.js': { everyTick: () => 0, stopTick: () => { } },
} });
/* CShapes is opened off the main thread in the app (js/hist-bundles.js); the decision under test needs only that it answered */
window.IntMapHistBundles = { open: async () => ({ during: async () => [], data: { feats: [], rings: [] } }) };
window.IntMapOS = { register() { } };
/* the lazy loader mounts the war body the way js/lazy-modules.js does: the factory, with the host */
window.IntMapLazy = { need: async () => { if (!window.__imWarFronts) warLayer(HOST); return true; } };
const { warFronts } = await importModule('js/war-fronts.js', { globals });
warFronts(HOST);
await new Promise((r) => setTimeout(r, 5));   /* buildRows runs on the next turn, as in the browser */
assert.ok(fileUrl('js/war-fronts.js'));

/** tick the row the way `who` does, and let the war decide (it decides after its record has loaded) */
async function tick(who) {
  const cb = byId.get('dl-ww2');
  assert.ok(cb, 'js/war-fronts.js built the WW2 row');
  const fire = (on) => {
    cb.checked = on;
    if (who === 'restore') cb.__imRestored = 1;
    if (who === 'map') cb.__syn = (cb.__syn || 0) + 1;
    try { cb.dispatchEvent(new Event('change', { bubbles: true })); } finally { if (who === 'map') cb.__syn = Math.max(0, cb.__syn - 1); }
  };
  fire(false); fire(true);
  /* the same door the row uses, awaited: it resolves on the war's own latched load, after the tick's request */
  await window.IntMapWarFronts.toggle('ww2', true, { restored: true });
  await new Promise((r) => setTimeout(r, 0));
}

test('a restore\'s tick and the map\'s own off→on leave «now» where it is; the reader\'s tick still opens the war on its first day', async () => {
  clock.live = true; writes.length = 0;
  await tick('restore');
  assert.deepEqual(writes, [], 'a restored war row moved the clock');
  assert.ok(window.__imWarFronts.span('ww2'), 'the fixture: the shipped record loaded, so the war really decided');

  await tick('map');
  assert.deepEqual(writes, [], "the map's own off→on (`__syn`, js/data-layers.js's heal) was read as the reader's tick and moved the clock");

  await tick('reader');
  assert.equal(writes.length, 1, "the reader's own tick must still move the clock into the war (the decision this measures is live)");
  assert.equal(writes[0].d, window.__imWarFronts.span('ww2')[0], "…to the war's first day");
});

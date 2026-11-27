/* (atlas-controls-receipts) the controls in an Atlas reply and the state they switch are one state.
   Node-only: the registry is faked at its one seam (`ofSpelling`), a tab row is a minimal element model — what is asserted is the order in which the
   switch reads and writes its state, not how it looks. The page holds the same claims in tests/board-compose.spec.js (atlas-controls-receipts ①–④). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const caps = (await import('../js/atlas-cap-ui.js')).default;
const { makeAtlasSwitch } = await import('../js/atlas-switch.js');
const { expressionOf, drawnControls, drawnSwitches, switchWorked } = await import('../scripts/atlas-eval/initiative.mjs');

const L = (en) => en;
const ROWS = { timeTravel: { id: 'time.travel', risk: 'reversible-session', confirmation: 'none' }, isolate: { id: 'map.isolateCountry', risk: 'reversible-session', confirmation: 'none' } };
const CAPS = { ofSpelling: (t) => ROWS[t] || null, resolve: (t) => ROWS[t] || null };
const K = { R: (ok, html, extra) => ({ ok, html, ...(extra || {}) }), warn: (h) => h, esc: (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])), L, CAPS, resolveLayer: () => null, layerOpacityControl: () => null };
const inline = (items) => caps.find((c) => c.row[0] === 'ui.inlineControls').run({ items }, {}, K);
const opt = (label, calls) => ({ label, calls: calls || [{ type: 'timeTravel', year: +label }] });

test('a call returns the controls it DREW, each with the id that stands on its markup — an item it could not draw is a problem, not a control', async () => {
  const r = await inline([{ kind: 'button', label: 'Again', run: 'show Japan' }, { kind: 'tabs', options: [opt('1900')] }, { kind: 'tabs', options: [opt('1900'), opt('2000')] }]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.meta.drawn.map((d) => [d.kind, d.at]), [['button', '[0]'], ['tabs', '[2]']]);
  assert.deepEqual(r.meta.problems.map((p) => p.at), ['[1].options']);
  const onPage = [...r.html.matchAll(/data-ctl-id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(onPage, r.meta.drawn.map((d) => d.id), 'every drawn id is on the page, and nothing else');
  assert.equal(r.meta.drawn[1].options, 2);
  const again = await inline([{ kind: 'button', label: 'Again', run: 'show Japan' }]);
  assert.notEqual(again.meta.drawn[0].id, r.meta.drawn[0].id, 'ids do not repeat between calls');
  const none = await inline([{ kind: 'tabs', options: [opt('1900')] }]);
  assert.equal(none.ok, false); assert.deepEqual(none.meta.drawn, []);
});

/* a tab row the switch can read and write: the attributes and the four selectors js/atlas-switch.js uses */
function fakeRow(n, selected) {
  const attrs = {}; let why = null;
  const row = { getAttribute: (k) => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = String(v); },
    querySelectorAll: (s) => (s === '.atl-ctl-tab' ? tabs : []), appendChild: (x) => { why = x; },
    querySelector: (s) => { if (s === '.atl-ctl-tab.on') return tabs.find((t) => t.cls.has('on')) || null; if (s === '.atl-ctl-why') return why; const m = s.match(/data-i="(\d+)"/); return m ? tabs[+m[1]] : null; } };
  const tabs = Array.from({ length: n }, (_, i) => {
    const cls = new Set(i === selected ? ['on'] : []); const a = { 'data-i': String(i) };
    return { cls, classList: { contains: (c) => cls.has(c), add: (c) => cls.add(c), remove: (c) => cls.delete(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) },
      getAttribute: (k) => (k in a ? a[k] : null), setAttribute: (k, v) => { a[k] = String(v); }, closest: () => row };
  });
  return { row, tabs, why: () => why };
}

test('presses queued behind a running one go back to the state the map last CONFIRMED, and a rollback confirms it again', async () => {
  globalThis.document = { createElement: () => ({ className: '', textContent: '', remove() {} }) };
  const year = { now: 1900 }; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const execute = async (c) => { await sleep(20); if (c.type === 'isolate') return { status: 'failed', code: 'not_found' }; year.now = c.year; return { status: 'completed' }; };
  const S = makeAtlasSwitch({ execute, CAPS, L });
  const { row, tabs } = fakeRow(3, 0);
  const calls = [[{ type: 'timeTravel', year: 1900 }], [{ type: 'timeTravel', year: 1950 }], [{ type: 'timeTravel', year: 2000 }, { type: 'isolate', country: 'Nowhere' }]];
  tabs.forEach((t, i) => t.setAttribute('data-calls', encodeURIComponent(JSON.stringify(calls[i]))));
  const p1 = S.press(tabs[1]); const p2 = S.press(tabs[2]);   /* the second is pressed while the first runs */
  await p1; await p2;
  assert.equal(row.getAttribute('data-confirmed'), '1', 'the record');
  assert.ok(tabs[1].cls.has('on') && !tabs[0].cls.has('on') && !tabs[2].cls.has('on'), 'the row');
  assert.equal(year.now, 1950, 'the map');
});

test('a press is judged by the kernel\'s observed status: unobserved is not a failure, failed is', async () => {
  globalThis.document = { createElement: () => ({ className: '', textContent: '', remove() {} }) };
  const S = makeAtlasSwitch({ execute: async (c) => ({ status: c.year === 2000 ? 'unobserved' : 'completed' }), CAPS, L });
  const { row, tabs } = fakeRow(2, 0);
  tabs.forEach((t, i) => t.setAttribute('data-calls', encodeURIComponent(JSON.stringify([{ type: 'timeTravel', year: i ? 2000 : 1900 }]))));
  await S.press(tabs[1]);
  assert.equal(row.getAttribute('data-confirmed'), '1');
  const F = makeAtlasSwitch({ execute: async (c) => (c.year === 1900 ? { status: 'failed', code: 'x' } : { status: 'completed' }), CAPS, L });
  await F.press(tabs[0]);
  assert.equal(row.getAttribute('data-confirmed'), '1', 'a failed press puts the map back on the confirmed option, and says so');
  assert.ok(tabs[1].cls.has('on'));
  const F2 = makeAtlasSwitch({ execute: async () => ({ status: 'failed', code: 'x' }), CAPS, L });
  await F2.press(tabs[0]);
  assert.equal(row.getAttribute('data-confirmed'), '', 'when even the way back fails, the row claims no option');
});

test('the evaluation reads controls off the result, presses the switches it drew, and grants `interactive` only to a switch that moved the map', () => {
  const tabsDrawn = { ok: true, status: 'completed', details: { drawn: [{ id: 'c1-0', kind: 'button' }, { id: 'c1-1', kind: 'tabs', options: 2 }] } };
  const asked = { args: { items: [{ kind: 'button', label: 'x', run: 'y' }, { kind: 'tabs', options: [{ label: 'only' }] }] } };
  assert.deepEqual(drawnControls([asked]), [], 'the arguments state nothing');
  assert.deepEqual(drawnControls([{ ...asked, resultText: JSON.stringify(tabsDrawn) }]).map((d) => d.kind), ['button', 'tabs']);
  assert.deepEqual(drawnSwitches([{ resultText: JSON.stringify(tabsDrawn) }]).map((d) => d.id), ['c1-1']);
  const opt2 = (i, t, ok = true) => ({ i, confirmed: ok, after: { snapshot: { time: t } } });
  assert.equal(switchWorked({ found: true, options: [opt2(0, 1900), opt2(1, 2000)] }), true);
  assert.equal(switchWorked({ found: true, options: [opt2(0, 1900), opt2(1, 1900)] }), false, 'options that leave the same map are not a switch');
  assert.equal(switchWorked({ found: true, options: [opt2(0, 1900), opt2(1, 2000, false)] }), false, 'an option its row could not confirm');
  assert.equal(switchWorked({ found: false, options: [] }), false);
  const e = expressionOf({ operations: [{ capabilityId: 'ui.inlineControls', status: 'completed' }], calls: [{ resultText: JSON.stringify(tabsDrawn) }], pressed: [{ id: 'c1-1', found: true, options: [opt2(0, 1900), opt2(1, 2000)] }] });
  assert.ok(e.families.includes('interactive'));
  assert.deepEqual(e.switches, { drawn: 1, working: 1 });
});

test('the switch under a reply takes a claimed surface through its painter, and the painters that hold their visibility declare the door', () => {
  const con = fs.readFileSync(new URL('../js/atlas-console.js', import.meta.url), 'utf8');
  const tools = fs.readFileSync(new URL('../js/map-tools.js', import.meta.url), 'utf8');
  const ui = fs.readFileSync(new URL('../js/map-ui.js', import.meta.url), 'utf8');
  const eng = fs.readFileSync(new URL('../js/geo-engine.js', import.meta.url), 'utf8');
  assert.match(eng, /showSurface:\(id,on\)=>/);
  assert.match(con, /function overlayToggle[\s\S]{0,400}render\.showSurface\(s,show\)/);
  assert.match(tools, /render\.claim\(\['iso-src','iso-edge-src'\],'isolate',\{[^}]*show:/);
  assert.match(tools, /'styledata',\(\)=>\{ if\(active&&shown\)/, 'the re-assert respects a hidden isolate');
  assert.match(ui, /render\.claim\(sid,'upload:'\+sid/);
  assert.ok(!/isolate:\['iso-mask'\]/.test(con), 'the typed layer list went when its painter claimed');
});

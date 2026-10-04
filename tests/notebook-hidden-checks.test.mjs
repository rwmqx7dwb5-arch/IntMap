/* ============================================================================
 *  notebook-hidden — THE INVESTIGATION NOTEBOOK EXISTS BUT IS NOT SHOWN, AND ONE CONSTANT SAYS SO
 * ----------------------------------------------------------------------------
 *  Owner, 2026-10-04: 「機能だけ残すけど、いったんユーザーには存在せず、見えないように」.
 *  What is proved here, on the shipped modules (not on their text where behaviour can be run):
 *    ① the switch is ONE exported constant, and every door found by discovery asks it;
 *    ② hidden: no strip, no sheet, nothing filed (even with the stored preference ON), the three capabilities are
 *       withdrawn (registry) and answer FEATURE_WITHDRAWN;
 *    ③ shown: the same doors are found and work — so turning the constant to true brings every entrance back;
 *    ④ the briefing draws no notebook door while hidden, and the privacy text says what is true.
 *  The notebook's own logic (filing, replay, compare, export) stays proved by tests/atlas-os-checks.test.mjs,
 *  which loads the modules as they run when shown (tests/helpers/notebook-shown.mjs).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shownNotebook, hiddenNotebook } from './helpers/notebook-shown.mjs';
import { makeAtlasCapabilities } from '../js/atlas-capabilities.js';
import { NOTEBOOK_SHOWN } from '../js/atlas-notebook-store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
const NB_IDS = ['notebook.list', 'notebook.open', 'notebook.compare'];

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); } };
const el = () => ({ style: {}, dataset: {}, className: '', innerHTML: '', setAttribute() { }, addEventListener() { }, querySelector: () => null, querySelectorAll: () => [], appendChild() { } });
globalThis.document = globalThis.document || { createElement: () => deepEl(), getElementById: () => null };
if (typeof globalThis.window === "undefined") globalThis.window = globalThis;
window.IntMapSafe = window.IntMapSafe || { html: (s) => String(s), url: (s) => String(s) };

const state = () => ({ onTurnEnd() { }, captureSections: () => ({ camera: { lng: 1, lat: 2, zoom: 3, bearing: 0, pitch: 0, base: 'map', projection: 'globe' }, time: { live: true, t: null }, layers: [] }) });
const deps = () => ({ ASTATE: state(), lang: () => 'en', host: () => ({}), waitIdle: async () => true, resolve: () => null, runDirect() { }, ask() { } });
const turn = (id) => ({ turnId: id, at: Date.now() - 10, question: 'Q' + id, reply: 'A' + id, status: 'done', operations: [] });
const K = () => ({ R: (ok, html, extra) => Object.assign({ ok: !!ok, html: html || '' }, extra || null), L: (en) => en,
  esc: (s) => String(s), note: (s) => s, warn: (s) => s, ASTATE: state() });
const deepEl = () => Object.assign(el(), { querySelector: () => deepEl(), insertBefore() { }, firstChild: null, nextSibling: null, classList: { add() { }, remove() { }, toggle() { } } });
const panelOf = (inserted) => Object.assign(deepEl(), { insertBefore(n) { inserted.push(n); } });

test('① the shipped switch is false, defined in ONE place, and every door found by discovery asks it', () => {
  assert.equal(NOTEBOOK_SHOWN, false, 'the notebook is hidden in the shipped build (owner, 2026-10-04)');
  const definers = jsFiles.filter((f) => /export\s+const\s+NOTEBOOK_SHOWN\s*=/.test(read('js/' + f)));
  assert.deepEqual(definers, ['atlas-notebook-store.js']);
  /* a door is any module that imports the PAGE side of the notebook (atlas-notebook.js) — found, not listed */
  /* (a stylesheet string, NOTEBOOK_CSS, is not a door: it draws nothing without the strip) */
  const importsOf = (f) => [...read('js/' + f).matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/atlas-notebook\.js'/g)].flatMap((m) => m[1].split(',').map((x) => x.trim()).filter(Boolean));
  const doors = jsFiles.filter((f) => importsOf(f).some((n) => n !== 'NOTEBOOK_CSS'));
  assert.ok(doors.length >= 3, 'discovery found the doors: ' + doors.join(', '));
  /* atlas-console.js only builds and mounts the notebook — mount() itself asks the constant (proved in ②) */
  doors.filter((f) => f !== 'atlas-console.js').forEach((f) => assert.match(read('js/' + f), /NOTEBOOK_SHOWN/, f + ' is a door and does not ask the switch'));
  assert.match(read('js/atlas-notebook.js'), /NOTEBOOK_SHOWN/);
  assert.match(read('js/atlas-cap-notebook.js'), /NOTEBOOK_SHOWN/);
});

test('② hidden: no strip, no sheet, nothing filed, capabilities withdrawn and answering FEATURE_WITHDRAWN', async () => {
  const { notebook, caps } = await hiddenNotebook();
  const NB = notebook.makeAtlasNotebook();
  const inserted = [];
  NB.mount(panelOf(inserted), deps());
  assert.equal(inserted.length, 0, 'no strip is put above the Atlas field');
  assert.equal(NB.show(), false, 'the sheet cannot be opened');
  assert.equal(notebook.keepingOn(), false);
  localStorage.setItem('intmap_atlas_notebook', JSON.stringify({ keep: true, sync: true }));
  assert.equal(await NB.fileTurn(turn(1)), null, 'an ordinary turn is not recorded even with the stored preference ON');
  NB.claim(2); const e2 = await NB.fileTurn(turn(2));
  assert.ok(e2 && e2.question === 'Q2', 'a briefing turn is still built...');
  assert.equal((await notebook.notebookStore().list('')).length, 0, '...and handed over, never stored');
  const CAPS = makeAtlasCapabilities({}, { publish: false });
  for (const id of NB_IDS) {
    assert.ok(CAPS.resolve(id).withdrawn, id + ' is withdrawn in the registry');
    const entry = caps.find((e) => e.row[0] === id);
    assert.ok(entry.policy && entry.policy.withdrawn.proofCode === 'FEATURE_WITHDRAWN');
    const r = await entry.run({ type: 'notebook' }, {}, K());
    assert.equal(r.ok, false); assert.equal(r.meta.code, 'FEATURE_WITHDRAWN');
  }
});

test('③ shown: the same doors exist and work — flipping the constant brings every entrance back', async () => {
  const { notebook, caps } = await shownNotebook();
  const NB = notebook.makeAtlasNotebook();
  const inserted = [];
  NB.mount(panelOf(inserted), deps());
  assert.equal(inserted.length, 1, 'the strip is put above the Atlas field');
  assert.equal(NB.show(), true);
  localStorage.setItem('intmap_atlas_notebook', JSON.stringify({ keep: true, sync: false }));
  assert.equal(notebook.keepingOn(), true);
  const filed = await NB.fileTurn(turn(9));
  assert.ok(filed && filed.question === 'Q9');
  assert.equal((await notebook.notebookStore().list('')).length, 1, 'a kept turn is stored again');
  caps.forEach((e) => assert.equal(e.policy, undefined, e.row[0] + ' is not withdrawn when shown'));
  const listed = await caps.find((e) => e.row[0] === 'notebook.list').run({ type: 'notebook' }, {}, K());
  assert.equal(listed.ok, true);
});

test('④ the briefing draws no notebook door while hidden, and the privacy text says what is true', () => {
  const b = read('js/atlas-briefing.js');
  ["btn('compare'", "btn('keep'", "btn('file'", 'class="atl-br-add"'].forEach((frag) => {
    const i = b.indexOf(frag); assert.ok(i > 0, frag);
    assert.match(b.slice(Math.max(0, i - 160), i), /NOTEBOOK_SHOWN/, frag + ' is drawn without asking the switch');
  });
  const legal = read('js/legal-text.js');
  assert.match(legal, /not offered at present, and nothing new is recorded/);
  assert.match(legal, /現在は提供しておらず、新しく記録することはありません/);
});

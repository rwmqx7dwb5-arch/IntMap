/* atlas-chat-scroll-ownership — 回答表示の 5 つの欠陥の回帰。DOM を持たないので、ブラウザが走らせるモジュールをそのまま評価する。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeAtlasAnswerSources } from '../js/atlas-answer-sources.js';
import entries from '../js/atlas-cap-compute.js';

const con = fs.readFileSync(new URL('../js/atlas-console.js', import.meta.url), 'utf8');

test('① scroll has an owner: nothing but a follow state moves it, and the reader’s gestures release it', () => {
  assert.match(con, /let _chatFollow=true;/);
  assert.ok(!/chatEl\.scrollTop=chatEl\.scrollHeight;\s*\}catch\(_\)\{\}\s*return d;/.test(con), 'bubble() must not scroll unconditionally');
  assert.ok(!/_nb=\(\)=>chatEl\.scrollHeight/.test(con), 'the distance rule is gone');
  for (const ev of ['wheel', 'touchmove', 'pointerdown', 'keydown']) assert.ok(con.includes("chatEl.addEventListener('" + ev + "'"), ev);
  assert.match(con, /jump\.onclick=\(\)=>\{ _chatFollow=true;/);
});

test('② a reply is four regions written only when their HTML changed; compose no longer assigns the whole bubble', () => {
  assert.match(con, /const _REGIONS=\['head','body','ops','srcs'\]/);
  const compose = con.slice(con.indexOf('function _atlCompose(ai)'), con.indexOf('async function runActions'));
  assert.ok(!/\bai\.innerHTML=\(head\+body\)/.test(compose));
  assert.match(compose, /_patchRegions\(ai,/);
  assert.match(con, /if\(reg\.html\[k\]===h\) return;/);
});

test('③ the reader’s card carries no runtime, package or dataset id; the model’s record carries them', async () => {
  const e = entries.find((x) => x.row[0] === 'compute.run');
  globalThis.window = { IntMapLazy: { need: async () => {} }, IntMapCompute: { run: async () => ({ ok: true, observed: true, runtime: 'pyodide@0.0', packages: ['numpy'],
    datasets: [{ id: 'ds-1', name: 'out', title: 'Result', count: 3, fields: [{ name: 'a', type: 'number' }] }], values: {} }) } };
  const L = (en) => en, esc = (s) => String(s), R = (ok, html, x) => Object.assign({ ok, html }, x);
  const r = await e.run({ code: 'x' }, {}, { R, warn: esc, L, esc });
  assert.ok(!/pyodide|numpy|ds-1|next step/i.test(r.html), r.html);
  assert.match(r.meta.record, /ds-1/); assert.match(r.meta.record, /pyodide/);
  assert.match(fs.readFileSync(new URL('../js/atlas-toolsurface.js', import.meta.url), 'utf8'), /res\.meta\.record/);
});

test('④ what a run drew is read off the renderer in one shape, and feeds the switch', () => {
  assert.match(con, /function _drewSince\(before\)/);
  assert.match(con, /kinds\.map\(k=>\(\{ kind:k, layerIds:_ovlIds\(k\), visible:_ovlVisible\(k\) \}\)\)/);
  assert.match(con, /results\.forEach\(rr=>\{ \(rr\.drew\|\|\[\]\)/);
});

test('⑤ a figure Atlas drew is listed apart from the basemap credit, and never credited to the basemap', () => {
  const c = makeAtlasAnswerSources({ esc: (s) => String(s), lang: () => 'en' });
  const items = c.collect([{ ok: true, meta: {}, drew: [{ kind: 'map.route', what: 'route' }] }], { credits: ['Esri'] });
  const fig = items.find((i) => i.kind === 'figure'), map = items.find((i) => i.kind === 'map');
  assert.equal(typeof fig.source, 'string'); assert.notEqual(fig.source, map.source); assert.match(fig.source, /Atlas/);
  const h = c.footerHtml(items, { id: 'a' });
  assert.match(h, /data-group="figure"/); assert.match(h, /data-group="data"/);
  const stated = c.collect([{ ok: true, meta: { provenance: [{ kind: 'figure', what: 'zone', source: 'USGS' }] }, drew: [{ kind: 'map.poi' }] }], {});
  assert.deepEqual(stated.map((i) => i.source), ['USGS']);
});

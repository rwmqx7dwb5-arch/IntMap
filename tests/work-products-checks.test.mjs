/* ============================================================================
 *  work-products — a job's different results are kept together, found again and compared
 * ----------------------------------------------------------------------------
 *  What Node can hold: the store's rules (kinds, versions, refusals by name, comparison by code, the workspace
 *  choice), the persistence through the NOTEBOOK's store technique, the capability's actions driven through a
 *  stand-in page (dataset registry, chart renderer, attachment log, file save), and the invariants that make this
 *  an addition and not a second implementation (no second store, notebook still hidden).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { codeOnly } from '../scripts/code-only.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

const S = await import('../js/atlas-work-store.js');
const NB = await import('../js/atlas-notebook-store.js');

const mk = (goal) => S.normalizeWork({ id: S.newWorkId(1000), at: 1000, goal });

test('① every kind is filed whole, or refused BY NAME — nothing is truncated', () => {
  let w = mk('compare three PDFs');
  const ok = (kind, content, name) => { const r = S.withProduct(w, { kind, name: name || kind, content }, 2000); assert.ok(r.product, kind + ' ' + JSON.stringify(r)); w = r.work; return r.product; };
  ok('table', { columns: ['country', 'gdp'], rows: [['JP', 1], ['FR', 2]] });
  ok('dataset', { format: 'geojson', features: [{ type: 'Feature', geometry: null, properties: { a: 1 } }] });
  ok('code', { language: 'python', text: 'result = 1', result: { values: { r: 1 } } });
  ok('image', { dataUrl: 'data:image/png;base64,iVBORw0KGgo=' });
  ok('document', { text: '# memo' });
  ok('chart', { spec: { kind: 'bar', source: 's' }, svg: '<svg></svg>' });
  ok('analysis', { projectId: 'p-1' });
  ok('answer', { text: 'yes' });
  assert.equal(S.currentProducts(w).length, 8);
  assert.equal(S.withProduct(w, { kind: 'poem', name: 'x', content: {} }).problem, 'unknown-kind');
  assert.equal(S.withProduct(w, { kind: 'table', name: 't', content: { columns: [], rows: [] } }).problem, 'no-columns');
  assert.equal(S.withProduct(w, { kind: 'image', name: 'i', content: { dataUrl: 'data:text/html;base64,AA==' } }).problem, 'image-type-not-kept');
  const big = S.withProduct(w, { kind: 'code', name: 'big', content: { text: 'x'.repeat((1 << 20) + 1) } });
  assert.equal(big.problem, 'too-large');
  assert.equal(big.maxBytes, 1 << 20);
});

test('② the same name+kind is the NEXT VERSION; the earlier one stays and is comparable', () => {
  let w = mk('quarterly numbers');
  const f = (rows) => { const r = S.withProduct(w, { kind: 'table', name: 'gdp', content: { columns: ['country', 'gdp', 'pop'], rows } }, 2000); w = r.work; return r.product; };
  const v1 = f([['JP', 5, 125], ['FR', 3, 68], ['DE', 4, 84]]);
  const v2 = f([['DE', 4, 84], ['JP', 6, 125], ['IT', 2, 59]]);   /* re-sorted, JP changed, FR gone, IT new */
  assert.equal(v1.version, 1); assert.equal(v2.version, 2); assert.equal(v2.supersedes, v1.id);
  assert.equal(w.products.length, 2);
  assert.equal(S.currentProducts(w).length, 1);
  assert.equal(S.findProduct(w, 'gdp').version, 2);
  assert.equal(S.findProduct(w, 'gdp@1').id, v1.id);
  const d = S.compareProducts(v1, v2);
  assert.equal(d.by, 'rows'); assert.equal(d.key, 'country');
  assert.deepEqual(d.added, ['IT']); assert.deepEqual(d.removed, ['FR']);
  assert.equal(d.changed.length, 1); assert.equal(d.changed[0].id, 'JP');
  assert.deepEqual(d.changed[0].diffs, [{ column: 'gdp', then: 5, now: 6 }]);
  assert.equal(d.unchanged, 1, 'DE moved position but did not change — a re-sorted table is not everything changed');
  assert.equal(d.keyUnique, true);
  const dup = S.compareProducts({ kind: 'table', content: { columns: ['k', 'v'], rows: [['a', 1], ['a', 2]] }, version: 1 }, { kind: 'table', content: { columns: ['k', 'v'], rows: [['a', 1]] }, version: 2 });
  assert.equal(dup.keyUnique, false, 'a repeated key is stated, not hidden');
});

test('③ text kinds compare by line; kinds with no structure say so; mismatched kinds are refused', () => {
  const c = (text, v) => ({ kind: 'code', version: v, content: { language: 'python', text } });
  const d = S.compareProducts(c('a\nb\nc', 1), c('a\nB\nc\nd', 2));
  assert.equal(d.by, 'lines'); assert.equal(d.added, 2); assert.equal(d.removed, 1);
  assert.equal(S.compareProducts(c('x', 1), c('x', 2)).identical, true);
  assert.equal(S.compareProducts({ kind: 'analysis', version: 1, content: { projectId: 'a' } }, { kind: 'analysis', version: 2, content: { projectId: 'b' } }).by, 'identity');
  assert.equal(S.compareProducts(c('x', 1), { kind: 'answer', version: 1, content: { text: 'x' } }).why, 'kinds-differ');
  assert.equal(S.compareProducts(null, c('x', 1)).why, 'needs-two-versions');
});

test('④ the workspace is chosen from the job\'s DECLARED NEEDS; what cannot be done is said by name', () => {
  const ids = S.WORKSPACES.map((x) => x.id);
  assert.deepEqual(ids, ['reading', 'gis', 'pyodide', 'server-files']);
  assert.equal(S.chooseWorkspace({}).choice, 'reading', 'no code → the cheapest: the model reads');
  assert.equal(S.chooseWorkspace({ language: 'gis', geometry: true }).choice, 'gis');
  assert.equal(S.chooseWorkspace({ language: 'python', packages: ['pandas'] }).choice, 'pyodide');
  const bin = S.chooseWorkspace({ language: 'python', binaryFiles: true });
  assert.equal(bin.choice, null, 'code that must parse PDF/Excel bytes has no workspace in this build');
  const server = bin.considered.find((c) => c.id === 'server-files');
  assert.ok(server.unmet.includes('not-in-this-build'), 'the absent workspace is REFUSED with its reason, not left out');
  assert.ok(bin.considered.find((c) => c.id === 'pyodide').unmet.includes('binaryFiles'));
  assert.equal(S.chooseWorkspace({ language: 'python', network: true }).choice, null, 'the sandbox has no network and says so');
  assert.equal(S.chooseWorkspace({ language: 'python' }, { pyodide: false }).choice, null, 'a workspace the page could not load is not offered');
  assert.ok(S.chooseWorkspace({ language: 'python' }, { pyodide: false }).considered.find((c) => c.id === 'pyodide').unmet.includes('not-loaded'));
});

test('⑤ persistence is the NOTEBOOK\'s store technique with its own normalizer — one device copy, no second implementation', async () => {
  const backend = S.memoryBackend(), st = S.makeWorkStore(backend);
  let w = mk('persist me'); const r = S.withProduct(w, { kind: 'answer', name: 'a', content: { text: 'hello' } }, 3000);
  await st.put(r.work);
  const st2 = S.makeWorkStore(backend);   /* "a reload": a new store over the same backend */
  const back = await st2.get(w.id);
  assert.equal(back.products.length, 1); assert.equal(back.products[0].content.text, 'hello');
  assert.equal((await st2.list('persist')).length, 1, 'found by the words of the goal');
  assert.equal((await st2.list('nothing like it')).length, 0);
  await assert.rejects(() => st2.put({ id: 'nb-abcd1234', question: 'a notebook turn' }), /invalid-entry/, 'a notebook entry is not a work');
  const nb = NB.makeNotebookStore(S.memoryBackend());
  await nb.put({ id: NB.newId(1), at: 1, question: 'q', answer: 'a' });
  assert.equal((await nb.list('')).length, 1, 'the notebook store still takes notebook entries by default');
  assert.equal(R('js/atlas-work-store.js').includes('indexedDB.open'), false, 'no IndexedDB code of its own: it calls the notebook\'s idbBackend');
  assert.match(R('js/atlas-work-store.js'), /makeNotebookStore\(backend \|\| memoryBackend\(\), normalizeWork\)/);
});

test('⑥ a work file round-trips and an imported work is a COPY under a new id', () => {
  let w = mk('ship it'); w = S.withProduct(w, { kind: 'document', name: 'memo', content: { text: '# a' } }, 3000).work;
  const file = JSON.parse(JSON.stringify(S.workToFile(w)));
  const got = S.workFromFile(file);
  assert.equal(got.works.length, 1); assert.notEqual(got.works[0].id, w.id); assert.equal(got.works[0].followOf, w.id);
  assert.equal(got.works[0].products[0].content.text, '# a');
  assert.throws(() => S.workFromFile({ format: 'nope' }), /not-a-work-file/);
  const md = S.workToMarkdown(w); assert.match(md, /## memo/); assert.match(md, /# a/);
});

test('⑦ a table leaves as RFC 4180 CSV (quotes doubled, newlines kept); code leaves under its language\'s extension', () => {
  let w = mk('files');
  let r = S.withProduct(w, { kind: 'table', name: 'my table', content: { columns: ['a', 'b'], rows: [['x,y', 'say "hi"\nthere'], [null, 2]] } }, 1); w = r.work;
  const f = S.fileOf(r.product);
  assert.equal(f.filename, 'my_table.csv');
  assert.equal(f.text, 'a,b\r\n"x,y","say ""hi""\nthere"\r\n,2\r\n');
  const c = S.fileOf(S.withProduct(w, { kind: 'code', name: 'fit', content: { language: 'python', text: 'x=1' } }, 1).product);
  assert.equal(c.filename, 'fit.py');
  assert.equal(S.fileOf(S.withProduct(w, { kind: 'dataset', name: 'd', content: { format: 'table', columns: ['a'], rows: [[1]] } }, 1).product), null, 'a dataset is written by js/gis-export.js, never here');
});

/* ── the capability, through a stand-in page ─────────────────────────────────────────────────────── */
function page() {
  const saved = [], datasets = new Map();
  datasets.set('ds-1', { id: 'ds-1', title: 'Cities', kind: 'vector', count: 2, withGeometry: 0, fields: [{ name: 'city', type: 'text' }, { name: 'pop', type: 'number' }],
    features: () => [{ type: 'Feature', geometry: null, properties: { city: 'A', pop: 1 } }, { type: 'Feature', geometry: null, properties: { city: 'B', pop: 2 } }], provenance: { licence: 'CC0' } });
  let n = 1;
  window.IntMapLazy = { need: async () => true };
  window.IntMapData = { get: (id) => datasets.get(id) || null, add: (s) => { const id = 'ds-' + (++n); const d = { id, title: s.title, count: s.features.length, features: () => s.features, provenance: s.provenance }; datasets.set(id, d); return d; } };
  window.IntMapAtlasChart = { render: (spec) => spec.source ? { ok: true, html: '<figure><svg viewBox="0 0 1 1"><rect/></svg></figure>' } : { ok: false, reason: 'no_source' } };
  const anchors = [];
  window.document = { body: { appendChild() {} }, createElement: () => { const a = { click() { saved.push({ name: a.download, href: a.href }); }, remove() {}, style: {} }; return a; } };
  window.URL.createObjectURL = () => 'blob:x'; window.URL.revokeObjectURL = () => {};
  return { saved, datasets, anchors };
}
const K = (turn) => ({ R: (ok, html, o) => ({ ok, html, meta: (o && o.meta) || null }), warn: (x) => '<warn>' + x + '</warn>', L: (e) => e, esc: (x) => String(x), note: (x) => x, _curTurn: turn || 0 });
const cap = (await import('../js/atlas-cap-work.js'));
const run = async (a, k) => (await cap.default[0].run(a, {}, k || K()));

test('⑧ job → add table / dataset / code / chart → carry on after a "reload" → compare → restore → export', async () => {
  const p = page(); cap._setStoreForTest(S.makeWorkStore(S.memoryBackend()));
  let r = await run({ action: 'start', goal: 'Compare 3 PDFs of tariffs', needs: { language: 'python' } });
  assert.ok(r.ok); const id = r.meta.work.id; assert.equal(r.meta.work.workspace, 'pyodide');
  r = await run({ action: 'add', kind: 'table', name: 'tariffs', columns: ['country', 'rate'], rows: [['JP', 1], ['FR', 2]], from: { attachment: 'a.pdf' } });
  assert.ok(r.ok, r.html); assert.equal(r.meta.work.version, 1);
  r = await run({ action: 'add', kind: 'table', name: 'tariffs', columns: ['country', 'rate'], rows: [['JP', 3], ['FR', 2], ['IT', 9]] });
  assert.equal(r.meta.work.version, 2);
  r = await run({ action: 'add', kind: 'dataset', name: 'cities', from: { dataset: 'ds-1' } });
  assert.ok(r.ok, r.html);
  r = await run({ action: 'add', kind: 'code', name: 'fit', language: 'python', text: 'result = 1', result: { values: { r: 1 } } });
  assert.ok(r.ok);
  r = await run({ action: 'add', kind: 'chart', name: 'rates', spec: { kind: 'bar', source: 'a.pdf', series: [] } });
  assert.ok(r.ok, r.html);
  r = await run({ action: 'add', kind: 'chart', name: 'bad', spec: { kind: 'bar' } });
  assert.equal(r.ok, false); assert.equal(r.meta.work.code, 'chart-refused', 'a chart with no source is refused by the renderer, and the refusal travels back');
  r = await run({ action: 'add', kind: 'document', name: 'raw', from: { attachment: 'missing.pdf' } });
  assert.equal(r.meta.work.code, 'no-such-attachment');
  assert.equal(r.ok, false);

  /* "tomorrow": the module forgets which job it was on; the store still has it */
  cap._setStoreForTest(cap.workStore());
  r = await run({ action: 'list', query: 'tariffs' }); assert.equal(r.meta.work.count, 1);
  r = await run({ action: 'start', id }); assert.equal(r.meta.work.resumed, true); assert.equal(r.meta.work.products, 4);
  r = await run({ action: 'compare', product: 'tariffs' });
  assert.equal(r.meta.work.by, 'rows'); assert.equal(r.meta.work.added, 1); assert.equal(r.meta.work.changed, 1);
  r = await run({ action: 'restore', product: 'cities' });
  assert.ok(r.ok, r.html); assert.match(r.meta.work.dataset, /^ds-\d+$/); assert.equal(r.meta.work.count, 2);
  r = await run({ action: 'get', product: 'fit' });
  assert.ok(r.html.includes('result = 1'));
  r = await run({ action: 'export', as: 'md' });
  assert.ok(r.ok, r.html); assert.match(p.saved.at(-1).name, /\.md$/);
  r = await run({ action: 'export', as: 'file', product: 'tariffs' });
  assert.ok(r.ok, r.html); assert.equal(p.saved.at(-1).name, 'tariffs-v2.csv');
  r = await run({ action: 'finish', summary: 'done' }); assert.equal(r.meta.work.status, 'done');
});

test('⑨ refusals are named and a missing job is not invented', async () => {
  page(); cap._setStoreForTest(S.makeWorkStore(S.memoryBackend()));
  let r = await run({ action: 'add', kind: 'answer', name: 'x', text: 'y' });
  assert.equal(r.ok, false); assert.equal(r.meta.work.code, 'needs_input', 'no job yet → say so, do not create one silently');
  r = await run({ action: 'open', id: 'wk-zzzz9999' }); assert.equal(r.meta.work.code, 'not_found');
  r = await run({ action: 'start' }); assert.equal(r.meta.work.code, 'needs_input');
  r = await run({ action: 'workspace', needs: { language: 'python', binaryFiles: true } });
  assert.equal(r.ok, false); assert.equal(r.meta.work.code, 'no_workspace');
  assert.ok(r.html.includes('not-in-this-build'));
  await run({ action: 'start', goal: 'g' });
  r = await run({ action: 'add', kind: 'code', name: 'big', text: 'x'.repeat((1 << 20) + 5) });
  assert.equal(r.meta.work.code, 'too-large');
  r = await run({ action: 'restore', product: 'nothing' }); assert.equal(r.meta.work.code, 'not_found');
});

test('⑩ the notebook stays hidden and untouched; the capability is one registered row that nothing else duplicates', () => {
  assert.equal(NB.NOTEBOOK_SHOWN, false);
  const src = R('js/atlas-cap-work.js');
  assert.equal(/NOTEBOOK_SHOWN/.test(codeOnly(src)), false, 'the work door neither reads nor flips the notebook switch');
  assert.match(R('js/atlas-capabilities.js'), /\["work\.job","work"/);
  assert.match(R('js/atlas-caps-modules.js'), /"work": caps_work/);
  for (const k of ['gis-export.js', 'atlas-chart', 'ATTACH_LOG', 'IntMapData']) assert.ok(src.includes(k), 'reuses ' + k);
  assert.equal(/new Blob|createObjectURL/.test(src), false, 'no download code of its own — js/gis-export.js save() is the one');
});

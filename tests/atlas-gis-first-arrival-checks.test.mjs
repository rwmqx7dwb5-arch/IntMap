/* ============================================================================
 *  atlas-gis-first-arrival — a search need not wait for its slowest catalogue, and an image turn need not end at the image reader
 * ----------------------------------------------------------------------------
 *  A  search({until:'ready'}) returns the first candidate whose DATA WAS READ and inspected while a slow catalogue is still asking;
 *     the finished list stays reachable (follow) and includes what arrived later.
 *  B  usability is decided on real values: a candidate that states it covers the window but reads as all-nodata is NOT returned early.
 *  C  without until the search is exactly as before (waits for all); until needs a window and a resolution.
 *  D  an image turn is continued by the READER's own flag, not by a pattern over the question; the reading travels as context.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { makeGisPipeline } = await import('../js/gis-pipeline.js');
const { makeGisRemote } = await import('../js/gis-remote.js');
const { wantsContinue, agentContext, VISION_CONTINUE_RULE } = await import('../js/atlas-image-continue.js');

const json = (o) => ({ ok: true, status: 200, headers: { get: (k) => (/content-type/i.test(k) ? 'application/json' : null) }, json: async () => o, text: async () => JSON.stringify(o), type: 'basic' });
const world = [[-180, -90, 180, 90]];
const dem = (id) => ({ id, title: 'Global DEM ' + id, description: 'Digital elevation model', keywords: ['elevation'], license: 'CC0-1.0', extent: { spatial: { bbox: world }, temporal: { interval: [['2011-01-01T00:00:00Z', null]] } }, summaries: { gsd: [30] } });
const feature = (bbox) => ({ id: 'T1', bbox, properties: { datetime: '2024-06-01T00:00:00Z', gsd: 30 }, assets: { data: { href: 'https://data.test/T1.tif', type: 'image/tiff; application=geotiff; profile=cloud-optimized', roles: ['data'] } } });
const WIN = [105.1, 21.1, 105.2, 21.2];

/* two catalogues: `fast` answers at once; `slow` answers when the test releases it */
function setup(opts) {
  const o = opts || {};
  let release; const gate = new Promise((r) => { release = r; });
  const fetch = async (url) => {
    const u = String(url);
    if (/^https:\/\/fast\.test\/stac\/collections\?/.test(u)) return json({ collections: [dem('fast-dem')], links: [] });
    if (/^https:\/\/slow\.test\/stac\/collections\?/.test(u)) { await gate; return json({ collections: [dem('slow-dem')], links: [] }); }
    if (/\/stac\/collections\/(fast-dem|slow-dem)$/.test(u)) return json(dem(u.split('/').pop()));
    if (/\/stac\/search$/.test(u)) return json({ features: [feature([105, 21, 106, 22])], links: [] });
    if (/^https:\/\/data\.test\//.test(u)) return { ok: true, status: 206, headers: { get: () => 'image/tiff' }, arrayBuffer: async () => new ArrayBuffer(1024), text: async () => '' };
    return { ok: false, status: 404, headers: { get: () => null }, text: async () => 'no', type: 'basic' };
  };
  const P = makeGisPipeline({});
  let n = 0;
  const readGrid = async (href) => {
    const key = 'url:' + href;
    const values = o.allNodata ? new Float32Array([NaN, NaN, NaN, NaN]) : new Float32Array([1, 2, 3, 4]);
    const id = 'ds' + (++n);
    P.readSucceeded(key, { completeness: 'all', reason: 'ok' }, P.inspectRaster(values), id);
    return { ok: true, id: id };
  };
  const M = makeGisRemote({ fetch, pipeline: P, readGrid });
  M.add({ kind: 'stac', id: 'fast', url: 'https://fast.test/stac' });
  M.add({ kind: 'stac', id: 'slow', url: 'https://slow.test/stac' });
  return { M, P, release };
}
const ASK = { q: 'elevation', bbox: WIN, maxGsd: 40, catalogs: ['fast', 'slow'], until: 'ready', width: 8, height: 8 };

test('A1 until:ready returns a read-and-inspected candidate while the slow catalogue is still silent; follow finishes the list with the late one', async () => {
  const { M, release } = setup();
  const r = await M.search(ASK);
  assert.equal(r.ok, true);
  assert.ok(r.early, 'an early result');
  assert.equal(r.early.ref, 'fast/fast-dem'); assert.equal(r.early.state.analysis, 'ready'); assert.ok(r.early.datasets.length >= 1);
  assert.deepEqual(r.stillAsking, ['slow']);
  assert.match(r.note, /EARLY RESULT/);
  release();
  const f = await M.follow(r.follow);
  assert.equal(f.ok, true);
  assert.ok(f.entries.some((e) => e.ref === 'slow/slow-dem'), 'what arrived later is in the finished list');
  assert.ok(f.entries.some((e) => e.ref === 'fast/fast-dem'));
  assert.equal(f.catalogs.every((c) => c.answered), true);
});

test('B1 a candidate that states it covers the window but reads as all-nodata is NOT returned early; the caller gets the finished search', async () => {
  const { M, release } = setup({ allNodata: true });
  const p = M.search(ASK);
  setTimeout(release, 30);
  const r = await p;
  assert.equal(r.ok, true);
  assert.equal(r.early, undefined, 'no early result: values were looked at and were empty');
  assert.ok(r.entries.length >= 2, 'the finished list came back instead');
});

test('C1 without until the search waits for every catalogue (unchanged); until needs a window and a grid size', async () => {
  const { M, release } = setup();
  let done = false;
  const p = M.search({ q: 'elevation', bbox: WIN, catalogs: ['fast', 'slow'] }).then((x) => { done = true; return x; });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(done, false, 'still waiting for the slow catalogue');
  release();
  const r = await p;
  assert.equal(r.early, undefined); assert.equal(r.entries.length, 2);
  assert.equal((await M.search({ q: 'elevation', until: 'ready', width: 8, height: 8 })).why, 'bad-param');
  assert.equal((await M.search({ q: 'elevation', bbox: WIN, until: 'ready' })).why, 'bad-param');
  assert.equal((await M.follow('nope')).why, 'bad-param');
});

test('A2 the door passes until/width/height and follow through, and declares them', () => {
  const atlas = readFileSync(join(ROOT, 'js/gis-atlas.js'), 'utf8');
  assert.match(atlas, /until: a\.until, width: a\.width, height: a\.height/);
  assert.match(atlas, /M\.follow\(handle\)/);
  const door = readFileSync(join(ROOT, 'js/atlas-cap-data.js'), 'utf8');
  assert.match(door, /until: one\('ready'\), follow: str\(\)/);
  assert.ok(makeGisRemote({}).actions().includes('follow'));
});

test('D1 continuation is the reader flag; the reading travels as context, marked as not yet verified', () => {
  assert.equal(wantsContinue({ continueWithTools: true }), true);
  assert.equal(wantsContinue({ continueWithTools: 'yes' }), false, 'only a real true');
  assert.equal(wantsContinue({ answer: 'check elevation against SRTM please' }), false, 'no pattern over the words decides this');
  assert.equal(agentContext({ answer: 'x' }), '');
  const c = agentContext({ continueWithTools: true, contentClass: 'geographic', answer: 'A terraced valley near Sa Pa', places: [{ n: 'Sa Pa', c: 'Vietnam', k: 'town' }], focusPlace: 'Sa Pa', uncertain: ['the ridge name'] });
  assert.match(c, /IMAGE READING/); assert.match(c, /NOT a checked fact/); assert.match(c, /Sa Pa \(Vietnam\)/); assert.match(c, /the ridge name/);
  assert.match(VISION_CONTINUE_RULE, /continueWithTools/);
});

test('D2 the console wires it: the reader may ask, run() continues into the agent loop with the reading and the images, and a plain reading still ends there', () => {
  const src = readFileSync(join(ROOT, 'js/atlas-console.js'), 'utf8');
  assert.match(src, /continueWithTools:d\.continueWithTools===true/);
  assert.match(src, /\+VISION_CONTINUE_RULE/);
  assert.match(src, /_imgCtx=agentContext\(_vd\); _atlRecallImgs=imgs;/);
  assert.match(src, /if\(!\(_vd&&gen===_runGen\)\) return;/, 'no flag, the turn ends at the reader as before');
  assert.match(src, /messages:\[\{role:'user',content:q\+_imgCtx\}\]/);
  assert.match(src, /'\[REQUEST\]\\n'\+q\+\(_imgCtx\|\|''\)/);
});

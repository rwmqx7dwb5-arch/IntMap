/* ============================================================================
 *  STAC · 「この場所・この時期の衛星画像・SAR・LiDAR・標高」 — js/gis-remote.js scenes()
 * ----------------------------------------------------------------------------
 *  THE DEFECTS THIS FILE MEASURES, RESTATED AS DEFECTS:
 *    ① a reader asking for imagery had to know which COLLECTION to ask; the catalogues were asked by name, not by kind
 *      of observation, so 「東京の 2024 年 6 月の SAR」 had no first move;
 *    ② 「画像が無い」 arrived as one empty list for three different facts (no collection states the place / the collections
 *      state it but hold no scene in the period / a catalogue did not answer);
 *    ③ an elevation model was searched by DATE and so reported 「無い」 for a place it covers;
 *    ④ a collection licensed for non-commercial use would have been offered to every visitor;
 *    ⑤ a scene's date, cloud, licence and the address to READ it were not stated together.
 *
 *  ⚠ NOTHING HERE TOUCHES THE NETWORK: a fake `fetch` serves a STAC catalogue, so the verdicts are about this logic. The live
 *  catalogues were measured on 2026-11-24 (dev-notes/2026-11-24-stac-scenes.md).
 * ==========================================================================*/
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeGisRemote } from '../js/gis-remote.js';
import { modalitiesOf, isNonCommercial } from '../js/gis-catalog-search.js';

const json = (o, status) => ({ ok: (status || 200) < 400, status: status || 200, text: async () => JSON.stringify(o) });
const WORLD = { spatial: { bbox: [[-180, -90, 180, 90]] }, temporal: { interval: [['2000-01-01T00:00:00Z', null]] } };
const col = (id, extra) => Object.assign({ id, title: id, description: '', license: 'CC-BY-4.0', keywords: [], extent: WORLD }, extra);

const COLS = [
  col('optical-a', { title: 'Optical A', summaries: { 'eo:bands': [{ name: 'red' }], gsd: [10] }, license: 'proprietary', links: [{ rel: 'license', href: 'https://terms.example/a.pdf' }] }),
  col('radar-a', { title: 'Radar A', summaries: { 'sar:polarizations': [['VV']] } }),
  col('elev-a', { title: 'Global DEM', keywords: ['Elevation', 'DEM'], summaries: { gsd: [30] } }),
  col('lidar-a', { title: 'Lidar point cloud', keywords: ['lidar'] }),
  col('biomass-nc', { title: 'Optical biomass', keywords: ['imagery'], license: 'CC-BY-NC-SA-4.0' }),
  col('weather', { title: 'Weather forecast', keywords: ['weather'] }),
  col('radar-old', { title: 'Radar Old', summaries: { 'sar:polarizations': [['HH']] }, extent: { spatial: WORLD.spatial, temporal: { interval: [['1990-01-01T00:00:00Z', '1995-12-31T00:00:00Z']] } } }),
];

function world(over) {
  const o = over || {};
  const searches = [];
  const feat = (id, collection, pr, bbox) => ({ type: 'Feature', id, collection, bbox: bbox || [139, 35, 140, 36], geometry: null, properties: pr,
    assets: { red: { href: 'https://data.example/' + id + '.tif', type: 'image/tiff; application=geotiff; profile=cloud-optimized' }, meta: { href: 'https://data.example/' + id + '.xml', type: 'application/xml' } } });
  const fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('https://stac.example/collections?')) return json({ collections: o.noCollections ? [] : COLS, links: [] });
    if (u.startsWith('https://down.example/')) throw new Error('connect ECONNREFUSED');
    if (u.startsWith('https://stac.example/search')) {
      const b = JSON.parse(init.body); searches.push(b);
      const c = b.collections[0], inPeriod = !!b.datetime && /^2024-06/.test(b.datetime);
      if (c === 'optical-a') {
        if (b.datetime && !inPeriod) return json({ type: 'FeatureCollection', features: [], links: [] });
        return json({ type: 'FeatureCollection', numberMatched: 2, features: [
          feat('opt-clear', c, { datetime: '2024-06-20T01:00:00Z', 'eo:cloud_cover': 3, gsd: 10, platform: 'sat-1', 's2:nodata_pixel_percentage': 0, 'proj:epsg': 32654 }),
          feat('opt-cloudy', c, { datetime: '2024-06-25T01:00:00Z', 'eo:cloud_cover': 91, gsd: 10, platform: 'sat-1' })], links: [] });
      }
      if (c === 'radar-a') {
        if (b.datetime && !inPeriod) return json({ type: 'FeatureCollection', features: [], links: [] });
        return json({ type: 'FeatureCollection', features: [feat('sar-1', c, { datetime: null, start_datetime: '2024-06-10T20:00:00Z', end_datetime: '2024-06-10T20:00:25Z', 'sar:instrument_mode': 'IW', 'sar:polarizations': ['VV', 'VH'], 'sat:orbit_state': 'descending' })], links: [] });
      }
      if (c === 'elev-a') {
        /* a DEM has ONE epoch: a request that carries the period finds nothing, which is the defect ③ */
        if (b.datetime) return json({ type: 'FeatureCollection', features: [], links: [] });
        return json({ type: 'FeatureCollection', features: [feat('dem-tile', c, { datetime: '2021-04-22T00:00:00Z', gsd: 30 })], links: [] });
      }
      if (c === 'lidar-a') {
        if (o.lidarDown) return json({ message: 'boom' }, 500);
        if (b.datetime) return json({ type: 'FeatureCollection', features: [], links: [] });
        return json({ type: 'FeatureCollection', features: [feat('lid-2018', c, { datetime: '2018-01-01T00:00:00Z' })], links: [] });
      }
      return json({ type: 'FeatureCollection', features: [], links: [] });
    }
    return json({}, 404);
  };
  const rem = makeGisRemote({ fetch });
  rem.add({ id: 'stac-x', kind: 'stac', url: 'https://stac.example' });
  return { rem, searches };
}
const BOX = [139.6, 35.6, 139.8, 35.8];
const ask = (w, req) => w.rem.scenes(Object.assign({ bbox: BOX, catalogs: ['stac-x'] }, req));

describe('what kind of observation a collection holds is read from STAC members', () => {
  test('sar:* summaries, eo:bands, elevation words and lidar words classify; a weather collection is none of them', () => {
    const by = (id) => modalitiesOf(COLS.find((c) => c.id === id));
    assert.deepEqual(by('optical-a'), ['optical']);
    assert.deepEqual(by('radar-a'), ['sar']);
    assert.deepEqual(by('elev-a'), ['dem']);
    assert.deepEqual(by('lidar-a'), ['lidar']);
    assert.deepEqual(by('weather'), []);
  });
  test('a lidar-derived DSM is both a DEM and lidar (a collection can be several kinds)', () => {
    assert.deepEqual(modalitiesOf({ id: '3dep-lidar-dsm', title: '3DEP Lidar Digital Surface Model', keywords: ['USGS', 'DSM'] }), ['dem', 'lidar']);
  });
  test('non-commercial is read from the licence; "proprietary" and open licences are not', () => {
    for (const l of ['CC-BY-NC-SA-4.0', 'CC-BY-NC-4.0', 'non-commercial use only']) assert.equal(isNonCommercial(l), true, l);
    for (const l of ['proprietary', 'CC-BY-4.0', 'CC0-1.0', 'PDDL-1.0', null]) assert.equal(isNonCommercial(l), false, String(l));
  });
});

describe('scenes() answers by kind, with what the catalogue states', () => {
  test('optical: the clear scene carries date, cloud, stated defect share, resolution, platform, licence + link, and a COG ref to read it', async () => {
    const r = await ask(world(), { time: '2024-06', modality: 'optical' });
    assert.equal(r.ok, true);
    const m = r.result.optical;
    assert.equal(m.found, 2);
    assert.equal(m.scenes[0].id, 'opt-cloudy', 'newest first');
    const clear = m.scenes.find((x) => x.id === 'opt-clear');
    assert.equal(clear.cloud, 3); assert.equal(clear.gsd, 10); assert.equal(clear.platform, 'sat-1');
    assert.deepEqual(clear.quality, { 's2:nodata_pixel_percentage': 0 });
    assert.equal(clear.license, 'proprietary'); assert.equal(clear.licenseUrl, 'https://terms.example/a.pdf');
    assert.deepEqual(clear.refs.grids, ['url:https://data.example/opt-clear.tif'], 'a ref the existing COG door reads');
    assert.equal(m.none, null);
  });
  test('maxCloud drops the cloudy scene and says how many', async () => {
    const r = await ask(world(), { time: '2024-06', modality: 'optical', maxCloud: 20 });
    assert.deepEqual(r.result.optical.scenes.map((x) => x.id), ['opt-clear']);
    assert.equal(r.result.optical.collections[0].droppedByCloud, 1);
  });
  test('SAR: a scene dated only by start/end is dated, with mode, polarisation and orbit direction', async () => {
    const r = await ask(world(), { time: '2024-06', modality: 'sar' });
    const s = r.result.sar.scenes[0];
    assert.match(s.datetime, /^2024-06-10T20:00:00Z\/2024-06-10T20:00:25Z$/);
    assert.deepEqual(s.sar, { mode: 'IW', polarizations: ['VV', 'VH'], direction: 'descending' });
  });
  test('a DEM is searched WITHOUT the period (one epoch), and says so', async () => {
    const w = world();
    const r = await ask(w, { time: '2024-06', modality: 'dem' });
    assert.equal(r.result.dem.periodApplied, false);
    assert.equal(r.result.dem.found, 1);
    assert.equal(w.searches.find((b) => b.collections[0] === 'elev-a').datetime, undefined);
  });
  test('the default is all four kinds, one answer each', async () => {
    const r = await ask(world(), { time: '2024-06' });
    assert.deepEqual(Object.keys(r.result), ['optical', 'sar', 'dem', 'lidar']);
  });
});

describe('「無い」 is three different answers, and never the world', () => {
  test('no-collection: no catalogue states that kind of data here — and it says the answer is these catalogues, not the world', async () => {
    const w = world({ noCollections: true });
    const e = await ask(w, { time: '2024-06', modality: 'sar' });
    assert.equal(e.result.sar.none.kind, 'no-collection');
    assert.match(e.result.sar.none.say, /these catalogues, not a statement about the world/);
    assert.equal(e.worldCompleteness, 'unproven');
  });
  test('no-scene: the collection states the place, holds none in the period, and what it holds at other times is listed', async () => {
    const r = await ask(world(), { time: '2019-05', modality: 'lidar' });
    const l = r.result.lidar;
    assert.equal(l.found, 0);
    assert.equal(l.none.kind, 'no-scene');
    assert.deepEqual(l.collections[0].atOtherTimes.datetimes, ['2018-01-01T00:00:00Z']);
  });
  test('not-answered: a collection that errored is 「訊けなかった」, not 「無い」', async () => {
    const r = await ask(world({ lidarDown: true }), { modality: 'lidar' });
    assert.equal(r.result.lidar.none.kind, 'not-answered');
    assert.match(r.result.lidar.none.say, /訊けなかった/);
  });
  test('a catalogue that did not answer at all is listed, and the no-collection answer names it', async () => {
    const w = world(); w.rem.add({ id: 'dead', kind: 'stac', url: 'https://down.example' });
    const r = await w.rem.scenes({ bbox: BOX, modality: 'sar', time: '1980', catalogs: ['stac-x', 'dead'] });
    assert.equal(r.catalogs.find((c) => c.id === 'dead').answered, false);
    assert.match(r.result.sar.none.say, /dead did not answer/);
  });
});

describe('licence and refusals', () => {
  test('a non-commercial collection is listed as excluded with the reason and is never searched', async () => {
    const w = world();
    const r = await ask(w, { modality: 'optical', time: '2024-06' });
    assert.deepEqual(r.excluded.map((x) => x.ref), ['stac-x/biomass-nc']);
    assert.equal(w.searches.some((b) => b.collections[0] === 'biomass-nc'), false);
    assert.equal(r.result.optical.collections.some((c) => c.ref === 'stac-x/biomass-nc'), false);
  });
  test('collections of no kind asked about are counted, not hidden', async () => {
    const r = await ask(world(), { modality: 'dem' });
    assert.equal(r.unclassified, 1, 'the weather collection');
  });
  test('a missing place, an unknown kind and an unknown catalogue are refused with the reason', async () => {
    const w = world();
    assert.equal((await w.rem.scenes({})).why, 'bad-param');
    assert.equal((await ask(w, { modality: 'thermal' })).why, 'bad-param');
    assert.equal((await w.rem.scenes({ bbox: BOX, catalogs: ['nope'] })).why, 'catalog-unknown');
  });
  test('the door action list carries scenes', () => {
    assert.ok(world().rem.actions().includes('scenes'));
  });
});

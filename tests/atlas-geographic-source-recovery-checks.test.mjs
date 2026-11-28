import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { browse, parseHtml, snapshotOf } from '../supabase/functions/_shared/web-browse.js';
import { makeGisCrs } from '../js/gis-crs.js';
import { mapRegistration, legendPixels } from '../js/gis-map-registration.js';
import { resolveMapSource, mapSourceReason } from '../js/gis-map-source.js';

const map = { width: 101, height: 83 };
const from = ([x, y]) => [21 + 0.017*x + 0.004*y, 49 + 0.003*x - 0.014*y];
const tie = (pixel, ground = from(pixel)) => ({ pixel, ground });
const control = [[0, 0], [100, 0], [0, 80], [100, 80]].map((p) => tie(p));

test('finds declared geometry routes, a source map, and a tile template on an unfamiliar portal', () => {
  const page = parseHtml(`<html><head><base href="/releases/2026/">
    <link rel="alternate" href="exports/unnamed" type="application/geo+json">
    <script type="application/json">{"source":{"tiles":["https://tiles.example.org/base/{z}/{x}/{y}.pbf"],
      "areas":"/portal/rest/services/theme/FeatureServer/7","ogc":"./collections/forest",
      "private":"http://127.0.0.1/private.geojson"}}</script>
    </head><body><object data="appendix/map.pdf" type="application/pdf"></object>
    <a href="/ows?request=GetCapabilities&amp;service=WFS">Download via OGC</a>
    <img src="/pictures/atlas.svg" alt="Survey plate">
    <!-- <img src="https://discard.example.org/dropped.png"> -->
    </body></html>`, 'https://data.example.org/home');
  const s = snapshotOf(page);
  assert.deepEqual(s.assets.map(({ kind }) => kind).sort(), ['arcgis-rest', 'geojson', 'ogc-collections', 'pdf', 'svg', 'tile-template', 'wfs']);
  assert.equal(s.assets.find((v) => v.kind === 'geojson').href, 'https://data.example.org/releases/2026/exports/unnamed');
  assert.equal(s.assets.find((v) => v.kind === 'arcgis-rest').via, 'inline-config');
  assert.equal(s.assets.find((v) => v.kind === 'svg').text, 'Survey plate');
  assert.ok(!s.assets.some((v) => /127\.0\.0\.1|discard/.test(v.href)));
});

test('scans a declared external bundle without running it and grounds relative literals at the document', async () => {
  const documentUrl = 'https://ocean.example.org/releases/survey/';
  const scriptUrl = 'https://cdn.example.org/maps/external.mjs';
  const page = snapshotOf(parseHtml('<script src="' + scriptUrl + '"></script>', documentUrl));
  assert.deepEqual(page.scripts, [scriptUrl]);
  let calls = 0;
  const result = await browse({ action: 'open', url: page.scripts[0], assetContext: documentUrl }, {
    resolvesPublic: async () => true,
    fetch: async (u) => {
      assert.equal(String(u), scriptUrl);
      calls++;
      return new Response(String.raw`const data = "./range-index.json";
        const link = "\u002fdownloads/\u00e9tendue.geojson"; throw new Error("This must never run");`,
      { headers: { 'content-type': 'text/javascript' } });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.deepEqual(result.page.assets.map(({ href, via }) => [href, via]), [
    ['https://ocean.example.org/releases/survey/range-index.json', 'script-literal'],
    ['https://ocean.example.org/downloads/%C3%A9tendue.geojson', 'script-literal'],
  ]);
});

test('an affine fit uses real control, independent check error, and a named acceptance threshold', () => {
  const crs = makeGisCrs();
  const model = mapRegistration(crs, map, { control, check: [tie([31, 29])], maxErrorM: 0.001 });
  assert.equal(model.ok, true);
  assert.ok(model.quality.independent.rmseM < 1e-6);
  assert.equal(model.quality.accepted, true);
  assert.deepEqual(model.calibrationBounds, [0, 0, 100, 80]);
  assert.ok(model.locate([77, 18]).every((v, i) => Math.abs(v - from([77, 18])[i]) < 1e-10));
  assert.equal(mapRegistration(crs, map, { control, maxErrorM: 10 }).why, 'map-independent-check-required');
  assert.equal(mapRegistration(crs, map, { control, check: [tie([0, 0])] }).why, 'map-duplicate-control-point');
  assert.equal(mapRegistration(crs, map, { control: [[0, 0], [4, 4], [8, 8]].map((p) => tie(p)) }).why, 'map-control-degenerate');
  const bad = mapRegistration(crs, map, { control, check: [tie([31, 29], [21, 47])], maxErrorM: 100 });
  assert.equal(bad.why, 'map-positional-tolerance-exceeded');
  assert.ok(bad.detail.independent.maxM > 100_000);
});

test('colour classification counts the holes in evidence without assigning transparent or tied pixels', () => {
  const source = new Uint8ClampedArray([
    1, 0, 0, 255, 10, 0, 0, 255, 20, 0, 0, 255, 0, 0, 0, 0, 100, 0, 0, 255,
  ]);
  const legend = [{ label: 'a', color: '#000000', tolerance: 10 }, { label: 'b', color: '#140000', tolerance: 10 }];
  const r = legendPixels({ width: 5, height: 1, data: source }, legend);
  assert.deepEqual([...r.values], [1, 0, 2, 0, 0]);
  assert.deepEqual(r.counts, { classes: [{ label: 'a', pixels: 1 }, { label: 'b', pixels: 1 }],
    unmatched: 1, ambiguous: 1, transparent: 1 });
  assert.equal(legendPixels({ width: 5, height: 1, data: source }, legend, [0, 0, 6, 1]).why, 'map-invalid-crop');
});

test('concurrent inspection and subsequent extraction use one copy of the actual download', async () => {
  const file = new File(['<svg/>'], 'sealed-map.svg', { type: 'image/svg+xml' });
  const url = 'https://data.example.org/unfamiliar/sealed-map.svg';
  let downloads = 0;
  const settings = { download: async () => {
    downloads++;
    return { ok: true, file, meta: { url, name: file.name, type: file.type, sha256: 'sealed-hash' } };
  } };
  const a = resolveMapSource({ action: 'inspect' }, { url }, settings);
  const b = resolveMapSource({ action: 'inspect' }, { url }, settings);
  const [first, second] = await Promise.all([a, b]);
  assert.equal(first.id, second.id);
  assert.equal((await resolveMapSource({ action: 'extract', source: first.id }, {}, settings)).file, file);
  assert.equal(downloads, 1);
});

test('every map-specific refusal has English and Japanese text in the Atlas reader', () => {
  const paths = ['gis-map-source.js', 'gis-map-registration.js'];
  for (const name of paths) {
    const source = readFileSync(new URL('../js/' + name, import.meta.url), 'utf8');
    for (const [, code] of source.matchAll(/fail\(\s*['"](map-[a-z-]+)['"]/g)) {
      const en = mapSourceReason(code, (en) => en);
      const jp = mapSourceReason(code, (_, jp) => jp);
      assert.ok(en && !en.includes(code), code + ' missing English wording');
      assert.ok(jp && !jp.includes(code) && /[\p{Script=Han}\p{Script=Hiragana}]/u.test(jp), code + ' missing Japanese wording');
    }
  }
});

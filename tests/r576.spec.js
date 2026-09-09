// R576 · the formats the map could not read before, driven in a REAL browser.
//
// ⚠ THIS FILE EXISTS BECAUSE Node HAS NO DOMParser. KML, KMZ and GPX are parsed with the browser's
// own XML parser, and handing tests/r576-checks.test.mjs a substitute would be the #R552 mistake
// exactly — a fixture more capable than the thing that ships cannot detect that the shipped thing
// is broken. So the pure-text formats are proved in Node and these are proved here, by dropping a
// real File on the real #map-container and looking at what ends up on the map.
//
// ⚠ AND IT LOOKS AT THE MAP, NOT AT THE MODULE. #R552: "モジュールを走らせた" is not "アプリを走らせた".
// Every assertion below reads the renderer's own sources and the panel's own list.
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';
import { zip } from './helpers/zip.mjs';

const CRITICAL = ['GeoJSONUpload', 'IntMapGeoEngine'];
test.describe.configure({ mode: 'serial' });

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
 <Document><name>Ports</name>
  <Folder><name>West</name>
   <Placemark><name>Ube</name><description><![CDATA[a <b>port</b><img src=x onerror=alert(1)>]]></description>
    <ExtendedData><Data name="berths"><value>12</value></Data></ExtendedData>
    <Point><coordinates>131.2470,33.9410,0</coordinates></Point></Placemark>
   <Placemark><name>Approach</name>
    <LineString><coordinates>131.20,33.90 131.25,33.94 131.30,33.98</coordinates></LineString></Placemark>
  </Folder>
  <Placemark><name>Basin</name>
   <Polygon><outerBoundaryIs><LinearRing><coordinates>
     131.20,33.90 131.30,33.90 131.30,34.00 131.20,34.00 131.20,33.90
   </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
 </Document></kml>`;

const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
 <wpt lat="35.6812" lon="139.7671"><name>Start</name><ele>3.2</ele></wpt>
 <trk><name>Morning run</name><trkseg>
  <trkpt lat="35.6812" lon="139.7671"/><trkpt lat="35.6850" lon="139.7700"/><trkpt lat="35.6900" lon="139.7750"/>
 </trkseg></trk>
</gpx>`;

let page, diag;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(context);
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction((g) => g.every((k) => typeof window[k] !== 'undefined'), CRITICAL, { timeout: 45_000 });
  await page.waitForTimeout(800);
});
test.afterAll(async () => { await page?.context()?.close(); });

/* Drop `bytes` on the map the way a person does, then report what the RENDERER holds afterwards.
   ⚠ Everything here goes through window.IntMapGeoEngine — the app's own contract (#R178) — so this
   measures what is on the map, not what a module returned. */
async function drop(name, bytes) {
  return page.evaluate(async ({ name, bytes }) => {
    const items = () => (window.GeoJSONUpload._items || []).length;
    const before = items();
    const mc = document.getElementById('map-container');
    if (!mc) return { err: 'no #map-container' };
    /* ⚠ WAIT FOR THE OUTCOME, EITHER OUTCOME. Both paths end at the app's own toast (#ai-toast),
       so polling only for "a layer appeared" makes every REFUSAL case pay the full timeout — which
       is how ⑤ alone was costing 7.6 s of the suite's budget. Watching the toast as well means a
       refusal is observed the moment it happens, and the toast is what ④ and ⑤ read anyway. */
    const toastEl = () => document.getElementById('ai-toast');
    const toast0 = (toastEl() && toastEl().textContent) || '';
    const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(bytes)], name));
    const ev = new DragEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    mc.dispatchEvent(ev);
    let toast = toast0;
    for (let i = 0; i < 100; i++) {
      toast = (toastEl() && toastEl().textContent) || '';
      if (items() > before || toast !== toast0) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    /* ⚠ NO SETTLE LOOP WHEN THE TOAST ALREADY SPOKE. addFC() pushes the item and THEN toasts,
       synchronously, so a changed toast means the count is already final — and waiting a further
       second for a layer that a refusal will never add was a second of the shared budget spent on
       something that cannot happen. The short grace below is only for the other exit. */
    for (let i = 0; i < 6 && items() === before && toast === toast0; i++) await new Promise((r) => setTimeout(r, 50));
    if (items() <= before) return { added: 0, toast: toast };
    const it = (window.GeoJSONUpload._items || [])[items() - 1], GE = window.IntMapGeoEngine;
    return {
      added: items() - before,
      label: it.name,
      toast: toast,
      hasSource: !!GE.layers.hasSource(it.sid),
      layers: ['-fill', '-line', '-pt'].filter((sfx) => GE.layers.has(it.sid + sfx)).length,
    };
  }, { name, bytes: Array.from(bytes) });
}

/* What the renderer's source for the most recently added layer actually contains. */
async function contentsOfLast() {
  return page.evaluate(() => {
    const items = window.GeoJSONUpload._items || [];
    const it = items[items.length - 1];
    if (!it) return null;
    const d = window.IntMapGeoEngine.layers.sourceData(it.sid);
    if (!d || !Array.isArray(d.features)) return { unreadable: true };
    return {
      count: d.features.length,
      types: [...new Set(d.features.map((f) => f.geometry && f.geometry.type))].sort(),
      props: d.features[0].properties,
    };
  });
}

test('①: a KML lands on the map as points, lines and areas with its ExtendedData intact', async () => {
  const r = await drop('ports.kml', Buffer.from(KML, 'utf8'));
  expect(r.err).toBeUndefined();
  expect(r.added, 'the KML produced a layer').toBe(1);
  expect(r.hasSource).toBe(true);
  expect(r.layers).toBe(3);                       // fill + line + circle, as the GeoJSON path always did
  expect(r.label).toBe('ports.kml');
  const t = await contentsOfLast();
  expect(t && t.unreadable, 'the source is readable through the engine contract').toBeFalsy();
  expect(t, 'the renderer holds the parsed features').not.toBeNull();
  expect(t.count).toBe(3);
  expect(t.types).toEqual(['LineString', 'Point', 'Polygon']);
  // <name>, <description> and <ExtendedData><Data name="berths"> all survive as properties
  expect(t.props.name).toBe('Ube');
  // ⚠ A KML <description> IS HTML BY SPEC. It arrives as the balloon's markup — here with an
  // onerror payload — and is stored as TEXT, so no sink can be handed hostile HTML by a file.
  expect(t.props.description).toBe('a port');
  expect(t.props.description).not.toMatch(/[<>]/);
  expect(t.props.berths).toBe('12');
});

test('②: a GPX becomes a waypoint and a track line, named from the <trk>', async () => {
  const r = await drop('run.gpx', Buffer.from(GPX, 'utf8'));
  expect(r.added).toBe(1);
  const t = await contentsOfLast();
  expect(t && t.unreadable, 'the source is readable through the engine contract').toBeFalsy();
  expect(t.count).toBe(2);
  expect(t.types).toEqual(['LineString', 'Point']);
});

test('③: a KMZ is opened and the layer says which entry inside it was read', async () => {
  // ⚠ A REAL ARCHIVE (tests/helpers/zip.mjs) — the browser walks an actual central directory.
  const kmz = zip([['doc.kml', Buffer.from(KML, 'utf8')], ['files/icon.png', Buffer.from([0x89, 0x50, 0x4E, 0x47])]]);
  const r = await drop('ports.kmz', kmz);
  expect(r.added).toBe(1);
  // the label names the archive AND the entry, so the reader knows where the shapes came from
  expect(r.label).toBe('ports.kmz › doc.kml');
  const t = await contentsOfLast();
  expect(t && t.unreadable, 'the source is readable through the engine contract').toBeFalsy();
  expect(t.count).toBe(3);
});

test('④: a CSV dropped on the map becomes pins, and the toast names the columns it chose', async () => {
  const csv = 'port,lat,lon\nUbe,33.9410,131.2470\nTokuyama,34.0400,131.8000\nIwakuni,34.1600,132.2300\nHiroshima,34.3500,132.4500\n';
  const r = await drop('ports.csv', Buffer.from(csv, 'utf8'));
  expect(r.added).toBe(1);
  const t = await contentsOfLast();
  expect(t && t.unreadable, 'the source is readable through the engine contract').toBeFalsy();
  expect(t.count).toBe(4);
  expect(t.types).toEqual(['Point']);
  expect(t.props.port).toBe('Ube');
  // ⚠ THE READER IS TOLD WHICH COLUMNS WERE CHOSEN — the pins are only as right as that guess.
  expect(r.toast).toMatch(/lat/);
  expect(r.toast).toMatch(/lon/);
});

test('⑤: a file it cannot read is refused BY NAME, and nothing is added to the map', async () => {
  const shp = zip([['ports.shp', Buffer.from([0, 0, 39, 10])], ['ports.dbf', Buffer.from([3, 0])]]);
  const before = await page.evaluate(() => (window.GeoJSONUpload._items || []).length);
  const r = await drop('ports.zip', shp);
  const after = await page.evaluate(() => (window.GeoJSONUpload._items || []).length);
  expect(after, 'a refused file adds no layer').toBe(before);
  // ⚠ "not valid GeoJSON" was this map's answer to a zipped Shapefile for the life of the feature.
  expect(r.toast, 'the refusal names the format').toMatch(/Shapefile/);
});

test('⑥: the import button is mounted and no longer names one format', async () => {
  const b = await page.evaluate(() => {
    try { document.getElementById('layer-btn')?.click?.(); } catch (_) { /* ignore */ }
    const el = document.getElementById('btn-upload-geojson');
    const span = el && el.querySelector('[data-i18n]');
    return el ? { key: span && span.getAttribute('data-i18n'), text: (el.textContent || '').trim() } : null;
  });
  expect(b, 'the button still exists').not.toBeNull();
  expect(b.key).toBe('importGeoFile');
  expect(b.text).not.toMatch(/GeoJSON/);
});

test('no uncaught page errors during R576 interactions', () => {
  expect(diag.pageErrors, 'pageErrors: ' + JSON.stringify(diag.pageErrors)).toEqual([]);
});

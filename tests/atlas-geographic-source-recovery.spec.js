import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80" viewBox="0 0 100 80">
<path fill="#35a870" fill-rule="evenodd" d="M 10 10 H 80 V 60 H 10 Z M 30 30 H 50 V 40 H 30 Z"/>
<g transform="translate(2 3)"><path id="survey-trace" fill="none" stroke="#5500ff" d="M 15 62 H 30 L 70 68"/></g>
</svg>`;

function vectorPdf() {
  const commands = '0.2 0.4 0.6 RG\n2 w\n10 10 m\n30 30 50 55 80 70 c\nS\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 80] /Resources <<>> /Contents 4 0 R >>',
    '<< /Length ' + commands.length + ' >>\nstream\n' + commands + 'endstream',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(out.length); out += (i+1) + ' 0 obj\n' + object + '\nendobj\n'; });
  const xref = out.length;
  return out + 'xref\n0 ' + offsets.length + '\n0000000000 65535 f \n' +
    offsets.slice(1).map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('') +
    'trailer\n<< /Root 1 0 R /Size ' + offsets.length + ' >>\nstartxref\n' + xref + '\n%%EOF\n';
}

test('Atlas imports an unseen SVG and PDF from public file refs and chains georeferenced results by dataset id', async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(context);
  await context.addInitScript(() => {
    localStorage.setItem('sb-vpekfwdpurzejrrmacac-auth-token', JSON.stringify({
      access_token: 'hermetic.test.token', token_type: 'bearer', expires_in: 86400,
      expires_at: Math.floor(Date.now()/1000) + 86400, refresh_token: 'hermetic-map-refresh',
      user: { id: '00000000-0000-4000-8000-0000000005e1', aud: 'authenticated', role: 'authenticated',
        email: 'reader@example.invalid', app_metadata: { provider: 'google' }, user_metadata: {},
        created_at: new Date().toISOString() },
    }));
  });
  const calls = [];
  let png;
  await context.exposeBinding('__provideMapRaster', (_, bytes) => { png = Buffer.from(bytes, 'base64'); });
  await context.route('**/functions/v1/web-browse', async (route) => {
    const req = route.request().postDataJSON();
    calls.push(req.url);
    const isPdf = req.url.endsWith('.pdf');
    const isPng = req.url.endsWith('.png');
    const bytes = isPng ? png : Buffer.from(isPdf ? vectorPdf() : svg);
    await route.fulfill({ json: { ok: true, file: { name: new URL(req.url).pathname.split('/').at(-1),
      type: isPng ? 'image/png' : isPdf ? 'application/pdf' : 'image/svg+xml', url: req.url, bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'), b64: bytes.toString('base64') } } });
  });
  try {
    const page = await context.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.IntMapAtlas, null, { timeout: 45_000 });
    await page.evaluate(() => window.IntMapAtlas.ensure());
    const evidence = await page.evaluate(async () => {
      const gis = async () => { await window.IntMapLazy.need('gisCore'); return window.IntMapGis; };
      const fetchFile = (a) => window.IntMapConsole.dispatch({ type: 'fetchFile', ...a });
      const areaUrl = 'https://public.example.org/editions/survey.svg', pdfUrl = 'https://public.example.org/assets/plate.pdf';
      const read = async (url) => {
        const r = await fetchFile({ url, mapSource: { action: 'inspect' } });
        if (!r?.ok || !r.exec?.mapSource) throw new Error(JSON.stringify(r));
        return r.exec.mapSource;
      };
      const area = await read(areaUrl);
      const G = await gis();
      const ground = ([x, y]) => [17 + x / 100, 42 - y / 100];
      const tie = (pixel) => ({ pixel, ground: ground(pixel) });
      const ring = (l, t, r, b) => [[l,t], [r,t], [r,b], [l,b], [l,t]].map(ground);
      const reference = G.data.add({ title: 'independently stated test boundary', features: [{
        type: 'Feature', properties: { featureClass: 'woodland' },
        geometry: { type: 'Polygon', coordinates: [ring(10,10,80,60), ring(30,30,50,40)] },
      }] });
      const georef = { control: [[0,0], [100,0], [0,80], [100,80]].map(tie), check: [tie([43,29])], maxErrorM: 0.001 };
      const extract = (record, extra) => fetchFile({ mapSource: { action: 'extract', source: record.source.id, ...georef, ...extra } });
      const a = await extract(area, { legend: [{ label: 'woodland', color: '#35a870' }], reference: { dataset: reference.id, field: 'featureClass' }, crop: [0, 0, 100, 61], period: { start: '1980', end: '1985' } });
      const l = await extract(area, { method: 'linework', legend: [{ label: 'survey', elementIds: ['survey-trace'] }] });
      const pdf = await read(pdfUrl);
      const p = await extract(pdf, { method: 'linework', legend: [{ label: 'river', color: '#336699' }] });
      const canvas = document.createElement('canvas');
      canvas.width = 100; canvas.height = 80;
      const context = canvas.getContext('2d');
      context.fillStyle = '#442290';
      context.fillRect(25, 20, 40, 30);
      context.fillRect(90, 70, 5, 5);
      const png = canvas.toDataURL('image/png').split(',')[1];
      // Hand the normal file relay a third, independently generated document.
      const rasterUrl = 'https://public.example.org/assets/archive.png';
      await window.__provideMapRaster(png);
      const raster = await read(rasterUrl);
      const z = await extract(raster, { legend: [{ label: 'marsh', swatch: [92, 72] }], crop: [0, 0, 85, 60] });
      const featuresOf = (r) => G.data.get(r.exec?.mapSource?.dataset?.id)?.features();
      const measured = a.ok ? await G.atlas.run({ op: 'measure', inputs: [a.exec.mapSource.dataset.id], params: { what: 'area' } }) : null;
      return { area, pdf, a, l, p, z, rasterFeatures: featuresOf(z), areaFeatures: featuresOf(a), svgLines: featuresOf(l), pdfLines: featuresOf(p),
        measurement: measured?.ok };
    });
    expect(evidence.area.size).toMatchObject({ width: 100, height: 80, origin: 'top-left' });
    expect(evidence.area.preview.frame).toBeTruthy();
    expect(evidence.a.ok, JSON.stringify(evidence.a)).toBe(true);
    expect(evidence.areaFeatures[0].geometry.coordinates).toHaveLength(2);
    expect(evidence.a.exec.mapSource.quality.reference.results[0].iou).toBeCloseTo(1, 7);
    expect(evidence.a.exec.mapSource.quality.positional.independent.rmseM).toBeLessThan(0.001);
    expect(evidence.a.exec.mapSource.dataset.time.kind).toBe('constant');
    expect(evidence.a.exec.mapSource.dataset.provenance.sourceSha256).toBe(evidence.area.source.sha256);
    expect(evidence.measurement).toBe(true);
    expect(evidence.l.ok, JSON.stringify(evidence.l)).toBe(true);
    expect(evidence.svgLines[0].geometry.coordinates[0][0]).toBeCloseTo(17.17);
    expect(evidence.svgLines[0].geometry.coordinates[0][1]).toBeCloseTo(41.35);
    expect(evidence.p.ok, JSON.stringify(evidence.p)).toBe(true);
    expect(evidence.pdfLines[0].geometry.coordinates.length).toBeGreaterThan(2);
    expect(evidence.pdfLines[0].geometry.coordinates[0][0]).toBeCloseTo(17.10);
    expect(evidence.pdfLines[0].geometry.coordinates.at(-1)[1]).toBeCloseTo(41.90);
    expect(evidence.z.ok, JSON.stringify(evidence.z)).toBe(true);
    expect(evidence.z.exec.mapSource.quality.extraction.classes).toEqual([{ label: 'marsh', pixels: 1200 }]);
    expect(evidence.rasterFeatures[0].properties).toMatchObject({ class: 'marsh', sourcePixels: 1200, color: '#442290' });
    expect(calls).toHaveLength(3);
  } finally { await context.close(); }
});

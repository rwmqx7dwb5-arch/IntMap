/* Atlas's document-map input. The browser decodes or renders public bytes
 * locally. The GIS registry receives only georeferenced, validated features. */
import { mapRegistration, legendPixels, traceMapPixels, placeMapShapes, compareMapAreas } from './gis-map-registration.js';
import { pdfLinework, svgLinework } from './gis-map-linework.js';

const MAX_SIDE = 2048; // Four million RGBA cells fit in 16 MiB. Report the actual sampling size.
const MAX_BYTES = 8 * 1024 * 1024; // Existing attachment PDF size order, and above the public relay's 6 MiB.
const MIME = Object.freeze({ svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', bmp: 'image/bmp', pdf: 'application/pdf' });
const fail = (why, detail) => ({ ok: false, why, ...(detail && { detail }) });
const uploads = new Map();
const inFlight = new Map();
let bytesHeld = 0;
const MAX_HELD_BYTES = 32 * 1024 * 1024; // Unregistered download bytes held for reuse in this page only.

export function readableMapType(file) {
  const type = file.type?.split(';')[0].trim().toLowerCase();
  if (Object.values(MIME).includes(type)) return type;
  const ext = String(file.name || '').split('.').at(-1).toLowerCase();
  return Object.hasOwn(MIME, ext) ? MIME[ext] : '';
}

export function rememberMapSource(record, key) {
  const { file, meta } = record;
  const type = readableMapType(file);
  if (!type || file.size > MAX_BYTES) return null;
  const id = meta.sha256 ? 'map-source:' + meta.sha256 + ':' + meta.url : 'map-source:' + meta.url;
  if (!uploads.has(id)) {
    uploads.set(id, { ...record, id, key, retrievedAt: new Date().toISOString() });
    bytesHeld += file.size;
    while (bytesHeld > MAX_HELD_BYTES) {
      const old = uploads.keys().next().value;
      bytesHeld -= uploads.get(old).file.size;
      uploads.delete(old);
    }
  }
  return id;
}

function decodeBase64(s) {
  const binary = atob(s);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function localFile(record) {
  if (!record) return null;
  if (record.kind === 'doc' && record.mime === MIME.pdf) {
    const bytes = decodeBase64(record.b64);
    return new File([bytes], record.name, { type: MIME.pdf });
  }
  if (record.kind === 'text' && record.name.toLowerCase().endsWith('.svg') && !record.truncated) {
    return new File([record.text], record.name, { type: MIME.svg });
  }
  if (record.kind === 'image' && record.dataUrl?.startsWith('data:image/')) {
    const [head, body] = record.dataUrl.split(',', 2);
    if (!head.endsWith(';base64')) return null;
    const bytes = decodeBase64(body);
    return new File([bytes], record.name, { type: head.slice(5, -7) });
  }
  return null;
}

export async function resolveMapSource(spec, args, settings) {
  if ([spec.attachment, spec.source, args.ref, args.url].filter(Boolean).length !== 1) return fail('map-source-choice-required');
  if (spec.attachment) {
    const attachment = settings.attachment(spec.attachment);
    const file = localFile(attachment);
    return file ? { ok: true, file, meta: { name: file.name, type: file.type, bytes: file.size, attachment: attachment.name,
      representation: attachment.kind === 'image' ? 'conversation-image' : attachment.kind === 'text' ? 'decoded-text' : 'original-bytes' } }
      : fail('map-attachment-unavailable');
  }
  if (spec.source) return uploads.get(spec.source) || fail('map-source-unavailable');
  const key = args.ref || args.url;
  if (!key) return fail('map-source-required');
  const reusable = args.url || String(args.ref || '').includes('@');
  const old = reusable && [...uploads.values()].find((v) => v.key === key || v.meta.url === key);
  if (old) return old;
  const underway = reusable && inFlight.get(key);
  if (underway) return underway;
  const acquire = (async () => {
    const d = await settings.download();
    if (!d?.ok) return d || fail('upstream_unreachable');
    const id = rememberMapSource(d, key);
    return id ? uploads.get(id) : d;
  })();
  if (!reusable) return acquire;
  inFlight.set(key, acquire);
  try { return await acquire; } finally { inFlight.delete(key); }
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
const scaleFor = (w, h) => Math.min(1, MAX_SIDE / Math.max(w, h));
function context(c) { return c.getContext('2d', { willReadFrequently: true }); }

async function withPdf(file, spec, signal, consume) {
  const [{ getDocument, GlobalWorkerOptions, OPS, AnnotationMode }, { default: workerUrl }] = await Promise.all([
    import('pdfjs-dist/build/pdf.mjs'), import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = workerUrl;
  const get = getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useWasm: false,
    useWorkerFetch: false, disableFontFace: true, maxImageSize: MAX_SIDE**2, stopAtErrors: true });
  try {
    const pdf = await get.promise;
    const number = spec.page ?? 1;
    if (!Number.isInteger(number) || number < 1 || number > pdf.numPages) return fail('map-page-out-of-range', { pages: pdf.numPages });
    const page = await pdf.getPage(number);
    const initial = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: scaleFor(initial.width, initial.height) });
    const c = canvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    if (spec.action === 'inspect' || spec.method !== 'linework') {
      const task = page.render({ canvas: c, canvasContext: context(c), viewport, annotationMode: AnnotationMode.DISABLE });
      const cancel = () => task.cancel();
      signal?.addEventListener('abort', cancel, { once: true });
      try { if (signal?.aborted) cancel(); await task.promise; }
      finally { signal?.removeEventListener('abort', cancel); }
    }
    return await consume(c, { page: number, pages: pdf.numPages, nativeWidth: initial.width, nativeHeight: initial.height },
      async (legend) => {
        const list = await page.getOperatorList({ annotationMode: AnnotationMode.DISABLE });
        if (legend) return pdfLinework(list, OPS, viewport, legend);
        const strokes = new Set(['#000000']);
        list.fnArray.forEach((op, i) => {
          const color = list.argsArray[i]?.[0];
          if (op === OPS.setStrokeRGBColor && /^#[0-9a-f]{6}$/i.test(color || '')) strokes.add(color);
        });
        return { strokeColors: [...strokes].slice(0, 32), omitted: Math.max(0, strokes.size - 32) };
      });
  } finally { await get.destroy(); }
}

async function withImage(file, type, spec, consume) {
  if (spec.page != null && spec.page !== 1) return fail('map-page-out-of-range', { pages: 1 });
  const img = new Image();
  const objectUrl = URL.createObjectURL(file.slice(0, file.size, type));
  let c;
  try {
    img.src = objectUrl;
    await img.decode();
    const { naturalWidth, naturalHeight } = img;
    if (!naturalWidth || !naturalHeight) return fail('map-empty-image');
    const scale = scaleFor(naturalWidth, naturalHeight);
    c = canvas(Math.max(1, Math.round(naturalWidth*scale)), Math.max(1, Math.round(naturalHeight*scale)));
    context(c).drawImage(img, 0, 0, c.width, c.height);
    const size = { page: 1, pages: 1, nativeWidth: naturalWidth, nativeHeight: naturalHeight };
    return await consume(c, size, type === MIME.svg ? async (legend) => {
      const doc = new DOMParser().parseFromString(await file.text(), 'image/svg+xml');
      if (doc.documentElement.namespaceURI !== 'http://www.w3.org/2000/svg' || doc.documentElement.localName !== 'svg') return null;
      if (!legend) {
        const ids = [...doc.querySelectorAll('line[id], polygon[id], polyline[id], path[id]')].map((node) => node.id);
        return { elementIds: ids.slice(0, 32), omitted: Math.max(0, ids.length - 32) };
      }
      return svgLinework(doc.documentElement, { ...size, width: c.width, height: c.height }, legend);
    } : null);
  } finally { URL.revokeObjectURL(objectUrl); }
}

function preview(c, show, url) {
  if (!show) return null;
  // The vision preview can be smaller. Report both dimensions so control
  // points can be scaled back into the exact extraction viewport.
  const scale = Math.min(1, 1024 / Math.max(c.width, c.height));
  const p = canvas(Math.max(1, Math.round(c.width*scale)), Math.max(1, Math.round(c.height*scale)));
  context(p).drawImage(c, 0, 0, p.width, p.height);
  return { frame: show(p.toDataURL('image/png'), { url, viewport: p.width + 'x' + p.height }), width: p.width, height: p.height };
}

export async function processMapSource(record, spec, { signal, show, getGIS }) {
  const { file, meta } = record;
  const type = readableMapType(file);
  if (!type) return fail('map-format-unsupported');
  if (file.size > MAX_BYTES) return fail('map-file-too-large', { maxBytes: MAX_BYTES });
  if (signal?.aborted) return fail('cancelled');
  const source = { ...meta, ...(record.id && { id: record.id }), mediaType: type, retrievedAt: record.retrievedAt || null };
  if (!source.sha256 && globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    source.sha256 = [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('');
  }
  const consume = async (c, info, readLinework) => {
    const size = { ...info, width: c.width, height: c.height, origin: 'top-left', units: 'pixels' };
    if (spec.action === 'inspect') {
      return { ok: true, source, size, methods: readLinework ? ['palette', 'linework'] : ['palette'],
        preview: preview(c, show, meta.url), vectorSelectors: readLinework ? await readLinework() : null };
    }
    const gis = await getGIS();
    if (!gis) return fail('map-gis-unavailable');
    if (spec.crs && !gis.crs.isWgs84(spec.crs)) await gis.crs.ready();
    const fit = mapRegistration(gis.crs, size, spec);
    if (!fit.ok) return fit;
    const recipe = { page: size.page, viewport: size, crop: spec.crop ?? null, legend: spec.legend,
      control: spec.control, check: spec.check || [], transform: fit.transform };
    let shapes, extraction;
    if (spec.method === 'linework') {
      if (!readLinework || spec.crop || spec.reference) return fail('map-linework-input-unsupported');
      const valid = Array.isArray(spec.legend) && spec.legend.length && spec.legend.every((l) =>
        typeof l.label === 'string' && l.label.trim()
        && (type === MIME.svg ? Array.isArray(l.elementIds) && l.elementIds.length : /^#[0-9a-f]{6}$/i.test(l.color || '')));
      if (!valid) return fail('map-linework-selector-required');
      const r = await readLinework(spec.legend);
      if (!r) return fail('map-vector-unreadable');
      ({ shapes } = r);
      extraction = { method: 'vector_extraction', selected: shapes.length, skipped: r.skipped,
        selection: type === MIME.svg ? 'svg-element-id' : 'pdf-stroke-color' };
    } else {
      const image = context(c).getImageData(0, 0, c.width, c.height);
      const mask = legendPixels(image, spec.legend, spec.crop);
      if (!mask.ok) return mask;
      const r = await traceMapPixels(gis.raster, mask, signal);
      if (!r.ok) return r;
      ({ shapes } = r);
      recipe.legend = mask.legend;
      extraction = { method: 'raster_digitization', ...mask.counts, selected: shapes.length };
    }
    if (signal?.aborted) return fail('cancelled');
    const placed = placeMapShapes(gis.geometry, fit, shapes, recipe.legend);
    const quality = { positional: { ...fit.quality, controlEnvelope: fit.calibrationHull }, extraction, geometry: placed.validation, coverageStatus: 'unknown', reference: null };
    if (!placed.features.length) return fail('map-no-verified-geometry', quality);
    const datasetReads = [];
    if (spec.reference) {
      const reference = gis.data.get(spec.reference.dataset);
      if (!reference) return fail('map-reference-not-found');
      await gis.geometry.ready();
      const compared = compareMapAreas(gis, placed.features, reference, spec.legend.map((l) => l.label), spec.reference.field);
      if (!compared.ok) return compared;
      quality.reference = compared;
      datasetReads.push(gis.data.readRecord(reference.id, 'map-source-comparison', true));
    }
    if (signal?.aborted) return fail('cancelled');
    const dataset = gis.data.add({ title: spec.label || meta.name, features: placed.features,
      sourceCrs: fit.transform.crs, time: spec.period ? { kind: 'constant', start: spec.period.start, end: spec.period.end } : undefined,
      provenance: { kind: 'map-reconstruction', source: source.url || source.attachment, sourceSha256: source.sha256 || null,
        licence: spec.licence || null, retrievedAt: source.retrievedAt, mapSource: source, recipe, quality,
        ...(spec.period && { temporalCoverage: spec.period }) } });
    const description = gis.data.describe(dataset.id);
    return { ok: true, source, dataset: description, quality, datasetsRead: datasetReads,
      datasetsCreated: [gis.data.readRecord(dataset.id, 'map-source-reconstruction', true)] };
  };
  try {
    if (type === MIME.pdf) return await withPdf(file, spec, signal, consume);
    return await withImage(file, type, spec, consume);
  } catch (error) {
    return fail(signal?.aborted ? 'cancelled' : 'map-source-unreadable', { reason: String(error?.message || error).slice(0, 180) });
  }
}

export async function readMapSource(a, dctx, K, D, web, handoffText) {
  const { R, L, note, warn, esc } = K;
  const spec = a.mapSource;
  const signal = dctx?.signal;
  const r = await resolveMapSource(spec, a, { attachment: (name) => K.ATTACH_LOG?.find(K._curTurn, name),
    download: () => D.download(a, signal) });
  if (!r.ok) {
    const code = r.handoff ? 'handoff_' + r.handoff.kind : r.why || r.code || 'upstream_unreachable';
    const say = r.handoff ? handoffText(r.handoff, L) : (r.say || L('Could not obtain the source map.', '原図を取得できませんでした。'));
    return R(false, warn(esc(say)), { meta: { code }, exec: { web: { ...web, code, handoff: r.handoff, page: r.page } } });
  }
  const V = K.VFRAMES;
  const result = await processMapSource(r, spec, { signal,
    show: V?.addWebImage ? (url, info) => V.addWebImage(url, info) : null,
    async getGIS() { await window.IntMapLazy.need('gisCore'); return window.IntMapGis; } });
  const { datasetsRead, datasetsCreated, ...mapSource } = result;
  const meta = { datasetsRead, datasetsCreated, ...(!result.ok && { code: result.why }) };
  const message = result.ok ? (result.dataset
    ? L('Registered the extracted geometry.', '抽出した地理形状を登録しました。')
    : L('Read the source map.', '原図を読み取りました。'))
    : L('Could not extract the source map: ', '原図を抽出できませんでした: ') + result.why;
  return R(result.ok, (result.ok ? note : warn)(esc(message)), { meta, exec: { web, mapSource } });
}

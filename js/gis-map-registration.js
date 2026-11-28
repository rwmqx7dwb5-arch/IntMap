/* Source-space fitting and feature recovery. Bytes and browser rendering live
 * in gis-map-source.js. Raw document coordinates never enter the GIS registry. */

const pointOK = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const groundOK = (p) => pointOK(p) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
const fail = (why, detail) => ({ ok: false, why, ...(detail && { detail }) });
const wrap = (x) => x >= -180 && x <= 180 ? x : ((x + 180) % 360 + 360) % 360 - 180;
const cross = (a, b, p) => (b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0]);

function controlHull(points) {
  const sorted = points.slice().sort((a, b) => a[0]-b[0] || a[1]-b[1]);
  const edge = (ordered) => {
    const out = [];
    for (const p of ordered) {
      while (out.length > 1 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...edge(sorted), ...edge(sorted.reverse())];
}


export function mapRegistration(crs, size, options) {
  const { width, height } = size;
  const { control, check = [], crs: name = 'EPSG:4326', maxErrorM } = options;
  const tieOK = (t) => pointOK(t?.pixel) && groundOK(t?.ground)
    && t.pixel[0] >= 0 && t.pixel[0] <= width && t.pixel[1] >= 0 && t.pixel[1] <= height;
  if (!Array.isArray(control) || control.length < 3) return fail('map-control-required');
  if (!Array.isArray(check) || ![...control, ...check].every(tieOK)) return fail('map-bad-control-point');
  const key = (t) => t.pixel.join(',');
  const controlKeys = new Set(control.map(key));
  if (controlKeys.size !== control.length || new Set(check.map(key)).size !== check.length
    || check.some((t) => controlKeys.has(key(t)))) return fail('map-duplicate-control-point');
  if (maxErrorM != null && (!Number.isFinite(maxErrorM) || maxErrorM < 0 || !check.length)) return fail('map-independent-check-required');

  const isGeographic = crs.isWgs84(name);
  const anchor = control[0].ground[0];
  const project = ([x, y]) => isGeographic ? [anchor + wrap(x - anchor), y] : crs.fromWgs84(x, y, name);
  const projected = control.map((t) => project(t.ground));
  if (!projected.every(pointOK)) return fail('map-crs-unavailable', { crs: name });
  const n = control.length;
  const average = (pairs) => pairs.reduce(([a, b], [x, y]) => [a + x / n, b + y / n], [0, 0]);
  const [ox, oy] = average(control.map((t) => t.pixel));
  const [gx, gy] = average(projected);
  let xx = 0, yy = 0, xy = 0, xg = 0, yg = 0, xh = 0, yh = 0;
  control.forEach((t, i) => {
    const x = (t.pixel[0] - ox) / width, y = (t.pixel[1] - oy) / height;
    const a = projected[i][0] - gx, b = projected[i][1] - gy;
    xx += x*x; yy += y*y; xy += x*y;
    xg += x*a; yg += y*a; xh += x*b; yh += y*b;
  });
  const determinant = xx*yy - xy*xy;
  if (determinant <= 64 * Number.EPSILON * Math.max(xx, yy)**2) return fail('map-control-degenerate');
  const a = (yy*xg - xy*yg) / determinant, b = (xx*yg - xy*xg) / determinant;
  const c = (yy*xh - xy*yh) / determinant, d = (xx*yh - xy*xh) / determinant;
  const scale = Math.hypot(a, b) * Math.hypot(c, d);
  if (!scale || Math.abs(a*d - b*c) <= 64 * Number.EPSILON * scale) return fail('map-control-degenerate');
  const locate = ([px, py]) => {
    const x = (px - ox) / width, y = (py - oy) / height;
    const p = crs.toWgs84(gx + a*x + b*y, gy + c*x + d*y, name);
    return pointOK(p) ? [wrap(p[0]), p[1]] : null;
  };
  const residuals = (points) => {
    let sum = 0, max = 0;
    const errors = [];
    for (const t of points) {
      const p = locate(t.pixel);
      if (!groundOK(p)) return null;
      const m = crs.geodesic(...p, ...t.ground);
      if (!Number.isFinite(m?.m)) return null;
      sum += m.m*m.m;
      max = Math.max(max, m.m);
      errors.push(m.m);
    }
    return { count: points.length, rmseM: Math.sqrt(sum / points.length), maxM: max, errorsM: errors };
  };
  const fit = residuals(control), independent = check.length ? residuals(check) : null;
  if (!fit || (check.length && !independent)) return fail('map-residual-unavailable');
  const quality = { fit, independent, accepted: maxErrorM == null ? null : independent.maxM <= maxErrorM,
    maxAllowedM: maxErrorM ?? null, positionalErrorM: independent?.rmseM ?? null };
  if (quality.accepted === false) return fail('map-positional-tolerance-exceeded', quality);
  const coefficients = [gx - a*ox/width - b*oy/height, a/width, b/height, gy - c*ox/width - d*oy/height, c/width, d/height];
  const calibrationBounds = control.reduce(([l, t, r, b], {pixel: [x, y]}) =>
    [Math.min(l, x), Math.min(t, y), Math.max(r, x), Math.max(b, y)], [width, height, 0, 0]);
  return { ok: true, locate, quality, calibrationBounds, calibrationHull: controlHull(control.map((t) => t.pixel)), transform: { model: 'affine', crs: name, coefficients } };
}

export function legendPixels(image, rules, crop = [0, 0, image.width, image.height]) {
  const { width, height, data } = image;
  const [left, top, right, bottom] = crop;
  if (crop.length !== 4 || !crop.every(Number.isInteger) || left < 0 || top < 0
    || right > width || bottom > height || left >= right || top >= bottom) return fail('map-invalid-crop');
  if (!Array.isArray(rules) || !rules.length || rules.length > 32) return fail('map-legend-required');
  const classNames = new Set();
  const legend = [];
  for (const c of rules) {
    let color = c?.color;
    if (c?.swatch != null) {
      const [x, y] = Array.isArray(c.swatch) ? c.swatch : [];
      if (color != null || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) {
        return fail('map-invalid-swatch');
      }
      const i = 4*(y*width+x);
      if (data[i+3] !== 255) return fail('map-invalid-swatch');
      color = '#' + [...data.slice(i, i+3)].map((v) => v.toString(16).padStart(2, '0')).join('');
    }
    if (typeof c?.label !== 'string' || !c.label.trim() || classNames.has(c.label)
      || typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)
      || (c.tolerance != null && (!Number.isFinite(c.tolerance) || c.tolerance < 0 || c.tolerance > 255))) return fail('map-invalid-legend');
    classNames.add(c.label);
    legend.push({ ...c, color });
  }
  const palette = legend.map((r) => {
    const [r1, g, b] = r.color.slice(1).match(/../g).map((s) => parseInt(s, 16));
    return { rgb: [r1, g, b], maxSq: (r.tolerance ?? 0)**2 };
  });
  const classPixels = Array(rules.length).fill(0);
  const w = right - left, h = bottom - top;
  const values = new Int16Array(w*h);
  let unmatched = 0, ambiguous = 0, transparent = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const i = 4*(y*width+x);
      if (data[i+3] !== 255) { transparent++; continue; }
      let nearest = -1, distance = Infinity, tied = false;
      for (let j = 0; j < palette.length; j++) {
        const {rgb: [r, g, b], maxSq} = palette[j];
        const d = (data[i]-r)**2 + (data[i+1]-g)**2 + (data[i+2]-b)**2;
        if (d > maxSq || d > distance) continue;
        if (d === distance) { tied = true; continue; }
        nearest = j; distance = d; tied = false;
      }
      if (tied) { ambiguous++; continue; }
      if (nearest < 0) { unmatched++; continue; }
      values[(y-top)*w+x-left] = nearest + 1;
      classPixels[nearest]++;
    }
  }
  return { ok: true, width: w, height: h, values, legend, offset: [left, top],
    counts: { classes: rules.map((c, i) => ({ label: c.label, pixels: classPixels[i] })), unmatched, ambiguous, transparent } };
}

export async function traceMapPixels(raster, mask, signal) {
  // The polygonizer traces an integer lattice; encode it privately on a unit
  // square, recover the original pixel corners, then apply the measured fit.
  const { width, height, values, offset: [left, top] } = mask;
  const grid = raster.build({ width, height, west: 0, north: 1, pixelLng: 1/width, pixelLat: 1/height },
    [{ name: 'legend class', nodata: 0 }], values);
  if (!grid.ok) return grid;
  const out = await raster.polygonize(grid.raster, 0, { signal });
  if (!out.ok) return out;
  return { ok: true, shapes: out.polygons.map((p) => ({
    classIndex: p.value - 1, pixels: p.pixels, type: 'Polygon',
    coordinates: p.rings.map((r) => r.map(([x, y]) => [left + Math.round(x*width), top + Math.round((1-y)*height)])),
  })) };
}

export function placeMapShapes(geometry, registration, shapes, legend) {
  const features = [];
  let invalid = 0, outsideControlEnvelope = 0;
  const issues = new Map();
  const hull = registration.calibrationHull;
  for (const s of shapes) {
    let extrapolated = false;
    function locate(p) {
      if (!extrapolated && hull.some((a, i) => cross(a, hull[(i+1) % hull.length], p) < 0)) extrapolated = true;
      return registration.locate(p);
    }
    const coordinates = s.type === 'Polygon' ? s.coordinates.map((ring) => ring.map(locate)) : s.coordinates.map(locate);
    const geom = { type: s.type, coordinates };
    const observed = geometry.validate(geom);
    const found = observed.value || observed;
    if (!found.valid) {
      invalid++;
      for (const p of found.problems || [{ code: found.why || 'map-invalid-geometry' }]) issues.set(p.code, (issues.get(p.code) || 0) + 1);
      continue;
    }
    if (extrapolated) outsideControlEnvelope++;
    const repaired = s.type === 'Polygon' ? geometry.repair(geom, { winding: true }) : null;
    features.push({ type: 'Feature', geometry: repaired?.geometry || geom, properties: {
      class: legend[s.classIndex].label, color: legend[s.classIndex].color ?? null, extrapolated,
      ...(s.pixels != null && { sourcePixels: s.pixels }),
    } });
  }
  return { features, validation: { valid: features.length, invalid, outsideControlEnvelope, issues: Object.fromEntries(issues) } };
}

export function compareMapAreas(gis, features, reference, classes, field) {
  if (reference.kind !== 'vector' || (field && !reference.fields.some((f) => f.name === field))) return fail('map-reference-field-invalid');
  const source = reference.features();
  if (source.some((f) => !['Polygon', 'MultiPolygon'].includes(f.geometry?.type) || !gis.geometry.validate(f.geometry).value?.valid)) return fail('map-reference-geometry-invalid');
  const results = [];
  for (const label of field ? new Set([...classes, ...source.map((f) => f.properties?.[field]).filter((v) => typeof v === 'string')]) : [null]) {
    const subset = (rows, key) => (label === null ? rows : rows.filter((f) => f.properties?.[key] === label)).map((f) => f.geometry);
    const a = gis.geometry.attempt.union(subset(features, 'class'));
    const b = gis.geometry.attempt.union(subset(source, field));
    if (!a.ok || !b.ok) return fail(a.why || b.why);
    const both = a.geometry && b.geometry ? gis.geometry.attempt.intersection(a.geometry, b.geometry) : { ok: true };
    if (!both.ok) return fail(both.why);
    const sizes = [a, b, both].map((v) => v.geometry ? gis.crs.areaOnGround(v.geometry) : { ok: true, value: 0 });
    if (sizes.some((v) => !v.ok)) return fail(sizes.find((v) => !v.ok).why);
    const [candidateKm2, referenceKm2, intersectionKm2] = sizes.map((v) => v.value);
    const unionKm2 = candidateKm2 + referenceKm2 - intersectionKm2;
    results.push({ label, candidateKm2, referenceKm2, intersectionKm2, unionKm2,
      iou: unionKm2 > 0 ? Math.min(1, intersectionKm2 / unionKm2) : null,
      precision: candidateKm2 > 0 ? Math.min(1, intersectionKm2 / candidateKm2) : null,
      recall: referenceKm2 > 0 ? Math.min(1, intersectionKm2 / referenceKm2) : null });
  }
  return { ok: true, reference: reference.id, area: 'WGS84-ellipsoidal', results };
}

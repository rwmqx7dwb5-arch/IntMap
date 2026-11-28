/* Source-space fitting and feature recovery. Bytes and browser rendering live
 * in gis-map-source.js. Raw document coordinates never enter the GIS registry. */

export const KERNEL_VERSION = 'map-registration-2';

const pointOK = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const groundOK = (p) => pointOK(p) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
const fail = (why, detail) => ({ ok: false, why, ...(detail && { detail }) });
const wrap = (x) => x >= -180 && x <= 180 ? x : ((x + 180) % 360 + 360) % 360 - 180;
const cross = (a, b, p) => (b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0]);
const nameKey = (value) => typeof value === 'string' && value.length <= 160 ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() : '';

function uniqueBy(rows, keyOf) {
  const grouped = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (key) grouped.set(key, grouped.has(key) ? null : row);
  }
  return [...grouped.values()].filter(Boolean);
}

export function referenceLandmarks(dataset, field) {
  if (dataset?.kind !== 'vector' || !dataset.fields.some(f => f.name === field)) return fail('map-landmark-reference-invalid');
  const candidates = uniqueBy(dataset.features().filter(f => f.geometry?.type === 'Point' && groundOK(f.geometry.coordinates)), f => nameKey(f.properties?.[field]))
    .map(f => ({ name: f.properties[field], ground: f.geometry.coordinates }));
  if (candidates.length > 48) return fail('map-landmark-reference-too-wide', { count: candidates.length, limit: 48 });
  return { ok:true, candidates };
}

export function matchMapLandmarks(candidates, marks, size, spec) {
  const unique = uniqueBy(uniqueBy(marks, mark => nameKey(mark?.name)), mark => pointOK(mark.pixel) ? mark.pixel.join(',') : '');
  const positions = new Map(unique.map(mark => [nameKey(mark.name), mark.pixel]));
  const named = candidates.map(row => ({ ...row, pixel: positions.get(nameKey(row.name)) })).filter(row => {
    const p = row.pixel;
    return p && p[0] >= 0 && p[0] <= size.width && p[1] >= 0 && p[1] <= size.height;
  });
  const minimum = spec.transformModel === 'quadratic' ? 6 : 3;
  const required = minimum === 6 ? 2 : 1;
  const manual = spec.check || [];
  const reserve = Math.max(0, required-manual.length, Math.min(3, Math.floor(named.length/4), named.length-minimum)-manual.length);
  if (named.length < minimum+reserve) return fail('map-landmark-matches-insufficient', { matched: named.length, required: minimum+reserve });
  // Reserve centrally located landmarks first so calibration retains its
  // spatial envelope. Keep the roles independent of the candidate order.
  const center = named.reduce(([x,y], row) => [x+row.pixel[0]/named.length, y+row.pixel[1]/named.length], [0,0]);
  const distance = (row) => ((row.pixel[0]-center[0])/size.width)**2+((row.pixel[1]-center[1])/size.height)**2;
  named.sort((a,b) => distance(a)-distance(b) || (a.name < b.name ? -1 : 1));
  return { ok:true, control:named.slice(reserve), check:[...manual, ...named.slice(0,reserve)] };
}

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


const basis = (x, y) => [1, x, y, x*x, x*y, y*y];
const dot = (a, b) => a.reduce((sum, term, i) => sum + term*b[i], 0);

// Solve both projected coordinates with the same QR factorization. Centring
// and scaling happen before this step, and rank-deficient points are refused.
function quadraticFit(pixels, projected) {
  const columns = Array.from({length: 6}, (_, i) => pixels.map(p => basis(...p)[i]));
  const q = [];
  const r = Array.from({length: 6}, () => Array(6).fill(0));
  for (let j = 0; j < columns.length; j++) {
    const v = columns[j].slice();
    for (let i = 0; i < j; i++) {
      r[i][j] = dot(q[i], v);
      for (let k = 0; k < v.length; k++) v[k] -= r[i][j]*q[i][k];
    }
    r[j][j] = Math.sqrt(dot(v, v));
    if (r[j][j] < r[0][0]*1e-8 || !r[j][j]) return null;
    q.push(v.map(x => x/r[j][j]));
  }
  return [0, 1].map(axis => {
    const values = projected.map(p => p[axis]);
    const coefficients = q.map(v => dot(v, values));
    for (let i = 5; i >= 0; i--) {
      for (let j = i+1; j < 6; j++) coefficients[i] -= r[i][j]*coefficients[j];
      coefficients[i] /= r[i][i];
    }
    return coefficients;
  });
}

// The Jacobian determinant of a quadratic warp is quadratic. Its extrema
// on the fitted rectangle occur at corners, stationary edge points, or an
// interior stationary point. Checking them detects reversals between ties.
function unfolded([[, ax, ay, axx, axy, ayy], [, bx, by, bxx, bxy, byy]], [l, t, r, b]) {
  const mult = ([c, x, y], [d, u, v]) => [c*d, c*u+x*d, c*v+y*d, x*u, x*v+y*u, y*v];
  const first = mult([ax,2*axx,axy], [by,bxy,2*byy]);
  const second = mult([ay,axy,2*ayy], [bx,2*bxx,bxy]);
  const coefficients = first.map((v, i) => v-second[i]);
  const [, x, y, xx, xy, yy] = coefficients;
  const samples = [[l,t],[l,b],[r,t],[r,b]];
  const add = (u, v) => { if (u >= l && u <= r && v >= t && v <= b) samples.push([u,v]); };
  if (xx) for (const v of [t,b]) add(-(x+xy*v)/(2*xx), v);
  if (yy) for (const u of [l,r]) add(u, -(y+xy*u)/(2*yy));
  const d = 4*xx*yy-xy*xy;
  if (d) add((xy*y-2*yy*x)/d, (xy*x-2*xx*y)/d);
  const values = samples.map(p => dot(coefficients, basis(...p)));
  const limit = 1e-8*Math.max(...values.map(Math.abs));
  return values.every(v => v > limit) || values.every(v => v < -limit);
}

export function mapRegistration(crs, size, options) {
  if (options.transformModel !== 'auto') return fitMapRegistration(crs, size, options);
  const affine = fitMapRegistration(crs, size, {...options, transformModel:'affine'});
  if ((options.control?.length ?? 0) < 6 || (options.check?.length ?? 0) < 2) return affine;
  const quadratic = fitMapRegistration(crs, size, {...options, transformModel:'quadratic'});
  if (!quadratic.ok) return affine;
  if (!affine.ok) return quadratic;
  const a = affine.quality.independent, q = quadratic.quality.independent;
  return q.rmseM <= 0.8*a.rmseM && q.maxM < a.maxM && a.rmseM-q.rmseM > 0.01 ? quadratic : affine;
}

function fitMapRegistration(crs, size, options) {
  const { width, height } = size;
  const { control, check = [], crs: name = 'EPSG:4326', maxErrorM, transformModel = 'affine' } = options;
  const nonlinear = transformModel === 'quadratic';
  if (!nonlinear && transformModel !== 'affine') return fail('map-transform-unsupported');
  const tieOK = (t) => pointOK(t?.pixel) && groundOK(t?.ground)
    && t.pixel[0] >= 0 && t.pixel[0] <= width && t.pixel[1] >= 0 && t.pixel[1] <= height;
  if (!Array.isArray(control) || control.length < 3) return fail('map-control-required');
  if (!Array.isArray(check) || ![...control, ...check].every(tieOK)) return fail('map-bad-control-point');
  const key = (t) => t.pixel.join(',');
  const controlKeys = new Set(control.map(key));
  if (controlKeys.size !== control.length || new Set(check.map(key)).size !== check.length
    || check.some((t) => controlKeys.has(key(t)))) return fail('map-duplicate-control-point');
  if (maxErrorM != null && (!Number.isFinite(maxErrorM) || maxErrorM < 0 || !check.length)) return fail('map-independent-check-required');
  if (nonlinear && (control.length < 6 || check.length < 2)) return fail('map-quadratic-points-required');

  const isGeographic = crs.isWgs84(name);
  const anchor = control[0].ground[0];
  const project = ([x, y]) => isGeographic ? [anchor + wrap(x - anchor), y] : crs.fromWgs84(x, y, name);
  const projected = control.map((t) => project(t.ground));
  if (!projected.every(pointOK)) return fail('map-crs-unavailable', { crs: name });
  const n = control.length;
  const average = (pairs) => pairs.reduce(([a, b], [x, y]) => [a + x / n, b + y / n], [0, 0]);
  const [ox, oy] = average(control.map((t) => t.pixel));
  const [gx, gy] = average(projected);
  const calibrationBounds = control.reduce(([l, t, r, b], {pixel: [x, y]}) =>
    [Math.min(l, x), Math.min(t, y), Math.max(r, x), Math.max(b, y)], [width, height, 0, 0]);
  const normalize = ([x,y]) => [(x-ox)/width, (y-oy)/height];
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
  const curved = nonlinear ? quadraticFit(control.map(t => normalize(t.pixel)), projected.map(([x,y]) => [x-gx,y-gy])) : null;
  if (nonlinear && !curved) return fail('map-control-degenerate');
  if (curved) {
    const [l,t,r,b] = calibrationBounds;
    if (!unfolded(curved, [...normalize([l,t]), ...normalize([r,b])])) return fail('map-transform-folds');
  }
  const locate = pixel => {
    const [x,y] = normalize(pixel);
    const offsets = curved ? curved.map(coeff => dot(coeff, basis(x,y))) : [a*x+b*y, c*x+d*y];
    const p = crs.toWgs84(gx+offsets[0], gy+offsets[1], name);
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
  const transform = curved
    ? { model: 'quadratic', crs: name, coefficients: curved, pixelOrigin: [ox,oy], pixelScale: [width,height], projectedOrigin: [gx,gy] }
    : { model: 'affine', crs: name, coefficients };
  return { ok: true, locate, quality, calibrationBounds, calibrationHull: controlHull(control.map((t) => t.pixel)), transform };
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
  const nonlinear = registration.transform?.model === 'quadratic';
  const [width,height] = registration.transform?.pixelScale || [];
  const inside = p => !hull.some((a,i) => cross(a,hull[(i+1)%hull.length],p) < -1e-7);
  const subdivide = path => {
    const points = [path[0]];
    for (let i=1; i<path.length; i++) {
      const [x,y] = path[i-1], [u,v] = path[i];
      const steps = Math.max(1, Math.ceil(32*Math.hypot((u-x)/width,(v-y)/height)));
      for (let j=1; j<steps; j++) points.push([x+(u-x)*j/steps,y+(v-y)*j/steps]);
      points.push(path[i]);
    }
    return points;
  };
  for (const s of shapes) {
    let extrapolated = false;
    const paths = s.type === 'Polygon' ? s.coordinates : [s.coordinates];
    if (nonlinear && paths.some(path => path.some(p => !inside(p)))) {
      invalid++;
      outsideControlEnvelope++;
      issues.set('map-transform-extrapolation', (issues.get('map-transform-extrapolation') || 0)+1);
      continue;
    }
    function locate(p) {
      if (!extrapolated && hull.some((a, i) => cross(a, hull[(i+1) % hull.length], p) < 0)) extrapolated = true;
      return registration.locate(p);
    }
    const mapped = paths.map(path => (nonlinear ? subdivide(path) : path).map(locate));
    const coordinates = s.type === 'Polygon' ? mapped : mapped[0];
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

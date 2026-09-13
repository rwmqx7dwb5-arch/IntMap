/* Re-cut geometry without re-deciding an identity, label, date or coverage window. */
export const geometryOf = (data, feature) => feature[8].map(poly => poly.map(i => data.rings[i]));
export const identityOf = feature => JSON.stringify(feature.slice(0, 8));

export function previousPrecision(data, tolerance, decimals) {
  const p = data?.precision;
  return {
    tolerance: Number.isFinite(p?.targetTolerance) && p.targetTolerance >= 0 ? p.targetTolerance : tolerance,
    decimals: Number.isInteger(p?.decimals) && p.decimals >= 0 ? p.decimals : decimals,
  };
}

export const generatedPrecision = (targetTolerance, decimals, count) => ({
  targetTolerance, decimals, refined: count, retained: 0,
  semantics: 'build target; every record generated from source at this precision; no retained corrections',
});

export function repoolGeometry(data, replacement) {
  const rings = [], pool = new Map();
  let refined = 0, retained = 0;
  const put = ring => {
    const key = JSON.stringify(ring);
    if (!pool.has(key)) { pool.set(key, rings.length); rings.push(ring); }
    return pool.get(key);
  };
  const feats = data.feats.map((feature, index) => {
    const next = replacement(feature, index);
    const before = geometryOf(data, feature);
    const ringCount = polys => polys.reduce((n,p) => n + p.length, 0);
    const polys = next && next.length >= before.length && ringCount(next) >= ringCount(before)
      && ringCount(next) - next.length >= ringCount(before) - before.length
      && next.every(p => p.length && p.every(r => r.length >= 4))
      ? (refined++, next) : (retained++, before);
    const row = feature.slice();
    row[8] = polys.map(poly => poly.map(put));
    return row;
  });
  return { data: { ...data, rings, feats }, refined, retained };
}

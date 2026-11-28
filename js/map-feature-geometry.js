/** Public endpoints and bounding box. Geographic bounds use west > east at the antimeridian. */
export function geometryRange(geometry) {
  const wrap = (lng) => ((lng + 180) % 360 + 360) % 360 - 180;
  const walk = (part, out) => {
    if (!Array.isArray(part)) return;
    if (Number.isFinite(part[0]) && Number.isFinite(part[1])) out.push(part);
    else part.forEach((child) => walk(child, out));
  };
  const points = [];
  walk(geometry?.coordinates, points);
  if (!points.length) return null;
  const lngs = [];
  let south = Infinity, north = -Infinity;
  for (const [lng, lat] of points) {
    lngs.push(wrap(lng));
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  lngs.sort((a, b) => a - b);
  let gap = lngs[0] + 360 - lngs.at(-1), west = lngs[0], east = lngs.at(-1);
  for (let i = 1; i < lngs.length; i++) {
    if (lngs[i] - lngs[i - 1] <= gap) continue;
    gap = lngs[i] - lngs[i - 1];
    west = lngs[i];
    east = lngs[i - 1];
  }
  return {
    bounds: [west, south, east, north],
    ...(/^(Multi)?LineString$/.test(geometry?.type) ? { endpoints: [points[0], points.at(-1)].map(([lng, lat]) => [wrap(lng), lat]) } : null),
  };
}

export function osmFeatureId(feature) {
  const type = feature?.osmType || feature?.osm_type;
  const id = feature?.osmId || feature?.osm_id;
  return type && id ? type + '/' + id : undefined;
}

export const userMapClick = (() => {
  let point = null;
  return {
    get: () => point && {...point},
    record: (ll) => {
      const lng = +ll?.lng, lat = +ll?.lat;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
      point = { lng: ((lng + 180) % 360 + 360) % 360 - 180, lat, author: 'user' };
    },
  };
})();

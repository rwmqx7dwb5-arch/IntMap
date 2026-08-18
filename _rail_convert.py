# -*- coding: utf-8 -*-
"""Build data/railways_gauge.json from Natural Earth 10m railroads (#R21).

Classifies every rail segment by the PREDOMINANT national track gauge of the country
its midpoint falls in (ray-casting PIP over NE 110m admin-0), decimates vertices
(every 2nd point, 2-decimal rounding ~1 km) and emits a slim FeatureCollection with
properties {g: gauge-mm, col: colour}. Real NE geometry, real national gauge standards.
"""
import json, os, sys, tempfile

TMP = os.environ.get('TEMP', tempfile.gettempdir())
RAIL = os.path.join(TMP, 'ne_rail.geojson')
CTY  = os.path.join(TMP, 'ne_countries.geojson')
OUT  = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'railways_gauge.json')

# Predominant national gauge (mm). Sources: standard rail-gauge references.
G1520 = ['RUS','BLR','UKR','KAZ','KGZ','TJK','TKM','UZB','ARM','AZE','GEO','MDA','LTU','LVA','EST','MNG']
G1524 = ['FIN']  # (#R266) Finland is 1524 mm (5 ft), not the Soviet 1520 mm re-standardisation — they run
                 # through each other but they are two gauges, and the layer draws them apart
G1435 = ['CHN','PRK','KOR','TUR','IRN','IRQ','SYR','JOR','ISR','SAU','ARE','EGY','DZA','TUN','MAR','LBY','USA','CAN','MEX','CUB','PAN','PER','URY','VEN','COL','GBR','FRA','DEU','ITA','CHE','AUT','BEL','NLD','LUX','DNK','NOR','SWE','POL','CZE','SVK','HUN','ROU','BGR','SRB','HRV','SVN','BIH','MKD','ALB','GRC','XKX','MNE','AUS','LAO','ETH','DJI','NGA','KEN','TZA','GMB' ]
G1067 = ['JPN','ZAF','ZWE','ZMB','MOZ','AGO','BWA','NAM','COD','GHA','IDN','PHL','NZL','TWN','SDN','SSD','ECU','CRI','GTM','HND','NIC','SLV']
G1000 = ['THA','MMR','KHM','VNM','MYS','SGP','BRA','BOL','UGA','SEN','MLI','BFA','CIV','TGO','BEN','NER','CMR','GAB','COG','MDG','GIN','MRT']
G1676 = ['IND','PAK','BGD','LKA','NPL','ARG','CHL']
G1668 = ['ESP','PRT']
G1600 = ['IRL']

GAUGE = {}
for iso in G1520: GAUGE[iso] = 1520
for iso in G1524: GAUGE[iso] = 1524
for iso in G1435: GAUGE[iso] = 1435
for iso in G1067: GAUGE[iso] = 1067
for iso in G1000: GAUGE[iso] = 1000
for iso in G1676: GAUGE[iso] = 1676
for iso in G1668: GAUGE[iso] = 1668
for iso in G1600: GAUGE[iso] = 1600

COL = {1435:'#3a7bd5', 1520:'#e03131', 1524:'#f08080', 1067:'#2f9e44', 1000:'#12b886', 1676:'#9c36b5', 1668:'#f08c00', 1600:'#d6336c', 0:'#868e96'}

def iter_rings(geom):
    t = geom['type']
    if t == 'Polygon':
        yield geom['coordinates'][0]
    elif t == 'MultiPolygon':
        for poly in geom['coordinates']:
            yield poly[0]

def pip(x, y, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside

def dp(points, tol):
    """Iterative Douglas-Peucker on [x,y] lists."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        worst, wi = -1.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            if L2 == 0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / L2
                t = 0 if t < 0 else (1 if t > 1 else t)
                d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d2 > worst:
                worst, wi = d2, i
        if worst > tol * tol:
            keep[wi] = True
            stack.append((a, wi))
            stack.append((wi, b))
    return [p for p, k in zip(points, keep) if k]

def main():
    with open(CTY, encoding='utf-8') as f:
        cty = json.load(f)
    countries = []
    for f0 in cty['features']:
        p = f0.get('properties', {})
        iso = p.get('ISO_A3_EH') or p.get('ISO_A3') or p.get('ADM0_A3') or ''
        if iso in ('-99', ''):
            iso = p.get('ADM0_A3', '')
        rings = list(iter_rings(f0['geometry']))
        if not rings:
            continue
        xs = [c[0] for r in rings for c in r]
        ys = [c[1] for r in rings for c in r]
        countries.append((iso, (min(xs), min(ys), max(xs), max(ys)), rings))

    def gauge_at(x, y):
        for iso, bb, rings in countries:
            if x < bb[0] or x > bb[2] or y < bb[1] or y > bb[3]:
                continue
            for r in rings:
                if pip(x, y, r):
                    return GAUGE.get(iso, 0)
        return 0

    with open(RAIL, encoding='utf-8') as f:
        rail = json.load(f)
    out = []
    for f0 in rail['features']:
        g = f0['geometry']
        lines = [g['coordinates']] if g['type'] == 'LineString' else (g['coordinates'] if g['type'] == 'MultiLineString' else [])
        for coords in lines:
            if len(coords) < 2:
                continue
            dec = dp([[c[0], c[1]] for c in coords], 0.012)
            dec = [[round(c[0], 2), round(c[1], 2)] for c in dec]
            slim = [dec[0]]
            for c in dec[1:]:
                if c != slim[-1]:
                    slim.append(c)
            if len(slim) < 2:
                continue
            mid = slim[len(slim) // 2]
            gauge = gauge_at(mid[0], mid[1])
            out.append({'type': 'Feature',
                        'geometry': {'type': 'LineString', 'coordinates': slim},
                        'properties': {'g': gauge}})
    fc = {'type': 'FeatureCollection', 'features': out}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(fc, f, separators=(',', ':'))
    print('features:', len(out), 'bytes:', os.path.getsize(OUT))

if __name__ == '__main__':
    main()

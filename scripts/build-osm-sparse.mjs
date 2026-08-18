/* ============================================================================
 *  IntMap · the two GLOBALLY SPARSE facility sets, fetched once and shipped  (#R266)
 * ----------------------------------------------------------------------------
 *  「宇宙基地・地上局レイヤー、外交公館（大使館・領事館）に何も表示されない。」
 *
 *  js/osm-facilities.js asks Overpass for the CURRENT VIEW and waits for zoom ≥ 5. For eleven of
 *  its twelve sets that is right — hospitals, schools, power, ports are everywhere, so a viewport
 *  always holds some. These two are not like that: there are ~30 spaceports on Earth and embassies
 *  exist only in capitals, so «the current view» is empty almost everywhere it is asked, and the
 *  world view — where a reader would look for exactly these two — is gated off entirely. The layer
 *  was working exactly as written and showing nothing, which is the same thing as broken.
 *
 *  A global Overpass query cannot be the fix at run time: MEASURED, the diplomatic union takes 60 s
 *  for a bare `out count`, and a second attempt came back «the server is probably too busy». So the
 *  global set is fetched HERE, once, and shipped — the same answer #R185 gave the satellite
 *  catalogue. The live viewport query still runs when the reader zooms in, and replaces the snapshot
 *  for that view.
 *
 *    node scripts/build-osm-sparse.mjs            → data/osm-diplo.json, data/osm-space.json
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EPS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/* the world in slices: a global union times out, the same union over a third of the planet does not */
const SLICES = [];
for (let lon = -180; lon < 180; lon += 60) SLICES.push([-90, lon, 90, lon + 60]);

const SETS = {
  diplo: {
    q: ['nwr["amenity"="embassy"]', 'nwr["office"="diplomatic"]'],
    kind: (t) => {
      const d = String(t['diplomatic'] || t['office'] || t['amenity'] || '').toLowerCase();
      if (/embassy|high_commission|nunciature/.test(d)) return 'embassy';
      if (/consul/.test(d)) return 'consulate';
      return 'other';
    },
  },
  space: {
    q: ['nwr["aeroway"="spaceport"]', 'nwr["man_made"="launch_pad"]', 'nwr["military"="launchpad"]',
        'nwr["man_made"="satellite_dish"]', 'nwr["man_made"="telescope"]["telescope:type"="radio"]'],
    kind: (t) => {
      if (t['aeroway'] === 'spaceport') return 'spaceport';
      if (t['man_made'] === 'launch_pad' || t['military'] === 'launchpad') return 'pad';
      if (t['man_made'] === 'satellite_dish') return 'ground';
      if (t['man_made'] === 'telescope') return 'radio';
      return 'other';
    },
  },
};

async function overpass(ql, tries = 9) {
  for (let i = 0; i < tries; i++) {
    const ep = EPS[i % EPS.length];
    try {
      const r = await fetch(ep, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'accept': 'application/json', 'user-agent': 'IntMap/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap) build-osm-sparse' }, body: 'data=' + encodeURIComponent(ql) });
      const txt = await r.text();
      if (!r.ok || txt[0] !== '{') { process.stdout.write(` [${r.status} ${ep.split('/')[2]}]`); }
      else {
        const j = JSON.parse(txt);
        if (Array.isArray(j.elements)) return j.elements;
      }
    } catch (e) { process.stdout.write(` [${String(e.message).slice(0, 30)}]`); }
    await new Promise((res) => setTimeout(res, 20000 * (i + 1)));
  }
  throw new Error('overpass exhausted');
}

for (const [key, SET] of Object.entries(SETS)) {
  const seen = new Map();
  for (const [s, w, n, e] of SLICES) {
    const bb = `(${s},${w},${n},${e})`;
    const ql = `[out:json][timeout:300];(${SET.q.map((q) => q + bb + ';').join('')});out center 60000;`;
    process.stdout.write(`${key} ${w}..${e}`);
    const els = await overpass(ql);
    for (const el of els) {
      const lon = el.lon != null ? el.lon : el.center && el.center.lon;
      const lat = el.lat != null ? el.lat : el.center && el.center.lat;
      if (lon == null || lat == null) continue;
      const t = el.tags || {};
      seen.set(el.type + '/' + el.id, {
        x: Math.round(lon * 1e5) / 1e5,
        y: Math.round(lat * 1e5) / 1e5,
        k: SET.kind(t),
        n: (t.name || t['name:en'] || '').slice(0, 90),
        i: el.type[0] + el.id,
        c: t['country'] || t['target'] || t['diplomatic:sending_country'] || undefined,
        o: t['operator'] || undefined,
      });
    }
    console.log(` → ${els.length} (${seen.size} total)`);
  }
  const out = { built: new Date().toISOString().slice(0, 10), source: 'OpenStreetMap contributors (ODbL), Overpass API',
    query: SET.q, count: seen.size, features: [...seen.values()] };
  const f = path.join(ROOT, 'data', 'osm-' + key + '.json');
  fs.writeFileSync(f, JSON.stringify(out));
  console.log('wrote', f, fs.statSync(f).size, 'bytes');
}

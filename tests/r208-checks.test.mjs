/* ============================================================================
 *  IntMap · #R208 source-level invariants
 * ----------------------------------------------------------------------------
 *  ⚠ NO NEW SPEC FILE THIS ROUND EITHER — #R207 measured why: appending six assertions to
 *  tests/smoke.spec.js moved it 29.6 s → 29.2 s, because the assertions are free and the BOOT is
 *  the whole price. So the browser-side checks are at the end of smoke.spec.js and everything that
 *  can be answered without a browser is here (this file is ~1 s and starts nothing).
 *
 *  ⚠ AND THEY PIN INVARIANTS, NOT SHAPES. #R207 broke four deep specs and #R205 broke five pins by
 *  fixing values that were never the point. Where this file names a number it is because the number
 *  IS the claim (148,083 rows is "ten times", IMSTAR2 is a format), and where the claim is a
 *  relation it is derived from both sides.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* one loaded copy of the locator, with the world rows registered — the state the app runs in */
let NG = null;
function locator() {
  if (NG) return NG;
  /* js/newsgeo.js publishes on `globalThis` (it is shared with the Supabase function, which has no
     `window`), so it is loaded the way both hosts load it rather than through a stub object. */
  globalThis.window = globalThis;
  new Function(read('js/newsgeo.js'))();
  NG = globalThis.IntMapNewsGeo;
  assert.ok(NG && typeof NG.register === 'function', 'the locator loaded');
  const gz = { addEventListener() { } };
  new Function('window', 'document', read('js/gazetteer.js'))(gz, { baseURI: 'https://example.test/' });
  const doc = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'gazetteer-world.json.gz'))).toString('utf8'));
  NG.register(gz.IntMapGazetteer._rowsFrom(doc).map(([type, terms, lng, lat, en, jp]) =>
    ({ terms, lng, lat, type, name_en: en, name_jp: jp })));
  return NG;
}

/* ═══ ① THE KATAKANA BOUNDARY — the reported bug, and the class it belongs to ══════════════════ */

test('R208 ①a: a place name that STARTS inside a katakana run is not a mention', () => {
  const N = locator();
  /* every one of these pinned a real city before this round, against the 15,048-row table. The
     first is the reported case (「ハンディファン」→ ディファ = Diffa, Niger); the rest are the same
     mechanism found by running ordinary Japanese headlines through it. */
  const noPin = ['ハンディファンが売れている', 'ワクチン接種が進む', 'マイナンバーカードの申請',
    'ドライブレコーダー', 'プラスチックごみ', 'スマートフォン新機種', 'キャッシュレス決済',
    'テレワーク定着', 'サブスクリプション解約', 'オンラインカジノ摘発', 'バリアフリー化を推進',
    'クレジットカードの不正利用', 'カーボンニュートラル', 'サステナビリティ報告'];
  for (const t of noPin) {
    const r = N.locate(t, { lang: 'ja' });
    assert.equal(r, null, `「${t}」 pinned ${r && r.name.en} (${r && r.surface}) — a place name that ` +
      'begins in the middle of a katakana run is a coincidence of syllables, not a mention');
  }
});

test('R208 ①b: …and the katakana places that ARE mentions still are', () => {
  const N = locator();
  for (const t of ['東京で地震', 'パリ五輪の開幕', 'パリオリンピックが開幕', 'ロシア・モスクワで会談',
    'ニューヨークで株価が急落', 'キーウに攻撃', 'ソウルで会談', 'ドバイで国際会議',
    'サンパウロの豪雨', 'ディファ近郊で襲撃', 'ロサンゼルス近郊の山火事']) {
    assert.ok(N.locate(t, { lang: 'ja' }), `「${t}」 lost its place — the guard is meant to remove ` +
      'coincidences, and 「ロシア・モスクワ」 in particular depends on ・ NOT counting as katakana');
  }
});

test('R208 ①c: the guard is left-only for curated places and total for the long tail', () => {
  const src = read('js/newsgeo.js');
  assert.ok(/KATA_RE\s*=/.test(src), 'the katakana class is named once');
  assert.ok(!/・/.test((/KATA_RE\s*=\s*\/\[([^\]]*)\]/.exec(src) || [, ''])[1]),
    'U+30FB (・) is NOT in the katakana class — it is the separator in 「ロシア・モスクワ」');
  assert.ok(/isKata\(text\.charAt\(i\)\)\s*&&\s*isKata\(text\.charAt\(i\s*-\s*1\)\)/.test(src),
    'a match may not START inside a run');
  assert.ok(/anyCurated\(ids\)/.test(src), 'the right-hand edge is scoped by rank, not applied flatly');
  /* ⚠ the direction of the rank test is the whole thing: rank counts UPWARDS (a prominence prior),
     so the bulk import is the FLOOR. Written the other way round it is true for nothing, the guard
     silently applies to every place, and 「パリオリンピック」 stops resolving. It did, while this
     round was being written. */
  assert.ok(/e\.rank\s*>\s*BULK_RANK/.test(src),
    'anyCurated must compare ABOVE the bulk rank — `< 3` is true for no entity at all');
});

test('R208 ①d: the trap table speaks Japanese, since the app does', () => {
  const N = locator();
  for (const t of ['ニューヨークタイムズが報じた', 'ワシントンポストの報道', 'パリ協定からの離脱',
    '京都議定書の目標', 'ベルリンの壁崩壊', 'ボストン・ダイナミクスのロボット',
    'ウォールストリート・ジャーナル', 'ストックホルム症候群']) {
    const r = N.locate(t, { lang: 'ja' });
    assert.equal(r, null, `「${t}」 pinned ${r && r.name.en} — the Latin spelling of this name has ` +
      'been trapped since #R161; the Japanese one is the same claim');
  }
  /* a club resolves to its home city THROUGH THE CLUB NAME, so it is docked like the Latin form */
  const psg = N.locate('パリ・サンジェルマンが勝利', { lang: 'ja' });
  assert.ok(psg && psg.name.en === 'Paris' && /サンジェルマン/.test(psg.surface),
    'the club name is the surface, not the bare city inside it');
});

test('R208 ①e: England is a curated admin-1, like the other three UK countries', () => {
  const src = read('js/newsgeo.js');
  const uk = ['England', 'Scotland', 'Wales', 'Northern Ireland'];
  for (const n of uk) {
    assert.ok(new RegExp(`'${n}\\|[^']*\\|GB\\|[A-Z]{3}\\|[^']*\\|admin1\\|`).test(src),
      `${n} is missing from the curated admin-1 rows — with cities1000 loaded, the only "England" ` +
      'left in the index was a village in Arkansas, and it out-scored Cambridge');
  }
  const N = locator();
  const r = N.locate('Cambridge scientists in England publish fusion result', { lang: 'en' });
  assert.ok(r && r.name.en === 'Cambridge', `hierarchy absorption puts the city first, got ${r && r.name.en}`);
});

/* ═══ ② THE GAZETTEER — ten times again, and shipped compressed ════════════════════════════════ */

test('R208 ②a: the world table is cities1000-scale, gzipped, and says where it came from', () => {
  const p = join(ROOT, 'data', 'gazetteer-world.json.gz');
  assert.ok(existsSync(p), 'data/gazetteer-world.json.gz is built');
  const raw = readFileSync(p);
  assert.ok(raw[0] === 0x1f && raw[1] === 0x8b, 'it really is gzip (the client decides from these bytes)');
  assert.ok(raw.length < 6 * 1024 * 1024, `${(raw.length / 1048576).toFixed(2)} MB — the ask was 「圧縮して数MB」`);
  const doc = JSON.parse(gunzipSync(raw).toString('utf8'));
  assert.ok(doc.rows.length > 120000, `${doc.rows.length} rows — the ask was 「cities1000相当15万件」`);
  assert.ok(/GeoNames/.test(doc.attribution) && /cities1000/.test(doc.attribution),
    'the source is named in the file itself (standing instruction 4)');
  assert.ok(Array.isArray(doc.langs) && doc.langs.length >= 10,
    'the languages it carries are declared, not implied');
  /* ⚠ and every language shipped must be one the matcher can actually read — js/newsgeo.js
     tokenises Latin/Greek/Cyrillic and scans Han/kana, so Hangul/Arabic/Hebrew/Thai names would be
     bytes that can never match a headline. */
  for (const l of doc.langs) {
    assert.ok(!['ko', 'ar', 'he', 'th', 'hi', 'fa', 'am'].includes(l),
      `'${l}' is shipped but js/newsgeo.js cannot tokenise its script`);
  }
});

test('R208 ②b: the client un-gzips it and registers it in slices', () => {
  const gz = read('js/gazetteer.js');
  assert.ok(/gazetteer-world\.json\.gz/.test(gz), 'the client asks for the compressed artefact');
  assert.ok(/bytes\[0\]===0x1f\s*&&\s*bytes\[1\]===0x8b/.test(gz),
    'it decides from the gzip magic, not from the file name — a host that sets Content-Encoding ' +
    'hands this code plain JSON and the name would be a lie');
  const nc = read('js/news-context.js');
  assert.ok(/function registerSlices\(/.test(nc),
    'a `function` declaration, because rebuildGeoIndex is defined above it and calls it (#R200 TDZ)');
  assert.ok(/scheduler[\s\S]{0,80}yield|setTimeout\(res,0\)/.test(nc),
    'the yield between slices is a MACROtask — a microtask would run all 148,083 in one task, ' +
    'which is the thing being avoided');
  assert.ok(!/IntMapNewsGeo\.register\(w\.map\(/.test(nc), 'the one-shot registration is gone');
});

/* ═══ ③ THE STARS — a catalogue with depth, and a camera that can use it ═══════════════════════ */

test('R208 ③a: stars.bin carries the measured parallax, and 0 means unknown', () => {
  const manifest = JSON.parse(read('data/stars.json'));
  assert.equal(manifest.format, 'IMSTAR2');
  assert.ok(manifest.fields.includes('parallax_mas'), 'the new field is declared');
  assert.ok(manifest.parallax.withDistance > 50000,
    `only ${manifest.parallax.withDistance} stars can be placed in depth`);
  assert.ok(manifest.parallax.unknown > 0,
    'some parallaxes are below the noise and are recorded as unknown rather than rounded to a distance');
  /* α Centauri is 1.34 pc and is the nearest star above the catalogue's magnitude limit; a build
     that reported anything nearer would be reading the wrong column. */
  assert.ok(manifest.parallax.nearest_pc > 1.2 && manifest.parallax.nearest_pc < 1.6,
    `nearest star ${manifest.parallax.nearest_pc} pc — expected α Centauri at ~1.34`);
  const bin = readFileSync(join(ROOT, 'data', 'stars.bin'));
  assert.equal(bin.toString('latin1', 0, 7), 'IMSTAR2');
  assert.equal(bin.length, 12 + manifest.count * 8, 'eight bytes per star, not six');
});

test('R208 ③b: both readers take the stride from the magic, so either format loads', () => {
  for (const f of ['js/space-sky.js', 'js/space.js']) {
    const src = read(f);
    assert.ok(/magic!=='IMSTAR1'&&magic!=='IMSTAR2'/.test(src), `${f} accepts both formats`);
    assert.ok(/STRIDE=\(magic==='IMSTAR2'\)\?8:6/.test(src), `${f} derives the stride`);
    assert.ok(!/12\+i\*6/.test(src), `${f} still has a hard-coded 6-byte stride — rebuilding the ` +
      'catalogue would shift every field by two bytes and the sky would become noise');
  }
});

test('R208 ③c: the camera can leave the solar system, and the ceiling is one function', () => {
  const src = read('js/space.js');
  assert.ok(/function distCeil\(\)/.test(src), 'the ceiling is derived, not written out');
  assert.ok((src.match(/distCeil\(\)/g) || []).length >= 5,
    'every clamp goes through it — it was 1e4 in four separate places');
  assert.ok(!/Math\.min\(1e4,d\)/.test(src) && !/'body'\?60:1e4/.test(src),
    'no literal ceiling survives');
  const reach = /const REACH_AU=([0-9e.+]+);/.exec(src);
  assert.ok(reach, 'the reach is a named constant');
  /* 1 pc = 206,264.8 AU, and the nearest star is 1.34 pc — a ceiling that cannot pass 276,000 AU
     cannot leave the solar system at all, which is what 1e4 (10,000 AU) could not. */
  assert.ok(Number(reach[1]) > 276000 * 2,
    `REACH_AU ${reach[1]} does not reach the nearest star (276,000 AU)`);
  assert.ok(/starPc\[i\]>0\?starPc\[i\]:\(unknown\+\+,starMaxPc\)/.test(src),
    'a star with no usable parallax goes to the far edge — a lower bound, not an invented distance');
  /* ⚠ and the edge is DERIVED, not cached beside the positions: the buffer only rebuilds on the next
     DRAW, so a stored edge describes whichever scale drew last — and that edge is the star pass's
     far clip plane. tests/smoke.spec.js ⑧ caught it reading a model-scale figure in true scale. */
  assert.ok(/function starFarEdgeNow\(\)/.test(src) && !/starFarEdge=edge/.test(src),
    'the star-field edge is computed from the current scale, not stored with the buffer');
  /* ⚠ and the edge is DERIVED, not cached with the buffer: the buffer only rebuilds on the next
     draw, so a cached edge describes whichever scale drew last — and the edge is the star pass's
     far clip plane. tests/smoke.spec.js ⑧ caught this reading a model-scale figure in true scale. */
  assert.ok(/function starFarEdgeNow()/.test(src) && !/starFarEdge=edge/.test(src),
    'the star field edge is computed from the current scale, not stored beside the positions');
  assert.ok(/posScale\(pc\*AU_PER_PC\)/.test(src),
    'star distance goes through the same scale mapping as the planets, or model scale puts the ' +
    'whole solar system inside one pixel');
});

/* ═══ ④ THE SUITE — the boots, and the stamp ══════════════════════════════════════════════════ */

test('R208 ④a: the shared app is worker-scoped, and says why', () => {
  const h = read('tests/helpers/app.js');
  assert.ok(/scope:\s*'worker'/.test(h), 'one boot per worker, so tests still run in parallel');
  assert.ok(/autoReset/.test(h), 'the reset runs before every test rather than being remembered');
  /* ⚠ THE PANEL'S OWN ✕ — not a new global. js/app-body.js is under a shrink-only ceiling
     (R200 ⑤) and js/tool-panel.js is one of the six DECLARATION-ONLY factories (R168 #4), so a
     helper that needs to close a tool uses the affordance that already exists rather than making
     either file grow a running statement for its convenience. */
  assert.ok(/#tool-panel \.tp-close/.test(h), 'the reset closes the tool through the panel button');
  /* comments stripped first: the header explains the trap by naming it, and a bare "does this
     string appear" test would fail on its own documentation */
  const codeOnly = h.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/IM_HOST\.exitTool/.test(codeOnly),
    'and NOT through IM_HOST, which is a module-local const in js/app-body.js — calling that from ' +
    'a test is the silent no-op #R205 is about, and it cost two runs of r171 to spot');
});

test('R208 ④b: no converted spec uses test.use — a worker-scoped page cannot honour it', () => {
  const specs = ['r170', 'r179-engine', 'r184-drone', 'r184-routing'];
  for (const s of specs) {
    const src = read(`tests/${s}.spec.js`);
    assert.ok(/helpers\/app\.js/.test(src), `tests/${s}.spec.js is converted`);
    assert.ok(!/test\.use\(/.test(src),
      `tests/${s}.spec.js uses test.use() — those options configure the PER-TEST context and a ` +
      'worker-scoped page is built before they are known, so it would ignore them SILENTLY. ' +
      'tests/r179-imagery.spec.js was reverted for exactly this.');
  }
});

test('R208 ④c: the stale-build guard compares round numbers, not the stamp as text', () => {
  const html = read('index.html');
  assert.ok(/roundOf=function\(s\)\{[\s\S]{0,120}-R\(\\d\+\)\$/.test(html),
    'the round number is parsed out of the stamp');
  assert.ok(/rSeen>rNow/.test(html) && /rNow>rSeen/.test(html),
    'both directions compare numerically');
  /* the hazard this closes: `'2026-08-09-R208' > '2026-08-11-R207'` is FALSE as text, because the
     date sorts first — so a build dated by the day the work was done, rather than the day the last
     build shipped, would make every device purge its caches and then claim the newest build is
     stale. Both directions wrong, which is the shape #R207 described for the stamp itself. */
  assert.ok('2026-08-09-R208' < '2026-08-11-R207',
    'sanity: this is exactly the string comparison that used to decide it');
});

/* ═══ ⑤ THE SKY FROM A POINT ON THE GROUND ════════════════════════════════════════════════════ */

/* js/night-sky.js touches the DOM only inside ensureDOM(), so the astronomy can be exercised here
   with a stub — no browser, no canvas, ~1 ms. */
function nightSky() {
  const win = { addEventListener() { }, devicePixelRatio: 1 };
  new Function('window', 'document', read('js/night-sky.js'))(win, { createElement: () => ({ style: {}, appendChild() { } }) });
  return win.IntMapNightSky;
}

test('R208 ⑤a: alt/az is checked against identities, not against itself', () => {
  const NS = nightSky();
  /* ⚠ THESE ARE EXACT RELATIONS, not "expected values" copied out of another program. Each one is
     true for every time and every catalogue, so it tests the transform rather than pinning a run. */
  for (const lat of [-70, -23.4, 0, 35.68, 51.5, 78]) {
    /* 1. THE POLE STAR SITS AT YOUR LATITUDE. A star at the celestial pole has altitude = latitude
          for every observer at every instant — the oldest navigation fact there is. */
    for (const lst of [0, 47, 123, 271, 359]) {
      const p = NS.altAz(0, 90, lst, lat);
      assert.ok(Math.abs(p.alt - lat) < 1e-6,
        `a star at the north celestial pole is at altitude ${p.alt} from latitude ${lat}`);
    }
    /* 2. ON THE MERIDIAN, altitude = 90 − |latitude − declination|. */
    for (const dec of [-40, 0, 20, 60]) {
      const p = NS.altAz(100, dec, 100, lat);          /* LST = RA → hour angle 0 → on the meridian */
      assert.ok(Math.abs(p.alt - (90 - Math.abs(lat - dec))) < 1e-6,
        `on the meridian at lat ${lat}, dec ${dec}: got ${p.alt}`);
      /* …and it is due south from the north, due north from the south */
      if (Math.abs(lat - dec) > 1e-9) assert.equal(Math.round(p.az), lat > dec ? 180 : 0);
    }
    /* 3. A STAR ON THE CELESTIAL EQUATOR RISES DUE EAST. Six hours (90°) before it transits, its
          azimuth is 90° exactly, at every latitude away from the poles. */
    if (Math.abs(lat) < 89) {
      const p = NS.altAz(0, 0, -90, lat);
      assert.ok(Math.abs(p.az - 90) < 1e-6, `an equatorial star rises due east, got az ${p.az} at lat ${lat}`);
      assert.ok(Math.abs(p.alt) < 1e-6, `…and at altitude 0, got ${p.alt}`);
    }
  }
});

test('R208 ⑤b: the projection puts the zenith at the centre and EAST ON THE LEFT', () => {
  const NS = nightSky();
  const R = 100;
  /* ⚠ not deepEqual against [0,0]: −cos(0)·0 is NEGATIVE ZERO, and strict deep equality separates
     −0 from 0. The claim is "at the centre", so it is a distance. */
  const z = NS.project(90, 0, R);
  assert.ok(Math.hypot(z[0], z[1]) < 1e-9, `the zenith is the centre, got ${z}`);
  const n = NS.project(0, 0, R), e = NS.project(0, 90, R), s = NS.project(0, 180, R), w = NS.project(0, 270, R);
  assert.ok(Math.abs(Math.hypot(n[0], n[1]) - R) < 1e-9, 'the horizon is the rim');
  assert.ok(n[1] < -R * 0.99, 'north is up');
  assert.ok(s[1] > R * 0.99, 'south is down');
  /* ⚠ looking UP mirrors the compass: a chart with east on the right is the sky seen from OUTSIDE,
     which is js/space-sky.js's view, not this one. */
  assert.ok(e[0] > R * 0.99, 'east is on the LEFT of the sky, which is +x in canvas coordinates '
    + 'only because the canvas y axis points down — see project()');
  assert.ok(w[0] < -R * 0.99, 'and west opposite it');
});

test('R208 ⑤c: the horizon angle takes the Earth curving away, and the sea is a surface', () => {
  const NS = nightSky();
  /* a 1,000 m peak 20 km away, seen from sea level. Flat-earth would be atan(1000/20000) = 2.862°;
     the curvature drop at 20 km with k = 1.13 is 20000²/(2·1.13·6371008.8) = 27.8 m, so the real
     angle is atan((1000−27.8)/20000) = 2.783°. The DIFFERENCE is the whole point of the term. */
  const flat = Math.atan2(1000, 20000) * 180 / Math.PI;
  const real = NS.elevAngleDeg(1000, 0, 20000);
  assert.ok(real < flat, 'the curvature term lowers a distant peak');
  assert.ok(Math.abs(real - 2.7834) < 0.002, `expected 2.783°, got ${real.toFixed(4)}`);
  /* and it grows with the square of the distance: at 40 km the drop is four times as much */
  const d20 = flat - real;
  const d40 = Math.atan2(1000, 40000) * 180 / Math.PI - NS.elevAngleDeg(1000, 0, 40000);
  assert.ok(d40 / d20 > 1.9 && d40 / d20 < 2.1,
    `the drop is d²/2kR, so twice the distance is twice the ANGLE deficit here: ratio ${(d40 / d20).toFixed(2)}`);
  const src = read('js/night-sky.js');
  /* ⚠ the observer stands on the SURFACE. The Terrarium DEM is bathymetric, so mid-Pacific answers
     −5,367 m; measured before this clamp, an open-ocean point reported a skyline where there is
     none and hid 3,823 of 4,404 stars behind it. */
  assert.ok(/Math\.max\(0,\s*h0raw\)/.test(src), 'the eye is clamped to sea level over water');
  assert.ok(/elevAngleDeg\(Math\.max\(0,\s*h\)/.test(src), 'and so is the ground along each ray');
});

test('R208 ⑤d: it borrows the catalogue, the ephemeris, the DEM and the clock', () => {
  const src = read('js/night-sky.js');
  assert.ok(/window\.IntMapSky/.test(src), 'the star catalogue and precession come from js/space-sky.js');
  assert.ok(/window\.IntMapEphemeris/.test(src), 'the Sun, Moon and planets from js/ephemeris.js');
  assert.ok(/window\.IntMapTerrain/.test(src), 'the terrain from js/map-extras.js');
  /* ⚠ the clock is asked with when(). #R200 recorded that the other spelling does not exist and
     reaching for it is a silent undefined rather than an error.
     ⚠ Comments stripped first — this file NAMES the wrong spelling in order to warn about it, and a
     bare source scan would fail on its own documentation. That is the second time this round. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(/IntMapTime[\s\S]{0,80}when\(\)/.test(code), 'the master clock is asked with when()');
  assert.ok(!/IntMapTime\.now\b/.test(code), '…and never with the spelling that does not exist');
  /* and the two reasons a star is not drawn are counted APART — "behind a mountain" and "washed out
     by daylight" are different answers, and a single number cannot say which */
  assert.ok(/starsHiddenByTerrain/.test(src) && /starsLostToDaylight/.test(src),
    'terrain occlusion and daylight are reported separately');
  /* reachable from Atlas as well as from the right-click item (STANDING #R112) */
  assert.ok(/window\.IntMapNightSky&&window\.IntMapNightSky\.open/.test(read('js/tool-panel.js')),
    'the right-click menu opens it');
  const atlas = read('js/atlas-console.js');
  assert.ok(/case 'nightSky':/.test(atlas), 'Atlas can open it');
  assert.ok(/NIGHT SKY FROM A POINT/.test(atlas),
    '…and it is in the SYS catalogue — an action the catalogue does not list does not exist to the '
    + 'planner (#R115)');
});

/* ═══ ⑥ THE OTHER PLANETS' MOONS ══════════════════════════════════════════════════════════════ */

test('R208 ⑥a: every satellite carries a real epoch, a stated frame, and a mean anomaly', () => {
  const p = join(ROOT, 'data', 'moons.json');
  assert.ok(existsSync(p), 'data/moons.json is built (scripts/build-moons.mjs)');
  const doc = JSON.parse(readFileSync(p, 'utf8'));
  assert.ok(/JPL|Jet Propulsion/i.test(doc.attribution), 'the source is named in the file');
  const all = Object.values(doc.planets).flat();
  assert.ok(all.length > 100, `only ${all.length} satellites`);
  for (const m of all) {
    /* ⚠ THE MEAN ANOMALY AT EPOCH IS THE WHOLE POINT. #R197 refused to place these because without
       it a moon is at a chosen angle; a row that lost it must not be shipped as if it had one. */
    assert.ok(Number.isFinite(m.mDeg), `${m.name} has no mean anomaly at epoch`);
    assert.ok(Number.isFinite(m.wDeg) && Number.isFinite(m.nodeDeg) && Number.isFinite(m.iDeg),
      `${m.name} is missing an orientation angle`);
    assert.ok(m.aKm > 0 && m.periodDays > 0, `${m.name} has no orbit`);
    assert.ok(m.epoch, `${m.name} has no stated epoch`);
    /* ⚠ and the FRAME its i/node are measured in — the ecliptic and a planet's local Laplace plane
       differ by tens of degrees for a close giant-planet satellite */
    assert.ok(m.frame === 'ecliptic' || m.frame === 'laplace', `${m.name}: frame "${m.frame}"`);
    if (m.frame === 'laplace') {
      assert.ok(Number.isFinite(m.poleRaDeg) && Number.isFinite(m.poleDecDeg),
        `${m.name} is on a Laplace plane with no pole — it cannot be placed and must not be kept`);
    }
  }
  /* the four Galileans are there, with their published semi-major axes (km) */
  const jup = Object.fromEntries((doc.planets.jupiter || []).map((m) => [m.name, m]));
  for (const [n, a, P] of [['Io', 421800, 1.762732], ['Europa', 671100, 3.525463],
    ['Ganymede', 1070400, 7.155588], ['Callisto', 1882700, 16.690440]]) {
    assert.ok(jup[n], `${n} is missing`);
    assert.equal(jup[n].aKm, a, `${n} semi-major axis`);
    assert.ok(Math.abs(jup[n].periodDays - P) < 1e-6, `${n} period`);
    assert.equal(jup[n].frame, 'laplace', `${n} is referred to Jupiter's Laplace plane`);
  }
});

test('R208 ⑥b: the client propagates them and rotates the Laplace plane, and says so', () => {
  const src = read('js/space.js');
  assert.ok(/E\.kepler\(M,\s*m\.e\)/.test(src),
    "the eccentric anomaly comes from js/ephemeris.js's own solver, not a second copy");
  assert.ok(/m\.mDeg\s*\+\s*n\s*\*\s*\(jd\s*-\s*2451545\.0\)/.test(src),
    'the mean anomaly is propagated from the epoch, which is what makes the phase real');
  assert.ok(/m\.frame==='laplace'/.test(src), 'the Laplace rotation is applied only where the row says to');
  assert.ok(/OBLIQ/.test(src), 'and equatorial → ecliptic afterwards, because the scene is ecliptic');
  /* a moon with no published radius is drawn at a FLOOR, not at an invented size */
  assert.ok(/m\.radiusKm\?Math\.max\(0\.004,\s*m\.radiusKm\/b\.rKm\):0\.006/.test(src),
    'an unmeasured radius falls back to a floor rather than a guess');
  /* ⚠ and js/ephemeris.js's "deliberately not here" note must acknowledge this, or the file and the
     app now disagree about whether the moons exist */
  assert.ok(/#R208[\s\S]{0,400}data\/moons\.json/.test(read('js/ephemeris.js')),
    "js/ephemeris.js still says the moons are deliberately absent without noting where they came from");
});

/* ═══ ⑦ WHAT TEN TIMES THE ROWS BROKE, WHICH ONLY THE DEEP TIER SAW ═══════════════════════════ */

test('R208 ⑦a: nothing spreads the gazetteer into a function call', () => {
  /* ⚠ MEASURED THE HARD WAY. `push(...src[type])` passes one ARGUMENT PER ELEMENT, and the argument
     limit is the stack limit: fine at 15,048 rows, `RangeError: Maximum call stack size exceeded`
     at 148,083. It surfaced two commits later, in a CESIUM spec, as 「applyTheme re-entered itself
     until the stack gave out」 — because that is the test that watches for uncaught errors — and it
     took a stack capture off the minified bundle to find. The local gate never saw it; the deep
     dispatch did, which is the argument for running deep before a push (#R205/#R207). */
  const nc = read('js/news-context.js');
  assert.ok(!/\.push\(\.\.\.src\[type\]\)/.test(nc), 'the merge is a loop, not a spread');
  assert.ok(/for\s*\(let i=0;i<from\.length;i\+\+\)\s*dst\.push\(from\[i\]\)/.test(nc),
    'and it is written as one, so it does not depend on how many rows there are');
});

test('R208 ⑦b: the legacy regex index is capped; the growth goes to the locator that can index it', () => {
  const gz = read('js/gazetteer.js');
  assert.ok(/INDEX_WORLD_CAP\s*=\s*15000/.test(gz),
    'the matcher-shaped index takes the head of the world list');
  assert.ok(/feed\(_worldRows,\s*INDEX_WORLD_CAP\)/.test(gz), 'and the cap is applied');
  /* ⚠ the reason is not tidiness: js/news-context.js compiles a RegExp per term from this index and
     SCANS it per news item, and js/search-geocode.js walks it with a Levenshtein per query. At
     148,083 rows the boot stopped finishing — measured, the page hung building the RegExps.
     The deterministic locator gets all of them instead, through `world()`. */
  assert.ok(/world:\(\)=>_worldRows/.test(gz), 'the full list is still published for the locator');
  const nc = read('js/news-context.js');
  assert.ok(/registerSlices\(w\)/.test(nc),
    'and the locator is fed the FULL row array, not the capped index');
});

/* ═══ ⑧ OCEAN CURRENTS ════════════════════════════════════════════════════════════════════════ */

test('R208 ⑧a: the paths are traced through a measured field, and warm/cold is derived', () => {
  const p = join(ROOT, 'data', 'ocean-currents.json');
  assert.ok(existsSync(p), 'data/ocean-currents.json is built (scripts/build-ocean-currents.mjs)');
  const doc = JSON.parse(readFileSync(p, 'utf8'));
  /* ⚠ NOT the dataset that was approved. #R207 stopped on the Maps.com licence; the Data Basin copy
     IS CC BY 3.0 and its API then answered `allow_anonymous_download: false`, which needs an account
     this build may not create. What is here is built from a public-domain field instead, and the
     attribution has to say so rather than implying the approved source. */
  assert.ok(/OSCAR/.test(doc.source) && /public domain/i.test(doc.attribution),
    'the source is named and its licence stated');
  assert.ok(/traced/i.test(doc.attribution) && /seed/i.test(doc.attribution),
    'and it says which part is measured and which part is editorial');
  assert.ok(doc.named.length >= 20, `${doc.named.length} named currents`);
  assert.ok(doc.arrows.length > 3000, `${doc.arrows.length} arrows`);

  for (const c of doc.named) {
    assert.ok(c.en && c.ja, `${c.en}: both names`);
    assert.ok(['warm', 'cold', 'zonal'].includes(c.kind), `${c.en}: kind "${c.kind}"`);
    assert.ok(c.path.length >= 6, `${c.en}: ${c.path.length} vertices is not a path`);
    /* every vertex is a real coordinate, and no path jumps the antimeridian mid-line */
    let prev = null;
    for (const [lng, lat] of c.path) {
      assert.ok(lng >= -180 && lng <= 180 && lat >= -85 && lat <= 85, `${c.en}: ${lng},${lat}`);
      if (prev) assert.ok(Math.abs(lng - prev) < 180, `${c.en} crosses the seam inside one line`);
      prev = lng;
    }
    /* ⚠ the classification must AGREE with the number it was derived from — if these can disagree,
       one of them is decoration. The first version compared the trace's endpoints and got the
       Kuroshio zonal and the North Atlantic Drift cold; this is the poleward component instead. */
    const k = c.polewardMs > 0.012 ? 'warm' : (c.polewardMs < -0.012 ? 'cold' : 'zonal');
    assert.equal(c.kind, k, `${c.en}: kind ${c.kind} but poleward ${c.polewardMs}`);
  }

  /* the four best-known western boundary currents carry warm water poleward — that is what a
     western boundary current IS, and if the trace says otherwise the field is being read wrong */
  const by = Object.fromEntries(doc.named.map((c) => [c.en, c]));
  for (const n of ['Gulf Stream', 'Kuroshio', 'East Australian Current', 'Agulhas Current']) {
    assert.ok(by[n], `${n} is missing`);
    assert.equal(by[n].kind, 'warm', `${n} is a warm western boundary current`);
  }
  /* …and these carry cold water equatorward */
  for (const n of ['Labrador Current', 'Oyashio', 'California Current', 'Benguela Current']) {
    assert.ok(by[n], `${n} is missing`);
    assert.equal(by[n].kind, 'cold', `${n} is a cold eastern boundary / subpolar current`);
  }
  /* the Gulf Stream is the fastest thing in the set, and OSCAR's 1/3° mean resolves it near 1 m/s */
  assert.ok(by['Gulf Stream'].maxSpeed > 0.6, `Gulf Stream max ${by['Gulf Stream'].maxSpeed} m/s`);
});

test('R208 ⑧b: the layer draws warm red, cold blue, and zonal neither', () => {
  const dl = read('js/data-layers.js');
  assert.ok(/OC_WARM="#e8503a", OC_COLD="#3a7fe8", OC_ZONAL="#9aa7b4"/.test(dl),
    'the three colours are named once');
  assert.ok(/c\.kind==="warm"\?OC_WARM:c\.kind==="cold"\?OC_COLD:OC_ZONAL/.test(dl),
    'and chosen from the DERIVED kind, so a current that is genuinely zonal is not forced into one');
  assert.ok(/lyr-oceancur-arrows/.test(dl) && /"text-rotate":\["get","bearing"\]/.test(dl),
    'the arrows are rotated to the measured flow');
  assert.ok(/"text-size":\["interpolate",\["linear"\],\["get","speed"\]/.test(dl),
    'and sized by the measured speed');
  assert.ok(/"symbol-placement":"line","text-field":\["get","name"\]/.test(dl), 'the currents are named on the map');
  assert.ok(/lyrOceanCur:/.test(dl), 'the row is labelled');
  assert.equal((dl.match(/lyrOceanCur:/g) || []).length, 5, 'in all five languages');
});

/* ═══ ⑨ THE AXIS DOES NOT JUMP AT THE MAP↔SPACE SEAM ══════════════════════════════════════════ */

test('R208 ⑨: the space camera interpolates its up-vector instead of snapping to the ecliptic', () => {
  const src = read('js/space.js');
  /* ⚠ the up-vector was the literal [0,0,1] — the ECLIPTIC north — while the map draws the Earth
     with its own axis vertical. Those differ by the obliquity, so the crossing rolled the Earth by
     up to 23.44° in one frame. #R203 matched the face, the size and the instant across that seam;
     this was the one thing left that did not match. */
  assert.ok(/function upVector\(\)/.test(src) && /function axisBlend\(\)/.test(src),
    'the up-vector is computed, not a constant');
  assert.ok(/mLook\(eye,\[0,0,0\],upVector\(\)\)/.test(src), 'and the camera uses it');
  assert.ok(!/mLook\(eye,\[0,0,0\],\[0,0,1\]\)/.test(src), 'the hard-wired ecliptic up is gone');
  assert.ok(/poleVector\('earth'/.test(src),
    "the Earth's axis comes from js/ephemeris.js rather than being re-derived from the obliquity");
  /* ⚠ AND IT MUST STILL REACH THE ECLIPTIC. Holding the Earth's axis up for ever would put every
     planet's orbit on a permanent 23° slant, so the blend has to fall to zero as the Earth shrinks —
     it is driven by the Earth's own apparent size, which is the same gesture that crosses the seam. */
  assert.ok(/earthRadiusPx\(\)\s*\/\s*Math\.max\(1,\s*H\s*\/\s*2\)/.test(src),
    'the blend is driven by the apparent size of the Earth');
  const knee = /const t = \(f - 0\.06\) \/ \(([\d.]+) - 0\.06\);/.exec(src);
  assert.ok(knee, 'the two knees are stated');
  /* MEASURED: `enterFromZoom` lands with the Earth at 0.32 of the viewport half-height, so a knee
     above that leaves a jump. 0.55 was tried first and left ~11° at the seam. */
  assert.ok(Number(knee[1]) <= 0.32,
    `the upper knee is ${knee[1]}, above the 0.32 the handover measures at — the seam would still jump`);
});

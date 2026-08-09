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

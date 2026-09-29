/* ============================================================================
 *  The world gazetteer (data/gazetteer-world.json.gz, js/gazetteer.js) and the news locator that reads
 *  it (js/newsgeo.js, js/news-context.js).
 * ----------------------------------------------------------------------------
 *  Gathered from tests/r208-checks ① ② ⑦ — the katakana boundary (the reported 「ハンディファン」 →
 *  Diffa, Niger, and the class it belongs to), the gazetteer ten times again and shipped compressed,
 *  and what ten times the rows broke that only the deep tier saw. Titles keep the round that wrote them.
 *
 *  ⚠ THEY PIN INVARIANTS, NOT SHAPES (#R207/#R205). Where a number is named it is because the number IS
 *  the claim (148,083 rows is "ten times"); where the claim is a relation it is derived from both sides.
 *
 *  RUN: the locator is loaded the way both hosts load it (it is shared with the Supabase function, which
 *  has no `window`, so it publishes on globalThis) and fed the MATCHABLE view of the real gazetteer.
 *  ⚠ GLOBAL STATE: that load sets globalThis.window / globalThis.IntMapNewsGeo for the life of this
 *  process — this file is its own process under node --test, and nothing else here reads either.
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
let NG = null, ROWS = null;
function locator() {
  if (NG) return NG;
  globalThis.window = globalThis;
  new Function(read('js/newsgeo.js'))();
  NG = globalThis.IntMapNewsGeo;
  assert.ok(NG && typeof NG.register === 'function', 'the locator loaded');
  const gz = { addEventListener() { } };
  new Function('window', 'document', read('js/gazetteer.js'))(gz, { baseURI: 'https://example.test/' });
  const doc = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'gazetteer-world.json.gz'))).toString('utf8'));
  /* ⚠ (#R620) THE MATCHABLE VIEW, WHICH IS WHAT js/news-context.js HANDS OVER. A row whose name a
     curated table already carries is flagged (`cur`, field 11) and withheld from the matcher; registering
     the whole list would put a second «Tokyo» in a locator the app never puts one in. */
  ROWS = gz.IntMapGazetteer._rowsFrom(doc).filter((r) => r[11] !== 1);
  NG.register(ROWS.map(([type, terms, lng, lat, en, jp]) => ({ terms, lng, lat, type, name_en: en, name_jp: jp })));
  return NG;
}

/* ═══ ① THE KATAKANA BOUNDARY — the reported bug, and the class it belongs to ═════════════════ */

test('R208 ①a: a place name that STARTS inside a katakana run is not a mention', () => {
  const N = locator();
  /* every one of these pinned a real city before this round, against the 15,048-row table. The first
     is the reported case (「ハンディファン」→ ディファ = Diffa, Niger); the rest are the same mechanism
     found by running ordinary Japanese headlines through it. */
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
  /* RUN (was a regex over the guard's spelling): the same four facts, asked of the locator.
     The long tail is DISCOVERED from the gazetteer — katakana-named rows that the locator itself
     reports at the bulk rank — rather than listed here. */
  const N = locator();
  const tail = [];
  for (const r of ROWS) {
    const jp = r[5];
    if (!jp || !/^[ァ-ヺー]{4,6}$/.test(jp)) continue;
    const hit = N.locate(jp + 'で地震', { lang: 'ja' });
    if (!hit || hit.name.en !== r[4] || !(hit.rank <= 3)) continue;
    tail.push({ jp, en: r[4] });
    if (tail.length >= 12) break;
  }
  assert.ok(tail.length >= 5, `only ${tail.length} long-tail katakana places were found — the check would be looking at nothing`);
  for (const { jp, en } of tail) {
    /* the RIGHT edge, for the long tail: the match must end with the katakana run */
    const right = N.locate(jp + 'ホテルで地震', { lang: 'ja' });
    assert.ok(!right || right.name.en !== en, `「${jp}ホテル」 pinned ${en} — a long-tail place must match a COMPLETE katakana run`);
    /* the LEFT edge, for everything: a match may not START inside a run */
    const left = N.locate('ア' + jp + 'で地震', { lang: 'ja' });
    assert.ok(!left || left.name.en !== en, `「ア${jp}」 pinned ${en} — a match may not start inside a run`);
  }
  /* …while a CURATED place may end inside a run — the right-hand edge is scoped by rank, not applied
     flatly. ⚠ the direction of the rank test is the whole thing: rank counts UPWARDS (a prominence
     prior), so the bulk import is the FLOOR; written the other way round the guard silently applies to
     every place and 「パリオリンピック」 stops resolving. It did, while #R208 was being written. */
  const paris = N.locate('パリオリンピックが開幕', { lang: 'ja' });
  assert.ok(paris && paris.name.en === 'Paris' && paris.rank > 3, 'a curated place followed by katakana still resolves');
  /* U+30FB (・) is NOT katakana — it is the separator in 「ロシア・モスクワ」 */
  const moscow = N.locate('ロシア・モスクワで会談', { lang: 'ja' });
  assert.ok(moscow && moscow.name.en === 'Moscow' && moscow.surface === 'モスクワ', `「ロシア・モスクワ」 → ${moscow && moscow.name.en}`);
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
  /* ⚠ READ (this half): the curated rows are a table inside js/newsgeo.js — their KIND is the claim */
  const src = read('js/newsgeo.js');
  for (const n of ['England', 'Scotland', 'Wales', 'Northern Ireland']) {
    assert.ok(new RegExp(`'${n}\\|[^']*\\|GB\\|[A-Z]{3}\\|[^']*\\|admin1\\|`).test(src),
      `${n} is missing from the curated admin-1 rows — with cities1000 loaded, the only "England" ` +
      'left in the index was a village in Arkansas, and it out-scored Cambridge');
  }
  const r = locator().locate('Cambridge scientists in England publish fusion result', { lang: 'en' });
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
  assert.ok(/GeoNames/.test(doc.attribution) && /cities1000/.test(doc.attribution), 'the source is named in the file itself (standing instruction 4)');
  assert.ok(Array.isArray(doc.langs) && doc.langs.length >= 10, 'the languages it carries are declared, not implied');
  /* ⚠ every language shipped must be one the matcher can actually read — js/newsgeo.js tokenises
     Latin/Greek/Cyrillic and scans Han/kana, so Hangul/Arabic/Hebrew/Thai names could never match */
  for (const l of doc.langs) {
    assert.ok(!['ko', 'ar', 'he', 'th', 'hi', 'fa', 'am'].includes(l), `'${l}' is shipped but js/newsgeo.js cannot tokenise its script`);
  }
});

/* ⚠ READ, NOT RUN: the fetch/decompress path and the macrotask yield run in a browser page against the
   network; a microtask yield would run all 148,083 rows in one task, which only a browser can show. */
test('R208 ②b: the client un-gzips it and registers it in slices', () => {
  const gz = read('js/gazetteer.js');
  assert.ok(/gazetteer-world\.json\.gz/.test(gz), 'the client asks for the compressed artefact');
  /* (data-one-door) the read moved into js/data-door.js, the one reader of data/: the gazetteer asks it
     by its window name, and the door is what decides from the magic (tests/data-one-door-checks ③ RUNS
     that decision against an uncompressed body) */
  assert.ok(/window\.IntMapDataDoor/.test(gz), 'the gazetteer reads the file through the one door');
  assert.ok(/head\[0\] === 0x1f && head\[1\] === 0x8b/.test(read('js/data-door.js')),
    'it decides from the gzip magic, not from the file name — a host that sets Content-Encoding hands this code plain JSON and the name would be a lie');
  const nc = read('js/news-context.js');
  assert.ok(/function registerSlices\(/.test(nc), 'a `function` declaration, because rebuildGeoIndex is defined above it and calls it (#R200 TDZ)');
  assert.ok(/scheduler[\s\S]{0,80}yield|setTimeout\(res,0\)/.test(nc),
    'the yield between slices is a MACROtask — a microtask would run all 148,083 in one task, which is the thing being avoided');
  assert.ok(!/IntMapNewsGeo\.register\(w\.map\(/.test(nc), 'the one-shot registration is gone');
});

/* ═══ ⑦ WHAT TEN TIMES THE ROWS BROKE, WHICH ONLY THE DEEP TIER SAW ════════════════════════════ */

/* ⚠ READ, NOT RUN: the merge is inside the news-context factory of the booted app. */
test('R208 ⑦a: nothing spreads the gazetteer into a function call', () => {
  /* ⚠ MEASURED THE HARD WAY. `push(...src[type])` passes one ARGUMENT PER ELEMENT, and the argument limit
     is the stack limit: fine at 15,048 rows, `RangeError: Maximum call stack size exceeded` at 148,083 —
     surfacing two commits later in a CESIUM spec as 「applyTheme re-entered itself」. */
  const nc = read('js/news-context.js');
  assert.ok(!/\.push\(\.\.\.src\[type\]\)/.test(nc), 'the merge is a loop, not a spread');
  assert.ok(/for\s*\(let i=0;i<from\.length;i\+\+\)\s*dst\.push\(from\[i\]\)/.test(nc),
    'and it is written as one, so it does not depend on how many rows there are');
});

/* ⚠ READ, NOT RUN: the legacy index is built by the gazetteer module inside a booted page (the RegExp
   compile per term is what hung the boot at 148,083 rows — measured in the browser). */
test('R208 ⑦b: the legacy regex index is capped; the growth goes to the locator that can index it', () => {
  const gz = read('js/gazetteer.js');
  assert.ok(/INDEX_WORLD_CAP\s*=\s*15000/.test(gz), 'the matcher-shaped index takes the head of the world list');
  /* ⚠ (#R620) the rows the cap is applied TO are the matchable ones */
  assert.ok(/feed\((?:w|_worldRows),\s*INDEX_WORLD_CAP\)/.test(gz), 'and the cap is applied');
  assert.ok(/const w=worldMatchable\(\);/.test(gz), 'and it is fed the matchable view (#R620)');
  assert.ok(/world:\(\)=>_worldRows/.test(gz), 'the full list is still published for the data readers');
  assert.ok(/worldMatchable,/.test(gz), '…and the matchable view for the locator (#R620)');
  const nc = read('js/news-context.js');
  assert.ok(/registerSlices\(w\)/.test(nc), 'and the locator is fed the FULL row array, not the capped index');
  assert.ok(/const w=GZ\.worldMatchable&&GZ\.worldMatchable\(\);/.test(nc), 'that array being the matchable view — the curated coordinate still wins (#R620)');
});

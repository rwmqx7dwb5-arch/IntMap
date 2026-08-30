/* ============================================================================
 *  #R504 — 「もっと多くの航空機を」と「方位磁針をちゃんとした計器に」
 * ----------------------------------------------------------------------------
 *  ⚠ 依頼の1本目は描画の話に見えて、**描画は一度も関係していなかった**。変更前の本番を測ると:
 *
 *      x-intmap-count      2,699 機
 *      x-intmap-coverage   lattice 0/980      ← どの isolate に訊いても、いつ訊いても
 *      provider の網が同じ分に見ていた機体   10,924 機（位置つき 10,911）
 *
 *  原因は2つあり、両方とも「上流が渋い」ではなかった。
 *
 *    ① **掃引の進捗が isolate を越えていなかった。** `STATE.cursor`・タイルごとの `last`/`miss`・
 *       #R434 の訊いた空域の台帳は全部 isolate の記憶で、Supabase は冷えた isolate を頻繁に配る。
 *       ⇒ 被覆率は 0 から動けず、掃引は毎回 cursor 0 から歩き直し、大洋を間引く `miss` は
 *         毎回 0 に戻るので**何も間引いていなかった**。
 *    ② **「間隔」が上流の実力の 1/5 だった。** #R434 はこの関数**全体**に 4 枚 / 45 秒
 *       ＝ 0.089 read/s を課していた。同じアドレス・同じ UA で測り直すと、2 秒間隔で 40 回中
 *       31 回が 200。**間隔で成功数が動かないのに 2 秒で 78 % 通る**のは四連発の弾倉ではなく
 *       毎秒 0.5 発ほどの leaky bucket の形である。
 *
 *  だからここで守るのは「今の定数が正しいこと」ではなく、**構造**である:
 *
 *    ① 上流を読む道は `takeTokens()` を通ったものしか無い（新しい呼び出し元が予算を迂回できない）。
 *    ② その bucket の算術が実際に平均 READ_RATE_PER_S を超えない——**出荷される関数そのもの**を
 *       vm に切り出して回す（#R498 の手口。写した式は写した瞬間から別物になる）。
 *    ③ isolate を越えて残るべき4つ（cursor・last・miss・台帳）が全部 `sweep.json` に載り、
 *       **格子の長さが変わったら捨てる**。番号を新しい空へ写すのは「探査済み」の嘘になる。
 *    ④ 45 秒の「間隔」は**消えている**。⚠ 消えたのは間隔だけで、「その空は訊く価値があるか」の
 *       VIEW_STALE_S は残る——1つの定数が持っていた2つの仕事のうち、1つだけを剥がした回なので、
 *       もう片方を巻き添えで消していないことを門にする。
 *    ⑤ 掃引ワークフローは「訊く」ことしかできない（`tiles=` は要求であって許可ではない）。
 *
 *  2本目（方位磁針）は見た目の話なので、守れるのは**見た目が壊れる形**だけである:
 *
 *    ⑥ 方位環は1つの図形で、デスクトップと携帯が**同じ幾何**を使う（片方だけ直す事故を止める）。
 *    ⑦ 北の針**以外**は `currentColor`＝テーマ追従。#9aa0a6 のような固定灰は1つも残っていない。
 *    ⑧ 2つの SVG は `id` を1つも持たない。gradient/defs を足した瞬間に**ページ内で id が衝突**し、
 *       後から来たほうが黙って前のを参照する——CSS でも検査でも見えない壊れ方なので、
 *       「入れられなくする」ほうを門にする。
 *    ⑨ #R480 の約束（.compass-btn は glass を再宣言しない・box-shadow はここにしか無い）が生きている。
 *
 *  3本目〜5本目は同じ回の追加依頼で、どれも「余白」の話である:
 *
 *    ⑩ 上の2つのバーと地名検索バーは**字を小さくせずに**縦を詰めた（実測 35.3→31.3・42→34）。
 *       ⚠ 検査するのは数値そのものではなく、**丸みが高さを追い越していないこと**——半径 21px は
 *       高さ 42px のちょうど半分で、高さだけ縮めるとピルが「角の丸い長方形」に化ける。
 *    ⑪ 画面下の2つの隅は**1つの余白を共有する**（「同じ幅で右下にそろえて」＝「隙間だけ同じように」）。
 *       片方だけ動かせる限り、それは「そろえた」ではなく「たまたま同じ数を2か所に書いた」である
 *       ——#R500 の形なので、**2つの数が等しいこと**を門にする。
 *    ⑫ Chronos の字は時計であって履歴の矢印ではない。
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

const FEED = 'supabase/functions/aviation-feed/index.ts';

/* ⚠ コメントを剥がしてから数える。#R341 で同じ検査が**自分の説明コメント**に当たって
   `genSyntheticPlanes()` を3つ数えた——この文書化の濃いファイルでは10回目の形である。 */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}
const count = (s, re) => (s.match(re) || []).length;

/* ── ① 上流へ出る道は、予算を通ったものしか無い ─────────────────────────────────────────── */
test('R504 ① every upstream read is granted by the one budget', () => {
  const code = codeOnly(rd(FEED));

  assert.match(code, /const READ_RATE_PER_S = [\d.]+;/, 'the ceiling is a named constant');
  assert.match(code, /const READ_BURST = \d+;/, 'and so is the burst');

  /* readTile は readSerial の中からしか呼ばれない（OpenSky の全球1発は別経路で、格子を使わない）。 */
  const readTileCalls = count(code, /(?<!function )\breadTile\(/g);
  assert.equal(readTileCalls, 1, `readTile() must have exactly one caller (readSerial); found ${readTileCalls}`);

  /* そして readSerial の呼び出し元は、どれも takeTokens で許可を得た数しか渡せない。
     呼び出し元の数と takeTokens の呼び出し数が一致することが、その言い換えである。 */
  const serialCalls = count(code, /await readSerial\(/g);
  const grants = count(code, /(?<!function )\btakeTokens\(/g);
  assert.equal(serialCalls, 2, `readSerial() has two call sites (view + sweep); found ${serialCalls}`);
  assert.equal(grants, serialCalls,
    `every readSerial() call site must be preceded by a takeTokens() grant — ${serialCalls} reads, ${grants} grants`);

  /* 視野側は「許可された枚数」だけを渡す。ranked 全部を渡してしまえば bucket は飾りになる。 */
  assert.match(code, /const grant = worthIt \? takeTokens\(ranked\.length, now\) : 0;/,
    'the viewport asks the budget for what it ranked');
  assert.match(code, /const spent = ranked\.slice\(0, grant\);/,
    'and spends only what it was granted');
  assert.match(code, /await readSerial\(provider, spent\.map\(/,
    'the read is over `spent`, not over `ranked`');
});

/* ── ② 出荷される bucket の算術そのものを回す ───────────────────────────────────────────── */
test('R504 ② the shipped bucket never averages more than READ_RATE_PER_S', () => {
  const src = rd(FEED);
  const RATE = Number(/const READ_RATE_PER_S = ([\d.]+);/.exec(src)[1]);
  const BURST = Number(/const READ_BURST = (\d+);/.exec(src)[1]);

  /* ⚠ 写さずに切り出す。ここで式を書き写したら、明日この定数が動いたときに検査は古い式を
     守りつづける——#R498 が「シップ済みの塊を vm に出す」を選んだのと同じ理由。 */
  const grab = (name) => {
    const re = new RegExp('\\nfunction ' + name + '\\([\\s\\S]*?\\n\\}');
    const m = re.exec(src);
    assert.ok(m, `${name}() must be a top-level function so this test can run the shipped one`);
    return m[0];
  };
  const ctx = {
    STATE: { readTokens: BURST, readTokensAt: 0, backoffUntil: 0 },
    READ_BURST: BURST, READ_RATE_PER_S: RATE, Math,
  };
  vm.createContext(ctx);
  vm.runInContext(grab('refillTokens') + '\n' + grab('takeTokens'), ctx);

  /* 空のバケツは、経過時間ぶんしか出さない */
  ctx.STATE.readTokens = 0; ctx.STATE.readTokensAt = 1000;
  assert.equal(ctx.takeTokens(6, 1000 + 10000), Math.floor(10 * RATE),
    '10 s of refill grants floor(10 · rate) tiles');

  /* どれだけ待っても BURST を超えない */
  ctx.STATE.readTokens = 0; ctx.STATE.readTokensAt = 1000;
  assert.equal(ctx.takeTokens(9999, 1000 + 86400_000), BURST, 'a day of quiet still only fills the burst');

  /* backoff 中は 0 */
  ctx.STATE.readTokens = BURST; ctx.STATE.readTokensAt = 0; ctx.STATE.backoffUntil = 5000;
  assert.equal(ctx.takeTokens(4, 4000), 0, 'nothing is granted while the function is backing off');
  ctx.STATE.backoffUntil = 0;

  /* そして長い目で見た平均が ceiling を超えない。1 秒ごとに 4 枚ねだり続ける利用者を1時間。 */
  ctx.STATE.readTokens = BURST; ctx.STATE.readTokensAt = 0;
  let got = 0;
  for (let t = 0; t <= 3600_000; t += 1000) got += ctx.takeTokens(4, t);
  const perSecond = got / 3600;
  assert.ok(perSecond <= RATE + BURST / 3600 + 1e-9,
    `a greedy hour must average <= the ceiling: ${perSecond.toFixed(4)}/s against ${RATE}/s`);
  assert.ok(perSecond > RATE * 0.95,
    `…and it must actually SPEND the ceiling, or the change bought nothing: ${perSecond.toFixed(4)}/s`);
});

/* ── ③ isolate を越えて残るもの ─────────────────────────────────────────────────────────── */
test('R504 ③ the sweep ledger carries everything that used to die with the isolate', () => {
  const code = codeOnly(rd(FEED));

  /* 書く側 — cursor / last / miss / 台帳 / 最後に上流へ触れた時刻 */
  const body = /function sweepBody\(\)[\s\S]*?\n\}/.exec(code);
  assert.ok(body, 'sweepBody() builds the persisted form');
  for (const field of ['cursor', 'readAt', 'last', 'miss', 'asked', 'n:']) {
    assert.ok(body[0].includes(field), `sweepBody() must persist ${field}`);
  }

  /* 読む側 — そして格子の長さが変わったら捨てる */
  const apply = /function applySweep\([\s\S]*?\n\}/.exec(code);
  assert.ok(apply, 'applySweep() restores it');
  assert.match(apply[0], /j\.n === L\.length/,
    'a lattice of a different length must be discarded, not renumbered onto new sky');
  assert.match(apply[0], /STATE\.cursor = /, 'the cursor is restored');
  assert.match(apply[0], /STATE\.readTokensAt = /,
    'and so is the bucket clock — otherwise a cold isolate grants itself a free burst');

  /* hydrate が実際に呼ぶ（作ったが誰も呼ばない、が #R493 の形） */
  assert.match(code, /Promise\.all\(\[loadSnapshot\(\), loadSweep\(\)/,
    'ensureHydrated loads the ledger alongside the aircraft');
  assert.match(code, /if \(applySweep\(sweep\)\)/, 'and applies it');

  /* 書き込みは両方の実際に走る経路から呼ばれる（#R341: after() は応答を越えて生きない） */
  const saves = count(code, /await saveSweep\(/g);
  assert.ok(saves >= 2,
    `saveSweep must be reached from BOTH paths that really run — the viewport read and ?refresh=1; found ${saves}`);
});

/* ── ③ b THE BUCKET'S MIME ALLOW-LIST IS A GATE THIS FUNCTION HAS TO PASS ─────────────────────
   ⚠ CAUGHT BEFORE DEPLOY, AND ONLY BECAUSE THE MIGRATION WAS RE-READ. `aviation` is declared with
   `allowed_mime_types = array['application/octet-stream']`, and Supabase Storage answers 415 to an
   upload with any other content-type. The first draft of saveSweep sent `application/json` —
   honest, and refused by the bucket on every single write, with the world snapshot and every other
   path still working perfectly. That is the #R341 shape exactly: a feature that looks alive in
   every test and never persists a byte in production. The two facts live in different files, so
   this is the only place they can be compared. */
test('R504 ③ b every object this function writes has a content-type the bucket accepts', () => {
  const mig = rd('supabase/migrations/20260823130000_aviation_snapshot_bucket.sql');
  const m = /allowed_mime_types\s*=?\s*array\[([^\]]+)\]/.exec(mig);
  assert.ok(m, 'the migration still declares the bucket mime allow-list');
  const allowed = m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
  assert.ok(allowed.length, 'and the list is not empty');

  const code = codeOnly(rd(FEED));
  /* every upload — world.bin and sweep.json alike — goes to /storage/v1/object/ */
  const uploads = [...code.matchAll(/svcUrl\("\/storage\/v1\/object\/"[\s\S]{0,900}?"content-type": "([^"]+)"/g)]
    .map((x) => x[1]);
  assert.ok(uploads.length >= 2, `both objects must be written from here; found ${uploads.length} upload(s)`);
  for (const ct of uploads) {
    assert.ok(allowed.includes(ct),
      `content-type "${ct}" is not in the bucket's allow-list [${allowed.join(', ')}] — Storage answers 415 and the write silently never happens`);
  }
});

/* ── ④ 消したのは「間隔」だけ ───────────────────────────────────────────────────────────── */
test('R504 ④ the global 45 s spacing is gone, and only the spacing', () => {
  const code = codeOnly(rd(FEED));
  assert.ok(!/now - STATE\.viewReadAt >= VIEW_STALE_S/.test(code),
    'the old "one burst per VIEW_STALE_S for the whole function" gate must be gone');
  /* ⚠ ですが VIEW_STALE_S 自身は残る。それは「その空は訊く価値があるか」で、上流の作法ではない。 */
  assert.match(code, /const VIEW_STALE_S = 45;/, 'VIEW_STALE_S still exists');
  assert.match(code, /const worthIt = ranked\.length > 0 && \(now - stalest\) \/ 1000 > VIEW_STALE_S;/,
    'and still decides whether a patch of sky is stale enough to be worth a read');

  /* 429 の休みは段階的で、成功で戻る */
  assert.match(code, /const RATE_BACKOFF_MIN_MS = \d+;/, 'the pause starts short');
  assert.match(code, /STATE\.backoffStep = Math\.min\(RATE_BACKOFF_MS, Math\.max\(RATE_BACKOFF_MIN_MS, STATE\.backoffStep \* 2\)\)/,
    'and doubles while refusals keep arriving, capped at the old flat value');
  assert.match(code, /STATE\.backoffStep = 0;/, 'a successful read clears it');
});

/* ── ⑤ 掃引ワークフローは「訊く」ことしかできない ───────────────────────────────────────── */
test('R504 ⑤ the sweeper may ask for a bigger slice; only the function may grant it', () => {
  const wf = rd('.github/workflows/aviation-sweep.yml');
  assert.match(wf, /\?ch=world&refresh=1&tiles=\d+/, 'the workflow asks with tiles=');
  assert.match(wf, /SLICES=\d+/, 'and loops rather than firing twice');

  const code = codeOnly(rd(FEED));
  assert.match(code, /const SWEEP_TILES_MAX = READ_BURST;/,
    'the query parameter is clamped to something the bucket can actually hold');
  assert.match(code, /Math\.min\(SWEEP_TILES_MAX, Number\(url\.searchParams\.get\("tiles"\)\)/,
    'the clamp is applied where the parameter is read');
  assert.match(code, /const grant = takeTokens\(want, now\);/,
    'and the sweep still asks the same budget everything else asks');
});

/* ── ⑥⑦⑧ 方位環 ────────────────────────────────────────────────────────────────────────── */
function roseOf(html, cls) {
  const re = new RegExp('<svg class="' + cls + '"[\\s\\S]*?</svg>');
  const m = re.exec(html);
  assert.ok(m, `index.html must carry the ${cls} rose`);
  return m[0];
}
/* 幾何だけを取り出す — class / width / height は2つで違ってよい、形は違ってはいけない */
const geometryOf = (svg) => (svg.match(/(?:points|d|r|cx|cy|fill|stroke|stroke-opacity|fill-opacity|stroke-width)="[^"]*"/g) || []).join('|');

test('R504 ⑥ one rose, drawn at two sizes — the desktop and the phone cannot drift apart', () => {
  const html = rd('index.html');
  const desk = roseOf(html, 'compass-svg');
  const phone = roseOf(html, 'm-compass-svg');

  for (const [name, svg] of [['desktop', desk], ['phone', phone]]) {
    assert.match(svg, /viewBox="0 0 40 40"/, `${name}: the rose is drawn in the 40×40 dial box`);
    /* リング・目盛り・二面取りの針・軸受け。二枚合わせの針は「点対称の三角形2枚」ではないので、
       4 枚の polygon があることが「面取りされている」の機械的な言い方になる。 */
    assert.equal(count(svg, /<polygon /g), 4, `${name}: the needle is four facets, not two flat triangles`);
    assert.equal(count(svg, /<circle /g), 3, `${name}: the dial ring and the two-part pivot`);
    assert.equal(count(svg, /<path /g), 2, `${name}: cardinal and intercardinal ticks`);
  }
  assert.equal(geometryOf(desk), geometryOf(phone),
    'the two copies must be the same artwork — only class/width/height may differ');
});

test('R504 ⑦ every part of the rose but the north needle follows the theme', () => {
  const html = rd('index.html');
  const css = rd('css/intmap.css');

  for (const cls of ['compass-svg', 'm-compass-svg']) {
    const svg = roseOf(html, cls);
    /* 固定色は北の針の2面だけ。#9aa0a6 は「明るい背景のために選ばれた中間灰」で、
       #R480 以来この釦が着ている暗いガラスの上では泥になる。 */
    const fixed = (svg.match(/#[0-9a-fA-F]{3,8}/g) || []);
    assert.equal(fixed.length, 2, `${cls}: only the two north facets may carry a fixed colour — found ${fixed.join(', ')}`);
    for (const c of fixed) assert.match(c, /^#(ff453a|d2312a)$/i, `${cls}: ${c} is not one of the two reds`);
    assert.ok(!/#9aa0a6/i.test(svg), `${cls}: the old fixed grey must be gone`);
    assert.ok(count(svg, /currentColor/g) >= 6, `${cls}: the ring, ticks, south needle and pivot all take currentColor`);
  }

  /* …そして currentColor が何かに解決される。ボタンが color を持たなければ、
     継承されるのは祖先の任意の色で、テーマ追従は偶然になる。 */
  const btn = /\n\s*\.compass-btn\{([\s\S]*?)\}/.exec(css);
  assert.ok(btn, 'css/intmap.css declares .compass-btn');
  assert.match(btn[1], /color:var\(--text-main\)/, '.compass-btn must give the rose a colour to inherit');
  const fab = /\n\s*\.m-fab\{([\s\S]*?)\}/.exec(css);
  assert.ok(fab && /color:var\(--text-main\)/.test(fab[1]), '.m-fab already did (#R23) — this test says so out loud');
});

test('R504 ⑧ neither rose declares an id — two copies of one gradient would collide', () => {
  const html = rd('index.html');
  for (const cls of ['compass-svg', 'm-compass-svg']) {
    const svg = roseOf(html, cls);
    assert.ok(!/\sid="/.test(svg),
      `${cls}: the same document holds both roses, so an id here is a duplicate id — use flat facets, not <defs>`);
  }
});

test('R504 ⑨ the housing still keeps #R480 promises', () => {
  const css = rd('css/intmap.css');
  const btn = /\n\s*\.compass-btn\{([\s\S]*?)\}/.exec(css)[1];
  /* glass の2つの一覧が background / backdrop-filter / border を !important で立てるので、
     ここで宣言し直すのは起動 CSS 予算に載る死んだ宣言である（#R480 が測って消した）。 */
  for (const dead of ['background:', 'backdrop-filter:', '-webkit-backdrop-filter:', 'border:']) {
    assert.ok(!btn.includes(dead), `.compass-btn must not declare ${dead} — the glass lists own it`);
  }
  assert.match(btn, /box-shadow:var\(--shadow\)/, 'box-shadow is in neither list, so it lives here');
  assert.match(css, /\.compass-btn:active\{ transform:scale\(0\.94\); \}/, 'the press response survives');
  /* 回転の書き手は変わっていない（#R480 の7つの呼び出し元は行も class も知っている） */
  assert.match(rd('js/map-readout.js'), /querySelector\('\.compass-svg'\)/, 'the bearing still rotates the whole rose');
  assert.match(rd('js/mobile-ui.js'), /querySelector\('\.m-compass-svg'\)/, 'and the phone rotates its own copy');
});

/* ── ⑩⑪⑫ 余白 ─────────────────────────────────────────────────────────────────────────────── */
const cssRule = (css, sel) => {
  const m = new RegExp('\\n\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([\\s\\S]*?)\\}').exec(css);
  assert.ok(m, 'css/intmap.css declares ' + sel);
  return m[1];
};
const px = (decl, prop) => {
  const m = new RegExp('(?:^|[;{ ])' + prop + ':(-?[\\d.]+)px').exec(decl);
  assert.ok(m, prop + ' is a plain px value in: ' + decl.slice(0, 90));
  return Number(m[1]);
};

test('R504 ⑩ the top bars got shorter without the type getting smaller', () => {
  const css = rd('css/intmap.css');

  /* the pills: 12 px type, less padding around it */
  const btn = cssRule(css, '.view-btn');
  assert.match(btn, /font-size:12px/, 'the label is still 12 px — this was a padding change, not a type change');
  assert.ok(px(btn, 'padding') < 7,
    'the pill row keeps its old vertical padding; 「縦幅を詰めて」 asked for less');

  /* the search bar: 14 px field, less padding, and a radius that is still half the height */
  const bar = cssRule(css, '.map-search');
  const input = cssRule(css, '.map-search input');
  const go = cssRule(css, '.map-search>button');
  assert.match(input, /font-size:14px/, 'the field is still 14 px');
  const shellPad = px(bar, 'padding');
  const fieldPad = px(input, 'padding');
  assert.ok(fieldPad < 8 && shellPad < 4, 'the search bar keeps its old vertical padding');
  assert.ok(px(go, 'padding') === fieldPad,
    'the Search button and the field must breathe the same, or the bar grows to the taller of them');

  /* ⚠ THE RADIUS IS HALF THE HEIGHT, AND THAT IS WHAT MAKES IT A PILL. Derived from the shipped
     numbers rather than written down, so shortening the bar again cannot quietly square it off.
     The field's line box is the tallest thing inside; 14 px type measures ~17 px. */
  const height = 17 + fieldPad * 2 + shellPad * 2 + 2 /* 1 px border, both sides */;
  const radius = px(bar, 'border-radius');
  assert.ok(Math.abs(radius - height / 2) <= 2.5,
    'the pill radius (' + radius + ') no longer tracks half the bar height (~' + (height / 2).toFixed(1) + ')');
});

test('R504 ⑪ the two bottom corners share one inset', () => {
  const css = rd('css/intmap.css');
  const readout = cssRule(css, '.coord-readout');
  /* the frosted rule is the one that positions Chronos in the shipping app; the base rule above it
     is overridden by it, which is why this reads the LAST .news-timeline{...} in the file. */
  const all = [...css.matchAll(/\n\s*\.news-timeline\{([\s\S]*?)\}/g)]
    .map((m) => m[1])
    /* ⚠ ONLY THE RULES THAT REALLY PLACE IT ON A DESKTOP. The phone's rule sets the same two
       properties with !important and a calc() that tracks the bottom sheet, which is a different
       question with a different answer; picking it up here would compare a corner inset against a
       sheet offset. */
    .filter((b) => /(?:^|[;{ ])right:\d+(?:\.\d+)?px/.test(b)
                && /(?:^|[;{ ])bottom:\d+(?:\.\d+)?px/.test(b)
                && !/!important/.test(b));
  assert.ok(all.length >= 2, 'the frosted rule that actually positions Chronos is still there');
  const chronos = all[all.length - 1];

  const left = px(readout, 'left'), bottomL = px(readout, 'bottom');
  const right = px(chronos, 'right'), bottomR = px(chronos, 'bottom');

  assert.equal(left, bottomL, 'the readout sits the same distance from the two edges it touches');
  assert.equal(right, bottomR, '…and so does Chronos');
  /* ⚠ THIS IS THE ASSERTION THE REQUEST ACTUALLY MADE. 「隙間だけ同じように詰める」 is a statement
     about the PAIR, so what is pinned is that the two numbers are the same — not what they are.
     Moving one corner and forgetting the other is exactly the failure this catches (#R500). */
  assert.equal(left, right, 'the two bottom corners must share one inset — found ' + left + ' and ' + right);
  assert.ok(left < 9, 'and it must actually be tighter than the 9 px it was');
});

test('R504 ⑫ the Chronos glyph is a clock, not a history arrow', () => {
  const html = rd('index.html');
  const m = /<span class="ntl-open-ico">([\s\S]*?)<\/span>/.exec(html);
  assert.ok(m, 'index.html carries the Chronos glyph');
  const svg = m[1];
  /* ⚠ WHAT IT MUST NOT BE. The old mark was rotate-ccw — a corner tick and a nearly-closed arc —
     with a pair of hands inside it, which at 23 px reads as 「戻す」 rather than as a clock. */
  assert.ok(!/M3 3v5h5/.test(svg), 'the undo arrow head is gone');
  assert.ok(!/A9 9 0|A 9 9 0/i.test(svg), 'and so is its open sweep arc');
  /* what it must be: a face, marks, two hands from the centre, a pivot */
  assert.equal((svg.match(/<circle /g) || []).length, 2, 'a face and a pivot');
  assert.match(svg, /<circle cx="12" cy="12" r="9\.?\d*"\/>/, 'the face is a full circle, centred');
  assert.match(svg, /M12 3\.6v1\.6M20\.4 12h-1\.6M12 20\.4v-1\.6M3\.6 12h1\.6/, 'twelve, three, six and nine are marked');
  assert.match(svg, /M12 6\.9V12l3\.7 2\.2/, 'and the hands leave the centre');
  assert.ok(!/\sid="/.test(svg), 'no id — the same trap as the compass roses (⑧)');
});

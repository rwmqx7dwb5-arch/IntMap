/* ============================================================================
 *  #R408 — 「起動したあと、誰も見ていないうちに済ませていた仕事」の回帰テスト
 * ----------------------------------------------------------------------------
 *  外部の監査が「スマホで遅い」の原因を6つ挙げた。実測して残ったのは、どれも**大きさ**ではなく
 *  **誰も頼んでいない仕事**だった。この回が塞いだのは4つで、4つとも「無かった」のではなく
 *  「**あるのに使われていなかった / 見ていなかった**」である:
 *
 *    · `js/runtime.js` の `every()`（＝hidden なタブでは動かない1本のタイマーホイール）は
 *      #R234 から在って、**呼び出し元が0件**だった。ファイル冒頭は「39本の `setInterval` を
 *      1本にする」と宣言しており、実際には js/ に生の `setInterval` が **43か所**あった。
 *      宣言と実体が食い違ったまま174ラウンド。#R394 の「走っていない機構を名乗る列」と同じ形。
 *    · `js/layer-previews.js` の `_openQueue` は canvas ペインタ **33件**を1回の同期 forEach で
 *      流し切る。パネルを一度も開かなくても起動直後に走る。`deadline.timeRemaining()` は
 *      このファイルに0件で、入力による中断もモバイル抑止も無い。
 *      ⚠ そして**自分の見積りが古びていた**——`:709` のコメントは取得量を「約950 KB」と言うが、
 *      それは #R193 当時の6枚ぶんで、実体は **28枚 / 4,051,978 B**（#R268/#R309 が22枚足した）。
 *      監査はこのコメントを孫引きして「950 KB」と報告した。**古いコメントは古い測定を配る。**
 *    · `js/tile-warm.js` の予測先読みは、発火**前**なら `clearTimeout` で潰れるが、発火**後**は
 *      止まらない（`AbortController` も世代カウンタも0件）。次の操作が始まっても、もう見ない
 *      場所のタイルを取り続ける。
 *    · `js/world-packs.js` の斜線カットは、キャッシュの鍵に**視野の矩形**（0.25度丸め）を
 *      持っていた。0.25度は指が動かすどんなパンより細かいので、**パンのたびに必ず外す**。
 *      外したあとに走るのは数千地物からの一覧・10度の格子・整列で、肝心の引き算だけが
 *      `cutMemo` で無料——そして #R344 の出力署名が「変わっていない」と結果を捨てる。
 *    · `src/main.js` の「プログラムが持つ全ファクトリの一覧」から **5件**が落ちていた
 *      （`worldPacks` / `facilities` / `insolation` / `space` / `aircraftPoints`）。
 *      一覧の目的は「消えた・改名されたファイルに、欠けるための場所を与える」ことなので、
 *      載っていない5件は改名しても起動ガードが黙る。#R280 の形。
 *
 *  だからここで検査するのは「今そうなっていること」ではなく、**戻したら赤くなること**である。
 *
 *    ① プレビューのキューが deadline で区切られ、入力で止まり、モバイルでは起動時に走らない
 *    ② js/ に生の `setInterval` が1つも無く、ホイールに**実際に呼び出し元がある**
 *    ③ 先読みが世代で打ち切られ、打ち切った URL を「頼んだ」と記憶しない
 *    ④ ファクトリの一覧が**導出で照合**される（手書きの完全性を信じない）
 *    ⑤ 斜線カットの鍵が視野の矩形ではなく「視野に入っている tier 0 の国の集合」である
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ⚠ 素の grep はコメントと文字列を読む。この回の調査で実際に外している——`js/app-body.js:168` の
   **ブロックコメントの中の説明例**が「99番目の機能ファクトリ」として数えられ、外部の監査もその
   99を引用した（実体は98）。だから数えるものは AST から取る。 */
function ast(rel) {
  return acorn.parse(rd(rel), { ecmaVersion: 'latest', sourceType: 'module' });
}
function lineOf(src, pos) { return src.slice(0, pos).split('\n').length; }

/* 呼び出し名の全数。`setInterval(...)` も `window.setInterval(...)` も同じ名前で返す。 */
function callsNamed(rel, want) {
  const src = rd(rel);
  const out = [];
  walk.simple(acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }), {
    CallExpression(node) {
      const c = node.callee;
      const n = (c.type === 'Identifier' && c.name)
        || (c.type === 'MemberExpression' && c.property && c.property.name);
      if (n === want) out.push(lineOf(src, node.start));
    },
  });
  return out;
}

const JS = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f);

/* ── ② THE WHEEL HAS CALLERS NOW, AND NOTHING ELSE ARMS A TIMER ───────────────────────────────
   ⚠ 二つの主張を1つの検査にしないこと。「生の `setInterval` が0件」だけでは、**全部消しても緑**
   になる（#R402 ⑬ と同じ形）。だから「ホイールに呼び出し元が N 件以上ある」を必ず並べて置く。 */
test('R408 ②a: js/ に生の setInterval は無い（js/runtime.js のフォールバックを除く）', () => {
  const offenders = [];
  for (const f of JS) {
    if (f === 'js/runtime.js') continue;          /* ホイール自身の内側 — 下の ②c が中身を見る */
    for (const ln of callsNamed(f, 'setInterval')) offenders.push(`${f}:${ln}`);
  }
  assert.deepEqual(offenders, [],
    'これらは js/runtime.js の everyTick() を通っていないので、hidden なタブでも起き続ける');
});

test('R408 ②b: そのホイールに実際の呼び出し元がある（宣言だけの機構にしない）', () => {
  const users = JS.filter((f) => /\bfrom\s+'\.\/runtime\.js'/.test(rd(f)) && /\beveryTick\s*\(/.test(rd(f)));
  assert.ok(users.length >= 25,
    `everyTick を呼ぶファイルが ${users.length} 件しかない — #R234 から呼び出し元0件だったのが、この回の当の欠陥`);
  /* ⚠ 半分だけ変換したファイルがいちばん危ない。停止関数を `clearInterval` に渡すと**黙って無視**
     され、タイマーはタブの寿命ぶん生き残る。だから everyTick を使うファイルに clearInterval は許さない。 */
  const mixed = [];
  for (const f of users) for (const ln of callsNamed(f, 'clearInterval')) mixed.push(`${f}:${ln}`);
  assert.deepEqual(mixed, [],
    'everyTick が返すのは停止関数であって数値ハンドルではない — stopTick() を使うこと');
});

test('R408 ②c: ホイールは hidden を見ており、取りこぼしをまとめて走らせない', () => {
  const rt = rd('js/runtime.js');
  assert.match(rt, /export function everyTick\(/, 'everyTick が export されている');
  assert.match(rt, /export function stopTick\(/, 'stopTick が export されている');
  /* Runtime が無いときに黙って何もしない実装は #R170 の欠陥。フォールバックがあることを見る。 */
  assert.match(rt, /if \(R && typeof R\.every === 'function'\) return R\.every\(/,
    'everyTick は Runtime があればホイールへ委譲する');
  assert.match(rt, /h: setInterval\(fn, p\)/,
    'Runtime がまだ無い時点の呼び出しは、黙って無効になるのではなく実際のタイマーに落ちる');
  /* ホイール本体: hidden の間は next を送るだけで fn を呼ばない＝復帰時に1回。 */
  assert.match(rt, /if \(hidden && !t\.hidden\) \{ t\.next = now \+ t\.ms;/,
    'hidden の間は tick を飛ばし、飛ばした分をまとめて走らせない');
});

test('R408 ②d: register より先に鳴った時計を、register ができた瞬間に引き取る', () => {
  const rt = rd('js/runtime.js');
  /* ⚠⚠⚠ これが無いと、この回の門は**緑のまま嘘をつく**。`js/theme-sky.js` の `makeThemeSky` は
     `js/app-body.js:500` で走り、`makeRuntime` は同じ関数の :756——つまり everyTick はフォールバック
     の生 interval を張る。ソースに `setInterval` の綴りは残らないので ②a は緑、しかしタイマーは
     hidden なタブで回り続ける。#R394 の「走っていない機構を名乗る列」を、その次のラウンドで
     自分で作るところだった。 */
  assert.match(rt, /everyTick\.pending\.set\(key, \{ ms: p, fn, opts: opts \|\| undefined, h: setInterval\(fn, p\) \}\)/,
    '早すぎた登録は捨てられず、引き取れる形で残る');
  assert.match(rt, /for \(const \[k, r\] of Array\.from\(everyTick\.pending\)\)[\s\S]{0,200}API\.every\(k, r\.ms, r\.fn, r\.opts\)/,
    'makeRuntime が、生 interval を止めて同じ鍵・周期・関数をホイールへ載せ直す');
  /* 引き取りは window.IntMapRuntime を公開したあとでなければ、載せ直した先が誰にも見えない。 */
  const pub = rt.indexOf('window.IntMapRuntime = API');
  const adopt = rt.indexOf('of Array.from(everyTick.pending)');
  assert.ok(pub > 0 && adopt > pub, '引き取りは register を公開したあとに走る');

  /* ⚠ そして「早い呼び出しが実在する」ことも見る。0件になったら、この機構は次の改修で
     「使われていないから」と消される側になる（#R402 で実際にそう判断した前例がある）。 */
  const early = JS.filter((f) => /\bfrom\s+'\.\/runtime\.js'/.test(rd(f)) && /\beveryTick\s*\(/.test(rd(f)))
    .filter((f) => /js\/(theme-sky|perf-hud)\.js/.test(f));
  assert.equal(early.length, 2,
    'register 生成前に鳴く2件（theme-sky / perf-hud）がホイールを呼んでいる — 引き取りが効く相手である');
});

/* ── ① THE PREVIEW QUEUE IS SLICED, YIELDS TO THE READER, AND DOES NOT OPEN ITSELF ON A PHONE ──*/
test('R408 ①a: canvas のキューが deadline で区切られ、1スライスで必ず1件は進む', () => {
  const s = rd('js/layer-previews.js');
  /* ⚠ 「無いこと」を主張するときは必ずコメントを剥がしてから見る。この検査は最初、旧コードを
     説明している散文（`_paintQ.splice(0).forEach(...)` と書いてある行）に当たって赤くなった。
     このリポジトリで検査が自分の散文に当たるのは13回目である。 */
  assert.ok(!/_paintQ\.splice\(0\)/.test(stripComments(s)),
    'キューを splice で全部取り出すと、その時点で「1回の同期 forEach」に戻る');
  assert.match(s, /const job=_paintQ\.shift\(\);/,
    'ジョブは前から1件ずつ取る — 届かなかったジョブは配列に残る当人である');
  assert.match(s, /dl\.timeRemaining\(\)>0/, 'idle の残り時間を見ている');
  assert.match(s, /const _SLICE_MS=\d+;/, '1スライスの予算が名前のある定数である');
  const slice = +/const _SLICE_MS=(\d+);/.exec(s)[1];
  assert.ok(slice >= 4 && slice <= 8, `1スライス ${slice} ms — 4〜8 ms の帯の外`);

  /* ⚠⚠⚠ 予算を「毎回」見ると、予算より長いジョブ（実測 statChoro 85 ms）で**1件も進まず**
     永久に再予約する。だから最初の1件は無条件に走る——停止性はここが担保している。 */
  assert.match(s, /while\(_paintQ\.length\)\{\s*if\(ran\)\{/,
    '予算判定は2件目から — 1スライスで必ず1件は減る');
  /* requestIdleCallback が無い環境でも同じ予算で区切る（黙って一気に流さない）。 */
  assert.match(s, /_drainH=setTimeout\(\(\)=>_paintSlice\(null\),\d+\)/,
    'rIC の無い環境は時計だけで同じ予算を守る');
});

test('R408 ①b: 入力が来たら次のスライスを止め、静かになったら必ず再開する', () => {
  const s = rd('js/layer-previews.js');
  for (const ev of ['pointerdown', 'touchstart', 'wheel', 'keydown']) {
    assert.ok(s.includes(`'${ev}'`), `${ev} で中断する`);
  }
  assert.match(s, /_INPUT_OPT=\{passive:true,capture:true\}/,
    'リスナは passive かつ capture — 中断機構が指の動きを遅らせない');
  /* ⚠ 中断は「捨てる」ではない。取り消すのは予約だけで、キューには触らない。 */
  assert.match(s, /function _cancelDrain\(\)\{[^}]*_drainPend=false;/, '取り消すのは予約だけ');
  assert.ok(!/_cancelDrain[\s\S]{0,200}_paintQ\s*=\s*\[\]/.test(s), '中断でキューを空にしていない');
  assert.match(s, /_quietH=setTimeout\(\(\)=>\{ _quietH=0; _drainHold=false; _scheduleDrain\(\); \},_INPUT_QUIET_MS\)/,
    '最後の入力から _INPUT_QUIET_MS で必ず再開する');
  /* 張りっぱなしにしない: キューが空になったら外す。 */
  assert.match(s, /if\(_paintQ\.length\) _scheduleDrain\(\); else _wireInput\(false\);/,
    'キューが空になった時点でリスナを外す');
});

test('R408 ①c: 携帯では起動経路が門を開かない。ただしパネルを開けば全部出る', () => {
  const s = rd('js/layer-previews.js');
  assert.match(s, /const _bootMobile=\(\)=>\{[\s\S]{0,200}max-width:768px/,
    '携帯判定はアプリ自身の 768px メディアクエリと同じ文字列');
  assert.match(s, /if\(_bootMobile\(\)\) return;[\s\S]{0,400}setTimeout\(go,6000\)/,
    '起動 IIFE は携帯で早期 return し、idle+400ms も 6 秒天井も張らない');
  /* ⚠⚠⚠ CONSTITUTION §0.3 — 機能を減らしていないこと。パネル経由の入口 kick() は無傷で、
     `_openQueue` は同じキューを同じ順で全部出す。ここが壊れたら「携帯だけプレビューが出ない」
     という退行になり、それは今回いちばんやってはいけない失敗である。 */
  assert.match(s, /function kick\(/, 'パネルから開く入口が残っている');
  const kick = s.slice(s.indexOf('function kick('), s.indexOf('function kick(') + 400);
  assert.match(kick, /_openQueue\(\)/, 'kick() は今までどおり門を開く');
  assert.ok(!/_bootMobile\(\)/.test(kick), 'kick() の側に携帯の抑止は入っていない');
});

test('R408 ①d: 自分の見積りを書き直した — コメントの数が実測と一致する', () => {
  const s = rd('js/layer-previews.js');
  /* ⚠ #R193 のコメントは「~950 KB」のまま22枚ぶん古びており、外部の監査がそれを孫引きした。
     古いコメントは古い測定を配る。だから**コメントの数をディスクと突き合わせる**——「950 が
     書かれていないこと」ではない（旧値を「これは古い」と断って引用するのは正しい書き方で、
     それを禁じると次の書き手は経緯を消す）。効くのは下の2本の等式のほうである。 */
  assert.match(s, /4,051,978|4051978/, '自ホスト画像の実バイトが書かれている');
  const imgs = readdirSync(ROOT).filter((f) => /^preview_.*\.png$/.test(f));
  assert.equal(imgs.length, 28, `preview_*.png は ${imgs.length} 枚 — コメントの28枚と食い違う`);
  const bytes = imgs.reduce((n, f) => n + statSync(join(ROOT, f)).size, 0);
  assert.equal(bytes, 4051978, `実測 ${bytes} B — コメントの数と食い違う`);
});

/* ── ③ THE PREFETCH STOPS WHEN IT IS OVERTAKEN, AND FORGETS WHAT IT DID NOT ASK FOR ───────────*/
test('R408 ③a: 追い越された先読みは、その場で発行をやめる', () => {
  const s = rd('js/tile-warm.js');
  assert.match(s, /let _pfGen=0, _pfView='';/, '世代カウンタが在る');
  /* ⚠⚠⚠ 世代の鍵は「呼び出し」ではなく**タイル矩形**である。リングは携帯 60 で切られるので、
     同じ視野からの次の呼び出しは「追い越し」ではなく**切り捨てられた残り**——それを捨てると、
     いま見ている視野のために積んであった56件が消え、指が止まると誰も再提示しない。 */
  assert.match(s, /const cont=\(_view===_pfView\); _pfView=_view;/,
    '同じタイル矩形の続きは追い越しではない');
  assert.match(s, /const gen=cont\?_pfGen:\+\+_pfGen;/, '新しい矩形のときだけ番号が動く');
  assert.match(s, /for\(const u of ring\)\{ if\(_pfGen!==gen\) break;/,
    'URL 1件ごとに世代を確かめ、追い越されたらそこで止める');
  /* 3経路: 同期発行・_warmQueued・SW。どれか1つでも落とさないと、止めたつもりで走り続ける。 */
  assert.match(s, /if\(e\.g<_pfGen\)\{ _pfSeen\.delete\(e\.u\); _pfDropped\.queue\+\+; continue; \}/,
    'ポンプが古い世代のエントリを fetch の直前で捨てる');
  assert.match(s, /d\.type==='prefetch-dropped'/, 'SW が捨てた分の報告を受け取る');
});

test('R408 ③b: 捨てた URL を「もう頼んだ」と憶えない（先読みの被覆に穴を空けない）', () => {
  const s = rd('js/tile-warm.js');
  /* ⚠⚠⚠ `_pfSeen` は「一度頼んだ URL は二度と頼まない」という記憶。中止したバッチの URL が
     そこに残ると、その URL は二度と先読みされない——中止機構が、静かに被覆へ穴を空ける。 */
  assert.match(s, /if\(_pfGen!==gen\) break;[\s\S]{0,120}_pfSeen\.add\(u\); uniq\.push\(u\);/,
    '記憶と発行は同じ1手 — 発行しなかった URL は憶えない');
  assert.match(s, /_pfSeen\.delete\(u\)\) _pfDropped\.worker\+\+/,
    'SW 側で捨てられた分は、報告を受けて記憶から取り消す');

  const sw = rd('sw.js');
  assert.match(sw, /d\.type !== 'prefetch' && d\.type !== 'prefetch-more'/,
    'SW は「新しい視野」と「同じ視野の続き」を区別する');
  assert.match(sw, /_pfQueue = _pfQueue\.filter\(\(e\) => \{ if \(e\.c !== cid\) return true; stale\.push\(e\.u\); return false; \}\)/,
    '新しい視野が来たら、同じ client の未処理分だけを捨てる');
  assert.match(sw, /postMessage\(\{ type: 'prefetch-dropped', urls: stale \}\)/,
    '捨てた URL をページへ返す — 返さなければページの記憶は取り消せない');
  /* ⚠ 強さを弱めていないこと（CONSTITUTION §0.3）。上限とレーン数は据え置き。 */
  assert.match(s, /_mob\?110:280/, '傾斜・飛行時の上限は据え置き');
  assert.match(s, /_mob\?60:150/, '通常の上限は据え置き');
});

/* ── ④ THE FACTORY INVENTORY IS DERIVED, NOT TRUSTED ──────────────────────────────────────────
   一覧が「全部そろっている」ことを、一覧を読んで確かめることはできない。だから js/ が実際に
   登録するファクトリを数え、src/main.js の3つの一覧と**両方向で**突き合わせる。
   ⚠ 3つに分かれているのは種類が3つあるからで、種類は「いつ存在するか」で決まる:
     MODULE_FACTORIES  … 起動時に存在する（eager な import 閉包に居る）
     LAZY_FACTORIES    … js/lazy-modules.js に頼めば来る（tests/r209 ③ がその等式を持つ）
     CARRIED_FACTORIES … 誰も単体では取りに行かない。別の遅延モジュールが static import する。 */
function listFrom(src, name) {
  const re = new RegExp('const\\s+' + name + '\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*;');
  const m = src.match(re);
  assert.ok(m, `src/main.js が ${name} を宣言している`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/* コメントを外してから読む。⚠ この回の調査用スクリプトは最初これを忘れ、散文の中の
   「#R280's shape」のアポストロフィを引用符と読んで、存在しないファクトリを3件報告した。 */
function stripComments(src) {
  let out = '', i = 0; const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; out += ' '; continue; }
    if (c === '/' && d === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += c; i++;
      while (i < n) { if (src[i] === '\\') { out += src.slice(i, i + 2); i += 2; continue; } out += src[i]; if (src[i] === q) { i++; break; } i++; }
      continue;
    }
    out += c; i++;
  }
  return out;
}

/* eager とは「src/main.js の import の推移閉包に居る」こと。⚠ 直接の import だけを見ると
   `facilities` を取り落とす——js/osm-facilities.js を import しているのは js/layer-packs.js である。
   ⚠ そして行頭に錨を打たないこと。src/main.js には1行に2本並ぶ import が6箇所あり、
   `^import` で数えると `warFronts` が「eager でない」と誤判定される（実際にそう出た）。 */
function eagerClosure() {
  const main = stripComments(rd('src/main.js'));
  const seen = new Set();
  const queue = [...main.matchAll(/import\s+(?:[^'"]*from\s*)?['"]\.\.\/(js\/[^'"]+)['"]/g)].map((m) => m[1]);
  while (queue.length) {
    const f = queue.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    let body = '';
    try { body = stripComments(rd(f)); } catch (_) { continue; }
    for (const m of body.matchAll(/import\s+(?:[^'"]*from\s*)?['"]\.\/([^'"]+)['"]/g)) queue.push('js/' + m[1]);
  }
  return seen;
}

test('R408 ④: js/ が登録する全ファクトリが、3つの一覧のちょうど1つに載っている', () => {
  const main = stripComments(rd('src/main.js'));
  const where = new Map();
  for (const k of listFrom(main, 'MODULE_FACTORIES')) where.set(k, 'MODULE');
  for (const k of listFrom(main, 'LAZY_FACTORIES')) where.set(k, 'LAZY');
  for (const k of listFrom(main, 'CARRIED_FACTORIES')) where.set(k, 'CARRIED');

  const reg = new Map();
  for (const f of JS) {
    for (const m of stripComments(rd(f)).matchAll(/window\.IntMapModules\.([A-Za-z0-9_$]+)\s*=/g)) reg.set(m[1], f);
  }
  assert.ok(reg.size >= 130, `js/ が登録するファクトリは ${reg.size} 件 — 数えられている`);

  const unlisted = [...reg.keys()].filter((k) => !where.has(k)).sort();
  assert.deepEqual(unlisted, [],
    'どの一覧にも無いファクトリは、改名しても起動ガードが黙る（#R280 の形）');

  const ghosts = [...where.keys()].filter((k) => !reg.has(k)).sort();
  assert.deepEqual(ghosts, [],
    '一覧が、もう誰も登録していない名前を持っている');

  /* ⚠ そして「どの一覧か」も検査する。起動時に存在しないものを MODULE_FACTORIES に置くと
     `missingFactories` が毎回の清潔な起動で非空になり（#R209）、逆に起動時に存在するものを
     LAZY / CARRIED に置くと、消えても誰も報告しない。 */
  const eager = eagerClosure();
  const misplaced = [];
  for (const [k, f] of reg) {
    const w = where.get(k);
    if (w === 'MODULE' && !eager.has(f)) misplaced.push(`${k} は MODULE_FACTORIES だが ${f} は eager でない`);
    if (w !== 'MODULE' && eager.has(f)) misplaced.push(`${k} は ${w} だが ${f} は eager である`);
  }
  assert.deepEqual(misplaced, []);
});

/* ── ⑤ THE HATCH CUT IS KEYED ON THE COUNTRIES, NOT ON THE RECTANGLE ──────────────────────────*/
test('R408 ⑤: 斜線カットの鍵が視野の矩形でなく、視野に入っている tier 0 の集合である', () => {
  const src = rd('js/world-packs.js');
  const i = src.indexOf('function rebuildHatchCut(');
  assert.ok(i > 0, 'rebuildHatchCut が居る');
  const head = src.slice(i, src.indexOf('if(key===hatchCutKey) return false;', i));
  assert.ok(head.length > 0 && head.length < 4000, '鍵は関数の頭で組み立てられている');

  assert.ok(!/getBounds\(\)/.test(head),
    '鍵の組み立てにカメラの矩形が入っている — 0.25 度に丸めても、指が動かすパンは必ずこれを外す');
  assert.match(head, /const zeroSeen=\[\]/,
    '視野に入っている tier 0 の国だけを集めている');
  assert.match(head, /const key=sig\+'\|'\+zeroSeen\.join\(','\)\+'\|'\+zero\.join\(','\)/,
    '鍵は「描かれている地物の署名 × 視野内の tier 0 × tier 0 全体」である');

  /* ⚠ そして視野の旗は早期 return の**前**で数えられていなければ意味が無い。下で数えていた
     ままだと、鍵は集合を名乗るのに集合を知らないので組み立てられない。 */
  assert.match(head, /inv\[c\]=!!inView\(geo\[i\]\)/, '視野の旗はここで数えている');
  const body = src.slice(i);
  assert.equal((body.match(/inv\[c\]=!!inView\(geo\[i\]\)/g) || []).length, 1,
    '視野の旗を2か所で数えると、鍵が指すものと実際に回すものが別々に決まる');
});

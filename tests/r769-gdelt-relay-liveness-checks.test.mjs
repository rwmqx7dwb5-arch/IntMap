/* ============================================================================
 *  #R769 — 空の棚を見つけた読者が、棚を空のままにして帰っていた回
 * ----------------------------------------------------------------------------
 *  ⚠ ここに書くのは「直した結果」ではなく **2026-09-17 に実測された欠陥そのもの**
 *  （[[intmap-restate-the-defect-not-the-fix]]）。到達した答えを不変条件にすると、
 *  次の欠陥をその答えが守ってしまう。
 *
 *  ① `gdelt-relay` の分岐 2（stale）は読者の後ろで refresh していたのに、分岐 4
 *     （cold かつ上流が拒否）は **何も残さずに 502 を返していた**。キャッシュが空という
 *     唯一の場合が、キャッシュに何も書かれない唯一の場合でもあった。本番実測: この
 *     endpoint への連続 8 回が 502 x8、全部 `cold`。次の読者は毎回同じ場所から始めていた。
 *
 *  ② その 502 は「上流が何と言ったか」を述べていなかった。ヘッダは
 *     `x-intmap-gdelt-cache: cold` だけで、外から見ると
 *       「GDELT が拒否した」「GDELT が artlist でないものを返した」「GDELT に到達できなかった」
 *     が **1 つの区別できない事象**だった。3 つは別の故障で、別の対処を要する。
 *
 *  ③ `js/proxy-fetch.js` の `null` が 2 つの問いに答えていた。本番実測（同日）:
 *     GDELT の梯子が全段拒否（自前 relay 502 / 直接は CORS 拒否 / 公開 proxy 4 本は
 *     401・403・408・abort）で読者には何も出なかった——`js/atlas-sources.js` は
 *     「全部の出典が拒否した」と「出典は答えたがニュースが無かった」を区別できない。
 *     片方は IntMap の配管の故障で、もう片方は世界についての事実である。
 *
 *  ⚠⚠⚠ この検査はネットワークに一切出ない。`globalThis.fetch` は全ケースでスタブし、
 *  実 URL を叩く検査は 1 本も無い。Edge Function は **ソースとして読むのではなく評価する**
 *  （#R505 が「テストの種類が 1 つも無かった」と記録した型）。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── A. gdelt-relay を評価して、ハンドラそのものを手に入れる ─────────────────────────────
   #R505 と同じ理由でソース検査ではない。ただしあちらは「module 本体が評価に到達するか」
   だけを訊くので子プロセスで済んだ。こちらは **ハンドラを呼んで返答を測る** ので、
   `Deno.serve` に渡されたものをこの場で捕まえる必要がある。*/

const ENV = { SUPABASE_URL: 'https://stub.supabase.test', GDELT_STORAGE_KEY: 'stub-service-key' };
let HANDLER = null;
/* EdgeRuntime.waitUntil のスパイ。⚠ 「warmBehind という関数がある」ではなく
   「この分岐が waitUntil を呼ぶ」を測るためにここに居る（欠陥 ①）。 */
const WAITED = [];
globalThis.Deno = { env: { get: (n) => ENV[n] || '' }, serve: (h) => { HANDLER = h; } };
globalThis.EdgeRuntime = { waitUntil: (p) => { WAITED.push({ p, atCall: CALLS.length }); } };

/* ⚠ 時計は仮想。人工的な遅延を実時間で払うと、1 リクエストが上流の予算（数十秒）を
   まるごと待つ検査になる。上流スタブが 1 回答えるたびに時計を `advanceMs` 進めるので、
   予算・床・試行回数は実装のものがそのまま効き、実時間は 0 に近い。 */
const REAL_NOW = Date.now;
let VCLOCK = 0;
const virtualClock = (on) => { if (on) { VCLOCK = REAL_NOW(); Date.now = () => VCLOCK; } else Date.now = REAL_NOW; };

/* 上流への 1 回ごとの呼び出し（開始時刻＝仮想）。 */
let CALLS = [];

/* 上流以外の fetch は Storage で、それ以外の URL は **この検査の誤り** なので落とす。 */
function stubFetch(upstream, advanceMs) {
  globalThis.fetch = async (input) => {
    const u = String((input && input.url) || input);
    if (u.includes('/storage/v1/object/public/')) return new Response('nothing', { status: 404 });
    if (u.includes('/storage/v1/')) return new Response('{}', { status: 200 });
    if (u.startsWith('https://api.gdeltproject.org/')) {
      CALLS.push(Date.now());
      VCLOCK += advanceMs;          /* 人工的な遅延 */
      return upstream();
    }
    throw new Error('this check must not reach the network: ' + u);
  };
}

const jsonRes = (body, status) =>
  new Response(body, { status, headers: { 'content-type': 'application/json' } });

const ASK = 'https://api.gdeltproject.org/api/v2/doc/doc?query=japan&mode=artlist&format=json&timespan=3d';

await import(pathToFileURL(join(ROOT, 'supabase/functions/gdelt-relay/index.ts')).href);

/* 1 リクエスト。戻り値は Response と、そのとき走った上流呼び出しの記録。
   ⚠ warm は応答より後まで生きるので、テストの外へ漏らさないようここで必ず落ち着かせる
   （module 直下の UPSTREAM_NOTE は request-scoped なので、前のテストの warm が次のテストの
   ヘッダを書き換えられる）。 */
async function ask({ upstream, advanceMs = 10000, url = ASK }) {
  CALLS = [];
  WAITED.length = 0;
  virtualClock(true);
  stubFetch(upstream, advanceMs);
  try {
    const res = await HANDLER(new Request('https://edge.test/functions/v1/gdelt-relay?u=' + encodeURIComponent(url)));
    const waited = WAITED.slice();
    const callsAtAnswer = CALLS.length;
    await Promise.all(waited.map((w) => w.p.catch(() => {})));
    return { res, waited, callsAtAnswer, calls: CALLS.slice() };
  } finally { virtualClock(false); }
}

const REFUSED = () => jsonRes('{"error":"rate limited"}', 429);

/* ── ① 空の棚を空のまま帰らない ──────────────────────────────────────────────────────── */
test('R769 ①: cold かつ上流拒否のとき、この分岐は棚に何かを残そうとする', async () => {
  const { res, waited } = await ask({ upstream: REFUSED });

  assert.equal(res.status, 502);
  assert.equal(res.headers.get('x-intmap-gdelt-cache'), 'cold');
  assert.ok(waited.length >= 1,
    'キャッシュが空で GDELT が拒否したとき、この分岐は読者の後ろで何も走らせずに 502 を返していた'
    + '——キャッシュが空という唯一の場合が、キャッシュに何も書かれない唯一の場合でもあった。'
    + '本番実測 2026-09-17: 連続 8 回が 502 x8、全部 cold。応答を返したあとまで生き残る経路'
    + '（EdgeRuntime.waitUntil）に上流読みが渡されていなければ、次の読者も同じ空の棚を見る');
});

/* ── ② 502 が上流の答えを名指す ─────────────────────────────────────────────────────── */
test('R769 ②: その 502 は、上流が何と言ったかを名指す', async () => {
  const { res } = await ask({ upstream: REFUSED });
  const note = res.headers.get('x-intmap-gdelt-upstream') || '';

  assert.ok(note.includes('429'),
    '本番実測 2026-09-17: 8 つの 502 はどれも x-intmap-gdelt-cache: cold だけを持ち、上流が何を'
    + `言ったかはどこにも書かれていなかった（実測 upstream=「${note}」）`);
  const body = JSON.parse(await res.text());
  assert.equal(body.error, 'upstream_unavailable');
  assert.ok(body.upstream && body.upstream !== '-',
    'ヘッダを読めない呼び手（curl でない、CORS の外の読み手）にも本文で同じことが言えていなかった');
});

/* ── ③ 3 つの故障が 1 つの区別できない事象になっていた ─────────────────────────────── */
test('R769 ③: 拒否・artlist でない 200・到達不能 は、互いに違う語で返る', async () => {
  const word = async (upstream) => {
    const { res } = await ask({ upstream });
    assert.equal(res.status, 502, 'どれもキャッシュが空のまま失敗する道である');
    return String(res.headers.get('x-intmap-gdelt-upstream') || '');
  };

  const refused = await word(REFUSED);
  /* 200 だが artlist ではない JSON */
  const notArtlist = await word(() => jsonRes('{"status":"ok","items":[]}', 200));
  /* JSON ですらないテキスト */
  const notJson = await word(() => new Response('<html>Sorry...</html>',
    { status: 200, headers: { 'content-type': 'text/html' } }));
  /* そもそも届かない */
  const unreachable = await word(() => { throw new Error('ENOTFOUND'); });

  assert.ok(notArtlist.includes('not-artlist'),
    'GDELT が 200 で artlist でないものを返したことは、拒否とは別の故障である');
  const words = [refused, notArtlist, notJson, unreachable].map((w) => w.split('/')[0]);
  assert.equal(new Set(words).size, words.length,
    '本番実測 2026-09-17: 502 が持っていたのは cold の 1 語だけで、「GDELT が拒否した」'
    + '「GDELT が artlist でないものを返した」「GDELT に到達できなかった」が外からは 1 つの'
    + `区別できない事象だった（実測 ${JSON.stringify(words)}）`);
});

/* ── ④ 予算の床 ─────────────────────────────────────────────────────────────────────────
   ⚠ 実装の定数はここに **書き写さない**——それを持っているファイルから読む。数を写すと、
   数が動いたときに検査は「実装と一致しているか」ではなく「1 年前の数と一致しているか」を
   訊き始める。 */
const RELAY_SRC = src('supabase/functions/gdelt-relay/index.ts');
const constFromSource = (name) => {
  const m = new RegExp('^const ' + name + ' = (\\d+);', 'm').exec(RELAY_SRC);
  assert.ok(m, name + ' は gdelt-relay が持っている数である（検査が持ってはならない）');
  return Number(m[1]);
};

test('R769 ④: warm は 1 回で諦めず、かつ終われない試行を始めない', async () => {
  const WARM = constFromSource('WARM_BUDGET_MS');
  const FLOOR = constFromSource('MIN_ATTEMPT_MS');
  const D = 10000;   /* 1 回の応答にかかる人工的な遅延 */

  const { waited, calls } = await ask({ upstream: REFUSED, advanceMs: D });
  assert.equal(waited.length, 1, 'cold で拒否された読者の後ろで warm が 1 本走る');
  assert.ok(calls.length >= 2, '読者自身の上流読みと、その後ろの warm の両方が上流に届いている');

  /* ⚠ warm がどこから始まるかを添字で決め打ちしない——warm の 1 回目は refresh() の中で
     同期的に発行されるので waitUntil が呼ばれた時点の呼び出し数に既に入っており、その
     「同期かどうか」は実装の書き方であってこの検査の主題ではない。warm の試行列は
     **warm の予算に収まる最長の末尾** として見つける（読者の在線読みまで含めた列は、
     warm の予算 1 本には収まらない）。 */
  const fitsBudget = (starts) => starts.every((s) => WARM - (s - starts[0]) >= FLOOR);
  /* 先頭は読者自身の在線読み（分岐 3）で、warm より必ず前にある。在線読みが 2 回以上ある実装でも
     「warm の予算 1 本に収まらない先頭」は落ちるので、残るのは warm だけになる。 */
  let warm = calls.slice(1);
  while (warm.length && !fitsBudget(warm)) warm = warm.slice(1);

  /* 「上流が毎回拒否するとき、1 回投げて諦める」が欠陥だった。同日実測、同一要求の 6 対:
       429 を引いた要求        成功 0/6     429 は 9.4-13.4 s
       その直後の即時再試行    成功 3/6     200 は 14.9-19.6 s
     ——最初の 1 投が負ける側なので、再試行しないことは「上流が落ちている」ではなく
     「一度も当たりを引かない」を意味していた。 */
  assert.ok(warm.length >= 2,
    `warm は予算を使い切るまで再試行する（実測 ${warm.length} 回）。1 回で諦めると、最初の 1 投が`
    + '負ける側である以上、棚は永久に空のままになる');

  /* ⚠ そして「終われない試行」を始めない。2026-09-17 の 29 リクエストで、
     api.gdeltproject.org が返したどんな種類の応答も最速 9,443 ms だった——それを下回る
     残り時間で始めた試行は、失敗を bound せず **失敗を製造する**（#R464 が 6 s の直接
     deadline で記録した同じ誤り）。 */
  warm.forEach((s, i) => {
    assert.ok(WARM - (s - warm[0]) >= FLOOR,
      `warm の ${i + 1} 回目は残り ${WARM - (s - warm[0])} ms で始まっている——最短応答 ${FLOOR} ms に`
      + '満たない残り時間で始めた試行は、失敗を bound せず失敗を製造する');
  });
  const end = (warm[warm.length - 1] - warm[0]) + D;
  assert.ok(WARM - end < FLOOR,
    `warm は、まだ 1 回分の余地（残り ${WARM - end} ms）がある状態で止まっている——予算は`
    + '「そこまで使ってよい」であって「そこまで使う」ではないが、使えるうちに止まるなら棚は空のまま');
});

/* ── ⑤ 実際に付いたヘッダから集める ─────────────────────────────────────────────────────
   #R468 ① は同じ不変条件をソースの文字列から集めている。ここはその不変条件を **事実**
   （返ってきた Response が実際に持っているヘッダ）に付け直したもので、綴りの一覧も
   ソースの正規表現も持たない。#R468 実測: 本番の 4 回の fetch で JavaScript が読めたのは
   CORS safelist の 3 本だけだった——名指されていないヘッダは、アプリが走る面には存在しない。*/
test('R769 ⑤: この関数が実際に付けた x-intmap-* が 1 つ残らず Expose される', async () => {
  const seen = new Map();   /* header -> どの場面で出たか */
  const collect = (label, res) => {
    for (const [k] of res.headers) if (k.toLowerCase().startsWith('x-intmap-')) seen.set(k.toLowerCase(), label);
    return res;
  };

  const cold = collect('cold+refused', (await ask({ upstream: REFUSED })).res);
  const miss = collect('cold+success', (await ask({
    upstream: () => jsonRes(JSON.stringify({ articles: [{ title: 'x', url: 'https://example.test/a' }] }), 200),
  })).res);
  assert.equal(miss.status, 200, '上流が artlist を返したときは、それが読者に渡る');

  assert.ok(seen.size >= 3, `診断ヘッダが実際に付いていること（実測 ${[...seen.keys()].join(', ')}）`);
  for (const res of [cold, miss]) {
    const exposed = String(res.headers.get('access-control-expose-headers') || '').toLowerCase();
    for (const [h, where] of seen) {
      assert.ok(exposed.includes(h),
        `«${h}»（${where} で実際に付いた）が Expose 一覧に無い。ブラウザはサーバが名指さない`
        + 'ヘッダを読めないので、アプリが走る面と production verification の面にだけ診断が存在しない');
    }
  }
});

/* ── B. js/proxy-fetch.js を評価して fetchViaProxy を得る ────────────────────────────────
   `window.SUPABASE_URL` は呼び出し時に読まれるので、最小の shim で足りる。 */
globalThis.window = { SUPABASE_URL: 'https://stub.supabase.test' };
const { fetchViaProxy } = await import(pathToFileURL(join(ROOT, 'js/proxy-fetch.js')).href);

const ALL_REFUSE = () => { globalThis.fetch = async () => { throw new Error('refused'); }; };
const OWN_RELAY_ANSWERS = (body) => {
  globalThis.fetch = async (input) => {
    const u = String((input && input.url) || input);
    if (u.includes('/functions/v1/gdelt-relay')) return new Response(body, { status: 200 });
    throw new Error('refused');
  };
};

/* ── ⑥/⑦ null が 2 つの問いに答えていた ─────────────────────────────────────────────── */
test('R769 ⑥: どの段も答えなかったとき、梯子はそう述べる', async () => {
  ALL_REFUSE();
  const note = {};
  const got = await fetchViaProxy(ASK, { as: 'json', note });

  assert.equal(got, null);
  assert.equal(note.reason, 'refused',
    '本番実測 2026-09-17: GDELT の梯子が全段拒否（自前 relay 502 / 直接は CORS 拒否 / 公開 proxy '
    + '4 本が 401・403・408・abort）でも、呼び手が受け取るのは `null` ひとつだった。'
    + 'js/atlas-sources.js はそれを「出典は答えたがニュースが無かった」と区別できない——'
    + '片方は IntMap の配管の故障で、もう片方は世界についての事実である');
});

test('R769 ⑦: 段が答えたときは、どの段かを述べる', async () => {
  OWN_RELAY_ANSWERS('{"articles":[]}');
  const note = {};
  const got = await fetchViaProxy(ASK, { as: 'json', note });

  assert.equal(got, '{"articles":[]}');
  assert.equal(note.reason, 'ok');
  assert.equal(note.via, 'own-relay',
    '「答えは来た」だけでは、次に何を直せばよいかを誰も言えない——どの段が生きているかは'
    + '梯子だけが知っている事実である');
});

/* ── ⑧ note を渡さない呼び手は一切影響を受けない ────────────────────────────────────── */
test('R769 ⑧: note を渡さない既存の呼び手の戻り値は変わらない', async () => {
  /* ⚠ これが「13 の既存呼び出し元を壊していない」ことの唯一の実測である。梯子の戻り値の
     契約は「文書のテキスト、または null」で、note はその契約の外に足された。 */
  ALL_REFUSE();
  assert.equal(await fetchViaProxy(ASK, { as: 'json' }), null,
    '全段が拒否したときの戻り値は、note を渡さない呼び手にとって今までどおり null である');

  OWN_RELAY_ANSWERS('{"articles":[]}');
  assert.equal(await fetchViaProxy(ASK, { as: 'json' }), '{"articles":[]}',
    '段が答えたときの戻り値も、note を渡さない呼び手にとっては今までどおり本文そのものである');
});

/* ── ⑨ 中止と予算切れは「拒否」ではない ──────────────────────────────────────────────── */
test('R769 ⑨: 中止と予算切れは、拒否と別の語で返る', async () => {
  ALL_REFUSE();
  const aborted = {};
  assert.equal(await fetchViaProxy(ASK, { as: 'json', note: aborted, signal: AbortSignal.abort() }), null);
  assert.notEqual(aborted.reason, 'refused',
    '読者が Stop を押した（あるいは次の質問が前の質問を追い越した）ことは、出典が拒否したことでは'
    + 'ない——両方を「拒否」と呼ぶと、直すものが無いところに故障が report される');
  assert.ok(aborted.reason, '中止は無言で終わってよい終わり方ではない');

  /* 予算切れも同様に別の終わり方である。上流が実時間で少し掛かるので、梯子は 1 段目で予算を
     使い切る。 */
  globalThis.fetch = async () => { await new Promise((r) => setTimeout(r, 20)); throw new Error('refused'); };
  const broke = {};
  assert.equal(await fetchViaProxy(ASK, { as: 'json', note: broke, budgetMs: 1 }), null);
  assert.notEqual(broke.reason, 'refused', '予算が尽きたことは、出典が拒否したことではない');
  assert.notEqual(broke.reason, aborted.reason,
    '中止と予算切れも互いに別の終わり方である（前者は読者が決め、後者は呼び手の時計が決める）');
});

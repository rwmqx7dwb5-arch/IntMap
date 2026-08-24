/* ============================================================================
 *  R386 — 出来事を利用者に届ける（Phase C / D / E）
 * ----------------------------------------------------------------------------
 *  #R334 が表を敷き、#R351 がパイプラインを本番で回した。それでも **`news_events` は
 *  本番に 892 行あるのに、配信バンドルからそこへ到達する経路が 1 本も無かった**
 *  （#R351 追記の本番検証）。このラウンドが足したのは 3 つ:
 *
 *    C  recall（塊どうしを結ぶ `link` 段）と運用者の Merge/Split/Reassign/undo
 *    D  出来事の一覧・カテゴリ chips・詳細（媒体ごとの相違）・1 出来事 1 ピン・★
 *    E  Atlas の capability と state provider、そして既定の切り替え
 *
 *  ⚠ 実データで測って初めて分かったことが 3 つあり、この検査はそれを固定する:
 *    ① **この鍵は埋め込みモデルに届かない**（実測 2026-08-24: `/v1/models` が 1 件しか
 *       返さず、`text-embedding-3-small` は 403 `model_not_found`）。⇒ `link` 段は
 *       **埋め込みが 1 本も無くても動かなければならない**。
 *    ② **割合だけの推移の検算は、分母が小さいと 1 本の辺で満たされる。** 空撃ちで出た
 *       17 対を人が読むと 15 正 / 2 誤で、誤りはどちらも合致 1〜2 本だった。
 *    ③ **本番の `public.is_admin` は引数を取る。** リポジトリの baseline が宣言する
 *       引数なしの版は本番に存在しない ⇒ migration はそれを呼んではならない。
 * ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

import {
  buildCandidateIndex, candidateEvents, eventsAgree, eventPairCandidates, INDEX, pairScore,
} from '../supabase/functions/_shared/news-ingest.js';
import { DEFAULTS, pairVerdict, buildIdf } from '../supabase/functions/_shared/news-cluster.js';
import { makeNewsClaims } from '../js/news-claims.js';   /* (#R394) 相違の規則は表示の層から出た */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readLF(path.join(ROOT, p));

/* 記事 1 本ぶんの形。地点は `subject_*`、種類は `subject_type`（DB の列名と同じ）。 */
let _id = 0;
const art = (title, o = {}) => ({
  id: ++_id, title,
  title_fingerprint: o.fp || null,
  published_at: o.at || '2026-08-24T09:00:00Z',
  subject_lng: o.lng, subject_lat: o.lat, subject_type: o.kind,
  source_family: o.fam || ('fam' + _id),
  source_id: o.src || o.fam || ('src' + _id),
  description: o.desc || '',
});

/* ══ ① `link` 段は埋め込みが 1 本も無くても候補を出す ═══════════════════════════════
   ⚠ これは「あれば良い」ではなく**この鍵での唯一の経路**である。埋め込みだけを入口に
     した最初の実装は、本番で 1 対も出せなかった（403 model_not_found）。 */
test('① 塊どうしの候補は、埋め込みが 1 本も無くても珍しい語の共有から出る', () => {
  const A = [art('Carney says Canada will impose retaliatory tariffs on various US sectors', { lng: -106, lat: 56, kind: 'country', fam: 'reuters' })];
  const B = [art('Canada readies retaliatory tariffs as Carney calls trade talks collapsed', { lng: -106, lat: 56, kind: 'country', fam: 'npr' })];
  const C = [art('Chinese robot beats Usain Bolt 100m world record at Beijing humanoid games', { lng: 116, lat: 40, kind: 'city', fam: 'bbc' })];
  const members = new Map([[1, A], [2, B], [3, C]]);
  const idf = buildIdf([...A, ...B, ...C]);
  const pairs = eventPairCandidates(members, idf, INDEX, 50);
  const key = (a, b) => Math.min(a, b) + ':' + Math.max(a, b);
  const got = new Set(pairs.map((p) => key(p.event_a, p.event_b)));
  assert.ok(got.has(key(1, 2)), 'the two Canada events must be a candidate pair');
  /* ロボットの塊とは語を共有していないので候補にならない。 */
  assert.ok(!got.has(key(1, 3)) && !got.has(key(2, 3)), 'unrelated events must not become candidates');
  /* 埋め込みの列は 1 つも読んでいない（引数にも無い）。 */
  assert.equal(eventPairCandidates.length >= 2, true);
});

/* ══ ② 1 本の辺だけで塊を結ばない ═════════════════════════════════════════════════
   実測（2026-08-24・本番 898 Event）で誤って結ばれた 2 対は、どちらも合致が 1〜2 本
   だった。`transitivity` は割合なので、分母が小さいと 1 本で満たされる。 */
test('② 合致した対が 1 本しかない塊どうしは結ばない（linkMinMatched）', () => {
  /* ⚠⚠⚠ **この組み立ては「1 対だけが合致する」ことを先に確かめてから使う。** 最初に書いた
     fixture は 1 対も合致しておらず、検査は**理由のない緑**だった（このリポジトリが何度も
     払ってきた形そのもの）。だから下の 2 行が先にある。 */
  const g = { lng: -119.8, lat: 39.5, kind: 'city' };
  const a1 = art('Wildfire approaches Reno Nevada forcing thousands to evacuate neighbourhoods', { ...g, fam: 'apnews' });
  const a2 = art('Nevada casino regulators approve new licence for downtown operator', { ...g, fam: 'kolo' });
  const b1 = art('Fast-moving wildfire in Reno Nevada forces thousands to evacuate homes', { ...g, fam: 'guardian' });
  const idf = buildIdf([a1, a2, b1]);
  assert.equal(pairVerdict(a1, b1, DEFAULTS, idf).same, true, 'fixture: a1 and b1 must agree');
  assert.equal(pairVerdict(a2, b1, DEFAULTS, idf).same, false, 'fixture: a2 and b1 must NOT agree');

  const v = eventsAgree([a1, a2], [b1], idf, DEFAULTS, null, INDEX.maxMembers);
  assert.equal(v.matched, 1);
  assert.equal(v.pairs, 2);
  /* ⚠ 割合の規則は**満たされている**（0.5 ≥ 0.34）。止めているのは対の本数のほうである。 */
  assert.ok(v.share >= DEFAULTS.transitivity, 'the ratio rule alone would have said yes');
  assert.equal(v.same, false, 'a single matching pair must not merge two clusters');

  /* 門を外すと同じ入力が通る＝この検査は門を測っている。 */
  const loose = eventsAgree([a1, a2], [b1], idf, { ...DEFAULTS, linkMinMatched: 1 }, null, INDEX.maxMembers);
  assert.equal(loose.same, true, 'with the guard removed the same input merges — the guard is what decides');

  /* 定数は 1 つで、`transitivity` はそのまま使われている（第 2 の推移規則を作っていない）。 */
  assert.equal(DEFAULTS.linkMinMatched, 3);
  assert.equal(DEFAULTS.transitivity, 0.34);
});

test('②b 十分な数の対が合致する塊どうしは結ぶ', () => {
  const mk = (t, fam) => art(t, { lng: -106, lat: 56, kind: 'country', fam });
  const A = [mk('Canada says it will match new US 50% tariffs dollar for dollar', 'france24'),
             mk('Canada to match US tariffs dollar for dollar PM Carney says', 'aljazeera'),
             mk('America has changed Canada to match Trump tariffs dollar for dollar', 'skynews')];
  const B = [mk('Canada vows dollar for dollar response as US puts 50% tariffs on some goods', 'guardian'),
             mk('Canada hits back on US tariffs as Carney says at war on trade', 'bloomberg')];
  const idf = buildIdf([...A, ...B]);
  const v = eventsAgree(A, B, idf, DEFAULTS, null, INDEX.maxMembers);
  assert.equal(v.same, true, 'the measured true-positive from production must still merge');
  assert.ok(v.matched >= DEFAULTS.linkMinMatched);
});

/* ══ ③ 埋め込みの入口は、既存の呼び出し側の答えを 1 ビットも変えない ═══════════════ */
test('③ sim を渡さない pairVerdict は #R351 と同じ答えを返す', () => {
  const a = art('Wildfire approaches Reno Nevada forcing thousands to evacuate', { lng: -119.8, lat: 39.5, kind: 'city' });
  const b = art('Fast-moving wildfire in Reno Nevada forces thousands to evacuate homes', { lng: -119.8, lat: 39.5, kind: 'city' });
  const idf = buildIdf([a, b]);
  const four = pairVerdict(a, b, DEFAULTS, idf);
  const five = pairVerdict(a, b, DEFAULTS, idf, null);
  assert.equal(four.same, five.same);
  assert.equal(four.code, five.code);
  assert.notEqual(four.code, 'embedding', 'a verdict with no similarity must never be credited to embedding');
});

test('③b `far` では埋め込みの入口を開かない（まとめ記事が橋になる形を通しやすくしない）', () => {
  assert.equal(DEFAULTS.embed.far, null, 'the embedding entrance must stay closed for geographically disagreeing pairs');
  const a = art('Podcast Trump tariffs hit Canada ballroom reprieve and Somali piracy', { lng: -106, lat: 56, kind: 'country' });
  const b = art('Somali pirates seize tanker off Puntland coast', { lng: 48, lat: 8, kind: 'city' });
  const idf = buildIdf([a, b]);
  const v = pairVerdict(a, b, DEFAULTS, idf, 0.99);   /* 意味的にはいくら近くても */
  assert.notEqual(v.code, 'embedding');
  assert.ok(String(v.reasons.join(' ')).includes('closed for far'), 'the verdict must say the entrance was closed, not stay silent');
});

test('③c 埋め込みで通った対は、語の量ではなく意味の近さで採点される', () => {
  const byWords = { same: true, code: 'jaccard', j: 0.5, containment: 0.4, weighted: 0.3 };
  const byEmbed = { same: true, code: 'embedding', j: 0, containment: 0, weighted: 0, sim: 0.88 };
  assert.equal(pairScore(byWords), 1.2);
  assert.equal(pairScore(byEmbed), 0.88, 'an embedding match must not score 0 — it would always lose the best-candidate race');
});

/* ══ ④ 埋め込みの候補は、語の候補を押しのけない ════════════════════════════════════ */
test('④ 語で見つかった候補が先に来て、埋め込みの候補はその後ろに足される', () => {
  const win = [];
  for (let i = 0; i < 6; i++) win.push(art('unrelated filler headline number ' + i + ' zzz' + i, { fam: 'f' + i }));
  const inEvent = art('Evergrande founder sentenced to life in Shenzhen court', { lng: 114, lat: 22.5, kind: 'city', fam: 'reuters' });
  inEvent.event_id = 11;
  const farAway = art('Completely different wording about a property developer verdict', { lng: 114, lat: 22.5, kind: 'city', fam: 'bbc' });
  farAway.event_id = 22;
  const fresh = art('Chinese court sentences Evergrande founder to life', { lng: 114, lat: 22.5, kind: 'city', fam: 'apnews' });
  const index = buildCandidateIndex([...win, inEvent, farAway, fresh]);

  const withEmbed = candidateEvents(fresh, index,
    [{ neighbour_id: farAway.id, event_id: 22, similarity: 0.93 }]);
  assert.equal(withEmbed[0].event_id, 11, 'the word candidate must stay first');
  assert.ok(withEmbed.some((c) => c.event_id === 22), 'the embedding candidate must be added');
  /* 埋め込みを渡さなければ、答えは #R351 と同じ。 */
  const without = candidateEvents(fresh, index);
  assert.deepEqual(without.map((c) => c.event_id), [11]);
});

/* ══ ⑤ migration は本番に存在しない関数を呼ばない ════════════════════════════════
   実測 2026-08-24: 本番の `public.is_admin` は `(uid uuid)` だけで、引数なしの版は無い。
   #R334 の migration が本番に通ったのは、述語をインラインで書いていたからである。 */
test('⑤ Phase C の migration は public.is_admin() を呼ばず、admin を述語で確かめる', () => {
  const sql = rd('supabase/migrations/20260824090000_news_events_phase_c.sql');
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.ok(!/public\.is_admin\s*\(/.test(code),
    'production has is_admin(uid uuid) only — calling the repository baseline’s zero-argument form fails there');
  /* 4 つの入口すべてが admin を確かめている（grant は「呼べる」であって「やってよい」ではない）。 */
  for (const fn of ['news_event_merge', 'news_event_reassign', 'news_event_update_meta', 'news_event_undo']) {
    const i = code.indexOf('function public.' + fn + '(');
    assert.ok(i > 0, fn + ' must exist');
    const body = code.slice(i, code.indexOf('$$;', i));
    assert.ok(/profiles p where p\.id = \(select auth\.uid\(\)\) and p\.is_admin/.test(body),
      fn + ' must check the admin predicate itself');
  }
  /* 機械の口（`link` 段）は admin を要求しない代わりに service_role にしか grant されない。 */
  assert.ok(/grant execute on function public\.news_event_merge_into\([^)]*\) to service_role;/.test(code));
  assert.ok(!/news_event_merge_into\([^)]*\) to authenticated/.test(code));
});

test('⑤b 運用者は「どの記事がどの Event に属するか」だけを直せる', () => {
  const sql = codeOnly(rd('supabase/migrations/20260824090000_news_events_phase_c.sql'));
  /* 上流が何と言ったかと、機械が何を根拠に判定したかは書き換えさせない。 */
  assert.ok(!/update\s+public\.news_articles\b(?![^;]*embedding)/i.test(sql),
    'no operator path may rewrite an article');
  assert.ok(!/update\s+public\.news_cluster_decisions/i.test(sql),
    'no operator path may rewrite the machine’s audit of its own decision');
});

/* ══ ⑥ 2 つのスイッチは別物である ═════════════════════════════════════════════════ */
test('⑥ NEWS_EVENT_MODE と USE_SERVER_NEWS は別のスイッチで、後者は今も false', () => {
  const body = rd('js/app-body.js');
  assert.match(body, /const USE_SERVER_NEWS\s*=\s*false/,
    'the #R40 current_news path stays off — docs/NEWS-EVENTS.md §12 forbids “flip it and call it done”');
  const m = body.match(/const NEWS_EVENT_MODE\s*=\s*(true|false)/);
  assert.ok(m, 'the event switch must exist and be greppable — the privacy-policy gate reads it');
  /* 一覧が実際に何であるかは、旗ではなく中身に訊く。 */
  assert.match(body, /function newsSurfaceMode\(\)/);
  assert.match(codeOnly(body), /_event/, 'the surface predicate must look at the items, not at the flag');
});

/* ══ ⑦ 能力表の lazy 列が実在する module を名指している（#R347 の 5 度目を防ぐ） ══ */
test('⑦ news.category が名指す lazy module は loader に実在する', () => {
  const cap = rd('js/atlas-capabilities.js');
  const row = cap.split('\n').find((l) => l.includes("'news.category'"));
  assert.ok(row, 'the capability row must exist');
  /* 行の最後の引用符付きの語が lazy 列（末尾に `],` が付くので、引用符で取り出す）。 */
  const quoted = row.match(/'[^']*'/g) || [];
  const lazy = quoted.length ? quoted[quoted.length - 1].replace(/'/g, '') : '';
  assert.equal(lazy, 'newsEvents');
  const loader = rd('js/lazy-modules.js');
  assert.ok(loader.includes("newsEvents: 'IntMapNewsEvents'"), 'PUBLISHES must name it');
  assert.ok(loader.includes("case 'newsEvents': return import('./news-events.js');"), 'fetchModule must have a LITERAL import');
  assert.ok(loader.includes('window.IntMapModules.newsEvents(IM_HOST)'), 'mount must run the factory');
  /* research.events も同じ module に依存するようになった（サーバーの Event を読むため）。 */
  const ev = cap.split('\n').find((l) => l.includes("'research.events'"));
  assert.ok(ev && ev.includes("'newsEvents'"), 'research.events now needs the events module at execution');
});

/* ══ ⑧ 出来事の UI は起動経路に入らない ═══════════════════════════════════════════ */
test('⑧ js/news-events.js は遅延取得だけから到達される', () => {
  const main = rd('src/main.js');
  assert.ok(!/news-events\.js/.test(main), 'the entry must not import it');
  for (const f of ['js/app-body.js', 'js/news-feed.js', 'js/news-ui.js']) {
    assert.ok(!/from '\.\/news-events\.js'/.test(rd(f)) && !/import\('\.\/news-events\.js'\)/.test(rd(f)),
      f + ' must reach it through IntMapLazy, not by importing it');
  }
  assert.match(rd('js/news-feed.js'), /IntMapLazy\.need\('newsEvents'\)/);
});

/* ══ ⑨ 「同じ出来事か」を決める場所は 1 つのまま ═══════════════════════════════════ */
test('⑨ js/news-events.js に第二のクラスタリング実装は無い', () => {
  const code = codeOnly(rd('js/news-events.js'));
  for (const banned of ['pairVerdict', 'jaccard', 'transitivity', 'geoClass', 'clusterArticles', 'countIndependentSources']) {
    assert.ok(!code.includes(banned), 'the presentation layer must not re-implement ' + banned);
  }
  /* 束ねられた結果を**読む**だけであることが、列の指定に出ている。 */
  assert.ok(rd('js/news-events.js').includes('news_event_articles('));
});

test('⑩ Atlas の research.events は、出来事モードでは束ね直さない', () => {
  const c = codeOnly(rd('js/atlas-console.js'));
  const i = c.indexOf("case 'events':");
  assert.ok(i > 0);
  const block = c.slice(i, i + 6000);
  assert.ok(/_evMode\s*\n?\s*\?/.test(block) || /_evMode$/m.test(block) || block.includes('_evMode'),
    'the case must branch on the surface mode');
  const g = block.indexOf('groupNewsEvents(');
  assert.ok(g > 0, 'the article path must still exist');
  /* 再クラスタリングは三項の「そうでない側」にしかない。 */
  assert.ok(block.slice(0, g).includes('_evMode'), 'the mode test must come before the grouper call');
});

/* ══ ⑪ 運用コンソールは RPC しか呼ばない ═════════════════════════════════════════ */
test('⑪ admin.html は Event の表を直接 UPDATE せず、4 つの RPC を通す', () => {
  const h = rd('admin.html');
  for (const fn of ['news_event_merge', 'news_event_reassign', 'news_event_update_meta', 'news_event_undo']) {
    assert.ok(h.includes("sb.rpc('" + fn + "'") || h.includes("nevRpc('" + fn + "'"), fn + ' must be called');
  }
  /* Event 側の表を直接書かない。⚠ 1 操作が 4 つの表に分かれるので、途中で失敗すると
     どの表も嘘をつく。 */
  const code = codeOnly(h);
  assert.ok(!/from\('news_events'\)[\s\S]{0,120}\.(update|insert|delete|upsert)\(/.test(code));
  assert.ok(!/from\('news_event_articles'\)[\s\S]{0,120}\.(update|insert|delete|upsert)\(/.test(code));
  assert.ok(!/from\('news_articles'\)[\s\S]{0,120}\.(update|insert|delete|upsert)\(/.test(code));
});

/* ══ ⑫ 4 つの非位置言語に、この画面の文字列が入っている ═══════════════════════════
   ⚠ `pick()` は 5 つ目までしか位置引数を見ない。9 個並べても fr/ko/zh/zh-hans は
     **英語のまま出荷される**（#R353 が測った形）。 */
test('⑫ fr / ko / zh / zh-hans の inline 表に、出来事画面の文字列がある', () => {
  const probes = ['Where outlets differ', 'Coverage', 'How this event was assembled', '{n} sources', 'First reported'];
  for (const f of ['ui.fr.js', 'ui.ko.js', 'ui.zh.js', 'ui.zh-hans.js']) {
    const s = rd('js/locales/' + f);
    for (const p of probes) {
      assert.ok(s.includes("'" + p + "'"), f + ' has no entry for ' + JSON.stringify(p));
    }
  }
  /* そして英語のままの写しになっていない。 */
  const fr = rd('js/locales/ui.fr.js');
  const m = fr.match(/'Where outlets differ':\s*'([^']+)'/);
  assert.ok(m && m[1] !== 'Where outlets differ', 'fr must be a translation, not a copy of the English');
});

/* ══ ⑬ 「相違」は媒体をまたいだときだけ ═══════════════════════════════════════════
   同じ媒体の速報 → 続報で数が変わるのは**更新**であって、媒体間の相違ではない。 */
test('⑬ 同じ系列の中の数の変化は「相違」と呼ばない', () => {
  /* ⚠ (#R394) **規則はもう js/news-events.js の中には無い。** そこに置いた結果、
     ブラウザの外から誰も呼べず、歩留まりも精度も測れなかった——実測してみると
     本番で 2 件出ており、うち 1 件は誤りだった。いまは js/news-claims.js の 1 本で、
     この検査も**規則そのものを呼んで**確かめる（綴りを grep するのではなく）。 */
  const C = makeNewsClaims();
  const same = C.differences([
    { title: 'Landslide at a landfill kills 3, government says', description: '', source: 'WJLA', family: 'sinclair' },
    { title: 'Landslide at a landfill kills 5, officials say', description: '', source: 'KOMO', family: 'sinclair' },
  ]);
  assert.equal(same.length, 0, 'one voice updating its own figure is not a disagreement');

  const cross = C.differences([
    { title: 'Landslide at a landfill kills 3, government says', description: '', source: 'BBC', family: 'bbc' },
    { title: 'Landslide at a landfill kills 5, officials say', description: '', source: 'AP News', family: 'apnews' },
  ]);
  assert.equal(cross.length, 1, 'two different owners stating two different values IS a disagreement');

  /* 数量の取り出しは「原文に書いてある形」だけ（推定しない）。 */
  const rule = rd('js/news-claims.js');
  assert.ok(rule.includes('const KINDS'));
  assert.ok(!/estimate|guess|infer/i.test(codeOnly(rule).replace(/[A-Za-z]*Info/g, '')),
    'the differences pass must not estimate anything');
  /* 表示の層は規則を持たない。 */
  assert.ok(!codeOnly(rd('js/news-events.js')).includes('famOfValue'),
    'the view grew its own copy of the rule again');
});

/* ══ ⑭ #R351 が守っているものを壊していない ═════════════════════════════════════ */
test('⑭ current_news と refresh-news には触れていない', () => {
  const fn = codeOnly(rd('supabase/functions/news-ingest/index.ts'));
  assert.ok(!fn.includes('current_news'));
  assert.ok(!fn.includes('refresh-news'));
  /* 段は 6 つになったが、cron が body で選ぶ 2 本の形は変わっていない。 */
  assert.match(fn, /\["fetch", "embed", "assign", "link", "translate", "prune"\]/);
});

test('⑮ 埋め込みが使えないことは、応答に必ず出る', () => {
  const fn = rd('supabase/functions/news-ingest/index.ts');
  /* 黙って 0 件になる AI 経路をもう一度作らない（#R334 が測り #R351 が突き止めた形）。 */
  assert.ok(fn.includes('available_embedding_models'), 'the stage must report what the key CAN reach');
  assert.ok(fn.includes('configured_model'), 'and what it was asked for');
  assert.ok(/skipped: cfg\.off/.test(fn), 'and say when it was switched off rather than failing');
  /* 次元が合わないベクトルを黙って入れない。 */
  assert.ok(fn.includes('rejected_wrong_dim'));
  assert.ok(fn.includes('EMBED_DIM'));
});

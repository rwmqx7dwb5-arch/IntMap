/* ============================================================================
 *  R404 — ニュースの地点解析に AI を戻す。戻したものが**本当に効く**ことを押さえる
 * ----------------------------------------------------------------------------
 *  依頼は「ニュースの地点解析システムは AI を使うようにしろ。復活です」。
 *  着手時の実測 (2026-08-24・本番):
 *    · `current_news` 1,548 行のうち `analyzed_by='ai'` は **0 件**
 *      （`AI_MODEL` の 403。#R351 が特定済み。`refresh-news` に 403 リトライが無く、
 *        例外は握り潰されていた）＝ #R29 の AI 経路は**書かれた日から一度も成功していない**
 *    · UI が実際に読むのは `news_events`（`news-ingest`）で、そちらは AI を 1 度も呼んでいない
 *  ⇒ 生きている経路（`news-ingest`）に「AI が第一手段・決定論エンジンがフォールバック」を戻す。
 *
 *  この検査が押さえるのは、**戻し方を間違えると静かに無効化される 5 か所**である。
 *    ① 返答の検証（模型の答えをそのまま採ると、間違った場所は「無い」より悪い）
 *    ② 壊れた batch で「AI は見た」の印を押すと、その記事は**永久に候補から外れる**
 *    ③ `fetch` の upsert が AI の座標を **20 分ごとに踏み潰す**（#R404 の一番危ない罠）
 *    ④ 記事の座標だけ直しても、Event を数え直さなければ**地図には一生出ない**
 *    ⑤ 種別の語彙が `js/newsgeo.js` とずれると、AI の都市が辞書の国に代表を譲る
 * ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';

import {
  parseAiPlaces, GEO_AGREE_KM, toArticleRow, summariseEvent, buildRegistry,
} from '../supabase/functions/_shared/news-ingest.js';
import { buildIdf } from '../supabase/functions/_shared/news-cluster.js';
import { NEWS_GEO_RULES, NEWS_GEO_KINDS, NEWS_GEO_KIND_LINE }
  from '../supabase/functions/_shared/news-geo-prompt.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readLF(path.join(ROOT, p));
/* 注釈の中の語を証拠にしない（#R285 の codeOnly と同じ形）。 */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const INGEST = 'supabase/functions/news-ingest/index.ts';
const SHARED = 'supabase/functions/_shared/news-ingest.js';
const MIGRATION = 'supabase/migrations/20260824210000_news_geo_ai.sql';

/* 東京の記事 1 本。決定論エンジンは東京（139.69, 35.69）に置いた、という前提。 */
const art = (over) => ({
  id: 1, title: 'Quake felt in Tokyo', description: '',
  subject_lng: 139.69, subject_lat: 35.69, subject_name_en: 'Tokyo', ...over,
});
const reply = (objs) => JSON.stringify(objs);

/* ── ① 素直な返答を採り、決定論エンジンとの一致を確度に写す ─────────────── */
test('① well-formed reply is taken, and confidence is MEASURED against the gazetteer', () => {
  const arts = [art({ id: 1 }), art({ id: 2, subject_lng: -0.13, subject_lat: 51.5, subject_name_en: 'London' })];
  const v = parseAiPlaces(reply([
    { i: 1, name: 'Tokyo', kind: 'city', lat: 35.68, lng: 139.76 },      /* 東京と一致 */
    { i: 2, name: 'Kyiv', kind: 'city', lat: 50.45, lng: 30.52 },        /* London とは別 */
  ]), arts);

  assert.equal(v.ok, true, v.error || '');
  assert.equal(v.placed.length, 2);
  assert.equal(v.omitted.length, 0);

  const [a, b] = v.placed;
  assert.equal(a.name, 'Tokyo');
  assert.equal(a.kind, 'city');
  assert.ok(a.km < GEO_AGREE_KM, 'Tokyo↔Tokyo should be inside the agreement radius');
  assert.equal(a.confidence, 0.95);
  assert.ok(a.reasons.includes('agrees-with-gazetteer'));
  assert.equal(v.agreed, 1);

  assert.equal(b.confidence, 0.7, 'a place far from the gazetteer answer must not claim high confidence');
  assert.ok(b.reasons.includes('differs-from-gazetteer'));
  assert.ok(b.reasons.some((r) => r.includes('London')), 'the reason must name what it disagreed WITH');
  assert.equal(v.differed, 1);
});

test('①b when the gazetteer had no answer the AI still places it, at its own confidence', () => {
  const v = parseAiPlaces(reply([{ i: 1, name: 'Kyiv', kind: 'city', lat: 50.45, lng: 30.52 }]),
    [art({ subject_lng: null, subject_lat: null, subject_name_en: null })]);
  assert.equal(v.placed.length, 1);
  assert.equal(v.noDict, 1);
  assert.equal(v.placed[0].confidence, 0.8);
  assert.ok(v.placed[0].reasons.includes('gazetteer-had-no-answer'));
  assert.equal(v.placed[0].km, null, 'there is nothing to measure a distance against');
});

/* ── ② 模型の答えをそのまま採らない ──────────────────────────────────── */
test('② (0,0) is refused — it is the Gulf of Guinea, and the model\'s way of saying "I do not know"', () => {
  const v = parseAiPlaces(reply([{ i: 1, name: 'Somewhere', kind: 'city', lat: 0, lng: 0 }]), [art()]);
  assert.equal(v.placed.length, 0);
  assert.equal(v.rejected.null_island, 1);
  assert.deepEqual(v.omitted, [1], 'a refused answer still counts as "the AI looked at this one"');
});

test('②b coordinates outside the real world are refused', () => {
  for (const bad of [{ lat: 91, lng: 0 }, { lat: 0, lng: 181 }, { lat: 'north', lng: 12 }, {}]) {
    const v = parseAiPlaces(reply([{ i: 1, name: 'X', kind: 'city', ...bad }]), [art()]);
    assert.equal(v.placed.length, 0, JSON.stringify(bad));
    assert.equal(v.rejected.bad_coords, 1, JSON.stringify(bad));
  }
});

test('②c an id we never sent is refused, and the same id twice is taken once', () => {
  const v = parseAiPlaces(reply([
    { i: 99, name: 'Nowhere', kind: 'city', lat: 10, lng: 10 },
    { i: 1, name: 'Tokyo', kind: 'city', lat: 35.68, lng: 139.76 },
    { i: 1, name: 'Osaka', kind: 'city', lat: 34.69, lng: 135.5 },
  ]), [art()]);
  assert.equal(v.placed.length, 1);
  assert.equal(v.placed[0].name, 'Tokyo', 'the first answer for an id wins; the second is not a second article');
  assert.equal(v.rejected.unknown_id, 2, 'both the never-sent id and the repeat land here');
});

test('②d an empty name is refused (a pin with no label is not an answer)', () => {
  const v = parseAiPlaces(reply([{ i: 1, name: '   ', kind: 'city', lat: 35.68, lng: 139.76 }]), [art()]);
  assert.equal(v.placed.length, 0);
  assert.equal(v.rejected.no_name, 1);
});

/* ── ③ 壊れた返答で「見た」印を押さない ────────────────────────────────── */
test('③ a reply that never arrived marks NOTHING as seen — otherwise those articles are lost forever', () => {
  for (const broken of ['', 'I am sorry, I cannot do that.', '[{"i":1,', '{"i":1,"name":"Tokyo"}']) {
    const v = parseAiPlaces(broken, [art(), art({ id: 2 })]);
    assert.equal(v.ok, false, JSON.stringify(broken));
    assert.equal(v.placed.length, 0);
    assert.deepEqual(v.omitted, [], 'omitted must be empty when the batch failed: ' + JSON.stringify(broken));
    assert.ok(v.error, 'the failure must carry a reason — a silent 0 is what #R334 measured');
  }
});

test('③b a reply that arrived but omitted an item marks THAT item as seen (and only it)', () => {
  const v = parseAiPlaces(reply([{ i: 2, name: 'Kyiv', kind: 'city', lat: 50.45, lng: 30.52 }]),
    [art({ id: 1 }), art({ id: 2 }), art({ id: 3 })]);
  assert.equal(v.ok, true);
  assert.deepEqual(v.omitted.sort(), [1, 3]);
});

/* ── ④ 種別の語彙は js/newsgeo.js と同じでなければならない ────────────── */
test('④ the kind vocabulary is DERIVED from js/newsgeo.js, not written down twice', () => {
  const src = rd('js/newsgeo.js');
  const m = src.match(/var\s+KIND_LOCAL\s*=\s*\{([^}]*)\}/);
  assert.ok(m, 'KIND_LOCAL is gone from js/newsgeo.js — this check needs rewriting');
  const engineKinds = [...m[1].matchAll(/(\w+)\s*:/g)].map((x) => x[1]).sort();
  assert.deepEqual([...NEWS_GEO_KINDS].sort(), engineKinds,
    'the AI is offered a different vocabulary than the engine uses — a kind the engine does not rank ' +
    'scores 0 in summariseEvent, so an AI-located city loses the event\'s pin to a dictionary-located country');
  /* 語彙は実際にプロンプトへ渡されていること（定数だけ揃っていても意味が無い）。 */
  for (const k of NEWS_GEO_KINDS) {
    assert.ok(NEWS_GEO_KIND_LINE.includes('"' + k + '"'), 'kind not offered to the model: ' + k);
  }
});

test('④b an unknown kind does not throw the answer away, but is counted', () => {
  const v = parseAiPlaces(reply([{ i: 1, name: 'Tokyo', kind: 'metropolis', lat: 35.68, lng: 139.76 }]), [art()]);
  assert.equal(v.placed.length, 1, 'the coordinates are still the answer');
  assert.equal(v.placed[0].kind, null);
  assert.equal(v.rejected.bad_kind, 1);
});

/* ── ⑤ 出どころは、決めたものが書く（#R394 の形） ───────────────────── */
test('⑤ toArticleRow stamps subject_located_by from the OUTCOME, never unconditionally', async () => {
  const feed = { id: 1, source_id: 'bbc', category: 'world', collection: 'direct_rss' };
  const registry = buildRegistry([{ id: 'bbc', name: 'BBC', domains: ['www.bbc.co.uk'], source_family: 'bbc', enabled: true }]);
  const item = {
    title: 'Heavy rain floods Osaka overnight, dozens evacuated from riverside homes',
    link: 'https://www.bbc.co.uk/news/world-1234', description: 'Rescue teams worked through the night in the city.',
    published: new Date().toUTCString(), categories: [],
  };
  const placed = await toArticleRow(item, feed, registry, { analyze: () => ({ result: { lng: 135.5, lat: 34.69, name: { en: 'Osaka' }, kind: 'city', confidence: 0.9, why: ['title'] } }) });
  assert.equal(placed.row.subject_located_by, 'dict');
  const blank = await toArticleRow(item, feed, registry, { analyze: () => ({ result: null }) });
  assert.equal(blank.row.subject_located_by, 'none');
  assert.equal(blank.row.subject_lng, null);
});

test('⑤b summariseEvent says WHICH mechanism placed the pin, and how many articles the AI has seen', () => {
  const base = (o) => ({ title: 'Quake felt in Tokyo tonight', published_at: '2026-08-24T00:00:00Z', source_id: 's1', source_family: 's1', ...o });
  const members = [
    base({ id: 1, subject_lng: 139.76, subject_lat: 35.68, subject_name_en: 'Tokyo', subject_type: 'city', subject_confidence: 0.95, subject_located_by: 'ai' }),
    base({ id: 2, subject_lng: 138.0, subject_lat: 36.0, subject_name_en: 'Japan', subject_type: 'country', subject_confidence: 0.6, subject_located_by: 'dict' }),
  ];
  const s = summariseEvent(members, buildIdf(members));
  assert.equal(s.rep_place_name_en, 'Tokyo', 'specificity first — the city must win the country');
  assert.equal(s.location_evidence.by, 'ai');
  assert.equal(s.location_evidence.ai_articles, 1);
});

/* ── ⑥ fetch の upsert が AI の座標を踏み潰さない ──────────────────────── */
test('⑥ the fetch upsert must NOT rewrite the subject of an article the AI already placed', () => {
  const fn = codeOnly(rd(INGEST));
  assert.match(fn, /subject_located_by["']\s*,\s*["']ai["']|eq\("subject_located_by",\s*"ai"\)/,
    'stageFetch does not look up which fingerprints the AI has already placed');
  assert.match(fn, /const SUBJECT_COLS\s*=\s*\[/, 'the stripped column list is gone');

  /* ⚠ 一覧を手で書くと、`toArticleRow` が subject_* をもう 1 列足した日に穴が開く。
     **toArticleRow が実際に書いている subject_* の全部**が剥がれることを確かめる。 */
  const shared = rd(SHARED);
  const body = shared.slice(shared.indexOf('export async function toArticleRow'));
  const written = [...new Set([...body.slice(0, body.indexOf('\n}')).matchAll(/^\s{6}(subject_\w+):/gm)].map((m) => m[1]))];
  assert.ok(written.length >= 6, 'expected toArticleRow to write several subject_* columns, found ' + written.length);
  const listed = (fn.match(/const SUBJECT_COLS\s*=\s*\[([\s\S]*?)\]/) || [, ''])[1];
  for (const col of written) {
    assert.ok(listed.includes('"' + col + '"'),
      col + ' is written by toArticleRow but not stripped before the upsert — every 20 minutes the ' +
      'deterministic result would overwrite what the AI placed');
  }

  /* 鍵の揃わないオブジェクトを 1 回の upsert に混ぜない（欠けた鍵は既定値/NULL で埋まる）。 */
  assert.match(fn, /insertChunked\(db,\s*"news_articles",\s*plain,[\s\S]{0,120}insertChunked\(db,\s*"news_articles",\s*keepAi,/,
    'the two shapes must be sent as two homogeneous upserts');
});

/* ── ⑦ 記事の地点が変われば Event を数え直す ───────────────────────────── */
test('⑦ relocating an article re-summarises its event — otherwise the AI answer never reaches the map', () => {
  const fn = codeOnly(rd(INGEST));
  assert.match(fn, /async function stageLocate\(db,\s*budget,\s*relocated\)/);
  assert.match(fn, /async function stageAssign\(db,\s*budget,\s*relocated\)/);
  assert.match(fn, /relocated\.add\(/, 'stageLocate never records which articles it moved');
  /* dirty に入る経路が存在すること。**finalOf**（実 ID に解決済み）から引くこと。 */
  const dirty = fn.slice(fn.indexOf('const dirty = new Set()'));
  assert.match(dirty.slice(0, 900), /relocated\.has\(aid\)/, 'the relocated set is never folded into dirty');
  assert.match(dirty.slice(0, 900), /for \(const \[aid, eid\] of finalOf\)/,
    'dirty must be keyed off finalOf — a temporary negative event id would update nothing');
  /* 同じ run の中で locate → assign の順であること。 */
  const order = (fn.match(/const ORDER = \[([^\]]*)\]/) || [, ''])[1].replace(/["'\s]/g, '').split(',');
  assert.deepEqual(order, ['fetch', 'locate', 'embed', 'assign', 'link', 'translate', 'prune']);
  assert.ok(order.indexOf('locate') > order.indexOf('fetch'), 'locate must see the articles fetch just wrote');
  assert.ok(order.indexOf('locate') < order.indexOf('assign'), 'events must be built on the AI coordinates');
});

/* ── ⑧ cron が新しい段を呼ぶ（呼ばれない段は存在しない段） ──────────────── */
test('⑧ the migration adds `locate` to the running cron job, and never writes the secret', () => {
  const sql = rd(MIGRATION);
  const fn = codeOnly(rd(INGEST));
  const order = (fn.match(/const ORDER = \[([^\]]*)\]/) || [, ''])[1].replace(/["'\s]/g, '').split(',');

  const m = sql.match(/replace\(\s*j\.command,\s*'([^']+)',\s*'([^']+)'\s*\)/);
  assert.ok(m, 'the cron rewrite is gone — the tick job would keep running the old stage list');
  const before = JSON.parse('{' + m[1] + '}').stages;
  const after = JSON.parse('{' + m[2] + '}').stages;
  assert.ok(!before.includes('locate'), 'the search string already contains locate — it will never match production');
  assert.deepEqual(after, before.slice(0, 1).concat(['locate'], before.slice(1)),
    'locate must be inserted right after fetch, leaving the other stages untouched');
  for (const s of after) assert.ok(order.includes(s), 'cron asks for a stage the function does not have: ' + s);
  assert.deepEqual(after, order.filter((s) => after.includes(s)),
    'the cron list must be in the same relative order the function runs them');

  /* ⚠ public なリポジトリなので、cron の command を書き直してはならない（秘密が入っている）。 */
  assert.match(sql, /perform cron\.alter_job\([^)]*command\s*:=\s*newcmd\)/);
  assert.ok(!/x-news-ingest-secret\s*'\s*,\s*'/.test(sql), 'the migration must not spell out the secret header value');
  assert.match(sql, /to_regclass\('cron\.job'\) is null/, 'a machine without pg_cron (db reset / CI) must not fail here');
});

/* ── ⑨ 規則の正本は 1 本（散文を 2 か所に置かない） ──────────────────── */
test('⑨ the AI geolocation rules live in ONE file — both functions import them', () => {
  const ingest = rd(INGEST), refresh = rd('supabase/functions/refresh-news/index.ts');
  for (const [name, src] of [['news-ingest', ingest], ['refresh-news', refresh]]) {
    assert.match(src, /from "\.\.\/_shared\/news-geo-prompt\.js"/, name + ' does not import the shared rules');
    /* 規則 (2) の実文を自分で持っていないこと（＝写しが 2 つある状態） */
    assert.ok(!src.includes('NOT where someone merely SPOKE about it'),
      name + ' still carries its own copy of the rules — one of the two will drift');
  }
  assert.ok(NEWS_GEO_RULES.includes('NOT where someone merely SPOKE about it'),
    'the shared rules lost the dateline clause that #R161 and #R29 both exist to solve');
  /* 返し方は共有しない——書き込み先の列が違う (refresh-news には種別の列が無い)。 */
  assert.ok(!NEWS_GEO_RULES.includes('Reply with ONLY'), 'the reply shape is the caller\'s, not the rules\'');
  assert.ok(ingest.includes('\\"kind\\"'), 'news-ingest must ask for the kind — summariseEvent ranks on it');
});

/* ── ⑩ 「0 件」の理由が残る（#R334 の形をもう一度作らない） ─────────────── */
test('⑩ the locate stage can never fail silently', () => {
  const fn = codeOnly(rd(INGEST));
  const st = fn.slice(fn.indexOf('async function stageLocate'), fn.indexOf('async function stageEmbed'));
  assert.match(st, /skipped:/, 'a stage that did nothing because it is switched off must say so');
  assert.match(st, /lastError/, 'the last upstream failure must be carried out of the loop');
  assert.match(st, /AbortSignal\.timeout/, 'the LLM call needs a deadline of its own');
  assert.match(st, /budget\.left\(\)/, 'the stage must stop before the wall-clock budget does');
  for (const k of ['located', 'omitted', 'considered', 'batches', 'error'])
    assert.ok(new RegExp('\\b' + k + '\\b').test(st), 'the stage does not report ' + k);
  /* 応答だけでなく `news_ingest_runs` にも出ること。 */
  assert.match(fn, /located_ai:\s*L\.located/);
  assert.match(fn, /locate_error:\s*L\.error/);
  assert.match(rd(MIGRATION), /add column if not exists located_ai\b/);
  /* kill-switch とモデル上書きが段ごとに独立していること。 */
  assert.match(fn, /providerConfig\("NEWS_GEO_AI",\s*"NEWS_GEO_MODEL"\)/);
  assert.match(fn, /providerConfig\("NEWS_TRANSLATE",\s*"NEWS_TRANSLATE_MODEL"\)/);
});

/* ── ⑪ 出どころの列は「見た」と「置いた」を分ける ─────────────────────── */
test('⑪ "the AI looked at it" and "the AI placed it" are different columns', () => {
  const sql = rd(MIGRATION);
  assert.match(sql, /add column if not exists subject_located_by\b/);
  assert.match(sql, /add column if not exists subject_ai_at\b/);
  assert.match(sql, /check \(subject_located_by in \('ai', 'dict', 'none'\)\)/);
  /* 未処理の記事を引く索引は `subject_ai_at is null` でなければならない——
     `subject_located_by <> 'ai'` で引くと、AI が「場所が無い」と判断した記事を
     毎 run 送り直し、上限を使い切って新しい記事に届かない。 */
  assert.match(sql, /where status = 'active' and subject_ai_at is null/);
  const fn = codeOnly(rd(INGEST));
  assert.match(fn, /\.is\("subject_ai_at",\s*null\)/, 'the todo query does not use the "has the AI seen it" column');
  /* 既存行の出どころは、実際にそうであるとおりに埋める（無条件に 'dict' にしない）。 */
  assert.match(sql, /set subject_located_by = 'dict'[\s\S]{0,200}subject_lng is not null/);
});

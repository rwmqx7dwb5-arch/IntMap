/* ============================================================================
 *  IntMap · News EVENTS — 記事ではなく出来事を主語にする News  (Phase D)
 * ----------------------------------------------------------------------------
 *  docs/NEWS-EVENTS.md §9 / §12。#R334 が表を敷き、#R351 がパイプラインを本番で回し、
 *  Phase C が recall と運用者の修正経路を足した。**それでも利用者は 1 バイトも見ていない**
 *  ——`news_events` は本番に 892 行あるのに、配信バンドルからそこへ到達する経路が
 *  1 本も無かった（#R351 追記の本番検証で実測）。これがその経路である。
 *
 *  ══ この層が持たない責任 ═══════════════════════════════════════════════════
 *  ⚠ **クラスタリングをここでしない。** 「同じ出来事か」を決める場所は
 *    supabase/functions/_shared/news-cluster.js の 1 本だけである
 *    （docs/NEWS-EVENTS.md「第二のクラスタリング実装を残さない」）。ここは**読む**だけ。
 *  ⚠ **記事モードを壊さない。** `USE_SERVER_NEWS` が false の経路（ブラウザのライブ RSS）は
 *    fallback として生き続ける。この層は `HOST.globalData` に**同じ形の項目**を入れるので、
 *    既存の描画・ピン・検索・無限スクロールがそのまま動く（変更は加算的に）。
 *  ⚠ **起動経路に置かない。** js/lazy-modules.js の `newsEvents` から取得される。
 *
 *  ══ 「媒体ごとの相違」について ═════════════════════════════════════════════
 *  依頼は「同一 Event 内で媒体ごとの主張や数値が異なる場合、その相違を保持して表示できる」。
 *  ⚠ **バイアス評価はしない**（docs/NEWS-EVENTS.md §15 の初期スコープ外）。ここが出すのは
 *    **機械的に検証できる相違だけ**である——見出しと要約に実際に書かれている数量が
 *    媒体間で食い違っているとき、その**原文の断片をそのまま**並べて出典を付ける。
 *    IntMap は「どちらが正しいか」を言わない。「両者はこう言っている」だけを言う。
 * ==========================================================================*/
import { makeNewsClaims } from './news-claims.js';   /* (#R394) 数量の相違の規則 — ブラウザの外からも測れる 1 本 */
import { makeNewsBrief } from './news-brief.js';     /* (#R405) 出来事の「読める中身」を組み立てる規則 — 同上 */
window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.newsEvents = function (HOST) {
  const L = window.IntMapLang.pick(() => HOST.lang);
  const LA = window.IntMapLang.pickArgs();
  const S = (v) => { try { return window.IntMapSafe.html(v == null ? '' : String(v)); } catch (_) { return ''; } };
  const U = (v) => { try { return window.IntMapSafe.url(String(v || '')); } catch (_) { return ''; } };

  /* ── カテゴリ ───────────────────────────────────────────────────────────
     ⚠ **一覧の正本は `_shared/news-cluster.js` の CATEGORIES と migration の check 制約**で、
       ここはその 8 つに表示名を与えるだけの表である。並び順は「世界 → 政治 → 経済 →
       技術 → 科学 → 気候 → 災害 → 社会」で、フィードのセクションの粒度に合わせてある。
     ⚠ 9 言語すべてを `L()` で書く。#R353 が測ったとおり、i18n の掃引器は
       `L`/`LA` 以外のヘッパーを**見ない**ので、別名を作るとその行は英語のまま出荷される。 */
  const CATS = [
    ['world', LA('World', '国際', 'International', 'В мире', 'Internacional')],
    ['politics', LA('Politics & Conflict', '政治・紛争', 'Politik & Konflikte', 'Политика и конфликты', 'Política y conflictos')],
    ['business', LA('Business & Economy', '経済', 'Wirtschaft', 'Экономика', 'Economía')],
    ['technology', LA('Technology', 'テクノロジー', 'Technologie', 'Технологии', 'Tecnología')],
    ['science_health', LA('Science & Health', '科学・医療', 'Wissenschaft & Gesundheit', 'Наука и здоровье', 'Ciencia y salud')],
    ['climate_weather', LA('Climate & Weather', '気候・気象', 'Klima & Wetter', 'Климат и погода', 'Clima y meteorología')],
    ['disasters', LA('Disasters', '災害', 'Katastrophen', 'Катастрофы', 'Desastres')],
    ['society', LA('Society', '社会', 'Gesellschaft', 'Общество', 'Sociedad')],
  ];
  const catLabel = (k) => { const r = CATS.find((c) => c[0] === k); return r ? L.arr(r[1]) : k; };
  /* ⚠ (#R428) one spelling, two readers — `renderChips()` draws it and `relabelChips()` puts it
     back on a language change. NOT 「すべて」: the scope pair to its left already uses that word.
     (see docs/NEWS-EVENTS.md §9) */
  const ALL_TOPICS = () => L('All topics', '全カテゴリ', 'Alle Themen', 'Все темы', 'Todos los temas');

  /* ── 供給元 ─────────────────────────────────────────────────────────────
     ⚠ Supabase の client は `HOST.DB`。**未ログインでも読める**（RLS は select を
       anon にも許している）——出来事はログインの後ろに隠すものではない。 */
  const EVENT_COLS =
    'id,public_id,representative_title,representative_article_id,primary_category,secondary_categories,' +
    'category_confidence,category_evidence,rep_lng,rep_lat,rep_place_name_en,location_confidence,' +
    'first_published_at,last_article_at,materially_updated_at,article_count,independent_source_count,' +
    'cluster_confidence,manual_lock,status,merged_into,summary,summary_evidence,summary_version';
  const MEMBER_COLS =
    'news_event_articles(relation,assignment_score,assigned_by,' +
    'news_articles(id,title,description,canonical_url,source_id,published_at,subject_name_en,subject_type))';

  const LIMIT = 200;          /* 一覧に載せる Event の上限（記事モードの 150 と同じ桁） */

  let sources = null;          /* id → { name, slug, type, country, hq } */
  let lastLoadedAt = 0;
  let lastError = null;
  let selected = null;         /* 詳細を開いている Event の public_id */
  let items = [];              /* 直近の load() が作った一覧の項目（HOST.globalData へ入れるのは呼び出し側） */
  let category = 'all';

  async function loadSources(force) {
    if (sources && !force) return sources;
    const { data, error } = await HOST.DB.from('news_sources')
      .select('id,name,slug,source_type,country,hq_lng,hq_lat,source_family,homepage_url');
    if (error) throw error;
    sources = new Map((data || []).map((s) => [s.id, s]));
    return sources;
  }

  /* ⚠⚠ **登録簿を一度読んだきりにしない。** Source Registry は運用者が足せる表で、媒体が
     1 つ増えた瞬間から、その媒体の記事は**名前ではなく id** で表示され、`source_family` が
     引けないので**独立媒体としても数え直せなくなる**（同じ資本の 2 本が 2 票になる）。
     ⇒ 応答の中に知らない `source_id` があったら、その読み込みの中で **1 回だけ**取り直す。
     ⚠ 取り直しても見つからないときは黙って id を出す——「知らない媒体」は「無い媒体」ではない。 */
  async function ensureSourcesFor(rows) {
    const need = new Set();
    for (const e of rows || []) {
      for (const l of e.news_event_articles || []) {
        const a = l && l.news_articles;
        if (a && a.source_id && !(sources && sources.has(a.source_id))) need.add(a.source_id);
      }
    }
    if (need.size) { try { await loadSources(true); } catch (_) { /* 古い表のままで描く */ } }
    return need.size;
  }

  /* ── 時刻の文言 ─────────────────────────────────────────────────────────
     ⚠ **1 つの時計に訊く。** 「n 分前」は端末のいまではなく IntMap のマスタークロックで
       決まる（window.IntMapTime。#R288 以降の全レイヤーの規則）。 */
  const nowMs = () => { try { const st = window.IntMapTime.state(); return (st.isLive ? new Date() : st.when).getTime(); } catch (_) { return Date.now(); } };
  function ago(iso) {
    const t = Date.parse(iso);
    if (!isFinite(t)) return '';
    const m = Math.max(0, Math.round((nowMs() - t) / 60000));
    if (m < 60) return L('{n}m ago', '{n}分前', 'vor {n} Min.', '{n} мин назад', 'hace {n} min').replace('{n}', m);
    const h = Math.round(m / 60);
    if (h < 48) return L('{n}h ago', '{n}時間前', 'vor {n} Std.', '{n} ч назад', 'hace {n} h').replace('{n}', h);
    const d = Math.round(h / 24);
    return L('{n}d ago', '{n}日前', 'vor {n} T.', '{n} дн назад', 'hace {n} d').replace('{n}', d);
  }

  /* ── ★ ────────────────────────────────────────────────────────────────
     ⚠ **記事の★（`favorites` / `intmap_bookmarks`）を 1 バイトも触らない。** あれは
       article mode のもので、そのまま動き続ける（docs/NEWS-EVENTS.md §2 の決定 7）。
       Event の★は `saved_news_events`（本人だけが読み書きできる）と、未ログインのための
       localStorage の一覧である。 */
  const SAVE_KEY = 'intmap_saved_events';
  function savedLocal() { try { const a = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
  function saveLocal(a) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(a.slice(-800))); } catch (_) { } }
  let savedIds = new Set(savedLocal());
  function isSaved(pid) { return savedIds.has(pid); }

  async function syncSaved() {
    if (!HOST.user || !HOST.DB) return;
    try {
      const { data, error } = await HOST.DB.from('saved_news_events').select('event_id,event_title');
      if (error) throw error;
      /* 行は Event の**数値 id** を持つ。public_id との対応は現在読み込んでいる一覧から取る。 */
      dbSaved = new Set((data || []).map((r) => r.event_id));
    } catch (e) { lastError = e && e.message; }
  }
  let dbSaved = new Set();

  async function toggleStar(item) {
    const ev = item && item._event;
    if (!ev) return false;
    const on = !isSaved(ev.publicId);
    if (on) savedIds.add(ev.publicId); else savedIds.delete(ev.publicId);
    saveLocal([...savedIds]);
    if (HOST.user && HOST.DB) {
      try {
        if (on) {
          await HOST.DB.from('saved_news_events').upsert(
            { user_id: HOST.user.id, event_id: ev.id, event_title: ev.title }, { onConflict: 'user_id,event_id' });
          dbSaved.add(ev.id);
        } else {
          await HOST.DB.from('saved_news_events').delete().eq('event_id', ev.id);
          dbSaved.delete(ev.id);
        }
      } catch (e) {
        /* ⚠ 失敗したら**元に戻す**。「★が付いたように見えて保存されていない」は
           #R210/#R215 が二度払った形である。 */
        if (on) savedIds.delete(ev.publicId); else savedIds.add(ev.publicId);
        saveLocal([...savedIds]);
        lastError = (e && e.message) || 'save failed';
        return !on;
      }
    }
    return on;
  }

  /* ── 数量の相違 ─────────────────────────────────────────────────────────
     ⚠⚠ **規則そのものはここに無い。** #R386 はこの factory の奥に書いており、
       `HOST` を要求するので**ブラウザの外からは誰も呼べなかった**——「効いている」が
       意見でしかない状態である（#R340 が `research.events` で直したのと同じ形）。
       規則は js/news-claims.js にあり、`scripts/news-events-eval.mjs --diffs` が
       本番のデータでそれを測る。ここに残すのは**ラベルの 9 言語**だけ。 */
  const CLAIMS = makeNewsClaims();
  const KIND_LABEL = {
    dead: LA('killed', '死者', 'Todesopfer', 'погибших', 'muertos'),
    injured: LA('injured', '負傷者', 'Verletzte', 'раненых', 'heridos'),
    missing: LA('missing', '行方不明', 'Vermisste', 'пропавших', 'desaparecidos'),
    money: LA('amount', '金額', 'Betrag', 'сумма', 'importe'),
    percent: LA('percentage', '割合', 'Prozentsatz', 'процент', 'porcentaje'),
  };
  const quantities = (text) => CLAIMS.quantities(text);

  /* ── 出来事の中身（#R405）──────────────────────────────────────────────────
     ⚠⚠⚠ **#R386 は証拠を取ってきておきながら 1 文字も出していなかった。**
       `members[].description` は最初から手元にあり、読者は `differences()` ただ 1 人で、
       本番 1,069 Event 中 **2 件**しか発火しない。⇒ 外部記事を開かない限り IntMap の
       中では何が起きたか分からない＝地図付きのニュース索引であって、出来事を理解する
       道具ではなかった。
     ⚠ **規則は js/news-brief.js にある。** ここに書かない——ブラウザの外から
       `scripts/news-events-eval.mjs --brief` が同じ 1 本を測れるようにするため
       （#R386 / #R340 が踏んだ形）。ここに残すのは 9 言語のラベルと DOM だけ。
     ⚠ **数量の規則を 2 本持たない。** `CLAIMS` をそのまま注入する。 */
  const BRIEF = makeNewsBrief(CLAIMS);
  function briefOf(members) {
    try { return BRIEF.build(members); } catch (_) { return null; }
  }

  /* ── サーバーが書いた統合文（`news_events.summary`）───────────────────────
     ⚠ 決定論の抽出では作れないもの——**複数の媒体が別々に書いた文を 1 つの説明に
       まとめること**——だけを、取り込みの `summarise` 段（サーバー側）が LLM で作る。
       ⚠ その関数の名前をここに綴らない。`tests/r351-checks ⑮` は「js/ と src/ にその綴りが
         1 つも無い」で**サーバー専用**を守っており、散文の言及と import を区別しない。
         区別させる方向に検査を緩めるより、こちらが名前を呼ばないほうが安い。
       返答は**1 文ごとに根拠の断片を言わせ、サーバー側でそれが原文に在ることを確かめて
       から**保存されている（1 文でも通らなければ Event 丸ごと捨てる）。
     ⚠⚠ **それでもここでもう一度確かめる。** 記事が入れ替わったあと、まだ次の run が
       来ていない Event では、保存された統合文が**いま画面に出ている媒体と対応しない**
       ことがありうる。⇒ 引用元の媒体がいまの構成記事の中に無ければ**出さない**。
       「古いかもしれない」ではなく「対応が取れているものだけ出す」。
     ⚠ 出せなくても損は無い——決定論の抽出はそのまま出る。 */
  function synthesisOf(row, members) {
    const ev = row && row.summary_evidence;
    const text = row && typeof row.summary === 'string' ? row.summary.trim() : '';
    if (!text || !ev || !Array.isArray(ev.sentences) || !ev.sentences.length) return null;
    const here = new Set(members.map((m) => m.sourceId));
    const named = new Map(members.map((m) => [m.sourceId, m.sourceName]));
    const lines = [];
    for (const s of ev.sentences) {
      if (!s || typeof s.text !== 'string' || !here.has(s.outlet)) return null;
      lines.push({ text: s.text, source: named.get(s.outlet) || s.outlet, span: s.span || '' });
    }
    return { lines, outlets: [...new Set(lines.map((l) => l.source))] };
  }

  function differences(ev) {
    return CLAIMS.differences((ev.members || []).map((m) => ({
      title: m.title, description: m.description, source: m.sourceName, family: m.family,
    }))).map((d) => ({ ...d, label: KIND_LABEL[d.kind] || d.kind }));
  }

  /* ── DB の行 → 一覧の項目 ───────────────────────────────────────────────
     ⚠ 形は article mode の項目と**同じ**にする。`startNews` / `appendNewsBatch` /
       ピン / 無限スクロール / 期間フィルタが、分岐なしでそのまま動くため。
       Event 固有の事実は `_event` にだけ足す（既存のどの読み手も見ない場所）。 */
  function toItem(row) {
    const links = (row.news_event_articles || [])
      .filter((l) => l.relation === 'same_event' || l.relation === 'update')
      .map((l) => l.news_articles).filter(Boolean)
      .sort((a, b) => Date.parse(a.published_at || 0) - Date.parse(b.published_at || 0));
    const members = links.map((a) => {
      const s = (sources && sources.get(a.source_id)) || null;
      return {
        id: a.id, title: a.title || '', description: a.description || '',
        url: a.canonical_url || '', sourceId: a.source_id,
        sourceName: (s && s.name) || a.source_id,
        family: (s && s.source_family) || a.source_id,
        country: (s && s.country) || '',
        type: (s && s.source_type) || '',
        hq: (s && isFinite(s.hq_lng) && isFinite(s.hq_lat)) ? [s.hq_lng, s.hq_lat] : null,
        publishedAt: a.published_at || '',
      };
    });
    const rep = links.find((a) => a.id === row.representative_article_id) || links[0] || null;
    /* ⚠⚠⚠ **見出しの日本語訳は表示しない**（#R405 で利用者が決めた）。News は英語で出す。
       DB の `news_event_i18n`（実測 708 行）は**消していない**——止めたのは生成と表示で
       あって、記録ではない。再開するときは `stageTranslate` の kill-switch を戻し、
       ここで `news_event_i18n` を読み直せばよい。 */
    const title = row.representative_title;
    const outlets = [];
    const seenFam = new Set();
    for (const m of members) { if (seenFam.has(m.family)) continue; seenFam.add(m.family); outlets.push(m.sourceName); }

    const subjectLoc = (isFinite(row.rep_lng) && isFinite(row.rep_lat)) ? [row.rep_lng, row.rep_lat] : null;
    const analysis = {
      subjectLoc, subjectName: row.rep_place_name_en || '',
      subjectType: (rep && rep.subject_type) || '',
      /* ⚠ (#R416) `short` (the map band's text) is NOT set here any more. It used to be `''`, and
         because the band layer reads exactly that field, every event pin drew an empty white pill
         (measured: 46 of 46 on screen). The rule now lives in js/map-typography.js `bandText()` and
         the pin builder applies it to the representative headline — one rule for both news modes.
         ⚠ `pubLoc` stayed `null` for the same reason nothing else filled it: an出来事 has no
         publisher location. #R416 removed the Subject/Publisher pin toggle it fed. */
      _title: title, _pub: outlets[0] || '',
    };
    try { HOST.applyPinMode(analysis); } catch (_) { analysis.loc = subjectLoc; analysis.name = row.rep_place_name_en || ''; analysis.mapped = subjectLoc ? true : false; }
    /* ⚠⚠⚠ **地点が解決していない出来事に、地点を持たせない。** `applyPinMode` は記事モード
       のために、解決できなかった項目へ `hashLocFromString()` の**擬似座標**を与える
       （`mapped=false`・「場所不明」の紫チップ付き）。実測 (2026-08-24・本番): active 1,069
       件のうち **330 件（30.9%）が座標を持たない**ので、そのまま使うと地図の 3 割が
       「そこで起きていない出来事」のピンになる。docs/NEWS-EVENTS.md §9 が
       「正直に出すもの: 場所不明」と決めているのは、**印を付けて出す**ことであって
       **在りもしない座標を配る**ことではない。
       ⚠ 記事モードは 1 ビットも変えない——ここは Event の項目を作る場所だけである。
       ⚠ 消えるのはピンだけ。カードは一覧に残り、チップは「場所不明」と言い、
         `state().unplacedCount` が何件かを数える。 */
    if (!subjectLoc) { analysis.loc = null; analysis.mapped = false; }

    const firstAt = row.first_published_at || (members[0] && members[0].publishedAt) || '';
    const lastAt = row.last_article_at || firstAt;
    /* ⚠ 1 Event につき 1 回だけ組む。カード・詳細・`state()` が同じ 1 つを読む
       （描画のたびに組み直すと、同じ出来事について 2 つの答えが在りうる）。 */
    const brief = briefOf(members);
    const synthesis = synthesisOf(row, members);
    return {
      title,
      publisher: outlets.slice(0, 2).join(' · '),
      link: (rep && rep.canonical_url) || (members[0] && members[0].url) || '',
      pubDate: lastAt,
      /* ⚠ `desc` は #R386 が `''` に固定していた欄である。実際の中身を入れると、
         カードの抜粋だけでなく `js/news-ui.js` の AI 要約プロンプト（160 字）にも
         初めて本文が渡る。 */
      desc: (brief && brief.gist[0] && brief.gist[0].text) || '',
      analysis,
      /* 検索は代表見出しだけでなく**構成記事の見出しにも当てる**。Event を探す人は
         「自分が読んだ 1 本の見出し」を覚えていることのほうが多い。 */
      _search: (title + ' ' + row.representative_title + ' ' + members.map((m) => m.title).join(' ') + ' ' + outlets.join(' ')).toLowerCase(),
      _event: {
        id: row.id, publicId: row.public_id, title: row.representative_title, titleShown: title,
        brief, synthesis,
        category: row.primary_category, secondary: row.secondary_categories || [],
        categoryBy: (row.category_evidence && row.category_evidence.by) || '',
        categoryConfidence: row.category_confidence,
        place: row.rep_place_name_en || '', locationConfidence: row.location_confidence,
        articleCount: row.article_count, sourceCount: row.independent_source_count,
        clusterConfidence: row.cluster_confidence, manualLock: !!row.manual_lock,
        firstAt, lastAt, updatedAt: row.materially_updated_at || lastAt,
        outlets, members,
      },
    };
  }

  /* ── 読み込み ───────────────────────────────────────────────────────────
     戻り値は「一覧に載せられる項目が取れたか」。取れなければ**呼び出し側が記事モードへ
     落ちられる**ように false を返す（黙って空の一覧を見せない）。 */
  async function load() {
    if (!HOST.DB) { lastError = 'no database client'; return false; }
    try {
      await loadSources();
      let q = HOST.DB.from('news_events')
        .select(EVENT_COLS + ',' + MEMBER_COLS)
        .eq('status', 'active').is('merged_into', null)
        .order('materially_updated_at', { ascending: false })
        .limit(LIMIT);
      const { data, error } = await q;
      if (error) throw error;
      if (!data || !data.length) { lastError = 'no events'; return false; }
      await ensureSourcesFor(data);

      /* ⚠ #R405: 日本語の見出しを引きに行くクエリはここに在った。利用者が「生成も表示も
         停止・ニュース機能は英語」と決めたので外した。1 往復ぶん軽くもなる。
         ⚠ 表は消していない（`news_event_i18n` の 708 行は本番に残っている）。 */
      await syncSaved();
      /* ログイン済みなら DB の★を localStorage 側にも映す（端末をまたいで同じ★が出る）。 */
      if (HOST.user) {
        for (const e of data) if (dbSaved.has(e.id)) savedIds.add(e.public_id);
        saveLocal([...savedIds]);
      }
      /* ⚠ **`HOST.globalData` をここから書かない。** そのメンバの書き手は
         js/news-feed.js だけであり（#R165 の RW 契約：1 メンバに書き手は 1 つ）、
         2 つ目の書き手ができた瞬間に「いま一覧に何が入っているか」の
         責任が 2 か所に分かれる。ここは**項目を作って渡すだけ**で、入れるのは呼び出し側。 */
      items = data.map((row) => toItem(row));
      lastLoadedAt = nowMs();
      lastError = null;
      return true;
    } catch (e) {
      lastError = (e && e.message) || String(e);
      console.warn('[IntMap] news events unavailable:', lastError);
      return false;
    }
  }

  /* ── カテゴリの chips ───────────────────────────────────────────────────
     docs/NEWS-EVENTS.md §9: 検索欄の下、`すべて / ★ 保存済み` と**同じ 1 行**に横スクロールで並ぶ。
     ⚠ 一覧と地図へ**同時に**適用する。地図だけ・一覧だけに効くフィルタは、利用者が
       「どちらが本当か」を判断できない状態を作る。 */
  function renderChips() {
    const row = document.getElementById('news-cat-chips');
    if (!row) return;
    const counts = new Map();
    for (const it of (HOST.globalData || [])) {
      if (!it._event) continue;
      counts.set(it._event.category, (counts.get(it._event.category) || 0) + 1);
    }
    const mk = (key, label, n) =>
      '<button class="news-cat-chip' + (category === key ? ' active' : '') + '" data-cat="' + S(key) + '">' +
      S(label) + (n == null ? '' : '<span class="news-cat-n">' + n + '</span>') + '</button>';
    /* ⚠ (#R416) NOT 「すべて」. The scope chips immediately to the left of this strip are
       「すべて / ★ 保存済み」, and this one used to say the same word about a different axis — two
       controls, one row, one word, two meanings. This one is about TOPICS. */
    let html = mk('all', ALL_TOPICS(),
      (HOST.globalData || []).filter((x) => x._event).length);
    for (const [key, label] of CATS) {
      const n = counts.get(key) || 0;
      if (!n) continue;      /* 0 件のカテゴリは出さない——押せない chip は嘘である */
      html += mk(key, L.arr(label), n);
    }
    row.innerHTML = html;
    row.style.display = '';
    Array.prototype.forEach.call(row.querySelectorAll('.news-cat-chip'), (b) => {
      b.onclick = () => {
        category = b.dataset.cat || 'all';
        renderChips();
        try { HOST.startNews(); } catch (_) { }
      };
    });
  }
  function hideChips() { const row = document.getElementById('news-cat-chips'); if (row) { row.style.display = 'none'; row.innerHTML = ''; } }

  /* 一覧と地図の両方が通す述語。⚠ 1 か所しかない。 */
  function passes(item) {
    if (!item || !item._event) return true;          /* 記事モードの項目は素通し */
    if (category !== 'all' && item._event.category !== category) return false;
    return true;
  }

  /* ── カードの Event 部分 ────────────────────────────────────────────────
     ⚠ `.news-item` を**発展させる**（docs/NEWS-EVENTS.md §9「既存の視覚言語と密度を維持
       する。Ground News 風の独立画面や巨大モーダルを作らない」）。作るのは 1 行だけ。 */
  function decorate(card, item) {
    const ev = item && item._event;
    if (!ev || !card) return;
    card.classList.add('news-event');
    const foot = card.querySelector('.news-foot');
    if (!foot) return;
    const isUpd = ev.articleCount > 1 && Date.parse(ev.lastAt) - Date.parse(ev.firstAt) > 3600e3;
    const badge = isUpd
      ? '<span class="ev-badge upd">' + S(L('Follow-up', '続報', 'Aktualisiert', 'Обновлено', 'Actualizado')) + '</span>'
      : '';
    const head = card.querySelector('.news-head');
    if (head && badge) head.insertAdjacentHTML('beforeend', badge);
    if (head) head.insertAdjacentHTML('beforeend',
      '<span class="ev-cat" title="' + S(L('Event category', '出来事のカテゴリ', 'Ereigniskategorie', 'Категория события', 'Categoría del suceso')) + '">' + S(catLabel(ev.category)) + '</span>');

    const nSrc = ev.sourceCount || 1;
    const label = nSrc === 1
      ? L('1 source', '1媒体', '1 Quelle', '1 источник', '1 fuente')
      : L('{n} sources', '{n}媒体', '{n} Quellen', '{n} источников', '{n} fuentes');
    const btn = document.createElement('button');
    btn.className = 'ev-sources';
    btn.textContent = String(label).replace('{n}', nSrc);
    btn.title = ev.outlets.join(' · ');
    btn.onclick = (e) => { e.stopPropagation(); openDetail(item); };
    foot.insertBefore(btn, foot.querySelector('.btn-read'));

    /* ── 何が起きたか（1 文）──────────────────────────────────────────────
       ⚠ カードに載せるのは**1 文だけ**。docs/NEWS-EVENTS.md §9 の「既存の視覚言語と
         密度を維持する」を守り、残りは詳細に置く。
       ⚠ **無いときは何も出さない。** 一覧の項目に「情報が足りません」と書くと、
         43.5% のカードが謝罪文になる。足りないことを言うのは詳細の仕事である。 */
    const g0 = ev.brief && ev.brief.gist[0];
    if (g0) {
      const t = card.querySelector('.news-title');
      /* ⚠⚠⚠ **出典は文の<u>前</u>に置く。** 実測 (2026-08-24・本番データのスクリーンショット):
         末尾に置いた `— 媒体名` は 2 行クランプで**必ず切り落とされ**、カードから出典が消えて
         いた。カードには `.news-pub` に媒体が 2 つまで出るが、それは Event 全体の媒体で
         あって**この文を書いた媒体ではない**（3 媒体の Event ではどれの文か分からない）。
         「各記述に根拠媒体が付く」がこの機能の約束なので、切られない側に置く。 */
      if (t) t.insertAdjacentHTML('afterend',
        '<div class="ev-gist"><span class="ev-gist-src">' + S(g0.source) + '</span> ' + S(g0.text) + '</div>');
    }

    /* ── 「記事を読む」を二次導線へ下げる（#R405）─────────────────────────
       ⚠⚠⚠ **記事モードのカードからは外さない。** `appendNewsBatch()` は article mode と
         Event mode で**同じ関数**なので、`js/news-ui.js` 側で消すと記事モードの
         「記事を読む」まで消える。ここは Event の項目にだけ呼ばれる `decorate()` なので、
         外れるのは Event のカードだけである。
       ⚠ **機能は失わせない。** 行き先は詳細の Coverage 節で、そこには**媒体ごとに**
         リンクがある——1 本の代表記事しか開けなかったカードのボタンより多い。 */
    const read = foot.querySelector('.btn-read');
    if (read) read.remove();
  }

  /* ── 詳細 ───────────────────────────────────────────────────────────────
     既存の `#news-reader-pane` に描く（記事の reader と同じ面）。
     ⚠ 「独立画面」を作らない。戻る動作も reader と同じものを使う。
     ⚠⚠⚠ (#R435) **「同じ面」は、同じ入り方・同じ出方まで含めて初めて本当になる。** ここは
       #R386 から `pane.style.display=''` と `feed.style.display='none'` の 2 行だけを持っていて、
       記事 reader が入口でやっている残り——サイドバーを開く／電話ならシートを full にする／
       一覧の外皮（タブ列・検索欄・scope と カテゴリの chips）を伏せる——を 1 つもやっていなかった。
       だから詳細は「一覧の外皮の下に残った帯」に描かれ（＝報告の「デザインが浮いている」）、
       電話ではシートの位置しだいで**画面の下に丸ごと落ちた**（実測 390×780・peek: 戻るボタンが
       y=866）。⇒ 入口は `HOST.enterReaderPane()`、出口は `HOST.closeReaderPane()` の 1 本ずつ。 */
  function openDetail(item) {
    const ev = item && item._event;
    if (!ev) return;
    selected = ev.publicId;
    const pane = HOST.enterReaderPane();
    if (!pane) return;

    const back = L('Back', '戻る', 'Zurück', 'Назад', 'Atrás');
    const rows = ev.members.slice().sort((a, b) => Date.parse(a.publishedAt || 0) - Date.parse(b.publishedAt || 0));
    const firstFam = rows.length ? rows[0].family : null;

    const fmt = (iso) => { try { return new Date(iso).toLocaleString(window.IntMapLang.locale(HOST.lang), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (_) { return iso || ''; } };

    /* ⚠⚠⚠ (#R435) **`.nrp-bar` / `.nrp-back` — 記事 reader と同じ綴り。** ここは `.reader-bar` /
       `.btn-back` と書いていて、css/intmap.css の規則は `.ev-detail .reader-bar` と
       `.ev-detail .btn-back`——**帯は `.ev-detail` の兄弟であって子孫ではない**ので、その 3 規則は
       #R386 から 1 度も当たっていなかった。当たらない CSS は「無い CSS」なので、戻るボタンは
       ブラウザ既定の <button>（実測: 背景 #f0f0f0・角丸 0・padding 0・border 2px outset・44×20 px）
       として描かれ、帯の `position:sticky` も効かず（実測 `static`）**スクロールで流れて二度と
       戻らなかった**。⇒ 読む面の外皮は 1 か所（`.nrp-bar`/`.nrp-back`）だけが持つ。 */
    let html = '<div class="nrp-bar"><button class="nrp-back" id="ev-back">‹ ' + S(back) + '</button></div>';
    html += '<div class="ev-detail">';
    html += '<div class="ev-d-head">';
    if (ev.place) html += '<span class="loc-chip">' + S(ev.place) + '</span>';
    html += '<span class="ev-cat">' + S(catLabel(ev.category)) + '</span>';
    html += '</div>';
    html += '<h2 class="ev-d-title">' + S(ev.titleShown) + '</h2>';

    /* ── 時刻 ── 初出と最新。「いつから続いているか」は出来事の基本的な事実である。 */
    html += '<div class="ev-d-meta">' +
      '<span>' + S(L('First reported', '初出', 'Zuerst gemeldet', 'Первое сообщение', 'Primer informe')) + ': ' + S(fmt(ev.firstAt)) + '</span>' +
      '<span>' + S(L('Latest article', '最新', 'Neueste', 'Последнее', 'Más reciente')) + ': ' + S(fmt(ev.lastAt)) + ' · ' + S(ago(ev.lastAt)) + '</span>' +
      '<span>' + S(String(L('{a} articles · {b} independent outlets', '記事{a}本・独立{b}媒体', '{a} Artikel · {b} unabhängige Quellen', '{a} статей · {b} независимых источников', '{a} artículos · {b} medios independientes')).replace('{a}', ev.articleCount).replace('{b}', ev.sourceCount)) + '</span>' +
      '</div>';

    /* ══ 何が起きたか（#R405）════════════════════════════════════════════════
       依頼: 「外部記事を開かないと内容が分からないなら、IntMap 内で世界を把握すると
       いう中心価値を果たせない」。⇒ **1 つの Event を IntMap の中だけで理解できるように
       する。** 出すのは 6 つ——何が起きたか / 誰がどこでいつ / 主要な数字 /
       最新記事で更新された点 / 媒体間の一致と相違 / **各記述の根拠媒体**。
       ⚠⚠⚠ **根拠のない AI 作文をしない**（docs/NEWS-EVENTS.md §15）。ここに出るのは
         すべて**媒体が実際に書いた原文の断片**で、1 行ごとに出典が付く。
       ⚠⚠⚠ **足りないときは足りないと言う。** 実測 (2026-08-24・本番 400 Event):
         2 文以上を取れるのは **15.0%**、1 文だけが 37.8%、**43.5% は本文が 1 文字も無い**
         ——Reuters / AP / Bloomberg は Google 経由の取り込みで `<description>` が
         リンク一覧なので捨てられる。ここで「読み込み失敗」に見せてはならない。 */
    const brief = ev.brief;
    if (brief) {
      html += '<div class="ev-d-sec ev-brief"><h3>' +
        S(L('What happened', '何が起きたか', 'Was geschehen ist', 'Что произошло', 'Qué ocurrió')) + '</h3>';

      /* ── 複数媒体をまとめた説明（サーバーが書き、根拠を照合済み）───────────
         ⚠⚠⚠ **AI が書いたことを隠さない。** 1 文ごとに引用元の媒体を付け、
           下に**原文の断片**（各文の根拠として照合に使ったもの）をそのまま置く。
           読者が「この文はどこから来たのか」を自分で確かめられる状態にする。 */
      if (ev.synthesis) {
        html += '<div class="ev-syn">';
        for (const l of ev.synthesis.lines) {
          html += '<p class="ev-line">' + S(l.text) + '<span class="ev-src">— ' + S(l.source) + '</span></p>';
        }
        html += '<details class="ev-syn-ev"><summary>' +
          S(String(L('How this was written — the exact wording each sentence came from ({n})', 'この文が何から書かれたか — 各文の根拠になった原文（{n}件）', 'Woraus dies geschrieben wurde — der genaue Wortlaut je Satz ({n})', 'Из чего это написано — точные формулировки для каждого предложения ({n})', 'De dónde salió esto — la redacción exacta de cada frase ({n})')).replace('{n}', ev.synthesis.lines.length)) + '</summary>';
        for (const l of ev.synthesis.lines) {
          if (l.span) html += '<div class="ev-diff-ctx">“' + S(l.span) + '” <span class="ev-src">— ' + S(l.source) + '</span></div>';
        }
        html += '</details>';
        html += '<p class="ev-d-note">' + S(L('IntMap combined what these outlets published into the paragraph above. Every sentence was machine-checked against the wording shown here before it was saved; sentences that could not be checked are discarded, never shown.', '上の段落は、これらの媒体が公表した内容を IntMap がまとめたものである。各文は保存前に、ここに示した原文と機械的に照合してある。照合できなかった文は捨てられ、表示されることはない。', 'IntMap hat das Veröffentlichte zu obigem Absatz zusammengefügt. Jeder Satz wurde vor dem Speichern maschinell gegen den hier gezeigten Wortlaut geprüft; ungeprüfte Sätze werden verworfen.', 'IntMap объединил опубликованное в абзац выше. Каждое предложение перед сохранением машинно сверено с приведёнными формулировками; непроверенные отбрасываются.', 'IntMap combinó lo publicado en el párrafo anterior. Cada frase se verificó automáticamente con la redacción mostrada aquí antes de guardarse; las que no se pudieron verificar se descartan.')) + '</p>';
        html += '</div>';
      }

      if (brief.gist.length) {
        if (ev.synthesis) {
          html += '<h4 class="ev-sub">' + S(L('In each outlet’s own words', '各媒体の原文', 'In den Worten der jeweiligen Quelle', 'Словами каждого источника', 'En palabras de cada medio')) + '</h4>';
        }
        for (const g of brief.gist) {
          html += '<p class="ev-line">' + S(g.text) +
            '<span class="ev-src">— ' + S(g.source) + '</span></p>';
        }
        html += '<p class="ev-d-note">' + S(L('Sentences are quoted from what each outlet published. IntMap does not rewrite or paraphrase them.', '各媒体が実際に公表した文をそのまま引いている。IntMap は書き換えも言い換えもしない。', 'Die Sätze sind wörtlich aus dem übernommen, was jede Quelle veröffentlicht hat. IntMap schreibt sie nicht um.', 'Предложения приведены дословно из публикаций каждого источника. IntMap их не переписывает.', 'Las frases se citan tal como las publicó cada medio. IntMap no las reescribe ni parafrasea.')) + '</p>';
        if (brief.status === 'thin') {
          html += '<p class="ev-short">' + S(L('Only one outlet supplied article text for this event, so this is all IntMap can show without leaving the app.', 'この出来事について本文を配っているのは1媒体だけなので、IntMap の中で読めるのはここまでである。', 'Nur eine Quelle lieferte Artikeltext, mehr kann IntMap hier nicht zeigen.', 'Текст статьи предоставил только один источник, поэтому это всё, что IntMap может показать.', 'Solo un medio proporcionó texto del artículo, así que esto es todo lo que IntMap puede mostrar.')) + '</p>';
        }
      } else {
        /* ⚠ **理由を言う。** 「要約がありません」だけだと読み込み失敗に見える。 */
        html += '<p class="ev-short">' + S(brief.reason === 'unusable_text'
          ? L('The outlets covering this event supplied no usable article text — only headlines. IntMap does not invent the rest.', 'この出来事を報じた媒体は、使える本文を配っていない（見出しだけ）。IntMap は残りを創作しない。', 'Die Quellen lieferten keinen brauchbaren Artikeltext — nur Schlagzeilen. IntMap erfindet den Rest nicht.', 'Источники не предоставили пригодного текста статьи — только заголовки. IntMap не выдумывает остальное.', 'Los medios no proporcionaron texto útil del artículo, solo titulares. IntMap no inventa el resto.')
          : L('The outlets covering this event publish headline-only feeds, so IntMap has no article text to show. Open a report below to read it at the source.', 'この出来事を報じた媒体は見出しだけのフィードを配信しており、IntMap には見せられる本文が無い。下の一覧から発信元で読める。', 'Die Quellen veröffentlichen reine Schlagzeilen-Feeds, daher hat IntMap keinen Artikeltext. Unten beim Original lesen.', 'Эти источники публикуют ленты только с заголовками, поэтому у IntMap нет текста статьи. Читайте в оригинале ниже.', 'Estos medios publican feeds solo de titulares, así que IntMap no tiene texto que mostrar. Léalo en la fuente más abajo.')) + '</p>';
      }
      html += '</div>';

      /* ── 主要な数字 ─────────────────────────────────────────────────────
         ⚠⚠ #R386 は数量を**食い違ったときしか**出していなかった（本番 1,069 Event 中
           2 件）。抽出そのものは当たっているので、食い違っていない数字も出す。
           実測: 出せる Event が **2 → 34**（400 件中）。 */
      if (brief.figures.length) {
        html += '<div class="ev-d-sec ev-figs"><h3>' +
          S(L('Key figures', '主要な数字', 'Wichtige Zahlen', 'Ключевые цифры', 'Cifras clave')) + '</h3>';
        for (const f of brief.figures) {
          html += '<div class="ev-fig"><span class="ev-fig-k">' + S(KIND_LABEL[f.kind] ? L.arr(KIND_LABEL[f.kind]) : f.kind) + '</span>' +
            '<b>' + S(f.text) + '</b><span class="ev-src">— ' + S(f.source) + '</span>' +
            (f.context ? '<div class="ev-diff-ctx">…' + S(f.context) + '…</div>' : '') + '</div>';
        }
        html += '</div>';
      }

      /* ── 最新記事で何が更新されたか ──────────────────────────────────────
         ⚠ **「最後に届いた記事」は「更新」ではない。** 初報から 1 時間以上あとに出た
           記事だけを見て、そこで初めて出た数量と、初めて報じた系列を出す。 */
      if (brief.latest) {
        const u = brief.latest;
        html += '<div class="ev-d-sec ev-upd"><h3>' +
          S(L('What the latest report added', '最新の記事で更新された点', 'Was der neueste Bericht ergänzt', 'Что добавило последнее сообщение', 'Qué añadió el último informe')) + '</h3>';
        if (u.newFamily) {
          html += '<p class="ev-line">' + S(String(L('{s} became the newest outlet to report this, {t}.', '{s} が新たにこの出来事を報じた（{t}）。', '{s} berichtete als neueste Quelle darüber, {t}.', '{s} стал новым источником, сообщившим об этом, {t}.', '{s} pasó a ser el medio más reciente en informarlo, {t}.'))
            .replace('{s}', u.source).replace('{t}', ago(u.at))) + '</p>';
        }
        if (u.text) html += '<p class="ev-line">' + S(u.text) + '<span class="ev-src">— ' + S(u.source) + '</span></p>';
        for (const f of u.figures) {
          html += '<p class="ev-line ev-new-fig"><b>' + S(f.text) + '</b> ' +
            S(L('first appears in this report', 'この記事で初めて出た数量', 'erscheint hier erstmals', 'впервые появляется в этом сообщении', 'aparece por primera vez en este informe')) +
            '<span class="ev-src">— ' + S(u.source) + '</span></p>';
        }
        html += '</div>';
      }

      /* ── 媒体間で一致している点 ───────────────────────────────────────────
         ⚠ 一致と呼ぶのは**別々の資本系列**が同じ値を言ったときだけ。同じ系列の転載が
           同じ数字を持っていても、それは 1 つの主張である。 */
      if (brief.agreements.length) {
        html += '<div class="ev-d-sec ev-agree"><h3>' +
          S(L('Where outlets agree', '媒体間で一致している点', 'Worin die Quellen übereinstimmen', 'В чём источники согласны', 'En qué coinciden los medios')) + '</h3>';
        for (const a of brief.agreements) {
          html += '<div class="ev-fig"><span class="ev-fig-k">' + S(KIND_LABEL[a.kind] ? L.arr(KIND_LABEL[a.kind]) : a.kind) + '</span>' +
            '<b>' + S(a.text) + '</b><span class="ev-src">— ' + S(a.sources.join(' · ')) + '</span></div>';
        }
        html += '</div>';
      }
    }

    /* ── 媒体ごとの相違（数量）── */
    const diffs = differences(ev);
    if (diffs.length) {
      html += '<div class="ev-d-sec ev-diff"><h3>' +
        S(L('Where outlets differ', '媒体間で食い違っている点', 'Wo sich Quellen unterscheiden', 'В чём источники расходятся', 'En qué difieren los medios')) + '</h3>';
      html += '<p class="ev-d-note">' + S(L('IntMap does not judge which is right. These are the figures each outlet actually printed.', 'IntMap はどちらが正しいかを判定しない。各媒体が実際に書いた数量をそのまま並べている。', 'IntMap urteilt nicht, was richtig ist. Dies sind die Zahlen, die jede Quelle tatsächlich gedruckt hat.', 'IntMap не решает, кто прав. Это цифры, которые каждый источник действительно напечатал.', 'IntMap no juzga cuál es correcto. Estas son las cifras que cada medio publicó realmente.')) + '</p>';
      for (const d of diffs) {
        html += '<div class="ev-diff-row"><span class="ev-diff-k">' + S(L.arr(d.label)) + '</span><div class="ev-diff-v">';
        for (const c of d.claims) {
          html += '<div><b>' + S(c.text) + '</b> <span class="ev-diff-src">— ' + S(c.source) + '</span>'
            + (c.context ? '<div class="ev-diff-ctx">…' + S(c.context) + '…</div>' : '') + '</div>';
        }
        html += '</div></div>';
      }
      html += '</div>';
    }

    /* ── どこが報じたか ── 初報に印を付ける。転載は独立の声として数えない。
       ⚠ #R405: **ここが「記事を読む」の行き先である。** カードのボタンは代表記事 1 本
         しか開けなかったが、ここには**媒体ごとに**リンクがある。二次導線に下げるとは、
         導線を減らすことではない。 */
    html += '<div class="ev-d-sec ev-cov-sec"><h3>' +
      S(L('Read it at the source', '発信元で読む', 'An der Quelle lesen', 'Читать в источнике', 'Leerlo en la fuente')) + '</h3>';
    html += '<p class="ev-d-note">' + S(L('Which outlet said what, in the order they published it.', 'どの媒体が何と書いたかを、公表された順に並べている。', 'Welche Quelle was sagte, in der Reihenfolge der Veröffentlichung.', 'Кто и что сказал, в порядке публикации.', 'Qué dijo cada medio, en el orden en que lo publicaron.')) + '</p>';
    const famSeen = new Set();
    for (const m of rows) {
      const dup = famSeen.has(m.family);
      famSeen.add(m.family);
      const u = U(m.url);
      html += '<div class="ev-cov' + (dup ? ' dup' : '') + '">' +
        '<div class="ev-cov-h"><span class="ev-cov-src">' + S(m.sourceName) + '</span>' +
        (m.family === firstFam && !dup ? '<span class="ev-badge first">' + S(L('First', '初報', 'Zuerst', 'Первым', 'Primero')) + '</span>' : '') +
        (dup ? '<span class="ev-badge dup">' + S(L('Same group', '同系列', 'Gleiche Gruppe', 'Та же группа', 'Mismo grupo')) + '</span>' : '') +
        '<span class="ev-cov-at">' + S(fmt(m.publishedAt)) + '</span></div>' +
        (u ? '<a class="ev-cov-t" href="' + u + '" target="_blank" rel="noopener">' + S(m.title) + '</a>'
           : '<div class="ev-cov-t">' + S(m.title) + '</div>') +
        /* 見出しがリンクであることは見て分かりにくいので、明示の導線も置く。 */
        (u ? '<a class="ev-cov-read" href="' + u + '" target="_blank" rel="noopener">' +
          S(L('Read at {s} ↗', '{s} で読む ↗', 'Bei {s} lesen ↗', 'Читать на {s} ↗', 'Leer en {s} ↗').replace('{s}', m.sourceName)) + '</a>' : '') +
        '</div>';
    }
    html += '</div>';

    /* ── なぜこの塊なのか ── 自動化が間違った理由を隠さない（§11 の規律を読み手にも）。 */
    html += '<div class="ev-d-sec ev-why"><h3>' +
      S(L('How this event was assembled', 'この出来事の組み立て方', 'Wie dieses Ereignis entstand', 'Как собрано это событие', 'Cómo se construyó este suceso')) + '</h3><ul>';
    html += '<li>' + S(L('Grouped from published headlines by a deterministic rule (time, place, shared rare words) — not by an AI summary.', '公表された見出しを、時刻・場所・珍しい語の共有という決定論の規則で束ねている（AI の要約ではない）。', 'Aus veröffentlichten Schlagzeilen nach einer deterministischen Regel gruppiert (Zeit, Ort, seltene Wörter) — nicht durch eine KI-Zusammenfassung.', 'Сгруппировано по опубликованным заголовкам детерминированным правилом (время, место, редкие слова), а не сводкой ИИ.', 'Agrupado a partir de titulares publicados mediante una regla determinista (tiempo, lugar, palabras poco frecuentes), no por un resumen de IA.')) + '</li>';
    html += '<li>' + S(String(L('Independent outlets are counted by ownership group, so syndicated copies of one story count once. Here: {a} articles, {b} independent.', '独立媒体は資本系列で数える（同一記事の転載は 1 票）。ここでは記事 {a} 本・独立 {b} 媒体。', 'Unabhängige Quellen werden nach Eigentümergruppe gezählt; syndizierte Kopien zählen einmal. Hier: {a} Artikel, {b} unabhängig.', 'Независимые источники считаются по группе владения, поэтому перепечатки считаются один раз. Здесь: {a} статей, {b} независимых.', 'Los medios independientes se cuentan por grupo propietario, así que las republicaciones cuentan una vez. Aquí: {a} artículos, {b} independientes.')).replace('{a}', ev.articleCount).replace('{b}', ev.sourceCount)) + '</li>';
    html += '<li>' + S(String(L('Category decided by: {by}.', 'カテゴリを決めたもの: {by}。', 'Kategorie bestimmt durch: {by}.', 'Категорию определил: {by}.', 'Categoría decidida por: {by}.'))
      .replace('{by}', ev.categoryBy || '—')) + '</li>';
    if (ev.manualLock) html += '<li>' + S(L('Reviewed and locked by an operator.', '運用者が確認し、固定している。', 'Von einem Betreiber geprüft und gesperrt.', 'Проверено и зафиксировано оператором.', 'Revisado y bloqueado por un operador.')) + '</li>';
    if (!ev.place) html += '<li>' + S(L('No location could be resolved for this event.', 'この出来事の地点は特定できていない。', 'Für dieses Ereignis konnte kein Ort bestimmt werden.', 'Место этого события не определено.', 'No se pudo determinar la ubicación de este suceso.')) + '</li>';
    html += '</ul></div>';
    html += '</div>';

    pane.innerHTML = html;
    pane.scrollTop = 0;

    /* ── Atlas に「いま読んでいるもの」を渡す（#R430）───────────────────────────
       js/atlas-console.js `_selectionState()` は `window._imReader` を読んで o.article を作り、
       js/atlas-state.js の文が「この記事 / **この出来事** / それ / 詳しく・背景・なぜ」をそこへ写像する。
       ⚠⚠⚠ **その文は最初から「この出来事」と書いてあったのに、橋を架ける側が誰も居なかった。**
         書き手は `openArticleInSidebar()` ただ 1 つで、それは #R11 以来呼ばれていない（#R430 で実測）
         ＝ o.article は書かれた日から undefined。#R80 の検証が `_imReader` を手で注入して読み手だけを
         確かめたので、書き手が一度も動いていないことが 300 ラウンド気付かれなかった。
       ⚠ **根拠のない要約を渡さない**（CONSTITUTION §5・docs/NEWS-EVENTS.md §15）。ここで積むのは
         `synthesis`（媒体の原文と機械照合済み）と `gist`（媒体の原文そのまま）だけで、両方とも出典付き。 */
    try {
      const lines = [];
      if (ev.synthesis && Array.isArray(ev.synthesis.lines)) {
        for (const l of ev.synthesis.lines) if (l && l.text) lines.push(l.text + (l.source ? ' — ' + l.source : ''));
      }
      if (ev.brief && Array.isArray(ev.brief.gist)) {
        for (const g of ev.brief.gist) if (g && g.text) lines.push(g.text + (g.source ? ' — ' + g.source : ''));
      }
      const firstName = rows.length ? (rows[0].sourceName || '') : '';
      const loc = (item.analysis && item.analysis.loc && isFinite(item.analysis.loc[0]))
        ? [item.analysis.loc[0], item.analysis.loc[1]] : null;
      window._imReader = {
        open: true, title: ev.titleShown || '',
        publisher: (ev.sourceCount > 1 && firstName) ? (firstName + ' +' + (ev.sourceCount - 1)) : firstName,
        link: rows.length ? (rows[0].url || '') : '',
        pubDate: ev.lastAt || '', loc, place: ev.place || '',
        body: lines.join('\n\n').slice(0, 6000),
      };
    } catch (_) { }

    const b = document.getElementById('ev-back');
    /* ⚠ (#R435) 出口は 1 本。ここで一覧を手で出し直すと、外皮（タブ列・検索欄・chips）を伏せた
       ままの一覧に戻る——伏せたものを戻す責任は `closeReaderPane()` と `renderUI()` にある。
       ⚠ `window._imReader` を消すのもその 1 本の仕事である（#R430 が置いたこの手当ては、
         タブの切り替えや背景の再描画で閉じたときには走らなかった）。 */
    if (b) b.onclick = () => { selected = null; try { HOST.closeReaderPane(); } catch (_) { } };
    /* 詳細を開いたら、その出来事の場所へ寄る（カードのクリックと同じ約束）。 */
    try { if (item.analysis && item.analysis.loc) window.IntMapGeoEngine.camera.flyTo({ center: item.analysis.loc, zoom: 4, speed: 1.0 }); } catch (_) { }
  }

  /* ── Atlas 用の状態（docs/NEWS-EVENTS.md §10）─────────────────────────────
     ⚠ **観測してから名乗る。** 「表示している」は DOM とレンダラに訊いた答えであって、
       この層が「そのつもりだった」ことではない（#R340 の produces-observed）。 */
  /* ⚠⚠ (#R435) 「いま開いている出来事」は **DOM に訊く**。閉じる経路は戻るボタンだけではない
     ——タブの切り替え・背景の再描画・記事 reader を開くこと——ので、この層が覚えている
     publicId は「最後に開いたもの」であって「いま画面に出ているもの」ではない。#R340 の
     produces-observed と同じ規律で、名乗る前に観測する。 */
  function selectedShown() {
    try {
      const p = document.getElementById('news-reader-pane');
      return (p && p.style.display !== 'none' && p.querySelector('.ev-detail')) ? selected : null;
    } catch (_) { return null; }
  }
  function state() {
    const all = (HOST.globalData || []).filter((x) => x && x._event);
    if (!all.length) return null;
    const shown = all.filter(passes);
    let pins = 0;
    try {
      const E = window.IntMapGeoEngine;
      if (E && E.layers.hasSource('news-points')) pins = (HOST.newsFeatures || []).length;
    } catch (_) { }
    const cats = {};
    for (const it of shown) cats[it._event.category] = (cats[it._event.category] || 0) + 1;
    return {
      mode: 'events',
      selectedEventId: selectedShown(),
      selectedCategory: category,
      visibleEventCount: shown.length,
      loadedEventCount: all.length,
      visiblePinCount: pins,
      unplacedCount: shown.filter((x) => !x._event.place).length,
      multiSourceCount: shown.filter((x) => x._event.sourceCount >= 2).length,
      /* (#R405) 出来事が IntMap の中だけで読めるか。⚠ **「読めない」を隠さない**——
         `noTextCount` は上流が本文を配っていない Event の数で、実測 43.5% ある。
         Atlas が「この出来事の中身は？」に答えられるかどうかがここで決まる。 */
      readableCount: shown.filter((x) => x._event.brief && x._event.brief.status === 'ok').length,
      thinCount: shown.filter((x) => x._event.brief && x._event.brief.status === 'thin').length,
      noTextCount: shown.filter((x) => x._event.brief && (x._event.brief.status === 'none' || x._event.brief.status === 'facts')).length,
      categories: cats,
      freshestArticleAt: all.reduce((a, x) => (x._event.lastAt > a ? x._event.lastAt : a), ''),
      loadedAt: lastLoadedAt ? new Date(lastLoadedAt).toISOString() : null,
      savedCount: savedIds.size,
      lastError,
    };
  }

  /* Atlas と本番検証が「いま何が読めるか」を数えるための、DOM に依らない読み口。 */
  function events() { return (HOST.globalData || []).filter((x) => x && x._event).map((x) => x._event); }
  /* 直近の load() が作った項目。⚠ これを HOST.globalData に入れるのは js/news-feed.js である。 */
  function loaded() { return items.slice(); }

  /* ══ (#R416) THE MAP'S WAY BACK TO THE 出来事 ═══════════════════════════════════════════════
     A pin carries `evId` (the event's `public_id`); the detail pane wants the ITEM. Resolving that
     here — rather than handing js/news-ui.js the item list — keeps `items` private and means the
     map never has to know how an event is shaped. Returns false when the id is not in the loaded
     window, so the caller can fall back instead of doing nothing. */
  function openByPublicId(pid) {
    if (!pid) return false;
    const it = items.find((x) => x && x._event && x._event.publicId === pid);
    if (!it) return false;
    openDetail(it);
    return true;
  }

  /* ══ (#R428) THE ONE CONTROL ON THE ROW THAT DID NOT RELABEL ════════════════════════════════
     `js/app-body.js` `setLang()` dispatches `intmap-lang` for「modules that relabel on language
     change」and this module was not listening. The chips' words come from `L(...)` evaluated AT
     RENDER TIME, and the next render waits for the language switch's refetch of `news_events` to
     land — measured on production (2026-08-24): the scope pair flipped to Japanese at once while
     the chips beside them stayed English for **5.9 / 6.3 / 6.7 s** (three runs; the REQ/RESP pair
     is 3.2 s → 4.6 s and `renderChips()` runs after it).
     ⚠ **RELABEL, DO NOT RE-RENDER.** `renderChips()` reads its counts from `HOST.globalData`, which
     the language switch has just emptied — a re-render here would draw 「全カテゴリ 0」 and drop every
     category chip (0 件のカテゴリは出さない), i.e. it would blank the row for those six seconds
     instead of translating it. So the words are replaced in place and the count nodes are kept.
     ⚠ The labels come from `catLabel()` — the same `CATS` table `renderChips()` reads, so the two
     cannot disagree about what a category is called. */
  function relabelChips() {
    const row = document.getElementById('news-cat-chips');
    if (!row || row.style.display === 'none') return;
    for (const b of row.querySelectorAll('.news-cat-chip')) {
      const key = b.dataset.cat || '';
      if (!key) continue;
      const n = b.querySelector('.news-cat-n');
      b.textContent = (key === 'all') ? ALL_TOPICS() : catLabel(key);
      if (n) b.appendChild(n);
    }
  }
  try { window.addEventListener('intmap-lang', relabelChips); } catch (_) { }

  const API = {
    load, loaded, state, events, passes, renderChips, hideChips, decorate, openDetail, openByPublicId,
    toggleStar, isSaved, differences, quantities,
    categories: () => CATS.map(([k, v]) => ({ key: k, label: L.arr(v) })),
    category: () => category,
    setCategory: (c) => { category = c || 'all'; renderChips(); try { HOST.startNews(); } catch (_) { } },
    selected: () => selected,
    error: () => lastError,
  };
  try { window.IntMapNewsEvents = API; } catch (_) { }
  return API;
};

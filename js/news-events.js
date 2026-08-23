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
    ['business', LA('Business', '経済', 'Wirtschaft', 'Экономика', 'Economía')],
    ['technology', LA('Technology', 'テクノロジー', 'Technologie', 'Технологии', 'Tecnología')],
    ['science_health', LA('Science & Health', '科学・医療', 'Wissenschaft & Gesundheit', 'Наука и здоровье', 'Ciencia y salud')],
    ['climate_weather', LA('Climate & Weather', '気候・気象', 'Klima & Wetter', 'Климат и погода', 'Clima y meteorología')],
    ['disasters', LA('Disasters', '災害', 'Katastrophen', 'Катастрофы', 'Desastres')],
    ['society', LA('Society', '社会', 'Gesellschaft', 'Общество', 'Sociedad')],
  ];
  const catLabel = (k) => { const r = CATS.find((c) => c[0] === k); return r ? L.arr(r[1]) : k; };

  /* ── 供給元 ─────────────────────────────────────────────────────────────
     ⚠ Supabase の client は `HOST.DB`。**未ログインでも読める**（RLS は select を
       anon にも許している）——出来事はログインの後ろに隠すものではない。 */
  const EVENT_COLS =
    'id,public_id,representative_title,representative_article_id,primary_category,secondary_categories,' +
    'category_confidence,category_evidence,rep_lng,rep_lat,rep_place_name_en,location_confidence,' +
    'first_published_at,last_article_at,materially_updated_at,article_count,independent_source_count,' +
    'cluster_confidence,manual_lock,status,merged_into';
  const MEMBER_COLS =
    'news_event_articles(relation,assignment_score,assigned_by,' +
    'news_articles(id,title,description,canonical_url,source_id,published_at,subject_name_en,subject_type))';

  const LIMIT = 200;          /* 一覧に載せる Event の上限（記事モードの 150 と同じ桁） */

  let sources = null;          /* id → { name, slug, type, country, hq } */
  let lastLoadedAt = 0;
  let lastError = null;
  let selected = null;         /* 詳細を開いている Event の public_id */
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
  const nowMs = () => { try { return window.IntMapTime.now().getTime(); } catch (_) { return Date.now(); } };
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
     ⚠ **「主張が違う」を推定しない。** 取り出すのは、原文に**そのまま書いてある数量**だけ。
       死者数・負傷者数・金額・割合・期間——同じ種類の数量に 2 つ以上の値があり、それを
       言っているのが**別の媒体系列**のときにだけ「相違」と呼ぶ。
     ⚠ 同じ媒体の続報どうしの食い違い（速報 3 人 → 続報 5 人）は相違ではなく**更新**なので、
       系列が同じ組は落とす。 */
  const NUM_KINDS = [
    ['dead', /\b(?:at least|more than|over|about|around|nearly|up to)?\s*([\d][\d,]*)\s+(?:people\s+)?(?:killed|dead|died|deaths?|fatalities)\b/i,
      LA('killed', '死者', 'Todesopfer', 'погибших', 'muertos')],
    ['injured', /\b(?:at least|more than|over|about|around|nearly|up to)?\s*([\d][\d,]*)\s+(?:people\s+)?(?:injured|wounded|hurt)\b/i,
      LA('injured', '負傷者', 'Verletzte', 'раненых', 'heridos')],
    ['missing', /\b(?:at least|more than|over|about|around|nearly|up to)?\s*([\d][\d,]*)\s+(?:people\s+)?missing\b/i,
      LA('missing', '行方不明', 'Vermisste', 'пропавших', 'desaparecidos')],
    ['money', /([$€£¥])\s?([\d][\d,.]*)\s*(billion|million|trillion|bn\b|tn\b)?/i,
      LA('amount', '金額', 'Betrag', 'сумма', 'importe')],
    ['percent', /\b([\d][\d.]*)\s?(?:%|percent|per cent)\b/i,
      LA('percentage', '割合', 'Prozentsatz', 'процент', 'porcentaje')],
  ];
  const MULT = { billion: 1e9, bn: 1e9, million: 1e6, trillion: 1e12, tn: 1e12 };

  function quantities(text) {
    const out = [];
    const t = String(text || '');
    for (const [kind, re, label] of NUM_KINDS) {
      const m = t.match(re);
      if (!m) continue;
      const raw = (m[1] || '').replace(/,/g, '');
      let v = parseFloat(kind === 'money' ? (m[2] || '').replace(/,/g, '') : raw);
      if (!isFinite(v)) continue;
      if (kind === 'money' && m[3]) v *= (MULT[String(m[3]).toLowerCase().replace(/\b/g, '')] || 1);
      out.push({ kind, label, value: v, text: m[0].trim() });
    }
    return out;
  }

  /* 見出し＋要約から、その Event で媒体間の食い違いになっている数量だけを返す。 */
  function differences(ev) {
    const byKind = new Map();
    for (const m of ev.members) {
      for (const q of quantities((m.title || '') + ' — ' + (m.description || ''))) {
        let g = byKind.get(q.kind);
        if (!g) byKind.set(q.kind, (g = { label: q.label, claims: [] }));
        g.claims.push({ value: q.value, text: q.text, source: m.sourceName, family: m.family, at: m.publishedAt });
      }
    }
    const out = [];
    for (const [kind, g] of byKind) {
      const values = new Set(g.claims.map((c) => c.value));
      if (values.size < 2) continue;
      /* ⚠ 別々の媒体系列が違う値を言っているときだけ。同じ系列の 2 本は「更新」である。 */
      const fams = new Set();
      const byValue = new Map();
      for (const c of g.claims) {
        fams.add(c.family);
        if (!byValue.has(c.value)) byValue.set(c.value, c);
      }
      const famOfValue = new Set([...byValue.values()].map((c) => c.family));
      if (fams.size < 2 || famOfValue.size < 2) continue;
      out.push({ kind, label: g.label, claims: [...byValue.values()].sort((a, b) => a.value - b.value) });
    }
    return out;
  }

  /* ── DB の行 → 一覧の項目 ───────────────────────────────────────────────
     ⚠ 形は article mode の項目と**同じ**にする。`startNews` / `appendNewsBatch` /
       ピン / 無限スクロール / 期間フィルタが、分岐なしでそのまま動くため。
       Event 固有の事実は `_event` にだけ足す（既存のどの読み手も見ない場所）。 */
  function toItem(row, i18n) {
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
    const translated = i18n && i18n.get(row.id);
    const title = (HOST.lang === 'jp' && translated) ? translated : row.representative_title;
    const outlets = [];
    const seenFam = new Set();
    for (const m of members) { if (seenFam.has(m.family)) continue; seenFam.add(m.family); outlets.push(m.sourceName); }

    const subjectLoc = (isFinite(row.rep_lng) && isFinite(row.rep_lat)) ? [row.rep_lng, row.rep_lat] : null;
    const analysis = {
      subjectLoc, subjectName: row.rep_place_name_en || '',
      subjectType: (rep && rep.subject_type) || '',
      pubLoc: null, pubName: null, short: '',
      _title: title, _pub: outlets[0] || '',
    };
    try { HOST.applyPinMode(analysis); } catch (_) { analysis.loc = subjectLoc; analysis.name = row.rep_place_name_en || ''; analysis.mapped = subjectLoc ? true : false; }

    const firstAt = row.first_published_at || (members[0] && members[0].publishedAt) || '';
    const lastAt = row.last_article_at || firstAt;
    return {
      title,
      publisher: outlets.slice(0, 2).join(' · '),
      link: (rep && rep.canonical_url) || (members[0] && members[0].url) || '',
      pubDate: lastAt,
      desc: '',
      analysis,
      /* 検索は代表見出しだけでなく**構成記事の見出しにも当てる**。Event を探す人は
         「自分が読んだ 1 本の見出し」を覚えていることのほうが多い。 */
      _search: (title + ' ' + row.representative_title + ' ' + members.map((m) => m.title).join(' ') + ' ' + outlets.join(' ')).toLowerCase(),
      _event: {
        id: row.id, publicId: row.public_id, title: row.representative_title, titleShown: title,
        translated: !!(translated && HOST.lang === 'jp'),
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

      let i18n = null;
      if (HOST.lang === 'jp') {
        const ids = data.map((e) => e.id);
        const r = await HOST.DB.from('news_event_i18n').select('event_id,title').eq('lang', 'ja').in('event_id', ids);
        if (!r.error) i18n = new Map((r.data || []).map((x) => [x.event_id, x.title]));
      }
      await syncSaved();
      /* ログイン済みなら DB の★を localStorage 側にも映す（端末をまたいで同じ★が出る）。 */
      if (HOST.user) {
        for (const e of data) if (dbSaved.has(e.id)) savedIds.add(e.public_id);
        saveLocal([...savedIds]);
      }
      HOST.globalData = data.map((row) => toItem(row, i18n));
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
     docs/NEWS-EVENTS.md §9: `All/Saved | Subject/Publisher` の**下に横スクロールの 1 行**。
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
    let html = mk('all', L('All', 'すべて', 'Alle', 'Все', 'Todas'),
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
      ? '<span class="ev-badge upd">' + S(L('Updated', '続報', 'Aktualisiert', 'Обновлено', 'Actualizado')) + '</span>'
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

    /* 翻訳された見出しには、原文が英語であることを添える（記事モードの
       `newsTitleHTML` が「(原文: …)」でやっているのと同じ約束）。 */
    if (ev.translated) {
      const t = card.querySelector('.news-title');
      if (t) t.insertAdjacentHTML('beforeend',
        '<div class="news-origlang">' + S(L('(translated from English)', '（英語から翻訳）', '(aus dem Englischen)', '(перевод с английского)', '(traducido del inglés)')) + '</div>');
    }
  }

  /* ── 詳細 ───────────────────────────────────────────────────────────────
     既存の `#news-reader-pane` に描く（記事の reader と同じ面）。
     ⚠ 「独立画面」を作らない。戻る動作も reader と同じものを使う。 */
  function openDetail(item) {
    const ev = item && item._event;
    if (!ev) return;
    selected = ev.publicId;
    const pane = document.getElementById('news-reader-pane');
    const feed = document.getElementById('live-news-feed');
    if (!pane || !feed) return;

    const back = L('Back', '戻る', 'Zurück', 'Назад', 'Atrás');
    const rows = ev.members.slice().sort((a, b) => Date.parse(a.publishedAt || 0) - Date.parse(b.publishedAt || 0));
    const firstFam = rows.length ? rows[0].family : null;

    const fmt = (iso) => { try { return new Date(iso).toLocaleString(window.IntMapLang.locale(HOST.lang), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (_) { return iso || ''; } };

    let html = '<div class="reader-bar"><button class="btn-back" id="ev-back">‹ ' + S(back) + '</button></div>';
    html += '<div class="ev-detail">';
    html += '<div class="ev-d-head">';
    if (ev.place) html += '<span class="loc-chip">' + S(ev.place) + '</span>';
    html += '<span class="ev-cat">' + S(catLabel(ev.category)) + '</span>';
    html += '</div>';
    html += '<h2 class="ev-d-title">' + S(ev.titleShown) + '</h2>';
    if (ev.translated) html += '<div class="news-origlang">' + S(ev.title) + '</div>';

    /* ── 時刻 ── 初出と最新。「いつから続いているか」は出来事の基本的な事実である。 */
    html += '<div class="ev-d-meta">' +
      '<span>' + S(L('First reported', '初出', 'Zuerst gemeldet', 'Первое сообщение', 'Primer informe')) + ': ' + S(fmt(ev.firstAt)) + '</span>' +
      '<span>' + S(L('Latest', '最新', 'Neueste', 'Последнее', 'Más reciente')) + ': ' + S(fmt(ev.lastAt)) + ' · ' + S(ago(ev.lastAt)) + '</span>' +
      '<span>' + S(String(L('{a} articles · {b} independent outlets', '記事{a}本・独立{b}媒体', '{a} Artikel · {b} unabhängige Quellen', '{a} статей · {b} независимых источников', '{a} artículos · {b} medios independientes')).replace('{a}', ev.articleCount).replace('{b}', ev.sourceCount)) + '</span>' +
      '</div>';

    /* ── 媒体ごとの相違（数量）── */
    const diffs = differences(ev);
    if (diffs.length) {
      html += '<div class="ev-d-sec ev-diff"><h3>' +
        S(L('Where outlets differ', '媒体間で食い違っている点', 'Wo sich Quellen unterscheiden', 'В чём источники расходятся', 'En qué difieren los medios')) + '</h3>';
      html += '<p class="ev-d-note">' + S(L('IntMap does not judge which is right. These are the figures each outlet actually printed.', 'IntMap はどちらが正しいかを判定しない。各媒体が実際に書いた数量をそのまま並べている。', 'IntMap urteilt nicht, was richtig ist. Dies sind die Zahlen, die jede Quelle tatsächlich gedruckt hat.', 'IntMap не решает, кто прав. Это цифры, которые каждый источник действительно напечатал.', 'IntMap no juzga cuál es correcto. Estas son las cifras que cada medio publicó realmente.')) + '</p>';
      for (const d of diffs) {
        html += '<div class="ev-diff-row"><span class="ev-diff-k">' + S(L.arr(d.label)) + '</span><div class="ev-diff-v">';
        for (const c of d.claims) {
          html += '<div><b>' + S(c.text) + '</b> <span class="ev-diff-src">— ' + S(c.source) + '</span></div>';
        }
        html += '</div></div>';
      }
      html += '</div>';
    }

    /* ── どこが報じたか ── 初報に印を付ける。転載は独立の声として数えない。 */
    html += '<div class="ev-d-sec"><h3>' +
      S(L('Coverage', '報じた媒体', 'Berichterstattung', 'Освещение', 'Cobertura')) + '</h3>';
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
    feed.style.display = 'none';
    pane.style.display = '';
    const b = document.getElementById('ev-back');
    if (b) b.onclick = () => { selected = null; pane.style.display = 'none'; pane.innerHTML = ''; feed.style.display = ''; };
    /* 詳細を開いたら、その出来事の場所へ寄る（カードのクリックと同じ約束）。 */
    try { if (item.analysis && item.analysis.loc) window.IntMapGeoEngine.camera.flyTo({ center: item.analysis.loc, zoom: 4, speed: 1.0 }); } catch (_) { }
  }

  /* ── Atlas 用の状態（docs/NEWS-EVENTS.md §10）─────────────────────────────
     ⚠ **観測してから名乗る。** 「表示している」は DOM とレンダラに訊いた答えであって、
       この層が「そのつもりだった」ことではない（#R340 の produces-observed）。 */
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
      selectedEventId: selected,
      selectedCategory: category,
      visibleEventCount: shown.length,
      loadedEventCount: all.length,
      visiblePinCount: pins,
      unplacedCount: shown.filter((x) => !x._event.place).length,
      multiSourceCount: shown.filter((x) => x._event.sourceCount >= 2).length,
      categories: cats,
      freshestArticleAt: all.reduce((a, x) => (x._event.lastAt > a ? x._event.lastAt : a), ''),
      loadedAt: lastLoadedAt ? new Date(lastLoadedAt).toISOString() : null,
      savedCount: savedIds.size,
      lastError,
    };
  }

  /* Atlas と本番検証が「いま何が読めるか」を数えるための、DOM に依らない読み口。 */
  function events() { return (HOST.globalData || []).filter((x) => x && x._event).map((x) => x._event); }

  const API = {
    load, state, events, passes, renderChips, hideChips, decorate, openDetail,
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

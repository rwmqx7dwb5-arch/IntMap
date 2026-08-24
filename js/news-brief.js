/* ============================================================================
 *  IntMap · 出来事の「読める中身」を組み立てる規則  (#R405)
 * ----------------------------------------------------------------------------
 *  #R386 が Event 単位のニュースを出荷したとき、カードの `desc` は `''` に固定され、
 *  詳細も媒体別の見出しとメタ情報しか出さなかった。⇒ **外部記事を開かない限り、
 *  IntMap の中では何が起きたのか分からない。** 地図付きのニュース索引であって、
 *  「出来事を理解する」ための道具ではなかった。
 *
 *  ⚠⚠⚠ **証拠は最初から手元にあった。** `js/news-events.js` は構成記事を
 *    `news_articles(id,title,description,…)` で取ってきており、`description` は
 *    `members[].description` に載っている。読者は 1 人だけ——数量の食い違いを探す
 *    `differences()` で、本番 1,069 Event 中 **2 件**しか発火しない。
 *    **51% の記事が持っている本文が、画面に 1 文字も出ていなかった。**
 *
 *  ══ 規則は発明ではなく実測から決めた（本番 758 本の description・2026-08-24） ══
 *
 *  | 測ったもの | 実測 | ここでの扱い |
 *  |---|---|---|
 *  | 末尾 `Continue reading...` | **109 本** | 落とす（`TAIL`） |
 *  | 末尾が `...` で切れている | **89 本** | 最後の不完全な文を落とす |
 *  | 先頭のデートライン `SEOUL, Aug. 24 (Yonhap) -- ` | **85 本** | 剥がす（`DATELINE`） |
 *  | 1 記事から取れる**文の数** | **中央値 1**（p75=2・最大 8） | ⇒ 2〜4 文は**複数の記事から**組む |
 *  | 文の長さ | 中央値 118 字（p10=56・p90=246） | `minSentence` 40・`maxSentence` 320 |
 *  | 見出しの語が第 1 文に出る割合 | 中央値 0.25 | ⇒ 重なりで**主題判定をしない**（低すぎる） |
 *
 *  ⚠⚠⚠ **「1 記事あたり中央値 1 文」がこの設計の中心にある事実である。**
 *    単独記事の Event（実測 88%）から「2〜4 文」は**取れない**——無いものを埋めるには
 *    書くしかなく、それは根拠のない AI 要約（`docs/NEWS-EVENTS.md` §15 が禁じている）
 *    になる。⇒ **取れるだけ出し、足りないことを言う。** `status` がそれを持つ。
 *
 *  ⚠⚠⚠ **1 系列 1 文。** 同じ通信社の速報 3 本を 3 文並べると、読者は「3 媒体が
 *    報じた」と読む。`family`（資本系列）ごとに 1 文だけ採り、単独系列のときに限って
 *    同じ記事から 2 文目を採る（`perFamilySolo`）。
 *
 *  ⚠ **推定しない・言い換えない・順位を付けない。** ここが出すのは原文の断片と、
 *    それを言った媒体だけである。どちらが正しいかは IntMap は言わない（§9.1 / §15）。
 *
 *  ⚠ **表示の層に置かない**（#R386 が踏んだ形・#R340 と同じ）。規則をここに出したので、
 *    `scripts/news-events-eval.mjs --brief` が**ブラウザの外から本番のデータで**
 *    歩留まりを測れる。9 言語のラベルと DOM は `js/news-events.js` に残る。
 * ==========================================================================*/

/**
 * @param {object} claims `makeNewsClaims()` の実体。**数量の規則を 2 本持たない**ため
 *                        呼び出し側から注入する（`js/news-claims.js` が正本）。
 */
export function makeNewsBrief(claims) {
  const DEFAULTS = {
    /* 実測 p10=56 字。40 未満は「Read more」の残骸や見出しの断片であって文ではない。 */
    minSentence: 40,
    /* 実測 p90=246 字。320 を超える塊は Guardian の standfirst＋本文が句点無しで
       つながったもので、そのまま出すと 1 文が段落になる。⇒ 切らずに**落とす**
       ——途中で切ると「原文のまま」でなくなる。 */
    maxSentence: 320,
    gistMax: 4,
    perFamily: 1,
    perFamilySolo: 2,
    /* 「最新で何が更新されたか」を初報とみなす窓。これより後の記事だけが「更新」。 */
    updateGapMs: 60 * 60 * 1000,
  };

  /* ── 末尾の定型（実測 109＋89 本）─────────────────────────────────────────
     ⚠ 「`...` で終わるものを全部落とす」にしてはならない——省略記号は文中にも出る。
       落とすのは**末尾の**定型と、末尾の**不完全な**文だけ。 */
  const TAIL = /\s*(?:Continue reading[\s\S]*|Read more(?:\s+at|\s+here)?[\s\S]*|The post\b[\s\S]*appeared first[\s\S]*|View (?:Entire|Full) Post\s*›?[\s\S]*)$/i;
  /* ── 先頭のデートライン（実測 85 本・Yonhap / AFP 型）───────────────────── */
  const DATELINE = /^([A-Z][A-Za-z.'’\- ]{1,28}(?:\/[A-Z][A-Za-z.'’\- ]{1,28})*),?\s+(?:[A-Z][a-z]{2}\.?\s+\d{1,2},?\s*)?\(([^)]{2,30})\)\s*(?:--|—|–|-)\s*/;
  /* 配信の宣伝・購読の勧誘。⚠ 見出しではなく**本文**に混ざるもの。 */
  const PROMO = /\b(?:subscribe|newsletter|sign up for|follow us on|download the app|click here|photo(?:graph)? by|getty images|all rights reserved|this article (?:was|is) )\b/i;

  /* ⚠ **不可視文字を先に落とす。** 実測: The Guardian の description には U+2060
     (WORD JOINER) が語の内側に入っている。«The bill would ⁠require …» ——目には
     見えないが、これがあると重複判定の鍵がずれ、**同じ通信社原稿が 2 媒体の別々の
     文として並ぶ**（下の `dedupeKey` の ⚠ 箱）。
     ⚠ **綴りは `\u` の逃がし字で書く。** 生の不可視文字を正規表現に貼ると、目でも
       diff でも確かめられないものが規則になる——#R394 の `\b` がバックスペース 1 個に
       潰れて門が一度も発火しなかったのと同じ形で、`scripts/static-checks.mjs` の
       `regex-control-char` がそれを落とす。 */
  const INVISIBLE = /[\u00AD\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\uFEFF]/g;
  const squeeze = (s) => String(s || '').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();

  /* ══ ⚠⚠⚠ 同じ配信原稿を「2 媒体が報じた」に見せてはならない ══════════════════
     実測 (2026-08-24・«New Zealand to introduce bill banning social media for
     children under 16»): The Guardian と The Japan Times が同じ配信を載せており、
     違いは `utilising`/`utilizing` の英米綴りと Guardian 側の U+2060 だけだった。
     並べると読者は「独立した 2 媒体が同じ内容を確認した」と読む。それは嘘である。

     ⚠⚠⚠ **語の重なり（containment）は、この判定に使えない。** 別々の系列どうしの
       文 **526 組**を測った分布と、上位の中身（同日実測）:

       | c | 組 | 中身 |
       |---|---|---|
       | ≥0.9 | **1** | Guardian / Japan Times ＝**本物の重複** |
       | 0.8–0.9 | 3 | NPR「米が 50% の関税」/ France 24「カナダが報復関税」＝**別の事実**。短い文が長い文に含まれるだけ |
       | 0.7–0.8 | 6 | ギニアの地滑り: Sky「死者 30」/ Al Jazeera「大雨で崩落」/ Guardian「移設を約束した直後」＝**3 つとも要る** |
       | 0.4–0.7 | 154 | ほぼ全部が独立した報道 |

       ⇒ **閾値を下げると価値のある独立報道が消える。** 0.8 の帯を落とす規則は、
         カナダの関税から「誰が誰に課したか」を消す。⇒ **狭く取る。**

     ⇒ 重複と呼ぶのは ①畳んだ文字列が完全一致するか、②**c ≥ 0.9 かつ長さの比 ≥ 0.6**
       のときだけ。長さの比を併せて要求するのは、上の 0.8 帯の誤りが全部「短い文 ⊂
       長い文」の形だからである（NPR 79 字 / France 24 133 字 = 0.59）。
     ⚠ **母数は薄い（526 組中 1 組が発火）。** それでも規則を置くのは、外したときの
       被害が「独立した裏付けの捏造」＝この機能が犯しうる最も重い誤りだからである。
     ⚠ 落とすのは 2 文目以降だけで、媒体は Coverage 節に両方とも残る。 */
  const dupeSameWire = 0.9;
  const dupeLenRatio = 0.6;
  const dedupeKey = (s) => squeeze(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const wordsOf = (s) => new Set(squeeze(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1));
  function sameWire(a, b) {
    const ka = dedupeKey(a); const kb = dedupeKey(b);
    if (!ka || !kb) return false;
    if (ka === kb) return true;
    const la = ka.length; const lb = kb.length;
    if (Math.min(la, lb) / Math.max(la, lb) < dupeLenRatio) return false;
    const A = wordsOf(a); const B = wordsOf(b);
    if (!A.size || !B.size) return false;
    let n = 0; for (const w of A) if (B.has(w)) n++;
    return n / Math.min(A.size, B.size) >= dupeSameWire;
  }

  /** RSS の description から、原文の文だけを残す。 */
  function clean(text) {
    let t = squeeze(text);
    if (!t) return '';
    t = t.replace(DATELINE, '');
    t = t.replace(TAIL, '');
    return t.trim();
  }

  /* 文の切れ目。終止符のあとに引用符・括弧が来てもよい。
     ⚠ 略語（`U.S.` `Mr.` `Aug.`）で切らないよう、直前が 1 文字か既知の略語なら繋ぐ。 */
  const ABBR = /\b(?:[A-Z]|Mr|Mrs|Ms|Dr|Prof|Sen|Rep|Gov|Gen|Lt|Col|St|Jr|Sr|vs|etc|Inc|Ltd|Co|Corp|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec|U\.S|U\.K|U\.N|E\.U)\.$/;

  /** 原文を文へ割る。**切り詰めない**——長すぎる塊は落とす（上の ⚠）。 */
  function sentences(text, opt) {
    const o = { ...DEFAULTS, ...(opt || {}) };
    const t = clean(text);
    if (!t) return [];
    const parts = [];
    let buf = '';
    for (const piece of t.split(/(?<=[.!?])["'’”)\]]?\s+/)) {
      buf = buf ? buf + ' ' + piece : piece;
      if (ABBR.test(buf.trim())) continue;      /* 略語なので文はまだ終わっていない */
      parts.push(buf.trim());
      buf = '';
    }
    if (buf.trim()) parts.push(buf.trim());
    const out = [];
    for (let i = 0; i < parts.length; i++) {
      const s = parts[i];
      /* 末尾が終止符でない最後の断片は、切れている（実測 89 本の `...`）。 */
      const complete = /[.!?]["'’”)\]]?$/.test(s);
      if (i === parts.length - 1 && !complete) continue;
      if (s.length < o.minSentence || s.length > o.maxSentence) continue;
      if (PROMO.test(s)) continue;
      out.push(s);
    }
    return out;
  }

  /* ── ① 何が起きたか ───────────────────────────────────────────────────────
     並べる順は**時系列**（初報が先）。⚠ 「重要そうな順」に並べ替えない——順位付けは
     IntMap がしてよい判断ではないし、実測で見出しとの語の重なりは中央値 0.25 しか
     無いので、重なりを主題の代理にすると誤る。 */
  function gist(members, opt) {
    const o = { ...DEFAULTS, ...(opt || {}) };
    const ordered = order(members);
    const families = new Set(ordered.map((m) => m.family || m.sourceId));
    const solo = families.size <= 1;
    const cap = solo ? o.perFamilySolo : o.perFamily;
    const used = new Map();
    const out = [];
    const seen = [];
    let dropped = 0;
    for (const m of ordered) {
      if (out.length >= o.gistMax) break;
      const fam = m.family || m.sourceId;
      const have = used.get(fam) || 0;
      if (have >= cap) continue;
      let taken = 0;
      for (const s of sentences(m.description, o)) {
        if (out.length >= o.gistMax || have + taken >= cap) break;
        /* 同じ配信原稿を 2 媒体ぶん並べない（上の ⚠ 箱）。落ちた本数は `syndicated`
           に数える——効いているのか効きすぎているのかを、次のラウンドが見られるように。 */
        if (seen.some((prev) => sameWire(prev, s))) { dropped++; continue; }
        seen.push(s);
        out.push({ text: s, source: m.sourceName, sourceId: m.sourceId, family: fam, articleId: m.id, url: m.url, at: m.publishedAt });
        taken++;
      }
      if (taken) used.set(fam, have + taken);
    }
    out.syndicated = dropped;
    return out;
  }

  /* ── ③ 主要な数字 ─────────────────────────────────────────────────────────
     ⚠⚠ **`differences()` は「食い違った数量」しか返さない**（本番 1,069 Event 中 2 件）。
       抽出そのものは 108 件・66 Event で当たっているので、**食い違っていない数字も
       出す**。ここが #R386 の一番大きい取りこぼしである。 */
  function figures(members, opt) {
    const o = { ...DEFAULTS, ...(opt || {}) };
    const out = [];
    const seen = new Set();
    for (const m of order(members)) {
      const text = squeeze(m.title) + ' — ' + clean(m.description);
      for (const qy of claims.quantities(text, o)) {
        const key = qy.kind + ':' + qy.value;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...qy, source: m.sourceName, sourceId: m.sourceId, family: m.family || m.sourceId, at: m.publishedAt });
      }
    }
    return out;
  }

  /* ── ⑤ 一致している点 ─────────────────────────────────────────────────────
     ⚠ 一致と呼ぶのは、**別々の系列**が**同じ種類の同じ値**を言ったときだけ。
       同じ系列の転載が同じ数字を持っていても、それは 1 つの主張である。 */
  function agreements(members, opt) {
    const o = { ...DEFAULTS, ...(opt || {}) };
    const byKey = new Map();
    for (const m of members || []) {
      const text = squeeze(m.title) + ' — ' + clean(m.description);
      for (const qy of claims.quantities(text, o)) {
        const key = qy.kind + ':' + qy.value;
        let g = byKey.get(key);
        if (!g) byKey.set(key, (g = { kind: qy.kind, value: qy.value, text: qy.text, context: qy.context, families: new Map() }));
        if (!g.families.has(m.family || m.sourceId)) g.families.set(m.family || m.sourceId, m.sourceName);
      }
    }
    const out = [];
    for (const g of byKey.values()) {
      if (g.families.size < 2) continue;
      out.push({ kind: g.kind, value: g.value, text: g.text, context: g.context, sources: [...g.families.values()] });
    }
    return out;
  }

  /* ── ④ 最新の記事で何が更新されたか ───────────────────────────────────────
     ⚠⚠ **「最後に届いた記事」は「更新」ではない。** 同じ分に配信された転載が最後に
       来ることのほうが多い。初報から `updateGapMs` 以上あとに出た記事だけを見て、
       **そこで初めて出た数量**と**そこで初めて報じた系列**を出す。何も新しくなければ
       `null` を返す——「更新がある」と嘘をつくより、欄ごと出さないほうがよい。 */
  function latest(members, opt) {
    const o = { ...DEFAULTS, ...(opt || {}) };
    const ordered = order(members);
    if (ordered.length < 2) return null;
    const first = tsOf(ordered[0]);
    const last = ordered[ordered.length - 1];
    const lastTs = tsOf(last);
    if (!(lastTs - first >= o.updateGapMs)) return null;

    const earlierText = ordered.slice(0, -1).map((m) => squeeze(m.title) + ' — ' + clean(m.description)).join(' \n ');
    const before = new Set(claims.quantities(earlierText, o).map((q) => q.kind + ':' + q.value));
    const lastText = squeeze(last.title) + ' — ' + clean(last.description);
    const added = claims.quantities(lastText, o).filter((q) => !before.has(q.kind + ':' + q.value));

    const seenFam = new Set(ordered.slice(0, -1).map((m) => m.family || m.sourceId));
    const newFamily = !seenFam.has(last.family || last.sourceId);
    const lines = sentences(last.description, o);
    if (!added.length && !newFamily && !lines.length) return null;
    return {
      source: last.sourceName, sourceId: last.sourceId, family: last.family || last.sourceId,
      at: last.publishedAt, url: last.url, title: squeeze(last.title),
      newFamily, figures: added, text: lines[0] || '',
      sinceMs: lastTs - first,
    };
  }

  function tsOf(m) { const t = Date.parse((m && m.publishedAt) || ''); return Number.isFinite(t) ? t : 0; }
  function order(members) {
    return (members || []).filter(Boolean).slice().sort((a, b) => tsOf(a) - tsOf(b));
  }

  /* ── まとめ ───────────────────────────────────────────────────────────────
     `status`:
       `ok`    … 2 文以上を原文から取れた
       `thin`  … 1 文しか取れなかった（本文はあるが薄い）
       `facts` … 文は 1 つも取れないが、**見出しから数量は読める**
       `none`  … 何も読めない
     ⚠⚠⚠ **`facts` を作った理由（実測で見つけた不整合）。** «Vietnam approves additional
       $3 billion spending for China rail link» は Reuters と Bloomberg の 2 本で構成され、
       どちらも description が空（Google 経由）なので文は 0。しかし **`$3 billion` は
       見出しに書いてあり、2 系列が同じ値を言っている**。ここで一律に `none` を返すと、
       UI は「この出来事について手元にあるのは見出しだけです」と言った**すぐ下に金額と
       一致の欄を出す**——自分の言ったことと画面が食い違う。⇒ 文の有無と、読めるものが
       有るかどうかを分ける。
     ⚠ `none` を「読み込み失敗」と読ませない。`reason` が**なぜ手元に無いのか**を持つ。 */
  function build(members, opt) {
    const o = { ...DEFAULTS, ...(opt || {}) };
    const list = order(members);
    const withText = list.filter((m) => sentences(m.description, o).length > 0);
    const g = gist(list, o);
    const fam = new Set(list.map((m) => m.family || m.sourceId));
    const figs = figures(list, o);
    const agrs = agreements(list, o);
    const diffs = claims.differences(list.map((m) => ({
      title: m.title, description: clean(m.description), source: m.sourceName, family: m.family || m.sourceId,
    })), o);
    const status = g.length >= 2 ? 'ok'
      : g.length === 1 ? 'thin'
        : (figs.length || agrs.length || diffs.length) ? 'facts' : 'none';
    const anyRaw = list.some((m) => squeeze(m.description).length > 0);
    return {
      status,
      /* `no_text` … 上流が本文を配っていない ／ `unusable_text` … 在るが文にならなかった */
      reason: (status === 'none' || status === 'facts') ? (anyRaw ? 'unusable_text' : 'no_text') : '',
      gist: g,
      /* 同一配信として落とした文の本数（`gist` は配列なので、数は別の欄で持ち出す
         ——配列に生やした属性は JSON を通ると消える）。 */
      syndicated: g.syndicated || 0,
      figures: figs,
      agreements: agrs,
      differences: diffs,
      latest: latest(list, o),
      coverage: {
        articles: list.length,
        families: fam.size,
        withText: withText.length,
        withoutText: list.length - withText.length,
        outlets: [...new Set(list.map((m) => m.sourceName))],
      },
    };
  }

  return { DEFAULTS, TAIL, DATELINE, clean, sentences, gist, figures, agreements, latest, build };
}

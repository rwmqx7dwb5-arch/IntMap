/* ============================================================================
 *  news-cluster.js — 同じ出来事を言っている記事を見つける (#R334)
 * ----------------------------------------------------------------------------
 *  ⚠ これはサーバー専用である。ブラウザのバンドルに入れてはならない
 *    (docs/NEWS-EVENTS.md §17 / 指示 §17「clustering をブラウザの起動経路へ置かない」)。
 *    だから js/ ではなく supabase/functions/_shared/ に置いてある。クライアントは
 *    結果 (news_events) を読むだけで、判定は一度もしない。
 *
 *  ⚠ ここに書いてある閾値は、実データで測った結果である。推測ではない。
 *    本番 current_news の 1,651 行 (2026-08-23・72時間) に対する ablation:
 *
 *      #R76 の実定数 (150km / 48h / J>=0.15 / 密ペアは 0.06 へ緩和)  → 最大クラスタ 43 件。破綻。
 *      緩和規則だけ除去                                              → 最大 10 件。まだ過統合。
 *      stopwords + J>=0.25〜0.35                                     → 最大 9 件。妥当。
 *      J>=0.45                                                       → 最大 7 件。過小統合。
 *
 *  ⚠⚠⚠ #R76 が壊れた理由を、同じ形で繰り返さないこと。
 *    IntMapNewsGeo が国レベルに解決した subject は座標が「完全に一致」する。#R76 は
 *    `d < 30km && dh <= 24h` のとき見出しの閾値を 0.06 まで落としていたので、
 *    国が同じ 2 記事は常にこの緩和に入り、CJK バイグラム 1 個の一致で融合していた。
 *    ⇒ **距離ゼロは「同じ場所」の証拠ではない。国の代表点であるという証拠でしかない。**
 *    このファイルでは country レベルの一致に対して、閾値を下げるのではなく **上げて** いる。
 * ========================================================================== */

/* ── カテゴリの正本 ─────────────────────────────────────────────────────────
 * ⚠ この配列が唯一の一覧である。migration の check 制約はこれと一致していなければならず、
 *   tests/r334-checks.test.mjs #1 が両者を突き合わせる（人が覚えていなければならない一覧は、
 *   いつか間違っている一覧になる）。
 * ⚠ 6 つは媒体のセクション別フィードがそのまま与える (news_source_feeds.category)。
 *   分類器が要るのは disasters と society だけ。 */
export const CATEGORIES = [
  'world', 'politics', 'business', 'technology',
  'science_health', 'climate_weather', 'disasters', 'society',
];

/* ── 既定値 ────────────────────────────────────────────────────────────────
 * geo クラスごとに見出しの閾値を変える。country-* が near より **高い** のが要点。 */
export const DEFAULTS = {
  timeWindowH: 48,
  nearKm: 150,
  tightKm: 25,
  /* jaccard の閾値。
   * ⚠ この数字は掃引して選んだ。英語・地点ありの実データ 857 件に対して倍率を振り、
   *   n>=5 のクラスタを全部読んで「1 つの出来事か」を判定した結果:
   *     ×1.00 → 629 events (1.36倍)・最大 9・取りこぼしが多い
   *     ×0.80 → 554 events (1.55倍)・最大 9・**n>=5 の 22 クラスタすべてが単一の出来事** ← これ
   *     ×0.70 → 505 events (1.70倍)・最大 10・**ウクライナ軍のロシア攻撃と、ロシア軍の
   *              ショッピングモール攻撃が 1 件に融合した**（両方に触れた 1 本が橋になった）
   *     ×0.50 → 374 events (2.29倍)・最大 14・融合が増える
   * ⚠ ラベル付き fixture 上の精度は ×0.5 まで 100% のままだった。負例が 5 件しかないので
   *   **fixture の精度は精度の測定になっていない**。だから実データを読んで決めた。 */
  thr: {
    tight: 0.19,        /* 精密な地点どうしが 25km 以内 */
    near: 0.24,         /* 精密な地点どうしが 150km 以内 */
    countrySame: 0.27,  /* ⚠ near より **高い**。#R76 はここを 0.06 に落として壊れた */
    countryNear: 0.27,
    unknown: 0.32,      /* どちらかが地点不明 */
    far: 0.37,          /* 地理が食い違う。強い見出し一致だけが根拠 */
  },
  /* 長さの違う見出しを Jaccard が不当に罰するので、包含率でも拾う。
   * 実測: TikTok の $400M 和解は ByteDance 本社と米国の代表点に分かれ、距離は約 10,000km。
   * Jaccard は 0.38 だったが包含率は 0.56 で、共有した語は tiktok/settlement/privacy/children/400。 */
  containment: {
    tight: 0.40, near: 0.44, countrySame: 0.50, countryNear: 0.50, unknown: 0.53, far: 0.44,
  },
  minOverlap: { tight: 2, near: 2, countrySame: 3, countryNear: 3, unknown: 3, far: 3 },
  /* IDF 重み付きの重なり率。窓の IDF が与えられたときだけ効く（第3の入口）。
   * ⚠ これは閾値を下げる緩和ではない。「珍しい語を共有しているか」という**別の質問**である。
   *   #R76 の 0.06 は同じ質問の答えを甘くしたので壊れた。 */
  weighted: {
    tight: 0.37, near: 0.40, countrySame: 0.45, countryNear: 0.45, unknown: 0.50, far: 0.48,
  },
  /* 珍しさの絶対量。頻出語だけで上の率を満たしても結ばない。 */
  minInterWeight: { tight: 3.2, near: 4.0, countrySame: 4.8, countryNear: 4.8, unknown: 5.6, far: 5.6 },
  /* 塊どうしを結ぶとき、対の何割が「同じ」と言えば結んでよいか。
   * ⚠ A-B と B-C が近くても A-C が別事件のことがある。#R76 は素の Union-Find で推移を
   *   無条件に信じたので、43 件の塊ができた。 */
  transitivity: 0.34,
};

/* ── 見出しのトークン化 ─────────────────────────────────────────────────────
 * ⚠ stopwords が要る。#R76 は 3 文字以上の語を全部入れていたので、"the"/"with"/"after" の
 *   一致だけで Jaccard が積み上がった。
 * ⚠ CJK は文字バイグラム。現在の収集は英語のみだが、過去データと将来の言語のために残す。 */
const STOP = new Set((
  'the and for with from that this you are was were has have had his her its not but who what how why ' +
  'says said say will can may new more than over under after before about into out top best worst here ' +
  'now day days year years week weeks month months their them they our your all one two three four five ' +
  'its it is as at by on in of to be been being do does did get got make made take took come came go ' +
  'goes went see saw look looks first last next big small long short high low old young man men woman ' +
  'women people world year via amid says report reports amid could would should might must also just ' +
  'still even back down off out up per via'
).split(/\s+/));

/** 見出しを正規化する（比較のためだけ。表示には使わない）。 */
export function normaliseTitle(title) {
  let s = String(title || '');
  /* Google News は "Headline - Publisher" を返す。媒体名は比較に入れない
   * （同じ媒体の無関係な 2 本が媒体名だけで似てしまう）。 */
  s = s.replace(/\s+[-–—|]\s+[^-–—|]{2,40}$/u, '');
  return s
    .replace(/[‘’ʼ']/g, '')     /* アポストロフィを落とす: Trump's → Trumps */
    .replace(/[“”"]/g, ' ')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

/* 語尾だけ落とす保守的な語幹化。
 * ⚠ 実測でこれが要る理由: 「Evergrande founder **sentenced** to life」と
 *   「Chinese court **sentences** founder of Evergrande」は同じ出来事なのに、
 *   語尾が違うだけで一致しなかった。Porter のような本格的な stemmer は入れない
 *   ——落とす語尾を 4 つに限れば、何が起きているかを読んで確かめられる。 */
function stem(w) {
  if (w.length > 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 6 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 5 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

/** 比較用のトークン集合。ラテンは語幹、CJK/ハングルは文字バイグラム。 */
export function tokenise(text) {
  const s = normaliseTitle(text);
  const out = [];
  const words = s.match(/[\p{L}\p{N}][\p{L}\p{N}.]{1,}/gu) || [];
  for (const w0 of words) {
    const w = w0.replace(/\.+$/, '');
    if (w.length < 3) continue;
    if (STOP.has(w)) continue;
    /* 数値は桁を落として揃える: $400m / $400 million / us$400 → 400 */
    if (/^\d[\d.,]*$/.test(w)) { out.push(w.replace(/[.,]/g, '')); continue; }
    const st = stem(w);
    if (!STOP.has(st)) out.push(st);
  }
  const cjk = s.match(/[一-鿿぀-ヿ가-힯]{2,}/g) || [];
  for (const seq of cjk) for (let i = 0; i + 1 < seq.length; i++) out.push(seq.slice(i, i + 2));
  return new Set(out);
}

/* ── IDF — 珍しい語だけが出来事を名指す ────────────────────────────────────
 * ⚠ 素の Jaccard は「その語がどれくらい珍しいか」を見ないので、同じ出来事の言い換えを
 *   取り逃がす。実測（tests/fixtures/r334-news-events.json）:
 *     「Explosions rock Kyiv as Russia launches ballistic missiles」と
 *     「Russian Missiles Kill at Least 15 in Kyiv」は同じ攻撃の報道だが Jaccard 0.118。
 *   一方 `kyiv` と `missile` は 48 時間の窓の中で数本にしか出ない。**珍しさを重みにすると
 *   この 2 本は結び付き、`united`/`state`/`trump` のような頻出語では結び付かない。**
 * ⚠ 窓の中で数える。固定の辞書にしない——ニュースの珍しさは日ごとに変わる。 */
export function buildIdf(articles) {
  const df = new Map();
  for (const a of articles) {
    const tk = a._tk || (a._tk = tokenise(a.title));
    for (const t of tk) df.set(t, (df.get(t) || 0) + 1);
  }
  const n = Math.max(1, articles.length);
  const idf = new Map();
  for (const [t, d] of df) idf.set(t, Math.log((n + 1) / (d + 0.5)));
  return { idf, n, fallback: Math.log((n + 1) / 0.5) };
}

const wOf = (t, I) => (I ? (I.idf.get(t) ?? I.fallback) : 1);

/** IDF 重み付きの重なり率（重み版の containment）。 */
export function weightedOverlap(a, b, I) {
  let inter = 0, sa = 0, sb = 0;
  for (const t of a) { const w = wOf(t, I); sa += w; if (b.has(t)) inter += w; }
  for (const t of b) sb += wOf(t, I);
  const min = Math.min(sa, sb);
  return { weighted: min ? inter / min : 0, interWeight: inter };
}

export function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const u = a.size + b.size - inter;
  return u ? inter / u : 0;
}

/** 重なり数 / 小さい方の大きさ。見出しの長さ差に強い。 */
export function containment(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const m = Math.min(a.size, b.size);
  return { overlap: inter, containment: m ? inter / m : 0 };
}

export function haversineKm(aLng, aLat, bLng, bLat) {
  const R = 6371, d = (x) => (x * Math.PI) / 180;
  const dLa = d(bLat - aLat), dLo = d(bLng - aLng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(d(aLat)) * Math.cos(d(bLat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ── URL の正規化 ───────────────────────────────────────────────────────────
 * ⚠ 記事の identity は URL ではなく fingerprint だが、その fingerprint を作る前に
 *   URL を揃えないと、同じ記事が tracking パラメータの違いだけで 2 本になる。
 * ⚠ Google News の /rss/articles/CBMi… は記事 URL ではなく集約リダイレクトである。
 *   復号しない（できない場合がある）ので、そのまま provider_url として持ち、
 *   canonical としては扱えないことを呼び出し側へ返す。 */
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|gbraid|wbraid|msclkid|mc_[ce]id|igshid|ref|ref_src|ref_url|smid|smtyp|partner|cmpid|CMP|ito|at_medium|at_campaign|ncid|sref|__twitter_impression|guccounter|guce_referrer|guce_referrer_sig)$/i;

export function normaliseUrl(raw) {
  let u;
  try { u = new URL(String(raw || '')); } catch (_) { return { url: String(raw || ''), canonical: false }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { url: u.href, canonical: false };
  const isGoogleRedirect = u.hostname === 'news.google.com' && u.pathname.startsWith('/rss/articles/');
  u.protocol = 'https:';
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^amp\./, '');
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  /* AMP: /amp/ や末尾の /amp、?outputType=amp を素の記事へ寄せる */
  u.pathname = u.pathname.replace(/\/amp\/?$/i, '/').replace(/^\/amp\//i, '/');
  if (u.searchParams.get('outputType') === 'amp') u.searchParams.delete('outputType');
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
  return { url: u.href, canonical: !isGoogleRedirect };
}

/* ── 記事の読み方 ───────────────────────────────────────────────────────────
 * ⚠ DB の列は `subject_lng` / `subject_lat` / `subject_type`、評価用の fixture は
 *   `lng` / `lat` / `place_kind` である。**同じものに 2 つの名前がある**ので、読む口を 1 つにする
 *   ——呼び出し側ごとに変換を書くと、片方だけ直った日に静かに壊れる。 */
export const lngOf = (a) => (Number.isFinite(a.lng) ? a.lng : a.subject_lng);
export const latOf = (a) => (Number.isFinite(a.lat) ? a.lat : a.subject_lat);
export const kindOf = (a) => a.place_kind || a.subject_type || null;

/* ── 地理の分類 ─────────────────────────────────────────────────────────────
 * ⚠ ここが #R76 との一番大きな違いである。国レベルの一致は「近い」ではない。 */
export function geoClass(a, b, opt = DEFAULTS) {
  const aLng = lngOf(a), aLat = latOf(a), bLng = lngOf(b), bLat = latOf(b);
  const hasA = Number.isFinite(aLng) && Number.isFinite(aLat);
  const hasB = Number.isFinite(bLng) && Number.isFinite(bLat);
  if (!hasA || !hasB) return { cls: 'unknown', km: null };
  const km = haversineKm(aLng, aLat, bLng, bLat);
  const countryish = kindOf(a) === 'country' || kindOf(b) === 'country';
  if (countryish) {
    if (km <= 1) return { cls: 'countrySame', km };
    if (km <= opt.nearKm) return { cls: 'countryNear', km };
    return { cls: 'far', km };
  }
  if (km <= opt.tightKm) return { cls: 'tight', km };
  if (km <= opt.nearKm) return { cls: 'near', km };
  return { cls: 'far', km };
}

/* ── 1 対の判定 ─────────────────────────────────────────────────────────────
 * 返すのは真偽ではなく、なぜそうなったかを含むオブジェクト。誤統合を後から説明できないと直せない
 * （news_cluster_decisions がこれを保存する）。 */
export function pairVerdict(a, b, opt = DEFAULTS, I = null) {
  const reasons = [];
  const ta = a._tk || (a._tk = tokenise(a.title));
  const tb = b._tk || (b._tk = tokenise(b.title));

  const dtH = Math.abs(Date.parse(a.published_at) - Date.parse(b.published_at)) / 3600e3;
  if (!Number.isFinite(dtH)) { return { same: false, code: 'no_time', reasons: ['missing published_at'] }; }
  if (dtH > opt.timeWindowH) return { same: false, code: 'time', dtH, reasons: ['dt ' + dtH.toFixed(1) + 'h > ' + opt.timeWindowH] };

  /* 同じ本文の転載は、地理も時間も見ずに同じ出来事である。
   * 実測: Sinclair 3 局・Hearst 4 局が字面まで同一の見出しを配信していた。 */
  if (a.title_fingerprint && a.title_fingerprint === b.title_fingerprint) {
    return { same: true, code: 'reprint', dtH, j: 1, reasons: ['identical title fingerprint'] };
  }

  const { cls, km } = geoClass(a, b, opt);
  const j = jaccard(ta, tb);
  const { overlap, containment: c } = containment(ta, tb);

  const thrJ = opt.thr[cls], thrC = opt.containment[cls], minO = opt.minOverlap[cls];
  const thrW = opt.weighted[cls], minW = opt.minInterWeight[cls];
  const { weighted: w, interWeight } = I ? weightedOverlap(ta, tb, I) : { weighted: 0, interWeight: 0 };

  reasons.push('geo=' + cls + (km == null ? '' : ' ' + km.toFixed(0) + 'km'));
  reasons.push('j=' + j.toFixed(3) + ' (>=' + thrJ + ')');
  reasons.push('c=' + c.toFixed(3) + '/' + overlap + ' (>=' + thrC + '/' + minO + ')');
  if (I) reasons.push('w=' + w.toFixed(3) + '/' + interWeight.toFixed(1) + ' (>=' + thrW + '/' + minW + ')');

  const byJ = j >= thrJ;
  const byC = c >= thrC && overlap >= minO;
  const byW = !!I && w >= thrW && interWeight >= minW;
  return {
    same: byJ || byC || byW,
    code: byJ ? 'jaccard' : (byC ? 'containment' : (byW ? 'idf' : 'below_threshold')),
    dtH, km, geo: cls, j, containment: c, overlap, weighted: w, interWeight, reasons,
  };
}

/* ── 独立媒体数 ─────────────────────────────────────────────────────────────
 * ⚠ 記事の本数ではない。同じ資本・同じ配信系列・同じ字面は 1 つの声である。
 *   実測: 「Mount Fuji」6 件のうち 3 件は Sinclair 系列の同一タイトルだった。
 *   媒体名で数えると「6 媒体が報じた」になり、それは嘘である。 */
export function countIndependentSources(articles) {
  const idx = articles.map((_, i) => i);
  const find = (i) => { while (idx[i] !== i) { idx[i] = idx[idx[i]]; i = idx[i]; } return i; };
  const uni = (i, k) => { const x = find(i), y = find(k); if (x !== y) idx[y] = x; };
  const byFamily = new Map(), byTitle = new Map();
  articles.forEach((a, i) => {
    const f = a.source_family || a.publisher || ('#' + i);
    if (byFamily.has(f)) uni(byFamily.get(f), i); else byFamily.set(f, i);
    const t = a.title_fingerprint || normaliseTitle(a.title);
    if (byTitle.has(t)) uni(byTitle.get(t), i); else byTitle.set(t, i);
  });
  return new Set(articles.map((_, i) => find(i))).size;
}

/* ── まとめてクラスタリングする（評価と backfill 用） ────────────────────────
 * ⚠ 本番の増分割り当てはこれを使わない。新着 1 本に対して候補 Event を DB から引いて
 *   pairVerdict を撃つ（全記事の総当たりは O(n^2) で、#R76 は 600 件で 179,700 ペアを回していた）。
 * ⚠ 推移だけで大きな塊を作らないため、edge を張る前に「その Event の代表と合うか」を見る。 */
export function clusterArticles(articles, opt = DEFAULTS, corpus = null) {
  const n = articles.length;
  /* ⚠ IDF は「その窓に実際に流れている記事」から作る。評価のときに小さな抜粋だけで
   *   作ると珍しさを過小評価する（実測: 66 件の抜粋と 932 件の窓で答えが変わる）。
   *   本番の増分処理では、窓 = 直近 48 時間の記事全部である。 */
  const I = buildIdf(corpus && corpus.length ? corpus : articles);
  const parent = articles.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const members = new Map(articles.map((_, i) => [i, [i]]));
  const edges = [];
  for (let i = 0; i < n; i++) {
    for (let k = i + 1; k < n; k++) {
      const v = pairVerdict(articles[i], articles[k], opt, I);
      if (v.same) edges.push({ i, k, score: v.j + v.containment + v.weighted });
    }
  }
  /* 強い辺から結ぶ。弱い辺で先に橋を架けると、両端が互いに無関係な塊ができる。 */
  edges.sort((x, y) => y.score - x.score);
  for (const e of edges) {
    const ri = find(e.i), rk = find(e.k);
    if (ri === rk) continue;
    /* ⚠ 推移の検算: 片方の全メンバーが、もう片方の全メンバーの過半と合うことを求める。
     *   A-B と B-C が近くても A-C が別事件のときに、ここで止まる。 */
    const A = members.get(ri), B = members.get(rk);
    let ok = 0, tot = 0;
    for (const x of A) for (const y of B) { tot++; if (pairVerdict(articles[x], articles[y], opt, I).same) ok++; }
    if (tot > 1 && ok / tot < opt.transitivity) continue;
    parent[rk] = ri;
    members.set(ri, A.concat(B));
    members.delete(rk);
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }
  return [...groups.values()];
}

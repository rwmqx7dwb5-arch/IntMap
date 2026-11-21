/* ============================================================================
 *  IntMap · 似た地域を探す — 地域そのものの特徴ベクトルで比べる   (js/geo-similar.js)
 * ----------------------------------------------------------------------------
 *  「この地区に似た地域はどこか」「この港に機能的に似た港は」に、名前や統計ではなく
 *  土地そのものの構成（OpenStreetMap の建物・道路・施設・水辺の種類別の量）で答える。
 *  Google の S2Vec（2026-03）や AlphaEarth と同じ問い（地域を固定長のベクトルにして近さを測る）を、
 *  外部のモデル API なしで成り立つ実データの手法で行う第 1 スライス:
 *
 *    1. 地域 = 格子の 1 区画（または点のまわりの正方形）。特徴 = FEATURES の各カテゴリの OSM 要素数。
 *    2. 面積で割って密度にし、log1p で裾を畳み、**比べる集合ごと**に特徴ごとに標準化する
 *       （「密度が高い」ではなく「この集合の中で平均よりどれだけ違うか」で測る）。
 *    3. 標準化したベクトルの cosine 類似度で並べる。特徴ごとの積の寄与が「何が効いたか」の根拠。
 *
 *  ⚠ これは**類似の記述であって因果ではない**。同じ構成の 2 地域が同じ経済的役割・同じ歴史・同じ
 *  リスクを持つ証明ではない。OSM の入力の濃さは国・地域で違い、それは特徴の差として現れる
 *  （空の地域は「何も無い」ではなく「描かれていない」かもしれない）。回答はこの 2 点を必ず述べる。
 *
 *  ⚠ 外部への問い合わせは `countFor(bbox)` に注入する。このファイルは純粋で、node で評価できる。
 *  既定の供給元 `overpassCounts` は js/overpass.js の 1 本（ミラーの順序・予算はそちらが持つ）。
 *  別セッションの Overture 接続が届いたら、同じ形の `countFor` を 1 つ足すだけで入れ替わる。
 * ==========================================================================*/

/* 特徴の一覧。ql は Overpass QL の選択子（bbox は後ろに付く）。順序がベクトルの次元の順序。
   観測: 2026-11-20 に深圳・東京・ロッテルダムの 2 km 区画で 1 区画 18 件の `out count` が
   Overpass の 1 リクエストで返ることを測った（検証は dev-notes/2026-11-20-geo-similar.md）。
   失効条件: OSM のタグ付けの慣行が変わったとき（例: building=house の廃止）。 */
import { cosine } from './imagery-change.js';

export const FEATURES = Object.freeze([
  { id: 'buildings',      group: 'built',     label: 'buildings',               ql: 'nwr["building"]' },
  { id: 'residential',    group: 'built',     label: 'residential buildings',       ql: 'nwr["building"~"^(residential|apartments|house|detached|terrace|dormitory|semidetached_house)$"]' },
  { id: 'commercial',     group: 'built',     label: 'commercial buildings', ql: 'nwr["building"~"^(commercial|retail|office|supermarket|hotel)$"]' },
  { id: 'industrial',     group: 'built',     label: 'industrial / warehouse buildings', ql: 'nwr["building"~"^(industrial|warehouse|factory|storage_tank|hangar)$"]' },
  { id: 'roads_major',    group: 'network',   label: 'major roads',           ql: 'way["highway"~"^(motorway|trunk|primary|motorway_link|trunk_link)$"]' },
  { id: 'roads_local',    group: 'network',   label: 'local roads', ql: 'way["highway"~"^(residential|service|tertiary|unclassified|living_street|secondary)$"]' },
  { id: 'paths',          group: 'network',   label: 'footways and paths',         ql: 'way["highway"~"^(footway|path|pedestrian|steps|cycleway)$"]' },
  { id: 'rail',           group: 'network',   label: 'rail, metro and tram lines', ql: 'way["railway"~"^(rail|subway|light_rail|tram|monorail)$"]' },
  { id: 'stations',       group: 'network',   label: 'stations and stops',         ql: 'nwr["railway"~"^(station|halt|tram_stop)$"]' },
  { id: 'food',           group: 'amenity',   label: 'restaurants and cafes',             ql: 'nwr["amenity"~"^(restaurant|cafe|fast_food|bar|pub|food_court)$"]' },
  { id: 'shops',          group: 'amenity',   label: 'shops',               ql: 'nwr["shop"]' },
  { id: 'offices',        group: 'amenity',   label: 'offices',             ql: 'nwr["office"]' },
  { id: 'education',      group: 'amenity',   label: 'schools and universities',         ql: 'nwr["amenity"~"^(school|kindergarten|university|college)$"]' },
  { id: 'health',         group: 'amenity',   label: 'health facilities',           ql: 'nwr["amenity"~"^(hospital|clinic|pharmacy|doctors|dentist)$"]' },
  { id: 'tourism',        group: 'amenity',   label: 'tourism and lodging',         ql: 'nwr["tourism"]' },
  { id: 'green',          group: 'nature',    label: 'parks and pitches',       ql: 'nwr["leisure"~"^(park|garden|pitch|playground|sports_centre)$"]' },
  { id: 'water',          group: 'nature',    label: 'water bodies and shoreline',    ql: 'nwr["natural"~"^(water|coastline|bay|wetland)$"]' },
  { id: 'port',           group: 'maritime',  label: 'piers, quays and docks', ql: 'nwr["man_made"~"^(pier|quay|breakwater|groyne)$"]' },
  { id: 'port_land',      group: 'maritime',  label: 'port and harbour land',   ql: 'nwr["landuse"~"^(port|harbour)$"]' },
  { id: 'cranes',         group: 'maritime',  label: 'cranes and container stacks', ql: 'nwr["man_made"="crane"]' },
]);

/* ── 幾何（球面の小さな範囲で十分な近似。区画の面積はここで 1 か所に決める） ── */
const KM_PER_DEG = 111.32;
export function bboxAreaKm2(b) {
  const lat = (b[1] + b[3]) / 2;
  return Math.max(1e-6, (b[2] - b[0]) * KM_PER_DEG * Math.cos(lat * Math.PI / 180) * (b[3] - b[1]) * KM_PER_DEG);
}
/* 点のまわりの、1 辺 sideKm の正方形 [w,s,e,n] */
export function squareAround(lat, lng, sideKm) {
  const dLat = (sideKm / 2) / KM_PER_DEG, dLng = (sideKm / 2) / (KM_PER_DEG * Math.max(0.05, Math.cos(lat * Math.PI / 180)));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}
/* 範囲 [w,s,e,n] を 1 辺 cellKm の区画に割る。maxCells を超えるなら、**超えた分は黙って捨てずに** truncated を立てる。
   区画は範囲の中心に近いものから採る（探索を中心から広げる向き） */
export function gridCells(bounds, cellKm, maxCells) {
  const [w, s, e, n] = bounds, lat0 = (s + n) / 2;
  const dLat = cellKm / KM_PER_DEG, dLng = cellKm / (KM_PER_DEG * Math.max(0.05, Math.cos(lat0 * Math.PI / 180)));
  const cols = Math.max(1, Math.round((e - w) / dLng)), rows = Math.max(1, Math.round((n - s) / dLat));
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const b = [w + c * dLng, s + r * dLat, w + (c + 1) * dLng, s + (r + 1) * dLat];
    cells.push({ bbox: b, lat: (b[1] + b[3]) / 2, lng: (b[0] + b[2]) / 2 });
  }
  const cx = (w + e) / 2, cy = (s + n) / 2;
  cells.sort((a, b) => ((a.lng - cx) ** 2 + (a.lat - cy) ** 2) - ((b.lng - cx) ** 2 + (b.lat - cy) ** 2));
  const cap = Math.max(1, maxCells | 0);
  return { cells: cells.slice(0, cap), total: cells.length, truncated: cells.length > cap };
}

/* ── Overpass: 区画 1 つ = 1 リクエスト。`out count;` を特徴の数だけ並べると count 要素が同じ順序で返る ── */
export function buildCountQuery(bbox, features) {
  const b = bbox[1].toFixed(6) + ',' + bbox[0].toFixed(6) + ',' + bbox[3].toFixed(6) + ',' + bbox[2].toFixed(6);
  return '[out:json][timeout:60];\n' + (features || FEATURES).map((f) => '(' + f.ql + '(' + b + '););out count;').join('\n');
}
export function parseCounts(json, features) {
  const fs = features || FEATURES;
  const counts = ((json && json.elements) || []).filter((e) => e && e.type === 'count');
  if (counts.length !== fs.length) throw new Error('Overpass returned ' + counts.length + ' counts for ' + fs.length + ' features');
  return counts.map((c) => +((c.tags && c.tags.total) || 0));
}
/* 既定の供給元。overpassQuery は js/overpass.js の export（呼び出し側が渡す。ここで import しないのは node の検査が
   fetch-deadline に触れずに評価できるようにするため） */
export function overpassCounts(overpassQuery, features) {
  const fs = features || FEATURES;
  return async (bbox) => parseCounts(await overpassQuery(buildCountQuery(bbox, fs), { budgetMs: 70000 }), fs);
}

/* ── ベクトルと類似度 ── */
const transform = (count, areaKm2) => Math.log1p(count / areaKm2);

/* 標準化は**比べる集合の中**で行う。分散 0 の特徴（集合の誰も持たない・全員が同じだけ持つ）は
   区別に使えないので落とし、落としたことを返す（黙って次元を減らさない）。 */
export function standardise(rows, features) {
  const fs = features || FEATURES, n = rows.length;
  const T = rows.map((r) => fs.map((_, j) => transform(r.counts[j], r.areaKm2)));
  const mean = fs.map((_, j) => T.reduce((a, t) => a + t[j], 0) / n);
  const sd = fs.map((_, j) => Math.sqrt(T.reduce((a, t) => a + (t[j] - mean[j]) ** 2, 0) / n));
  const keep = sd.map((s) => s > 1e-9);
  const Z = T.map((t) => t.map((v, j) => (keep[j] ? (v - mean[j]) / sd[j] : 0)));
  return { Z, mean, sd, keep, dropped: fs.filter((_, j) => !keep[j]).map((f) => f.id) };
}
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const norm = (a) => Math.sqrt(dot(a, a));

/* query と candidates を同じ集合として標準化し、candidate を query との cosine で並べる。
   各 candidate に `because`（積の寄与が大きい特徴 = 似させている）と `differs`（積が負で大きい = 違わせている）を付ける。
   寄与は cosine の分子の項 / (|zq||zc|) なので、全特徴の寄与の和がそのまま score になる。 */
export function rankSimilar(query, candidates, opt) {
  opt = opt || {};
  const fs = opt.features || FEATURES, k = Math.max(1, opt.k | 0 || 8);
  const rows = [query].concat(candidates);
  const st = standardise(rows, fs);
  const zq = st.Z[0], nq = norm(zq);
  if (!(nq > 0)) return { results: [], dropped: st.dropped, error: 'QUERY_FLAT' };
  const out = candidates.map((c, i) => {
    const zc = st.Z[i + 1], nc = norm(zc);
    if (!(nc > 0)) return { cand: c, score: 0, contrib: fs.map(() => 0) };
    const contrib = zq.map((v, j) => (v * zc[j]) / (nq * nc));
    return { cand: c, score: contrib.reduce((a, b) => a + b, 0), contrib };
  });
  out.sort((a, b) => b.score - a.score);
  const describe = (r, j) => ({
    id: fs[j].id, label: fs[j].label,
    queryPerKm2: query.counts[j] / query.areaKm2, candidatePerKm2: r.cand.counts[j] / r.cand.areaKm2,
    queryCount: query.counts[j], candidateCount: r.cand.counts[j], share: r.contrib[j],
  });
  const results = out.slice(0, k).map((r) => {
    const idx = r.contrib.map((v, j) => j).filter((j) => st.sd[j] > 1e-9);
    const byShare = idx.slice().sort((a, b) => r.contrib[b] - r.contrib[a]);
    return {
      cell: r.cand, score: r.score,
      because: byShare.filter((j) => r.contrib[j] > 0.01).slice(0, 4).map((j) => describe(r, j)),
      differs: byShare.slice().reverse().filter((j) => r.contrib[j] < -0.01).slice(0, 3).map((j) => describe(r, j)),
    };
  });
  return { results, dropped: st.dropped, error: null, pool: candidates.length };
}

/* 地域の特徴ベクトルを実際に取る。同時 2 本（公開インスタンスへの礼儀。件数の上限ではなく同時数）。
   失敗した区画は failed に理由つきで残す——「類似なし」と「取れなかった」を同じ答えにしない。 */
export async function measureCells(cells, countFor, opt) {
  opt = opt || {};
  const conc = Math.max(1, opt.concurrency | 0 || 2), out = new Array(cells.length), failed = [];
  /* 1 つも答えが返らないまま続けて失敗したら、供給元が落ちているので残りを問わない（観測: 2026-11-20、応答の無い
     Overpass に 24 区画 × 65 s = 25 分を使った）。これは件数の上限ではなく「実在した失敗のあとの打ち切り」で、
     問わなかった区画は notAsked に数えて述べる。1 つでも成功したら（個別の区画の失敗は）続ける。 */
  const giveUp = Math.max(1, opt.giveUpAfter | 0 || 3);
  let next = 0, ok = 0, streak = 0, notAsked = 0;
  async function worker() {
    while (next < cells.length) {
      if (ok === 0 && streak >= giveUp) { notAsked = cells.length - next; next = cells.length; break; }
      const i = next++, c = cells[i];
      try { out[i] = Object.assign({}, c, { counts: await countFor(c.bbox), areaKm2: bboxAreaKm2(c.bbox) }); ok++; streak = 0; }
      catch (e) { streak++; failed.push({ cell: c, reason: String((e && e.message) || e).slice(0, 160) }); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(conc, cells.length) }, worker));
  return { rows: out.filter(Boolean), failed, notAsked };
}

/* 本体。
   opt.query      { lat, lng, name?, sideKm? } または { bbox }
   opt.within     [w,s,e,n]（格子で探す範囲）／ opt.candidates [{name, lat, lng}]（点のまわりの同じ大きさの区画）
   opt.cellKm     格子の 1 辺（既定 2）／ opt.maxCells 走査する区画の数（既定 48。超えた分は truncated と total で述べる）
   戻り値の coverage が「どこまで見たか」で、類似の主張はその範囲の中のことだけ。 */
/* 基準の区画と、比べる区画の一覧を決める（OSM 版と埋め込み版が同じ区画の取り方を使う: 取り方が違えば「似ている」の母集団が違ってしまう）。 */
function planCells(opt) {
  const cellKm = +opt.cellKm > 0 ? +opt.cellKm : 2, maxCells = +opt.maxCells > 0 ? +opt.maxCells : 48;
  const q = opt.query || {};
  const qBox = q.bbox || squareAround(q.lat, q.lng, +q.sideKm > 0 ? +q.sideKm : cellKm);
  const sideKm = Math.sqrt(bboxAreaKm2(qBox));
  let cells, total, truncated = false;
  if (Array.isArray(opt.candidates) && opt.candidates.length) {
    cells = opt.candidates.filter((c) => isFinite(+c.lat) && isFinite(+c.lng)).slice(0, maxCells)
      .map((c) => ({ name: c.name, lat: +c.lat, lng: +c.lng, bbox: squareAround(+c.lat, +c.lng, sideKm) }));
    total = opt.candidates.length; truncated = total > cells.length;
  } else {
    const within = opt.within || squareAround((qBox[1] + qBox[3]) / 2, (qBox[0] + qBox[2]) / 2, Math.sqrt(maxCells) * cellKm);
    const g = gridCells(within, cellKm, maxCells + 4); /* 探索範囲が query を含むと自分自身も入るので除く分の余裕 */
    const cx = (qBox[0] + qBox[2]) / 2, cy = (qBox[1] + qBox[3]) / 2, half = sideKm / 2 / KM_PER_DEG;
    cells = g.cells.filter((c) => Math.abs(c.lat - cy) > half * 1.2 || Math.abs(c.lng - cx) > half * 1.2).slice(0, maxCells);
    total = g.total; truncated = g.truncated || g.total > cells.length;
  }
  return { q, qBox, sideKm, cellKm, cells, total, truncated };
}

export async function findSimilar(opt, countFor) {
  const { q, qBox, sideKm, cellKm, cells, total, truncated } = planCells(opt);
  /* 基準が読めないなら候補を測っても意味が無い——先に基準だけを問い、読めなければ候補を 1 つも問わない */
  const qm = await measureCells([{ bbox: qBox, lat: (qBox[1] + qBox[3]) / 2, lng: (qBox[0] + qBox[2]) / 2, name: q.name }], countFor, { concurrency: 1, giveUpAfter: 1 });
  if (!qm.rows.length) return { ok: false, code: 'QUERY_UNREAD', failed: qm.failed, coverage: { requested: cells.length, measured: 0, total } };
  const cm = await measureCells(cells, countFor, opt);
  const query = qm.rows[0];
  const emptyBuilt = query.counts.reduce((a, b) => a + b, 0) === 0;
  if (cm.rows.length < 3) return { ok: false, code: 'POOL_TOO_SMALL', query, failed: cm.failed, notAsked: cm.notAsked, coverage: { requested: cells.length, measured: cm.rows.length, total, truncated } };
  const ranked = rankSimilar(query, cm.rows, { k: opt.k, features: opt.features });
  return {
    ok: !ranked.error, code: ranked.error || 'OK', query, emptyBuilt,
    results: ranked.results, droppedFeatures: ranked.dropped,
    failed: cm.failed, notAsked: cm.notAsked, coverage: { requested: cells.length, measured: cm.rows.length, total, truncated, cellKm, sideKm },
  };
}

/* ── 衛星埋め込み（AlphaEarth Foundations）で比べる ──
   区画の特徴 = その区画の有効画素の埋め込み（64 次元・長さ 1）の平均を再正規化したもの。類似度 = cosine。
   OSM 版と違い、次元は人が読める量ではない（「建物が似ている」とは言えない）。根拠として返すのは、
   どの年の埋め込みか・区画のうち何割の画素が有効だったか・候補全体の中でそのスコアがどの位置か（中央値と最大）。
   embedMany(boxes) は js/imagery-change-io.js regionEmbeddings の形: 各 box に { embedding:{vector,pixels,coverage} } か { reason }。 */
export async function findSimilarEmbedding(opt, embedMany) {
  const plan = planCells(opt);
  const all = await embedMany([plan.qBox].concat(plan.cells.map((c) => c.bbox)));
  const qr = all[0];
  if (!qr || !qr.embedding) return { ok: false, code: 'QUERY_UNREAD', failed: [{ reason: (qr && qr.reason) || 'no answer' }], coverage: { requested: plan.cells.length, measured: 0, total: plan.total } };
  const rows = [], failed = [];
  plan.cells.forEach((c, i) => { const r = all[i + 1]; if (r && r.embedding) rows.push({ cell: c, score: cosine(qr.embedding.vector, r.embedding.vector), validCoverage: r.embedding.coverage }); else failed.push({ cell: c, reason: (r && r.reason) || 'no answer' }); });
  const coverage = { requested: plan.cells.length, measured: rows.length, total: plan.total, truncated: plan.truncated, cellKm: plan.cellKm, sideKm: plan.sideKm };
  if (rows.length < 3) return { ok: false, code: 'POOL_TOO_SMALL', failed, coverage };
  const scores = rows.map((r) => r.score).sort((a, b) => a - b), med = scores[Math.floor(scores.length / 2)];
  rows.sort((a, b) => b.score - a.score);
  const k = Math.max(1, opt.k | 0 || 8);
  return { ok: true, code: 'OK', signal: 'embedding', query: { validCoverage: qr.embedding.coverage }, results: rows.slice(0, k), poolMedian: med, poolMin: scores[0], poolMax: scores[scores.length - 1], failed, coverage };
}
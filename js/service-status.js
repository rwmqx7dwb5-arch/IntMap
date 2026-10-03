/* ============================================================================
 *  IntMap · js/service-status.js — 「IntMap のいま」: WHAT IS WORKING, FOR THIS READER, NOW   (shell-experience)
 * ----------------------------------------------------------------------------
 *  MEASURED 2026-10-03, BEFORE THIS FILE. Four facts a reader of the map is affected by were each
 *  known to exactly one place, and none of those places was in front of the reader:
 *    ① which suppliers are not answering — .github/workflows/upstream-liveness.yml classified 113
 *       hosts every night into a CI artifact. On 2026-10-02 six were down (GDELT 429, OEC 403,
 *       CelesTrak, overpass-api.de and both Overpass mirrors). A layer behind them drew an empty map,
 *       or its row said 「読み込めません」 and nothing about the supplier having been silent for a day;
 *    ② whether this layer's request failed — js/layer-state.js knew, per row, and only per row;
 *    ③ whether IntMap opens without a network here — sw.js keeps a copy of the app (installable-app),
 *       and nothing told the reader it had one;
 *    ④ when Atlas's answers were last evaluated — never: atlas-eval.yml ran eight times and stopped at
 *       its first step each time for want of two secrets (scripts/lib/nightly-status.mjs).
 *
 *  THIS FILE PUTS THEM ON ONE PAGE, AND PUTS ① WHERE THE READER ALREADY LOOKS.
 *    · the page — Settings ▸ 「IntMap のいま」, `statusPage.open()` (js/layer-state.js keeps
 *      that handle eager; this module is fetched when it is first used), and Atlas (`diagnose`, and
 *      `module` can open it by name);
 *    · a layer row whose request failed — js/layer-state.js asks `upstreamRow(url)` and its pill's
 *      sentence gains 「このデータ元は 10月2日 から応答していません（毎晩の確認）」;
 *    · the data-sources list (in-app dialog and sources.html) — a supplier row whose host is down says so.
 *
 *  ⚠ NOTHING HERE IS CLAIMED THAT WAS NOT MEASURED.
 *    · Last night's verdicts are data/service-status.json (scripts/build-service-status.mjs), with the
 *      time each was measured. A host this bundle does not list is not 「alive」 — it is not mentioned.
 *    · 「確認できなかった」 is not 「止まっている」 (.agents/rules/one-pass-or-a-reason.md §5): an
 *      `unobserved` night, an unreadable bundle and a run that measured nothing each say so in words of
 *      their own.
 *    · This reader's own state (online, the stored app, a failed request) is read from the browser at
 *      the moment the page is drawn; it is never inferred from last night.
 *    · Which host a failed request went to is read from the request's own URL — and when that URL is a
 *      relay carrying the real target in its query (`?u=https://…`, js/proxy-fetch.js), from the target.
 *      No table maps layers to hosts.
 *  Words are en + jp (CONSTITUTION.md §7). No emoji: pictures are js/icons.js line icons.
 * ==========================================================================*/
import { jsonWithin } from './fetch-deadline.js';
import { hostMatches } from './host-match.js';
import { IntMapLang } from './lang-registry.js';
import { iconNode } from './icons.js';
import * as bus from './bus.js';

/* where the nightly measurement is shipped (scripts/build-service-status.mjs OUT) */
const BUNDLE_URL = './data/service-status.json';
/* how long the page waits for its own origin's small file before saying it could not read it.
   OBSERVED: a same-origin JSON of ~35 kB; Pages answers in well under a second. EXPIRES: never in
   practice — the clock only separates 「slow」 from 「not there」. CANON: this constant. */
const BUNDLE_MS = 8000;

const t = (lang, en, jp) => IntMapLang.t(lang, en, jp);
const docLang = () => { try { return IntMapLang.normalise(document.documentElement.lang || 'en'); } catch (_) { return 'en'; } };

/* ── the bundle, once per page ───────────────────────────────────────────────────────────────── */
let bundleP = null;
/** last night's measurement, or { unreadable: why } — never throws; asked again only after a failure.
    ⚠ NOT `unread`: the bundle itself carries an `unread` list (the halves its builder could not read), and an
    empty list is truthy — the first draft read every good bundle as unreadable. `usable()` is the one test. */
export function loadStatus() {
  if (!bundleP) {
    bundleP = jsonWithin(BUNDLE_URL, BUNDLE_MS).then((b) => (b && typeof b === 'object' ? b : { unreadable: 'parse' }),
      (e) => { bundleP = null; return { unreadable: (e && e.reason) || 'network' }; });
  }
  return bundleP;
}

/* ── the pure parts ──────────────────────────────────────────────────────────────────────────── */

/** is this a measurement that was read (as opposed to loadStatus()'s `{ unreadable }`)? */
export function usable(b) { return !!b && typeof b === 'object' && !b.unreadable && b.v === 1; }

/** the host a request actually asked: the target carried in a relay's query, else the URL's own host */
export function requestHost(url) {
  let u;
  /* a relative URL is IntMap's own origin — not a supplier the nightly check asks */
  const raw = String(url == null ? '' : url);
  if (!/^https?:\/\//i.test(raw)) return null;
  try { u = new URL(raw); } catch (_) { return null; }
  for (const v of u.searchParams.values()) {
    if (!/^https?:\/\//i.test(v)) continue;
    try { return new URL(v).hostname.toLowerCase(); } catch (_) { /* not a URL after all */ }
  }
  return u.hostname.toLowerCase();
}

/** the bundle's row for a host (exact or by the ledger's pattern), or null */
export function upstreamFor(bundle, host) {
  const rows = bundle && bundle.upstream && Array.isArray(bundle.upstream.hosts) ? bundle.upstream.hosts : [];
  if (!host) return null;
  return rows.find((r) => r.host === host) || rows.find((r) => hostMatches(r.host, host)) || null;
}

/**
 * The bundle's rows that speak for a data-source credit whose link is `url`: the link's own host, or
 * a host under the same site (the credit links `www.gdeltproject.org`, the browser asks
 * `api.gdeltproject.org`). ⚠ «Under the same site» is the link's host without a leading `www.` —
 * never a registrable-domain guess, which would make every *.nasa.gov host speak for every NASA credit.
 */
export function upstreamsForSource(bundle, url) {
  const rows = bundle && bundle.upstream && Array.isArray(bundle.upstream.hosts) ? bundle.upstream.hosts : [];
  const h = requestHost(url); if (!h) return [];
  const base = h.replace(/^www\./, '');
  return rows.filter((r) => {
    if (r.host === h || hostMatches(r.host, h)) return true;
    const rh = String(r.host);
    return rh.indexOf('*') < 0 && (rh === base || rh.endsWith('.' + base));
  });
}

const down = (r) => !!r && (r.verdict === 'dead' || r.verdict === 'refused');

/** a date the way this reader reads one: 10月2日 19:44 / Oct 2, 19:44 (local time) */
function when(iso, lang) {
  const d = new Date(iso); if (!iso || isNaN(d)) return '';
  try {
    return new Intl.DateTimeFormat(IntMapLang.locale(lang),
      { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  } catch (_) { return d.toISOString().slice(0, 16).replace('T', ' '); }
}

/** one sentence about one supplier, from last night's measurement */
export function upstreamSentence(row, lang, measuredAt) {
  if (!row) return '';
  const night = measuredAt ? when(measuredAt, lang) : '';
  if (row.verdict === 'alive') {
    return t(lang, 'In the nightly check' + (night ? ' (' + night + ')' : '') + ' this source was answering.',
      '毎晩の確認' + (night ? '（' + night + '）' : '') + 'では、このデータ元は応答していました。');
  }
  if (row.verdict === 'unobserved') {
    return t(lang, 'The nightly check could not reach this source to tell.', '毎晩の確認では、このデータ元の状態を確かめられませんでした。');
  }
  const since = row.downSince ? when(row.downSince, lang) : '';
  const last = row.lastAlive ? when(row.lastAlive, lang) : '';
  const runs = Number.isInteger(row.runs) && row.runs > 1 ? row.runs : 0;
  const refused = row.verdict === 'refused';
  const code = refused && row.status ? 'HTTP ' + row.status : '';
  if (lang === 'jp') {
    const parts = [code, since ? since + ' から' : runs ? runs + ' 回続けて' : '', last ? '最後に応答 ' + last : ''].filter(Boolean);
    return (refused ? 'このデータ元は要求を拒否しています' : 'このデータ元は応答していません') + '（毎晩の確認' + (parts.length ? '：' + parts.join('・') : '') + '）。';
  }
  const en = (refused ? 'This source has been refusing requests' + (code ? ' (' + code + ')' : '') : 'This source has not been answering')
    + (since ? ' since ' + since : runs ? ' in the last ' + runs + ' nightly checks' : ' in the nightly check')
    + (last ? '; it last answered ' + last : '') + '.';
  return t(lang, en, en);
}

/* ── (ops-next) the record over time ─────────────────────────────────────────────────────────────
   The bundle's `history` (scripts/build-service-status.mjs advanceHistory) is one character per host per
   measured night: a alive · r refused · d dead · u unobserved · . not probed that night. These readers
   count only what a night MEASURED: `u` and `.` are neither answered nor failed — they are left out of
   both sides of the ratio, and the sentence says how many nights were measured. */
const MEASURED = /[ard]/g;

/** the series of one host (by the bundle row's own host, the key the builder wrote), or '' */
function seriesOf(bundle, host) {
  const H = bundle && bundle.history;
  return H && H.hosts && typeof H.hosts[host] === 'string' ? H.hosts[host] : '';
}

/** { answered, measured, nights } for one series — nights is the span held, measured those that said something */
export function recordOf(series) {
  const s = String(series || '');
  return { answered: (s.match(/a/g) || []).length, measured: (s.match(MEASURED) || []).length, nights: s.length };
}

/** every night's share of the measured sources that answered: [{ at, answered, measured }] oldest first */
export function nightsOf(bundle) {
  const H = bundle && bundle.history;
  if (!H || !Array.isArray(H.nights) || !H.hosts) return [];
  const series = Object.values(H.hosts);
  return H.nights.map((at, i) => {
    let answered = 0, measured = 0;
    for (const s of series) { const c = s[i]; if (c === 'a') answered++; if (c === 'a' || c === 'r' || c === 'd') measured++; }
    return { at, answered, measured };
  });
}

/** one sentence about one host's record: 「直近 30 晩のうち 28 晩応答」 — or '' when no night measured it */
export function recordSentence(series, lang) {
  const r = recordOf(series);
  if (!r.measured) return '';
  if (r.answered === r.measured) {
    return r.measured === 1 ? t(lang, 'Answered the one nightly check so far.', 'これまでの毎晩の確認（1 晩）で応答。')
      : t(lang, 'Answered all of the last ' + r.measured + ' nightly checks.', '直近 ' + r.measured + ' 晩の確認すべてで応答。');
  }
  return t(lang, 'Answered ' + r.answered + ' of the last ' + r.measured + ' nightly checks.', '直近 ' + r.measured + ' 晩の確認のうち ' + r.answered + ' 晩で応答。');
}

/** the cells a strip draws for a series: [{ c, tone }] — the tone vocabulary of the rows */
const CELL_TONE = Object.freeze({ a: 'ok', r: 'warn', d: 'bad', u: 'muted', '.': 'none' });

/** what the reader is told a host is for, in their language — the ledger's words, else the host itself */
const whatOf = (r, lang) => (lang === 'jp' ? (r.whatJp || r.what) : r.what) || r.host;

/**
 * The page, as data: { tone, headline, sections: [{ id, title, rows: [{ tone, icon, title, detail }], all? }] }.
 * Pure — every input is passed in (tests/shell-experience-checks.test.mjs evaluates it).
 * @param {{ bundle, online, shell, storageMB, layersOn, layerProblems, now }} m
 */
export function composeStatus(m, lang) {
  const out = { sections: [] };
  const notes = [];

  /* ── this device ── */
  const dev = [];
  dev.push(m.online === false
    ? { tone: 'bad', icon: 'signal', title: t(lang, 'Offline', 'オフライン'), detail: t(lang, 'This device has no network. Maps and data you have already opened can still be shown; nothing new can be fetched.', 'この端末はネットワークにつながっていません。一度開いた地図とデータは表示できますが、新しいものは取得できません。') }
    : { tone: 'ok', icon: 'signal', title: t(lang, 'Online', 'オンライン'), detail: t(lang, 'This device can reach the network.', 'この端末はネットワークにつながっています。') });
  if (m.shell === true) dev.push({ tone: 'ok', icon: 'save', title: t(lang, 'Opens without a network', 'ネットワークが無くても開ける'), detail: t(lang, 'A copy of IntMap is stored on this device, so it opens offline. The map shows the areas you have already viewed.', 'この端末に IntMap の本体が保存されているので、オフラインでも開けます。地図は一度表示した範囲が出ます。') });
  else if (m.shell === false) dev.push({ tone: 'muted', icon: 'save', title: t(lang, 'Not stored for offline use yet', 'オフライン用にはまだ保存されていません'), detail: t(lang, 'The copy is stored the next time IntMap is opened with a network.', '次にネットワークのある状態で開いたときに保存されます。') });
  else dev.push({ tone: 'muted', icon: 'save', title: t(lang, 'Offline opening is not available here', 'この環境ではオフラインで開けません'), detail: t(lang, 'This browser or this copy of IntMap keeps no offline copy.', 'このブラウザ、またはこの IntMap は、オフライン用の保存を持ちません。') });
  if (Number.isFinite(m.storageMB) && m.storageMB > 0) dev.push({ tone: 'muted', icon: 'folder', title: t(lang, 'Stored on this device: ' + m.storageMB + ' MB', 'この端末に保存: ' + m.storageMB + ' MB'), detail: t(lang, 'Map tiles and data kept so that places you revisit load without the network.', '再訪した場所をネットワーク無しで出すために保存している地図タイルとデータです。') });
  out.sections.push({ id: 'device', title: t(lang, 'This device', 'この端末'), rows: dev });
  if (m.online === false) notes.push('offline');

  /* ── the layers that are on ── */
  const lay = [];
  const probs = Array.isArray(m.layerProblems) ? m.layerProblems : [];
  for (const p of probs) {
    const word = p.state === 'nodata' ? t(lang, 'No data for this date', 'この日時のデータなし')
      : p.state === 'unobserved' ? t(lang, 'No reply', '応答なし') : t(lang, "Couldn't load", '読み込めません');
    lay.push({ tone: p.state === 'nodata' ? 'muted' : 'warn', icon: 'layers', title: p.label + ' — ' + word, detail: [p.detail, p.upstream].filter(Boolean).join(' ') });
  }
  const on = Number.isInteger(m.layersOn) ? m.layersOn : 0;
  if (!probs.length) lay.push({ tone: on ? 'ok' : 'muted', icon: 'layers', title: on ? t(lang, on + ' layer(s) on, all drawn', on + ' 件のレイヤーを表示中・すべて描画できています') : t(lang, 'No layers are on', '表示中のレイヤーはありません'), detail: '' });
  else notes.push('layers');
  out.sections.push({ id: 'layers', title: t(lang, 'Layers on the map', '地図のレイヤー'), rows: lay });

  /* ── the suppliers, last night ── */
  const b = m.bundle || {};
  const U = b.upstream || null;
  const sup = [];
  let all = null;
  if (!U) {
    sup.push({ tone: 'muted', icon: 'clock', title: t(lang, 'The nightly check could not be read', '毎晩の確認の記録を読めませんでした'), detail: t(lang, 'Nothing is said about the data sources until it can be read.', '読めるまでは、データ元について何も述べません。') });
  } else if (U.networkObserved === false) {
    sup.push({ tone: 'muted', icon: 'clock', title: t(lang, 'Last night’s check measured nothing', '昨夜の確認は何も測れていません'), detail: t(lang, 'The checking machine had no network, so this is not a statement about the sources.', '確認する側がネットワークにつながっていなかったため、データ元についての記録ではありません。') });
  } else {
    const bad = U.hosts.filter(down);
    const head = t(lang, 'Checked ' + when(U.measuredAt, lang) + ' — ' + U.hosts.length + ' sources', when(U.measuredAt, lang) + ' に確認・' + U.hosts.length + ' 件のデータ元');
    if (!bad.length) sup.push({ tone: 'ok', icon: 'check-circle', title: t(lang, 'Every source answered', 'すべてのデータ元が応答しました'), detail: head });
    else {
      sup.push({ tone: 'warn', icon: 'warning', title: t(lang, bad.length + ' source(s) did not answer', bad.length + ' 件のデータ元が応答しませんでした'), detail: head });
      for (const r of bad) {
        const rec = recordSentence(seriesOf(b, r.host), lang);
        sup.push({ tone: 'bad', icon: 'dot', title: whatOf(r, lang), detail: r.host + ' — ' + upstreamSentence(r, lang, U.measuredAt) + (rec ? ' ' + rec : ''), series: seriesOf(b, r.host) });
      }
      notes.push('upstream');
    }
    all = U.hosts.map((r) => {
      const rec = recordSentence(seriesOf(b, r.host), lang);
      return { tone: down(r) ? 'bad' : r.verdict === 'alive' ? 'ok' : 'muted', title: whatOf(r, lang), host: r.host, series: seriesOf(b, r.host),
        detail: (r.verdict === 'alive' ? t(lang, 'answering', '応答あり') : down(r) ? upstreamSentence(r, lang, U.measuredAt) : t(lang, 'not measured', '確認できず')) + (rec ? ' · ' + rec : '') };
    });
  }
  /* (ops-next) the record over time: every measured night, the share of the measured sources that answered.
     A night is drawn only if the bundle holds it; the span is the bundle's, never assumed. */
  const nights = nightsOf(b);
  let record = null;
  if (nights.length) {
    const tot = nights.reduce((s, n) => ({ a: s.a + n.answered, m: s.m + n.measured }), { a: 0, m: 0 });
    const pct = tot.m ? Math.round((tot.a / tot.m) * 1000) / 10 : null;
    const from = when(nights[0].at, lang), to = when(nights[nights.length - 1].at, lang);
    record = { nights, pct,
      title: t(lang, 'The record: ' + nights.length + ' nightly check(s)', '記録: 毎晩の確認 ' + nights.length + ' 回分'),
      detail: pct == null ? t(lang, 'No night measured any source.', 'どの晩もデータ元を測れていません。')
        : t(lang, pct + '% of source checks answered, ' + from + ' – ' + to + '. Each bar is one night; a source the check could not reach is left out, not counted as down.',
          from + ' 〜 ' + to + ' の確認のうち ' + pct + '% で応答。棒は 1 晩ずつ。確かめられなかったデータ元は数に入れず、停止とも数えません。') };
  }
  out.sections.push({ id: 'upstream', title: t(lang, 'Data sources (checked every night)', 'データ元（毎晩の確認）'), rows: sup, all, record });

  /* ── Atlas, evaluated ── */
  const A = b.atlasEval || null;
  const atl = [];
  if (!A) atl.push({ tone: 'muted', icon: 'clock', title: t(lang, 'The evaluation record could not be read', '評価の記録を読めませんでした'), detail: '' });
  else {
    atl.push(A.lastSuccessAt
      ? { tone: 'ok', icon: 'check-circle', title: t(lang, 'Last evaluated ' + when(A.lastSuccessAt, lang), '最後に評価された日時: ' + when(A.lastSuccessAt, lang)), detail: t(lang, 'Atlas’s answers to recorded questions are checked against an answer key every night.', '記録した質問への Atlas の答えを、毎晩、解答と照らしています。') }
      : { tone: 'warn', icon: 'warning', title: t(lang, 'Atlas’s answers have not been evaluated yet', 'Atlas の答えはまだ一度も評価されていません'), detail: t(lang, 'None of the ' + A.total + ' scheduled evaluations' + (A.windowFrom ? ' since ' + when(A.windowFrom, lang) : '') + ' measured anything.', (A.windowFrom ? when(A.windowFrom, lang) + ' 以降の' : '') + '予定された ' + A.total + ' 回の評価は、どれも何も測れていません。') });
    const L = A.latest;
    if (L && L.conclusion !== 'success') {
      atl.push({ tone: 'muted', icon: 'note', title: L.measured === false ? t(lang, 'The latest run (' + when(L.at, lang) + ') stopped before evaluating', '最新の回（' + when(L.at, lang) + '）は評価の前に止まりました') : t(lang, 'The latest run (' + when(L.at, lang) + ') did not pass', '最新の回（' + when(L.at, lang) + '）は通りませんでした'),
        detail: L.why && L.why.length ? t(lang, 'The run says: ', '実行の記録: ') + L.why[0] : '' });
    }
    /* (ops-next) the half that needs no session — measured every night even while the live half cannot be.
       It is IntMap's own code between the model and the map, not Atlas's answers, and the row says so. */
    const O = A.offline;
    if (O && O.replay && O.reach) {
      atl.push({ tone: O.replay.clean === O.replay.cassettes ? 'ok' : 'warn', icon: 'gauge',
        title: t(lang, 'Measured without signing in' + (O.at ? ' (' + when(O.at, lang) + ')' : ''), 'ログイン不要の部分の計測' + (O.at ? '（' + when(O.at, lang) + '）' : '')),
        detail: t(lang, O.replay.clean + ' of ' + O.replay.cassettes + ' recorded Atlas turns still run as recorded. The words of the answer-key questions alone (word search, not meaning) reach ' + O.reach.reached + ' of the ' + O.reach.pairs + ' capabilities their answers use. This checks IntMap’s own code, not the answers.',
          '記録した Atlas の手順 ' + O.replay.cassettes + ' 本のうち ' + O.replay.clean + ' 本が記録どおりに動きます。解答つきの質問の言葉だけで（語の検索のみ・意味の検索なし）、答えに要る能力 ' + O.reach.pairs + ' 件のうち ' + O.reach.reached + ' 件に届きます。これは IntMap 自身のコードの確認で、答えの評価ではありません。') });
    }
  }
  out.sections.push({ id: 'atlas', title: t(lang, 'Atlas quality check', 'Atlas の品質評価'), rows: atl });

  out.tone = notes.includes('offline') ? 'bad' : notes.length ? 'warn' : 'ok';
  out.headline = notes.includes('offline') ? t(lang, 'You are offline', 'オフラインです')
    : notes.includes('layers') ? t(lang, 'Some layers could not be drawn', '描けていないレイヤーがあります')
      : notes.includes('upstream') ? t(lang, 'IntMap is working; some data sources are not answering', 'IntMap は動いています。一部のデータ元が応答していません')
        : t(lang, 'Everything is working', 'すべて動いています');
  return out;
}

/* ── what the browser says right now ─────────────────────────────────────────────────────────── */

async function shellStored() {
  try {
    if (!('serviceWorker' in navigator) || typeof caches === 'undefined') return null;
    if (!navigator.serviceWorker.controller) return false;
    const keys = await caches.keys();
    /* sw.js names the app's copy `intmap-shell-<build>` (SHELL_CACHE) */
    return keys.some((k) => String(k).startsWith('intmap-shell-'));
  } catch (_) { return null; }
}
async function storageMB() {
  try { const e = await navigator.storage.estimate(); return e && e.usage ? Math.round(e.usage / 1048576) : null; } catch (_) { return null; }
}
function activeLayerCount() {
  const sec = document.getElementById('layer-active-section');
  return sec ? sec.querySelectorAll('.active-lyr-chip').length : 0;
}

/** everything the page shows, gathered now. `ctx.layers()` is js/layer-state.js's snapshot, handed in */
async function gather(ctx) {
  const lang = docLang();
  const [bundle, shell, mb] = await Promise.all([loadStatus(), shellStored(), storageMB()]);
  const probs = [];
  try {
    const snap = ctx && typeof ctx.layers === 'function' ? ctx.layers() : [];
    for (const r of (Array.isArray(snap) ? snap : [])) {
      if (r.state !== 'failed' && r.state !== 'unobserved' && r.state !== 'nodata') continue;
      /* the record's own detail already carries the supplier's sentence once js/layer-state.js has joined it */
      const row = (!r.upstream && r.url) ? upstreamFor(bundle, requestHost(r.url)) : null;
      probs.push({ label: r.label, state: r.state, detail: r.detail || r.message || '',
        upstream: row ? upstreamSentence(row, lang, bundle.upstream && bundle.upstream.measuredAt) : '' });
    }
  } catch (_) { /* no layer state yet */ }
  return { lang, model: { bundle: usable(bundle) ? bundle : null, online: navigator.onLine !== false, shell, storageMB: mb, layersOn: activeLayerCount(), layerProblems: probs } };
}

/** for js/layer-state.js: last night's row for a failed request (plain data, for Atlas) */
export async function upstreamRow(url) {
  const b = await loadStatus(); if (!usable(b)) return null;
  const r = upstreamFor(b, requestHost(url));
  return r ? { host: r.host, verdict: r.verdict, status: r.status, lastAlive: r.lastAlive || null, downSince: r.downSince || null, measuredAt: b.upstream.measuredAt } : null;
}
/** for the data-sources lists: a sentence for a credit whose link is `url`, when a host behind it is down */
export function sourceNote(bundle, url, lang) {
  const rows = upstreamsForSource(bundle, url).filter(down);
  if (!rows.length) return '';
  return rows.map((r) => upstreamSentence(r, lang, bundle.upstream && bundle.upstream.measuredAt) + (rows.length > 1 ? ' (' + r.host + ')' : '')).join(' ');
}

/**
 * (ops-next) for the data-sources lists: the RECORD of the hosts behind a credit, over every night the bundle
 * holds — said for every credit the nightly check measures, not only the failing ones, because «this source
 * has answered all of the last 30 checks» is what a reader weighing the data wants to know. '' when no host
 * behind the link is measured. Several hosts: the one sentence when all of them answered every check, else
 * one sentence per host that did not.
 */
export function sourceRecord(bundle, url, lang) {
  const rows = upstreamsForSource(bundle, url);
  const recs = rows.map((r) => ({ r, s: seriesOf(bundle, r.host), k: recordOf(seriesOf(bundle, r.host)) })).filter((x) => x.k.measured);
  if (!recs.length) return '';
  const short = recs.filter((x) => x.k.answered < x.k.measured);
  if (!short.length) return recordSentence(recs.reduce((m, x) => (x.k.measured > m.k.measured ? x : m)).s, lang);
  return short.map((x) => recordSentence(x.s, lang) + (recs.length > 1 ? ' (' + x.r.host + ')' : '')).join(' ');
}

/** for Atlas (`diagnose`): the page as plain lines — the same model, no DOM */
export async function describe(ctx) {
  const { lang, model } = await gather(ctx);
  const s = composeStatus(model, lang);
  const lines = [s.headline];
  for (const sec of s.sections) {
    lines.push('', sec.title);
    for (const r of sec.rows) lines.push('- ' + r.title + (r.detail ? ' — ' + r.detail : ''));
    if (sec.record) lines.push('- ' + sec.record.title + ' — ' + sec.record.detail);
  }
  return { text: lines.join('\n'), status: s };
}

/* ── the page ────────────────────────────────────────────────────────────────────────────────── */
const CSS = `
#im-status .modal-content{ width:min(560px,94vw); max-width:none; padding:22px 20px 18px; }
#im-status .ims-head{ display:flex; align-items:center; gap:12px; margin:0 34px 14px 0; }
#im-status .ims-badge{ width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex:0 0 auto; color:#fff; background:var(--ims-tone); }
#im-status .ims-badge svg{ width:22px; height:22px; }
#im-status h3{ margin:0; font-size:18px; line-height:1.25; }
#im-status .ims-sub{ margin:2px 0 0; font-size:12px; color:var(--text-muted); }
#im-status .ims-sec{ margin:14px 0 0; }
#im-status .ims-sec h4{ margin:0 0 6px 4px; font-size:12px; font-weight:600; letter-spacing:.02em; text-transform:uppercase; color:var(--text-muted); }
#im-status .ims-group{ border-radius:14px; background:rgba(128,128,128,0.09); overflow:hidden; }
#im-status .ims-row{ display:flex; gap:10px; padding:11px 14px; min-height:44px; box-sizing:border-box; align-items:flex-start; }
#im-status .ims-row + .ims-row{ border-top:1px solid rgba(128,128,128,0.16); }
#im-status .ims-ic{ flex:0 0 auto; width:18px; height:18px; margin-top:1px; color:var(--ims-tone); }
#im-status .ims-ic svg{ width:18px; height:18px; }
#im-status .ims-t{ font-size:14px; line-height:1.35; color:var(--text-main); }
#im-status .ims-d{ font-size:12.5px; line-height:1.45; color:var(--text-muted); margin-top:2px; overflow-wrap:anywhere; }
#im-status [data-tone="ok"]{ --ims-tone:#34c759; }
#im-status [data-tone="warn"]{ --ims-tone:var(--widget-warning,#ff9f0a); }
#im-status [data-tone="bad"]{ --ims-tone:var(--widget-danger,#ff3b30); }
#im-status [data-tone="muted"]{ --ims-tone:var(--text-muted); }
#im-status details{ margin-top:8px; }
#im-status summary{ cursor:pointer; font-size:13px; color:var(--primary-color); padding:10px 4px; min-height:44px; box-sizing:border-box; }
#im-status .ims-foot{ display:flex; gap:8px; flex-wrap:wrap; margin-top:16px; }
#im-status .ims-foot .ai-test-btn{ flex:1 1 160px; min-height:44px; }
#im-status .ims-record{ margin-top:8px; border-radius:14px; background:rgba(128,128,128,0.09); overflow:hidden; }
#im-status .ims-bars{ display:flex; align-items:flex-end; gap:2px; height:40px; padding:12px 14px 4px; }
#im-status .ims-bar{ flex:1 1 0; max-width:14px; min-width:3px; border-radius:2px; background:var(--ims-tone); }
#im-status .ims-strip{ display:flex; gap:2px; margin-top:6px; }
#im-status .ims-cell{ width:8px; height:12px; border-radius:2px; background:var(--ims-tone); flex:0 0 auto; }
#im-status .ims-cell[data-tone="none"]{ background:transparent; box-shadow:inset 0 0 0 1px rgba(128,128,128,0.3); }
#im-status [data-tone="none"]{ --ims-tone:transparent; }
@media (forced-colors: active){ #im-status .ims-badge{ border:1px solid CanvasText; } #im-status .ims-bar, #im-status .ims-cell{ border:1px solid CanvasText; } }
`;
function ensureCSS() {
  if (document.getElementById('im-status-css')) return;
  const st = document.createElement('style'); st.id = 'im-status-css'; st.textContent = CSS; document.head.appendChild(st);
}
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
function rowNode(r) {
  const row = el('div', 'ims-row'); row.dataset.tone = r.tone || 'muted';
  const ic = el('span', 'ims-ic'); ic.setAttribute('aria-hidden', 'true');
  try { ic.appendChild(iconNode(r.icon || 'dot')); } catch (_) { /* no picture */ }
  const body = el('div', '');
  body.appendChild(el('div', 'ims-t', r.title));
  if (r.detail) body.appendChild(el('div', 'ims-d', r.detail));
  if (r.series) body.appendChild(stripNode(r.series));
  row.append(ic, body);
  return row;
}
/* (ops-next) one cell per measured night of one source — the words are in the row's detail (recordSentence),
   so the picture is hidden from assistive technology rather than read out cell by cell */
function stripNode(series) {
  const s = el('div', 'ims-strip'); s.setAttribute('aria-hidden', 'true');
  for (const c of String(series)) { const k = el('span', 'ims-cell'); k.dataset.tone = CELL_TONE[c] || 'muted'; s.appendChild(k); }
  return s;
}
/* (ops-next) one bar per night: its height the share of the measured sources that answered; green when every
   measured source answered, amber when any did not. No threshold decides a colour — only «all» or «not all». */
function barsNode(rec) {
  const g = el('div', 'ims-bars'); g.setAttribute('aria-hidden', 'true');
  for (const n of rec.nights) {
    const b = el('span', 'ims-bar');
    const share = n.measured ? n.answered / n.measured : 0;
    b.dataset.tone = !n.measured ? 'muted' : n.answered === n.measured ? 'ok' : 'warn';
    b.style.height = Math.max(8, Math.round(share * 100)) + '%';
    g.appendChild(b);
  }
  return g;
}
const HEAD_ICON = { ok: 'check-circle', warn: 'warning', bad: 'warning' };

function render(root, s, lang) {
  const panel = root.querySelector('.modal-content');
  panel.replaceChildren();
  const x = el('button', 'ims-x'); x.type = 'button'; x.setAttribute('aria-label', t(lang, 'Close', '閉じる'));
  x.style.cssText = 'position:absolute;top:12px;right:12px;width:44px;height:44px;border:none;background:transparent;color:var(--text-muted);font-size:22px;cursor:pointer;';
  x.textContent = '×'; x.addEventListener('click', close);
  const head = el('div', 'ims-head'); head.dataset.tone = s.tone;
  const badge = el('div', 'ims-badge'); badge.setAttribute('aria-hidden', 'true');
  try { badge.appendChild(iconNode(HEAD_ICON[s.tone] || 'info')); } catch (_) { /* no picture */ }
  const hb = el('div', '');
  const h = el('h3', '', s.headline); h.id = 'im-status-title';
  hb.append(h, el('p', 'ims-sub', t(lang, 'IntMap, now — read when you opened this', 'IntMap のいま — 開いた時点の状態')));
  head.append(badge, hb);
  panel.append(x, head);
  for (const sec of s.sections) {
    const box = el('section', 'ims-sec'); box.dataset.sec = sec.id;
    const h4 = el('h4', '', sec.title); h4.id = 'ims-h-' + sec.id; box.setAttribute('aria-labelledby', h4.id);
    const g = el('div', 'ims-group'); g.setAttribute('role', 'list');
    for (const r of sec.rows) { const n = rowNode(r); n.setAttribute('role', 'listitem'); g.appendChild(n); }
    box.append(h4, g);
    if (sec.record) {
      /* not an .ims-group: the section's rows are «one count row and one per supplier down» (tests/ui-a11y-polish.spec.js) */
      const rg = el('div', 'ims-record');
      rg.appendChild(rowNode({ tone: sec.record.pct === 100 ? 'ok' : 'muted', icon: 'chart', title: sec.record.title, detail: sec.record.detail }));
      rg.appendChild(barsNode(sec.record));
      box.appendChild(rg);
    }
    if (sec.all && sec.all.length) {
      const d = el('details', '');
      d.appendChild(el('summary', '', t(lang, 'All ' + sec.all.length + ' sources and their last answer', '全 ' + sec.all.length + ' 件のデータ元と最後の応答')));
      const ga = el('div', 'ims-group'); ga.setAttribute('role', 'list');
      for (const r of sec.all) { const n = rowNode({ tone: r.tone, icon: 'dot', title: r.title, detail: r.host + ' — ' + r.detail, series: r.series }); n.setAttribute('role', 'listitem'); ga.appendChild(n); }
      d.appendChild(ga); box.appendChild(d);
    }
    panel.appendChild(box);
  }
  const foot = el('div', 'ims-foot');
  const again = el('button', 'ai-test-btn', t(lang, 'Check again', 'もう一度確認'));
  again.type = 'button'; again.addEventListener('click', () => { bundleP = null; open(); });
  const src = el('a', 'ai-test-btn', t(lang, 'Data sources page', 'データ出典ページ'));
  src.href = './sources.html'; src.target = '_blank'; src.rel = 'opener';
  src.style.cssText = 'display:flex;align-items:center;justify-content:center;text-decoration:none;box-sizing:border-box;';
  /* (ops-next) what changed, beside what is working — the updates page scripts/whats-new.mjs builds */
  const upd = el('a', 'ai-test-btn', t(lang, 'What’s new', '新着'));
  upd.href = lang === 'jp' ? './ja/updates.html' : './updates.html'; upd.target = '_blank'; upd.rel = 'noopener';
  upd.style.cssText = src.style.cssText;
  foot.append(again, src, upd);
  panel.appendChild(foot);
}

/** open (or refresh) the page; resolves once it is drawn */
let lastCtx = null;
export async function open(ctx) {
  if (ctx) lastCtx = ctx;
  ensureCSS();
  let root = document.getElementById('im-status');
  if (!root) {
    root = el('div', 'modal-overlay'); root.id = 'im-status';
    const panel = el('div', 'modal-content'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'im-status-title'); panel.setAttribute('aria-busy', 'true');
    panel.appendChild(el('p', 'ims-sub', t(docLang(), 'Reading…', '確認しています…')));
    root.appendChild(panel); document.body.appendChild(root);
    try { window.IntMapDialog.adopt(root, { panel, labelledby: 'im-status-title', backdrop: true }); } catch (_) { /* no registry: Escape and the trap are lost, the page is not */ }
  }
  root.style.display = 'flex';
  const { lang, model } = await gather(lastCtx);
  render(root, composeStatus(model, lang), lang);
  root.querySelector('.modal-content').removeAttribute('aria-busy');
  return root;
}
export function close() { const r = document.getElementById('im-status'); if (r) r.style.display = 'none'; }
export function shown() { const r = document.getElementById('im-status'); return !!r && r.style.display !== 'none'; }
/* the language changes the words, not the facts: an open page is drawn again in the new language */
try { bus.on('intmap-lang', () => { if (shown()) open(); }); } catch (_) { /* headless */ }

/* ============================================================================
 *  IntMap · js/connections-panel.js — 「このページの通信」: WHO THIS PAGE HAS TALKED TO, HELD AGAINST WHAT IntMap SAYS   (security-next)
 * ----------------------------------------------------------------------------
 *  The reader-facing half of js/connection-watch.js. That file records, from the browser's own accounts, every
 *  host this page has contacted since it opened; this one holds each host against IntMap's published statement
 *  of where its code connects and what each place is sent (data/connection-ledger.json — derived from
 *  scripts/outbound-hosts.json, the ledger check:datagov holds against the source and against Privacy §4).
 *
 *  WHAT A HOST CAN BE, and each is said in words of its own:
 *    · stated     — the statement names it and says what it is sent. Grouped by WHAT IS SENT, most personal
 *                   first, because that is the question a reader brings («who has my location?»).
 *    · unlisted   — the statement does not name it. Some hosts are chosen at run time by the data itself (a
 *                   webcam's image server, an article's publisher, a tile server the reader typed in) and the
 *                   policy describes them by kind; anything else is a gap in the statement or a defect, and
 *                   the reader is given the way to report it.
 *    · contradicts — the statement names it as a LINK only (never contacted) or as switched OFF (dormant), and
 *                   the page contacted it anyway. That is the statement being wrong, so it is shown first.
 *    · refused    — the page tried, and the Content Security Policy stopped it. Nothing left the browser.
 *  ⚠ 「COULD NOT READ」 IS NOT 「UNLISTED」. If the statement itself cannot be fetched, no host is called unlisted —
 *  the panel says it could not compare (.agents/rules/one-pass-or-a-reason.md §5).
 *  ⚠ WHAT THE PAGE CANNOT SEE IS SAID ON THE PAGE: requests inside embedded frames, and background workers while
 *  the offline helper (sw.js) does not control the page.
 *
 *  Reached from: Settings ▸ Privacy ▸ «This page's connections» (js/connection-watch.js wires the button) and
 *  Atlas (`system.connections`, js/atlas-cap-system.js — the summary as text, and `show:true` opens this).
 *  Words are en + jp (CONSTITUTION.md §7). No emoji: pictures are js/icons.js line icons.
 * ==========================================================================*/
import { jsonWithin } from './fetch-deadline.js';
import { hostMatches } from './host-match.js';
import { IntMapLang } from './lang-registry.js';
import { iconNode } from './icons.js';
import { connections, coverage } from './connection-watch.js';
import * as bus from './bus.js';

/* where the derived statement is shipped (scripts/connection-ledger.mjs OUT) */
const LEDGER_URL = './data/connection-ledger.json';
/* how long the page waits for its own origin's ~40 kB file before saying it could not read it.
   OBSERVED: same-origin JSON of this size answers in well under a second on Pages (the status page's
   35 kB bundle, js/service-status.js). EXPIRES: never in practice — it only separates slow from absent. */
const LEDGER_MS = 8000;

const t = (lang, en, jp) => IntMapLang.t(lang, en, jp);
const docLang = () => { try { return IntMapLang.normalise(document.documentElement.lang || 'en'); } catch (_) { return 'en'; } };
const isJp = (lang) => lang === 'jp' || lang === 'ja';
/* the reader's words held as DATA are pickArgs() rows (js/lang-registry.js): an ordinary call site the i18n gate can see,
   resolved at render time through t() — never by indexing, which would hand every other language the English */
const LA = IntMapLang.pickArgs();
const said = (lang, row) => t(lang, ...row);

/* ══ WHAT IS SENT, IN THE READER'S WORDS — one sentence per code of scripts/outbound-hosts.mjs SENDS, in the order a
   reader would worry about them. tests/security-next-checks.test.mjs holds the keys to the ledger's `sendsCodes`, so a
   code added there without a sentence here is a red test, not a heading that prints the code. */
export const SENDS_WORDS = Object.freeze({
  'content': LA('What you write or ask — sign-in, posts, questions to Atlas (IntMap\'s own backend)', 'あなたが書いたもの・尋ねたもの — ログイン、投稿、Atlas への質問（IntMap 自身の基盤）'),
  'credential-prefix': LA('The first 5 characters of a password\'s hash (the password itself never leaves)', 'パスワードのハッシュの先頭 5 文字（パスワード自体は送られません）'),
  'url': LA('A web address — the article you asked to read', 'ウェブアドレス — 読もうとした記事の URL'),
  'query-text': LA('Words — a place or topic you searched or opened', '言葉 — 検索した・開いた地名や話題'),
  'coordinates': LA('A point — the coordinates of a place you chose', '地点 — 選んだ場所の座標'),
  'area': LA('The map area on screen — which tiles to draw', '画面の地図範囲 — どのタイルを描くか'),
  'identifier': LA('An identifier — a country code, a flight or a satellite number', '識別子 — 国コード、便名、衛星番号など'),
  'page-visit': LA('That this page was visited', 'このページを訪れたこと'),
  'nothing': LA('Nothing about you or your map — a fixed request for public data', 'あなたや地図について何も送らない — 公開データの固定の取得'),
});
const SEND_ORDER = Object.keys(SENDS_WORDS);

/* ── the statement, once per page ─────────────────────────────────────────────────────────────── */
let ledgerP = null;
/** the derived ledger, or { unreadable: why } — never throws; asked again only after a failure */
export function loadLedger() {
  if (!ledgerP) {
    ledgerP = jsonWithin(LEDGER_URL, LEDGER_MS)
      .then((b) => (b && Array.isArray(b.hosts) ? b : { unreadable: 'shape' }))
      .catch((e) => ({ unreadable: (e && e.reason) || 'failed' }));
    ledgerP.then((b) => { if (b.unreadable) ledgerP = null; });
  }
  return ledgerP;
}

/** The ledger row that names `host` (exact names before patterns, the longest pattern first), or null.
    The port is not part of a ledger host, so it is not part of the question. */
export function rowFor(ledger, host) {
  const rows = (ledger && Array.isArray(ledger.hosts)) ? ledger.hosts : [];
  const h = String(host || '').toLowerCase().replace(/:\d+$/, '');
  let best = null;
  for (const r of rows) {
    if (r.host === h) return r;
    if (r.host.includes('*') && hostMatches(r.host, h) && (!best || r.host.length > best.host.length)) best = r;
  }
  return best;
}

/** Each observed host, judged. Pure: the panel, Atlas and the tests read the same answer.
    @returns {{ comparable, stated:{code,rows}[], unlisted, contradicts, refused, totals }} */
export function judge(snap, ledger) {
  const comparable = !!(ledger && Array.isArray(ledger.hosts));
  const hosts = (snap && Array.isArray(snap.hosts)) ? snap.hosts : [];
  const byCode = new Map(), unlisted = [], contradicts = [], unread = [];
  for (const h of hosts) {
    if (!comparable) { unread.push({ ...h, row: null }); continue; }
    const row = rowFor(ledger, h.host);
    const item = { ...h, row };
    if (!row) unlisted.push(item);
    else if (row.form === 'link' || row.form === 'dormant') contradicts.push(item);
    else {
      const code = (row.sends && SENDS_WORDS[row.sends.code]) ? row.sends.code : 'nothing';
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code).push(item);
    }
  }
  const byCount = (a, b) => b.count - a.count || a.host.localeCompare(b.host);
  const stated = SEND_ORDER.filter((c) => byCode.has(c)).map((code) => ({ code, rows: byCode.get(code).sort(byCount) }));
  const refused = ((snap && snap.blocked) || []).slice().sort(byCount);
  return {
    comparable, stated, unread: unread.sort(byCount), unlisted: unlisted.sort(byCount), contradicts: contradicts.sort(byCount), refused,
    totals: {
      hosts: hosts.length,
      requests: hosts.reduce((s, h) => s + h.count, 0),
      stated: stated.reduce((s, g) => s + g.rows.length, 0),
      unlisted: unlisted.length, contradicts: contradicts.length, refused: refused.length,
      self: (snap && snap.selfRequests) || 0, overflow: (snap && snap.overflow) || 0,
    },
  };
}

/* what kind of request it was — Resource Timing's initiatorType, in the reader's words. Two initiators that mean the same
   thing to a reader share one row (fetch and XHR are both «data»; a <link> and a CSS import both load styles or fonts). */
const DATA_WORDS = LA('data', 'データ'), STYLE_WORDS = LA('stylesheets/fonts', 'スタイル・フォント');
const KIND_WORDS = {
  img: LA('images', '画像'), fetch: DATA_WORDS, xmlhttprequest: DATA_WORDS, script: LA('scripts', 'スクリプト'),
  link: STYLE_WORDS, css: STYLE_WORDS, beacon: LA('beacons', 'ビーコン'),
  iframe: LA('embedded pages', '埋め込みページ'), websocket: LA('live connection', '常時接続'), worker: LA('from a background worker', 'バックグラウンド処理から'),
  other: LA('other', 'その他'), navigation: LA('pages', 'ページ'),
};
function kindsText(kinds, lang) {
  const parts = [];
  for (const k of Object.keys(kinds || {})) {
    const label = KIND_WORDS[k] ? said(lang, KIND_WORDS[k]) : k;
    if (!parts.some((p) => p.label === label)) parts.push({ label, n: 0 });
    parts.find((p) => p.label === label).n += kinds[k];
  }
  return parts.sort((a, b) => b.n - a.n).map((p) => p.label).join(isJp(lang) ? '・' : ', ');
}
const requestsText = (n, lang) => t(lang, n + (n === 1 ? ' request' : ' requests'), n + ' 回');
const whatOf = (row, lang) => (row ? ((isJp(lang) && row.whatJp) || row.what || '') : '');
const clock = (ms, lang) => { try { return new Date(ms).toLocaleTimeString(isJp(lang) ? 'ja-JP' : 'en-GB', { hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } };

/** The page as a model (headline, tone, sections of rows) — what render() draws and describe() reads as text. */
export function compose(snap, ledger, cov, lang) {
  const J = judge(snap, ledger), T = J.totals, c = cov || {};
  const sections = [];
  const hostRow = (h, tone, icon, extra) => {
    const bits = [];
    const what = whatOf(h.row, lang); if (what) bits.push(what);
    bits.push(requestsText(h.count, lang) + (Object.keys(h.kinds || {}).length ? ' · ' + kindsText(h.kinds, lang) : ''));
    if (extra) bits.push(extra);
    return { tone, icon, title: h.host + (h.scheme && !/^https?$/.test(h.scheme) ? ' (' + h.scheme + ')' : ''), detail: bits.join(' — '), host: h.host };
  };
  if (J.contradicts.length) sections.push({
    id: 'contradicts', title: t(lang, 'Contacted, although IntMap\'s statement says it is not', 'IntMap の記載と食い違う接続'),
    rows: J.contradicts.map((h) => hostRow(h, 'bad', 'warning', h.row.form === 'dormant'
      ? t(lang, 'The statement lists this as switched off.', '記載ではこの送信先は停止中です。')
      : t(lang, 'The statement lists this only as a link, never contacted.', '記載ではリンクとしてのみ扱い、接続しないことになっています。'))),
  });
  if (J.unlisted.length) sections.push({
    id: 'unlisted', title: t(lang, 'Not named in IntMap\'s statement', 'IntMap の記載に名前の無い接続先'),
    note: t(lang, 'Some addresses are chosen at run time by the data itself — a webcam\'s image server, the publisher of an article you opened, a tile server you added — and the Privacy Policy describes them by kind rather than by name. If none of those explains one of these, please report it.',
      '一部の接続先はデータ自体が実行時に決めます（ウェブカメラの画像サーバー、開いた記事の発行元、追加したタイルサーバーなど）。これらはプライバシーポリシーで名前ではなく種類として説明しています。どれにも当てはまらないものがあれば、報告してください。'),
    rows: J.unlisted.map((h) => hostRow(h, 'warn', 'question')),
  });
  if (!J.comparable && J.unread.length) sections.push({
    id: 'unread', title: t(lang, 'Contacted (could not be compared)', '接続先（照合できませんでした）'),
    rows: J.unread.map((h) => hostRow(h, 'muted', 'dot')),
  });
  for (const g of J.stated) {
    sections.push({
      id: 'sends-' + g.code, code: g.code, title: said(lang, SENDS_WORDS[g.code]),
      rows: g.rows.map((h) => hostRow(h, 'ok', 'check-circle',
        h.row.disclosure ? t(lang, 'Privacy Policy §4: «' + h.row.disclosure.en + '»', 'プライバシーポリシー §4:「' + h.row.disclosure.jp + '」') : '')),
    });
  }
  if (J.refused.length) sections.push({
    id: 'refused', title: t(lang, 'Refused by the page\'s security policy (nothing was sent)', 'このページのセキュリティポリシーが拒否したもの（何も送られていません）'),
    rows: J.refused.map((h) => ({ tone: 'muted', icon: 'shield', title: h.host, host: h.host,
      detail: t(lang, h.count + (h.count === 1 ? ' attempt' : ' attempts'), h.count + ' 回の試み') + (Object.keys(h.kinds || {}).length ? ' · ' + Object.keys(h.kinds).join(', ') : '') })),
  });
  /* what this page can and cannot witness — always shown, so a short list is never mistaken for a complete one */
  const cv = [];
  cv.push({ tone: c.page ? 'ok' : 'bad', icon: c.page ? 'check-circle' : 'warning', title: t(lang, 'Requests made by this page', 'このページ自身のリクエスト'),
    detail: c.page ? t(lang, 'reported by the browser (Resource Timing), including those made before this list opened', 'ブラウザが報告（Resource Timing）。この一覧を開く前のものも含みます')
      : t(lang, 'this browser does not report them, so this list cannot be complete', 'このブラウザは報告しないため、この一覧は完全ではありません') });
  cv.push({ tone: c.socket ? 'ok' : 'warn', icon: c.socket ? 'check-circle' : 'warning', title: t(lang, 'Live connections (WebSocket)', '常時接続（WebSocket）'),
    detail: c.socket ? t(lang, 'every one the page opens is recorded', 'ページが開くものはすべて記録します') : t(lang, 'not observed in this browser', 'このブラウザでは観測できません') });
  cv.push({ tone: c.worker ? 'ok' : 'warn', icon: c.worker ? 'check-circle' : 'warning', title: t(lang, 'Background workers (map tiles and data)', 'バックグラウンド処理（地図タイルとデータ）'),
    detail: c.worker
      ? t(lang, 'reported by IntMap\'s offline helper' + (snap && snap.workerWindows > 1 ? '; with ' + snap.workerWindows + ' IntMap tabs open, these may include the other tabs\' workers' : ''),
        'IntMap のオフライン補助が報告' + (snap && snap.workerWindows > 1 ? '（IntMap を ' + snap.workerWindows + ' タブ開いているため、他のタブの分を含むことがあります）' : ''))
      : t(lang, 'not visible right now — the offline helper does not control this page yet (it does after a reload)', '現在は見えません — オフライン補助がまだこのページを制御していません（再読み込み後に有効）') });
  cv.push({ tone: 'muted', icon: 'eye-off', title: t(lang, 'Inside embedded pages', '埋め込みページの中'),
    detail: t(lang, 'a page shown in a frame (e.g. a webcam\'s site) makes its own requests, which this page cannot see', '枠の中に表示されたページ（ウェブカメラのサイトなど）自身のリクエストは、このページからは見えません') });
  sections.push({ id: 'coverage', title: t(lang, 'What this list can see', 'この一覧に見えるもの'), rows: cv });

  const tone = J.contradicts.length ? 'bad' : (J.unlisted.length || !J.comparable) ? 'warn' : 'ok';
  const n = T.hosts;
  const headline = !J.comparable
    ? t(lang, 'This page has contacted ' + n + (n === 1 ? ' address' : ' addresses') + ' — IntMap\'s statement could not be read to compare', 'このページは ' + n + ' 件の接続先と通信しました — IntMap の記載を読めず照合できませんでした')
    : J.contradicts.length
      ? t(lang, n + (n === 1 ? ' address' : ' addresses') + ' contacted — ' + J.contradicts.length + ' contradict IntMap\'s statement', n + ' 件の接続先 — ' + J.contradicts.length + ' 件が IntMap の記載と食い違います')
      : J.unlisted.length
        ? t(lang, n + (n === 1 ? ' address' : ' addresses') + ' contacted — ' + J.unlisted.length + ' not named in IntMap\'s statement', n + ' 件の接続先 — ' + J.unlisted.length + ' 件は IntMap の記載に名前がありません')
        : t(lang, n + (n === 1 ? ' address' : ' addresses') + ' contacted — every one is in IntMap\'s statement', n + ' 件の接続先 — すべて IntMap の記載どおりです');
  const sub = t(lang, 'Since ' + clock(snap ? snap.since : Date.now(), lang) + ' · ' + T.requests + ' requests to other sites · ' + T.self + ' to IntMap itself' + (T.overflow ? ' · ' + T.overflow + ' more beyond the list\'s limit' : ''),
    clock(snap ? snap.since : Date.now(), lang) + ' から · 外部へ ' + T.requests + ' 回 · IntMap 自身へ ' + T.self + ' 回' + (T.overflow ? ' · 上限を超えた ' + T.overflow + ' 回' : ''));
  return { tone, headline, sub, sections, totals: T, comparable: J.comparable, judged: J };
}

/** The page as text and facts — what Atlas reads. Never opens anything. */
export async function describe(langIn) {
  const lang = langIn || docLang();
  const ledger = await loadLedger();
  const snap = connections.snapshot();
  const m = compose(snap, ledger.unreadable ? null : ledger, coverage(), lang);
  const lines = [m.headline, m.sub];
  for (const s of m.sections) {
    lines.push('', s.title);
    for (const r of s.rows) lines.push('- ' + r.title + (r.detail ? ' — ' + r.detail : ''));
  }
  const J = m.judged;
  return {
    text: lines.join('\n'), model: m,
    facts: {
      hosts: m.totals.hosts, requests: m.totals.requests, selfRequests: m.totals.self, comparable: m.comparable,
      unlisted: J.unlisted.map((h) => h.host), contradicts: J.contradicts.map((h) => ({ host: h.host, form: h.row.form })),
      refused: J.refused.map((h) => h.host),
      bySends: J.stated.map((g) => ({ sends: g.code, hosts: g.rows.map((h) => h.host) })),
      coverage: coverage(),
    },
  };
}

/** The whole record as a file the reader keeps — the observed hosts, each one's verdict and row, and the coverage. */
export function reportDocument(snap, ledger, cov) {
  const J = judge(snap, ledger);
  const verdict = (h) => ({ key: h.key, count: h.count, first: new Date(h.first).toISOString(), last: new Date(h.last).toISOString(), via: h.via, kinds: h.kinds,
    statement: h.row ? { host: h.row.host, form: h.row.form, what: h.row.what, sends: h.row.sends || null } : null });
  return {
    format: 'intmap-connections', version: 1,
    page: (typeof location !== 'undefined') ? location.origin + location.pathname : '',
    observedSince: new Date(snap.since).toISOString(), observedAt: new Date(snap.at).toISOString(),
    statement: J.comparable ? (ledger.src || 'data/connection-ledger.json') : null,
    coverage: cov, totals: J.totals,
    contradicts: J.contradicts.map(verdict), unlisted: J.unlisted.map(verdict),
    stated: J.stated.map((g) => ({ sends: g.code, hosts: g.rows.map(verdict) })),
    unread: J.unread.map(verdict),
    refusedByPolicy: J.refused.map((h) => ({ key: h.key, count: h.count, directives: Object.keys(h.kinds || {}) })),
  };
}

/* ── the page ────────────────────────────────────────────────────────────────────────────────── */
const CSS = `
#im-conn .modal-content{ width:min(580px,94vw); max-width:none; padding:22px 20px 18px; position:relative; }
#im-conn .imc-head{ display:flex; align-items:center; gap:12px; margin:0 40px 14px 0; }
#im-conn .imc-badge{ width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex:0 0 auto; color:#fff; background:var(--imc-tone); }
#im-conn .imc-badge svg{ width:22px; height:22px; }
#im-conn h3{ margin:0; font-size:17px; line-height:1.3; }
#im-conn .imc-sub{ margin:3px 0 0; font-size:12px; color:var(--text-muted); font-variant-numeric:tabular-nums; }
#im-conn .imc-live{ display:inline-flex; align-items:center; gap:5px; }
#im-conn .imc-live::before{ content:''; width:7px; height:7px; border-radius:50%; background:#34c759; }
#im-conn .imc-sec{ margin:14px 0 0; }
#im-conn .imc-sec h4{ margin:0 0 6px 4px; font-size:12px; font-weight:600; letter-spacing:.02em; color:var(--text-muted); }
#im-conn .imc-note{ margin:0 4px 8px; font-size:12px; line-height:1.5; color:var(--text-muted); }
#im-conn .imc-group{ border-radius:14px; background:rgba(128,128,128,0.09); overflow:hidden; }
#im-conn .imc-row{ display:flex; gap:10px; padding:10px 14px; min-height:44px; box-sizing:border-box; align-items:flex-start; }
#im-conn .imc-row + .imc-row{ border-top:1px solid rgba(128,128,128,0.16); }
#im-conn .imc-ic{ flex:0 0 auto; width:18px; height:18px; margin-top:1px; color:var(--imc-tone); }
#im-conn .imc-ic svg{ width:18px; height:18px; }
#im-conn .imc-t{ font-size:14px; line-height:1.35; color:var(--text-main); overflow-wrap:anywhere; }
#im-conn .imc-d{ font-size:12.5px; line-height:1.45; color:var(--text-muted); margin-top:2px; overflow-wrap:anywhere; }
#im-conn [data-tone="ok"]{ --imc-tone:#34c759; }
#im-conn [data-tone="warn"]{ --imc-tone:var(--widget-warning,#ff9f0a); }
#im-conn [data-tone="bad"]{ --imc-tone:var(--widget-danger,#ff3b30); }
#im-conn [data-tone="muted"]{ --imc-tone:var(--text-muted); }
#im-conn details.imc-sec > summary{ cursor:pointer; list-style:none; margin:0 0 6px 4px; font-size:12px; font-weight:600; color:var(--text-muted); min-height:32px; display:flex; align-items:center; gap:6px; }
#im-conn details.imc-sec > summary::-webkit-details-marker{ display:none; }
#im-conn details.imc-sec > summary::after{ content:''; width:7px; height:7px; margin-left:auto; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor; transform:rotate(-45deg); transition:transform .2s; }
#im-conn details.imc-sec[open] > summary::after{ transform:rotate(45deg); }
#im-conn details.imc-sec > summary b{ font-weight:600; color:var(--text-main); font-variant-numeric:tabular-nums; }
#im-conn .imc-foot{ display:flex; gap:8px; flex-wrap:wrap; margin-top:16px; }
#im-conn .imc-foot .ai-test-btn{ flex:1 1 150px; min-height:44px; display:flex; align-items:center; justify-content:center; text-decoration:none; box-sizing:border-box; }
#im-conn .imc-msg{ margin:8px 4px 0; font-size:12px; color:var(--text-muted); min-height:1em; }
@media (forced-colors: active){ #im-conn .imc-badge{ border:1px solid CanvasText; } }
`;
function ensureCSS() {
  if (document.getElementById('im-conn-css')) return;
  const st = document.createElement('style'); st.id = 'im-conn-css'; st.textContent = CSS; document.head.appendChild(st);
}
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
function rowNode(r) {
  const row = el('div', 'imc-row'); row.dataset.tone = r.tone || 'muted'; row.setAttribute('role', 'listitem');
  if (r.host) row.dataset.host = r.host;
  const ic = el('span', 'imc-ic'); ic.setAttribute('aria-hidden', 'true');
  try { ic.appendChild(iconNode(r.icon || 'dot')); } catch (_) { /* no picture */ }
  const body = el('div', '');
  body.appendChild(el('div', 'imc-t', r.title));
  if (r.detail) body.appendChild(el('div', 'imc-d', r.detail));
  row.append(ic, body);
  return row;
}
const HEAD_ICON = { ok: 'shield', warn: 'warning', bad: 'warning' };
/* the stated groups fold (a reader looks for the unusual first); the sections that need attention never do */
const FOLDS = (id) => id.startsWith('sends-') || id === 'coverage' || id === 'refused';

let lastLedger = null;
function render(root, m, lang) {
  const panel = root.querySelector('.modal-content');
  const keepScroll = panel.scrollTop;
  const opened = new Set([...panel.querySelectorAll('details.imc-sec[open]')].map((d) => d.dataset.sec));
  const msgText = (panel.querySelector('.imc-msg') || {}).textContent || '';
  panel.replaceChildren();
  const x = el('button', 'imc-x'); x.type = 'button'; x.setAttribute('aria-label', t(lang, 'Close', '閉じる'));
  x.style.cssText = 'position:absolute;top:12px;right:12px;width:44px;height:44px;border:none;background:transparent;color:var(--text-muted);font-size:22px;cursor:pointer;';
  x.textContent = '×'; x.addEventListener('click', close);
  const head = el('div', 'imc-head'); head.dataset.tone = m.tone;
  const badge = el('div', 'imc-badge'); badge.setAttribute('aria-hidden', 'true');
  try { badge.appendChild(iconNode(HEAD_ICON[m.tone] || 'network')); } catch (_) { /* no picture */ }
  const hb = el('div', '');
  const h = el('h3', '', m.headline); h.id = 'im-conn-title';
  const sub = el('p', 'imc-sub');
  sub.append(el('span', 'imc-live', t(lang, 'Live', 'ライブ')), document.createTextNode(' · ' + m.sub));
  hb.append(h, sub);
  head.append(badge, hb);
  panel.append(x, head);
  for (const s of m.sections) {
    const fold = FOLDS(s.id);
    const box = el(fold ? 'details' : 'section', 'imc-sec'); box.dataset.sec = s.id;
    if (fold && opened.has(s.id)) box.open = true;
    const h4 = el(fold ? 'summary' : 'h4', '');
    h4.id = 'imc-h-' + s.id;
    if (fold) { h4.append(document.createTextNode(s.title + ' ')); if (s.id !== 'coverage') h4.appendChild(el('b', '', String(s.rows.length))); }
    else { h4.textContent = s.title; box.setAttribute('aria-labelledby', h4.id); }
    box.appendChild(h4);
    if (s.note) box.appendChild(el('p', 'imc-note', s.note));
    const g = el('div', 'imc-group'); g.setAttribute('role', 'list');
    for (const r of s.rows) g.appendChild(rowNode(r));
    box.appendChild(g);
    panel.appendChild(box);
  }
  const foot = el('div', 'imc-foot');
  const dl = el('button', 'ai-test-btn', t(lang, 'Download this record (JSON)', 'この記録をダウンロード（JSON）'));
  dl.type = 'button'; dl.id = 'imc-download';
  dl.addEventListener('click', () => {
    const r = download();
    const msg = panel.querySelector('.imc-msg');
    if (msg) msg.textContent = r ? t(lang, 'Saved ' + r + ' to this device — nothing was sent.', r + ' をこの端末に保存しました（どこにも送信していません）。') : t(lang, 'Could not save the file.', 'ファイルを保存できませんでした。');
  });
  const pol = el('button', 'ai-test-btn', t(lang, 'Privacy Policy', 'プライバシーポリシー'));
  pol.type = 'button';
  /* the in-app policy is opened through its own link (js/legal.js owns that handler); a page without it gets the public page */
  pol.addEventListener('click', () => { const lp = document.getElementById('link-privacy'); if (lp) { close(); lp.click(); return; } window.open('./privacy.html', '_blank', 'noopener'); });
  const rep = el('a', 'ai-test-btn', t(lang, 'Report a concern', '懸念を報告する'));
  rep.href = isJp(lang) ? './ja/security.html#report' : './security.html#report'; rep.target = '_blank'; rep.rel = 'noopener';
  foot.append(dl, pol, rep);
  panel.appendChild(foot);
  panel.appendChild(el('p', 'imc-msg', msgText));
  panel.scrollTop = keepScroll;
}

function download() {
  try {
    const snap = connections.snapshot();
    const doc = reportDocument(snap, lastLedger, coverage());
    const name = 'intmap-connections-' + new Date(snap.at).toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json';
    const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) { /* nothing to revoke */ } }, 30000);
    return name;
  } catch (_) { return ''; }
}

/* the list is redrawn while it is open, at most once per REDRAW_MS — a map pan makes dozens of tile requests a second,
   and a list that redraws on each one cannot be read. OBSERVED by eye, not measured: half a second keeps the counts
   visibly live without the rows jumping under the reader's finger. */
const REDRAW_MS = 500;
let unsub = null, pending = null;
function paint() {
  const root = document.getElementById('im-conn');
  if (!root || root.style.display === 'none') return;
  const lang = docLang();
  render(root, compose(connections.snapshot(), lastLedger, coverage(), lang), lang);
}
function schedule() { if (pending) return; pending = setTimeout(() => { pending = null; paint(); }, REDRAW_MS); }

/** open the list; resolves once it is drawn */
export async function open() {
  ensureCSS();
  let root = document.getElementById('im-conn');
  if (!root) {
    root = el('div', 'modal-overlay'); root.id = 'im-conn';
    const panel = el('div', 'modal-content'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'im-conn-title'); panel.setAttribute('aria-busy', 'true');
    panel.appendChild(el('p', 'imc-sub', t(docLang(), 'Reading…', '確認しています…')));
    root.appendChild(panel); document.body.appendChild(root);
    try { window.IntMapDialog.adopt(root, { panel, labelledby: 'im-conn-title', backdrop: true, close }); } catch (_) { /* no registry: Escape and the trap are lost, the list is not */ }
  }
  root.style.display = 'flex';
  const L = await loadLedger();
  lastLedger = L.unreadable ? null : L;
  paint();
  root.querySelector('.modal-content').removeAttribute('aria-busy');
  if (!unsub) unsub = connections.on(schedule);
  return root;
}
export function close() {
  const r = document.getElementById('im-conn'); if (r) r.style.display = 'none';
  if (unsub) { unsub(); unsub = null; }
}
export function shown() { const r = document.getElementById('im-conn'); return !!r && r.style.display !== 'none'; }
/* the language changes the words, not the facts */
try { bus.on('intmap-lang', () => { if (shown()) paint(); }); } catch (_) { /* headless */ }

/* ============================================================================
 *  IntMap · CLASS RESULTS — the teacher's board   (js/quest-class-board.js)   (wave4-education)
 * ----------------------------------------------------------------------------
 *  What a teacher sees after giving a class a learn quest as a CLASS SET (js/quest-class.js): every set they made,
 *  and for each one
 *    · the class link to hand out (copy / share) and whether the set still takes answers (open / close);
 *    · who has handed in, each student's total and their score on every question;
 *    · each question's class mean, the HARDEST question (lowest mean — the one to go back over), and what the
 *      class answered: for a place question the median distance and every student's tap DRAWN ON THE MAP around
 *      the true place; for a year question the median error, how many were exact, and the spread of the years;
 *    · the whole table as CSV for the teacher's own mark book; removing one hand-in (a name that should not be
 *      there); deleting the set (its hand-ins go with it).
 *  ⚠ THE SCORES ARE THE ENGINE'S. Nothing scored is stored: the board asks js/quest-panel.js questionsOf() for the
 *    set's questions and its engine, and js/quest-class.js tally() scores every raw answer with that engine — the
 *    student's panel and the teacher's board cannot disagree about a score.
 *  ⚠ WHILE A SET IS OPEN AND ON SCREEN the board reads the hand-ins again every BOARD_REFRESH_MS (everyTick — the
 *    runtime's one timer), so a teacher at the front of the room sees the class arrive; it stops when the set is
 *    closed, another view is shown or the board is closed.
 *  Doors: the quest menu's «Your class sets», the end of a set's «Use with a class» (js/quest-panel.js openClassBoard)
 *  and Atlas (`learn.class`, js/atlas-cap-learn.js), which reads the board's state (what openBoard resolves with) after it acts.
 *  Loaded on demand; no window global. IntMap-authored text is en + jp (CONSTITUTION.md §7). No emoji.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { icon } from './icons.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { everyTick, stopTick } from './runtime.js';
import * as bus from './bus.js';
import './safe-html.js';
import { kindTitle, QUEST_KIND_IDS, SET_LENGTHS, QUEST_MAX } from './quest-engine.js';
import * as CLASS from './quest-class.js';
import { questionsOf, questLink, freshSeed } from './quest-panel.js';

const GE = () => IntMapGeoEngine;
const H = (s) => globalThis.IntMapSafe.html(String(s == null ? '' : s));
let HOST = null;
const lang = () => (HOST && HOST.lang) || 'en';
const t = IntMapLang.pick(() => lang());
const fmt = (v) => Number(v).toLocaleString(lang() === 'jp' ? 'ja-JP' : 'en-GB');

/* How often an open set on screen is read again. ⚠ §4 of .agents/rules/no-ad-hoc-hardcoding.md:
     1. observation — none measured: an estimate of «a teacher watching the class finish»; one read is one small
        PostgREST select of at most 400 rows (the table's ceiling), so the cost is the database's, not the page's.
     2. expiry      — if a realtime channel replaces the read, or a teacher reports the board lagging the room.
     3. source      — this line. */
const BOARD_REFRESH_MS = 15000;

/* ══ STATE ═══════════════════════════════════════════════════════════════════════════════════════ */
let panel = null, view = 'list', sets = null, cur = null, err = null, tick = null, langOff = null, armDelete = false, shownQ = null;
/* cur = { set, qs, engine, rows, T } — the set on screen, its questions, the engine, its hand-ins and their tally */

/** what the board shows now — openBoard() resolves with it, and that is what Atlas reads after it acts */
function boardState() {
  const open = !!(panel && panel.isConnected && panel.style.display !== 'none');
  return { open, view: open ? view : 'closed', signedIn: !!(HOST && HOST.user), sets: sets ? sets.length : null,
    set: cur && cur.set ? { code: cur.set.code, kind: cur.set.kind, n: cur.set.n, title: cur.set.title || '', open: !!cur.set.open,
      link: linkOf(cur.set), handedIn: cur.T ? cur.T.count : null } : null, error: err };
}
/** the class link of a set — this page's address, the set's quest and its code */
export function linkOf(set) {
  const base = questLink(set.kind, set.seed, set.n);
  return base.slice(0, base.indexOf('?')) + CLASS.classQuery(set.kind, set.seed, set.n, set.code);
}

/* ══ THE MAP — a place question's taps, around the true place ═══════════════════════════════════════ */
const SRC = 'quest-class-src', L_PT = 'quest-class-pt', L_TRUE = 'quest-class-true';
function clearMap() { try { GE().layers.remove(L_TRUE); GE().layers.remove(L_PT); GE().layers.removeSource(SRC); } catch (_) { } shownQ = null; }
function drawTaps(i) {
  if (!cur || !cur.T) return;
  const q = cur.qs[i]; if (!q || q.kind !== 'where') return;
  const feats = [{ type: 'Feature', properties: { k: 'true' }, geometry: { type: 'Point', coordinates: q.at } }];
  const pts = [];
  cur.T.students.forEach((s) => { const a = CLASS.decodeAnswer('where', s.answers[i]); if (a) { pts.push([a.lng, a.lat]); feats.push({ type: 'Feature', properties: { k: 'tap', name: s.name }, geometry: { type: 'Point', coordinates: [a.lng, a.lat] } }); } });
  /* every point here is finite and in range by construction (js/quest-class.js decodeAnswer, the question's own place) */
  const fc = { type: 'FeatureCollection', features: feats };
  try {
    const L = GE().layers;
    if (L.hasSource(SRC)) L.setSourceData(SRC, fc); else L.addSource(SRC, { type: 'geojson', data: fc });
    if (!L.has(L_PT)) L.add({ id: L_PT, type: 'circle', source: SRC, filter: ['==', ['get', 'k'], 'tap'],
      paint: { 'circle-radius': 5, 'circle-color': '#ff3b30', 'circle-opacity': 0.75, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } });
    if (!L.has(L_TRUE)) L.add({ id: L_TRUE, type: 'circle', source: SRC, filter: ['==', ['get', 'k'], 'true'],
      paint: { 'circle-radius': 8, 'circle-color': '#34c759', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 } });
    GE().render.claim([SRC], 'map.questClass', { clear: clearMap });
  } catch (_) { }
  shownQ = i;
  /* the frame holds the true place and every tap: the bounds of all, the short way round the antimeridian */
  try {
    const all = pts.concat([q.at]);
    let w = Math.min.apply(null, all.map((p) => p[0])), e = Math.max.apply(null, all.map((p) => p[0]));
    if (e - w > 180) { const east = all.map((p) => (p[0] < 0 ? p[0] + 360 : p[0])); w = Math.min.apply(null, east); e = Math.max.apply(null, east); }
    const s = Math.min.apply(null, all.map((p) => p[1])), n = Math.max.apply(null, all.map((p) => p[1]));
    if (all.length > 1) GE().camera.fitBounds([[w, s], [e, n]], { padding: 80, maxZoom: 7, duration: 900 });
    else GE().camera.flyTo({ center: q.at, zoom: 5, duration: 900 });
  } catch (_) { }
}

/* ══ THE PANEL ════════════════════════════════════════════════════════════════════════════════════ */
function ensure() {
  if (!document.getElementById('im-qcb-css')) { const st = document.createElement('style'); st.id = 'im-qcb-css'; st.textContent = CSS; document.head.appendChild(st); }
  if (!langOff) langOff = bus.on('intmap-lang', () => { if (panel && panel.style.display !== 'none') paint(); });
  if (panel && panel.isConnected) return panel;
  panel = document.createElement('div'); panel.className = 'tool-panel qcb'; panel.id = 'quest-class-panel';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'qcb-title');
  (document.getElementById('map-container') || document.body).appendChild(panel);
  return panel;
}
function header(sub, back) {
  return '<div class="tp-header qcb-head">' + (back ? '<button type="button" class="qcb-back" aria-label="' + H(t('All class sets', 'クラスのセット一覧')) + '">' + icon('chevronL') + '</button>' : '')
    + '<span class="tp-title" id="qcb-title">' + icon('users') + ' ' + H(t('Class sets', 'クラスのセット')) + '</span>'
    + '<button type="button" class="tp-close" aria-label="' + H(t('Close', '閉じる')) + '">×</button></div>' + (sub ? '<div class="qcb-sub">' + sub + '</div>' : '');
}
function wire() {
  const x = panel.querySelector('.tp-close'); if (x) x.addEventListener('click', () => closeBoard());
  const b = panel.querySelector('.qcb-back'); if (b) b.addEventListener('click', () => { showList(); });
  try { if (HOST && HOST.makeDraggable) HOST.makeDraggable(panel, panel.querySelector('.tp-header')); } catch (_) { }
}
const setName = (s) => s.title || kindTitle(s.kind, lang()) + ' · ' + t(s.n + ' questions', s.n + ' 問');
const when = (iso) => { try { return new Date(iso).toLocaleDateString(lang() === 'jp' ? 'ja-JP' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' }); } catch (_) { return String(iso || '').slice(0, 10); } };
const km = (v) => (v < 10 ? v.toFixed(1) : fmt(Math.round(v))) + ' km';

function paint() {
  if (!panel) return;
  if (!(HOST && HOST.user)) return paintSignIn();
  if (view === 'create') return paintCreate();
  if (view === 'set') return paintSet();
  return paintList();
}
function paintSignIn() {
  const p = ensure(); p.style.display = 'block';
  p.innerHTML = header(H(t('Give a class the same learn quest and see every student’s answers here.', 'クラスに同じ学ぶクエストを配り、生徒全員の答えをここで見ます。')))
    + '<div class="qcb-note">' + H(CLASS.classFailureText('sign_in', lang())) + ' ' + H(t('Students need no account.', '生徒にはアカウントは要りません。')) + '</div>'
    + '<button type="button" class="ai-test-btn qcb-go" id="qcb-signin">' + H(t('Sign in', 'ログイン')) + '</button>';
  wire();
  const b = p.querySelector('#qcb-signin');
  if (b) b.addEventListener('click', () => { try { if (HOST && HOST.openAuthModal) HOST.openAuthModal(); } catch (_) { } });
}
function paintList() {
  const p = ensure(); p.style.display = 'block';
  const rows = !sets ? '<div class="qcb-note">' + H(t('Reading your class sets…', 'クラスのセットを読み込んでいます…')) + '</div>'
    : !sets.length ? '<div class="qcb-note">' + H(t('No class sets yet. Play a learn quest, then choose «Use with a class» at the end — or make one here.', 'まだクラスのセットはありません。学ぶクエストを解き、最後の「クラスで使う」を選ぶか、ここで作ります。')) + '</div>'
    : '<div class="qcb-sets">' + sets.map((s, i) => '<button type="button" class="qcb-set" data-i="' + H(i) + '"><span><b>' + H(setName(s)) + '</b><small>'
      + H(when(s.created_at) + ' · ' + (s.title ? kindTitle(s.kind, lang()) + ' · ' + t(s.n + ' questions', s.n + ' 問') + ' · ' : '') + t(s.answered + ' handed in', s.answered + ' 人提出'))
      + '</small></span><span class="qcb-badge' + (s.open ? ' on' : '') + '">' + H(s.open ? t('Taking answers', '受付中') : t('Closed for answers', '締切')) + '</span></button>').join('') + '</div>';
  p.innerHTML = header(H(t('Every set you gave a class. Students’ names and answers are deleted with the set, a year after it was made.', 'クラスに配ったセットの一覧です。生徒の名前と答えは、セットを作ってから 1 年でセットとともに削除されます。')))
    + (err ? '<div class="qcb-err">' + H(CLASS.classFailureText(err, lang())) + '</div>' : '') + rows
    + '<div class="qcb-sec">' + H(t('Make a class set', 'クラスのセットを作る')) + '</div>'
    + '<div class="qcb-acts">' + QUEST_KIND_IDS.map((k) => '<button type="button" class="ai-test-btn" data-new="' + H(k) + '">' + icon(k === 'when' ? 'clock' : 'pin') + ' ' + H(kindTitle(k, lang())) + '</button>').join('') + '</div>';
  wire();
  p.querySelectorAll('.qcb-set').forEach((b) => b.addEventListener('click', () => { const s = sets[+b.getAttribute('data-i')]; if (s) showSet(s); }));
  p.querySelectorAll('[data-new]').forEach((b) => b.addEventListener('click', () => { showCreate({ kind: b.getAttribute('data-new') }); }));
}
/* ── making a set: the quest it is (given, or a new seed for a kind), its length and an optional title ── */
let draft = null;
function paintCreate() {
  const p = ensure(); p.style.display = 'block';
  const d = draft;
  p.innerHTML = header(H(t('Every student who opens the class link answers the same questions; their answers come back to this board.', 'クラスのリンクを開いた生徒は全員同じ問題を解き、答えがこのボードに届きます。')), true)
    + '<div class="qcb-q">' + H(kindTitle(d.kind, lang())) + (d.seed ? ' · ' + H(t('the set you just played', '今解いたセット')) : '') + '</div>'
    + (d.seed ? '' : '<label class="qcb-row">' + H(t('Questions', '問題数')) + ' <select id="qcb-n">' + SET_LENGTHS.map((v) => '<option value="' + H(v) + '"' + (v === d.n ? ' selected' : '') + '>' + H(v) + '</option>').join('') + '</select></label>')
    + '<label class="qcb-lab" for="qcb-title-in">' + H(t('Title (optional) — the students see it', '題（任意）——生徒にも表示されます')) + '</label>'
    + '<input type="text" id="qcb-title-in" maxlength="80" placeholder="' + H(t('e.g. Year 8 · Cities of Asia', '例: 2年1組 アジアの都市')) + '">'
    + '<div class="qcb-note">' + H(t('Ask students to type a first name or a class number — not a full name. Nothing else about them is sent.', '生徒には名字なしの名前か出席番号を入力するよう伝えてください。それ以外の情報は送られません。')) + '</div>'
    + (err ? '<div class="qcb-err">' + H(CLASS.classFailureText(err, lang())) + '</div>' : '')
    + '<button type="button" class="ai-test-btn qcb-go" id="qcb-make">' + icon('link') + ' ' + H(t('Make the class link', 'クラスのリンクを作る')) + '</button>';
  wire();
  const sel = /** @type {HTMLSelectElement|null} */ (p.querySelector('#qcb-n'));
  if (sel) sel.addEventListener('change', () => { d.n = +sel.value; });
  const mk = /** @type {HTMLButtonElement} */ (p.querySelector('#qcb-make'));
  mk.addEventListener('click', async () => {
    mk.disabled = true;
    const title = /** @type {HTMLInputElement} */ (p.querySelector('#qcb-title-in')).value;
    const r = await makeSet({ kind: d.kind, seed: d.seed, n: d.n, title });
    if (!r.ok) { mk.disabled = false; paint(); }
  });
}
/** make a set (a fresh seed when none is given) and show it. → { ok, set? , error? } */
async function makeSet(o) {
  const seed = o.seed || freshSeed();
  const r = await CLASS.createClassSet(HOST && HOST.DB, { kind: o.kind, seed, n: o.n, title: o.title });
  err = r.ok ? null : r.error;
  if (r.ok) { sets = null; draft = null; await showSet(r.set); }
  return r;
}

/* ── one set ── */
function paintSet() {
  const p = ensure(); p.style.display = 'block';
  const s = cur.set, T = cur.T, link = linkOf(s);
  const share = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  let body = '<div class="qcb-name">' + H(setName(s)) + '</div>'
    + '<div class="qcb-meta">' + H(kindTitle(s.kind, lang()) + ' · ' + t(s.n + ' questions', s.n + ' 問') + ' · ' + when(s.created_at)) + '</div>'
    + '<div class="qcb-link"><input type="text" readonly id="qcb-link" value="' + H(link) + '" aria-label="' + H(t('Class link', 'クラスのリンク')) + '">'
    + '<div class="qcb-acts"><button type="button" class="ai-test-btn" id="qcb-copy">' + icon('clipboard') + ' ' + H(t('Copy the class link', 'リンクをコピー')) + '</button>'
    + (share ? '<button type="button" class="ai-test-btn" id="qcb-share">' + icon('share') + ' ' + H(t('Share…', '共有…')) + '</button>' : '') + '</div></div>'
    + '<div class="qcb-acts"><button type="button" class="ai-test-btn' + (s.open ? '' : ' qcb-go') + '" id="qcb-open">' + H(s.open ? t('Close for answers', '提出を締め切る') : t('Reopen for answers', '提出を再開する')) + '</button>'
    + '<button type="button" class="ai-test-btn" id="qcb-refresh">' + icon('reset') + ' ' + H(t('Refresh', '更新')) + '</button></div>'
    + (err ? '<div class="qcb-err">' + H(CLASS.classFailureText(err, lang())) + '</div>' : '');
  if (cur.dataError) body += '<div class="qcb-err">' + H(t('The questions of this set could not be made from the map’s data, so the answers cannot be scored. Check the connection and refresh.', 'このセットの問題を地図のデータから作れなかったため、答えを採点できません。接続を確認して更新してください。')) + '</div>';
  else if (!T) body += '<div class="qcb-note">' + H(t('Reading the hand-ins…', '提出を読み込んでいます…')) + '</div>';
  else if (!T.count) body += '<div class="qcb-note">' + H(s.open ? t('Nobody has handed in yet. Give the class the link above; this board updates by itself while the set is open.', 'まだ提出はありません。上のリンクをクラスに配ってください。受付中はこのボードが自動で更新されます。')
    : t('Nobody handed in, and the set is closed.', '提出はなく、セットは締め切られています。')) + '</div>';
  else {
    body += '<div class="qcb-sum"><div><b>' + H(fmt(T.count)) + '</b><span>' + H(t('handed in', '人が提出')) + '</span></div>'
      + '<div><b>' + H(fmt(T.meanTotal)) + '</b><span>' + H(t('class mean', 'クラス平均')) + ' / ' + H(fmt(T.max)) + '</span></div>'
      + '<div><b>' + H(fmt(T.medianTotal)) + '</b><span>' + H(t('median', '中央値')) + '</span></div></div>';
    if (T.hardest != null) body += '<div class="qcb-hard">' + H(t('Hardest for the class: question ', 'クラスがいちばん苦戦した問題: ') + (T.hardest + 1) + ' — ' + CLASS.questionLabel(cur.qs[T.hardest], lang())) + '</div>';
    body += '<div class="qcb-sec">' + H(t('Question by question', '問題ごと')) + '</div><ol class="qcb-qs">' + T.questions.map((x) => {
      const q = cur.qs[x.i];
      const what = q.kind === 'where'
        ? (x.medianKm != null ? t('median ' + km(x.medianKm) + ' away', '中央値 ' + km(x.medianKm) + ' ずれ') : t('no taps', 'タップなし'))
        : (x.medianOff != null ? t('median ' + fmt(x.medianOff) + ' y off · exact ' + x.exact, '中央値 ' + fmt(x.medianOff) + ' 年ずれ · ぴったり ' + x.exact + ' 人') : t('no answers', '答えなし'));
      return '<li class="' + (x.i === T.hardest ? 'hard' : '') + '"><span class="qcb-ql">' + H(CLASS.questionLabel(q, lang())) + '</span>'
        + '<span class="qcb-qs-s">' + H(t('mean ', '平均 ') + fmt(x.mean) + ' · ' + what + (x.skipped ? ' · ' + t('skipped ' + x.skipped, 'スキップ ' + x.skipped) : '')) + '</span>'
        + (q.kind === 'where' && x.answered ? '<button type="button" class="qcb-map' + (shownQ === x.i ? ' on' : '') + '" data-q="' + H(x.i) + '">' + icon('map') + ' ' + H(shownQ === x.i ? t('Shown on the map', '地図に表示中') : t('The class’s taps on the map', 'クラスのタップを地図に')) + '</button>' : '')
        + (q.kind === 'when' && x.answered ? yearStrip(x.i) : '') + '</li>';
    }).join('') + '</ol>';
    body += '<div class="qcb-sec">' + H(t('Students who handed in', '提出した生徒')) + '</div><div class="qcb-tbl" role="table">' + T.students.map((st) =>
      '<div class="qcb-tr" role="row"><span class="qcb-sn" role="cell">' + H(st.name) + '</span><span class="qcb-st" role="cell"><b>' + H(fmt(st.total)) + '</b></span>'
      + '<span class="qcb-ss" role="cell">' + st.scores.map((v, i) => '<i class="' + scoreClass(v) + '" title="' + H('Q' + (i + 1) + ': ' + v) + '"></i>').join('') + '</span>'
      + '<button type="button" class="qcb-rm" data-id="' + H(st.id) + '" aria-label="' + H(t('Remove the hand-in of ', '提出を削除: ') + st.name) + '">×</button></div>').join('') + '</div>'
      + '<div class="qcb-acts"><button type="button" class="ai-test-btn" id="qcb-csv">' + icon('save') + ' ' + H(t('Download CSV', 'CSV をダウンロード')) + '</button></div>';
  }
  body += '<button type="button" class="ai-test-btn qcb-del" id="qcb-del">' + icon('trash') + ' ' + H(armDelete ? t('Tap again to delete the set and every hand-in', 'もう一度押すと、セットと提出がすべて削除されます') : t('Delete this set', 'このセットを削除')) + '</button>';
  p.innerHTML = header('', true) + body;
  wire();
  const field = /** @type {HTMLInputElement} */ (p.querySelector('#qcb-link'));
  const copy = p.querySelector('#qcb-copy');
  if (copy) copy.addEventListener('click', async () => {
    let done = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(link); done = true; } } catch (_) { done = false; }
    if (!done) { try { field.focus(); field.select(); } catch (_) { } }
    copy.innerHTML = done ? icon('check') + ' ' + H(t('Copied', 'コピーしました')) : H(t('Selected — copy it', '選択しました。コピーしてください'));
  });
  const sh = p.querySelector('#qcb-share');
  if (sh) sh.addEventListener('click', async () => { try { await navigator.share({ title: setName(s), url: link }); } catch (_) { /* the reader closed the sheet */ } });
  const op = p.querySelector('#qcb-open');
  if (op) op.addEventListener('click', async () => { await setOpen(!s.open); });
  const rf = p.querySelector('#qcb-refresh'); if (rf) rf.addEventListener('click', () => { refresh(); });
  p.querySelectorAll('.qcb-map').forEach((b) => b.addEventListener('click', () => { const i = +b.getAttribute('data-q'); if (shownQ === i) clearMap(); else drawTaps(i); paint(); }));
  p.querySelectorAll('.qcb-rm').forEach((b) => b.addEventListener('click', async () => {
    const r = await CLASS.deleteClassAnswer(HOST && HOST.DB, b.getAttribute('data-id'));
    err = r.ok ? null : r.error; await refresh();
  }));
  const csv = p.querySelector('#qcb-csv'); if (csv) csv.addEventListener('click', () => downloadCsv());
  const del = p.querySelector('#qcb-del');
  if (del) del.addEventListener('click', async () => {
    if (!armDelete) { armDelete = true; paint(); return; }
    armDelete = false;
    const r = await CLASS.deleteClassSet(HOST && HOST.DB, s.id);
    err = r.ok ? null : r.error;
    if (r.ok) { clearMap(); showList(); } else paint();
  });
}
/* a score's colour in a student's strip: green where the panel itself calls an answer good (js/quest-panel.js — at least
   90% of the most a question gives), grey for nothing scored (a skip), amber for the rest */
const scoreClass = (v) => (v >= QUEST_MAX * 0.9 ? 'g' : v > 0 ? 'm' : 'z');
/* the spread of the years the class answered on one question: a strip of bins over [lowest, highest] of the answers
   and the true year, the true year's bin marked. BINS is a choice of display (enough columns to read a spread on a
   360 px panel), not a measurement. */
const BINS = 24;
function yearStrip(i) {
  const q = cur.qs[i];
  const ys = cur.T.students.map((s) => CLASS.decodeAnswer('when', s.answers[i])).filter(Boolean).map((a) => a.year);
  if (!ys.length) return '';
  const lo = Math.min(q.year, Math.min.apply(null, ys)), hi = Math.max(q.year, Math.max.apply(null, ys));
  const w = Math.max(1, (hi - lo + 1) / BINS), bins = new Array(BINS).fill(0);
  const at = (y) => Math.min(BINS - 1, Math.floor((y - lo) / w));
  ys.forEach((y) => { bins[at(y)]++; });
  const top = Math.max.apply(null, bins), truth = at(q.year);
  return '<div class="qcb-yr" aria-label="' + H(t('Years answered from ' + lo + ' to ' + hi + '; the record dates it ' + q.year, '答えた年は ' + lo + '〜' + hi + ' 年、記録の年は ' + q.year + ' 年')) + '">'
    + bins.map((c, k) => '<i class="' + (k === truth ? 'truth' : '') + '" style="height:' + (c ? Math.max(12, Math.round(100 * c / top)) : 4) + '%"></i>').join('')
    + '</div><div class="qcb-yr-ax"><span>' + H(lo) + '</span><span>' + H(t('record: ', '記録: ') + q.year) + '</span><span>' + H(hi) + '</span></div>';
}
function downloadCsv() {
  if (!cur || !cur.T) return;
  const text = CLASS.classCsv(cur.qs, cur.T, lang());
  try {
    /* a byte-order mark so a spreadsheet opens the Japanese names as UTF-8 */
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'intmap-class-' + cur.set.code + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(a.href); } catch (_) { } }, 4000);
  } catch (_) { /* no download in this context: nothing is lost, the board still shows every row */ }
}

/* ══ THE FLOW ═════════════════════════════════════════════════════════════════════════════════════ */
function stopRefresh() { if (tick) { stopTick(tick); tick = null; } }
function keepRefreshing() {
  stopRefresh();
  if (view === 'set' && cur && cur.set.open) tick = everyTick('quest-class-board', BOARD_REFRESH_MS, () => { if (panel && panel.style.display !== 'none' && view === 'set') refresh(); });
}
async function showList() {
  view = 'list'; cur = null; armDelete = false; stopRefresh(); clearMap();
  paint();
  if (!(HOST && HOST.user)) return;
  const r = await CLASS.listClassSets(HOST.DB);
  sets = r.ok ? r.sets : (sets || []); err = r.ok ? null : r.error;
  if (view === 'list') paint();
}
function showCreate(d) { view = 'create'; err = null; draft = { kind: d.kind, seed: d.seed || null, n: SET_LENGTHS.indexOf(+d.n) >= 0 ? +d.n : SET_LENGTHS[0] }; stopRefresh(); paint(); }
async function showSet(s) {
  view = 'set'; armDelete = false; err = null; clearMap();
  cur = { set: s, qs: [], engine: null, rows: null, T: null, dataError: false };
  paint();
  const made = await questionsOf(s.kind, s.seed, s.n);
  if (!cur || cur.set !== s) return;
  if (!made.ok) { cur.dataError = true; paint(); return; }
  cur.qs = made.qs; cur.engine = made.engine;
  await refresh();
  keepRefreshing();
}
/** read the set's hand-ins again and tally them with the engine */
async function refresh() {
  if (!cur || !cur.engine) return boardState();
  const s = cur.set;
  const r = await CLASS.classAnswers(HOST && HOST.DB, s.id);
  if (!cur || cur.set !== s) return boardState();
  if (!r.ok) { err = r.error; paint(); return boardState(); }
  cur.rows = r.rows; cur.T = CLASS.tally(cur.engine, cur.qs, r.rows);
  if (shownQ != null) drawTaps(shownQ);
  paint();
  return boardState();
}
async function setOpen(open) {
  if (!cur) return { ok: false, error: 'not_found' };
  const r = await CLASS.setClassOpen(HOST && HOST.DB, cur.set.id, open);
  err = r.ok ? null : r.error;
  if (r.ok) cur.set = Object.assign({}, cur.set, { open: r.open });
  keepRefreshing();
  paint();
  return r;
}

/** Open the board. `o` = { host, create?: { kind, seed?, n? }, code?: the set to show }. Resolves with boardState(). */
export async function openBoard(o) {
  o = o || {};
  HOST = o.host || HOST;
  ensure(); panel.style.display = 'block';
  if (!(HOST && HOST.user)) { view = 'list'; paint(); return boardState(); }
  if (o.create) { showCreate(o.create); return boardState(); }
  if (o.code) {
    const r = await CLASS.listClassSets(HOST.DB);
    sets = r.ok ? r.sets : sets; err = r.ok ? null : r.error;
    const s = (sets || []).find((x) => x.code === String(o.code).toUpperCase());
    if (s) { await showSet(s); return boardState(); }
  }
  await showList();
  return boardState();
}
/** Atlas's view of one set: its tally, read now (the same tally the board shows). → { ok, set, qs, T } | { ok:false, error } */
export async function readSet(code) {
  const r = await CLASS.listClassSets(HOST && HOST.DB);
  if (!r.ok) return { ok: false, error: r.error };
  const s = r.sets.find((x) => x.code === String(code || '').toUpperCase());
  if (!s) return { ok: false, error: 'not_found', sets: r.sets };
  const made = await questionsOf(s.kind, s.seed, s.n);
  if (!made.ok) return { ok: false, error: 'data', set: s };
  const a = await CLASS.classAnswers(HOST.DB, s.id);
  if (!a.ok) return { ok: false, error: a.error, set: s };
  return { ok: true, set: s, qs: made.qs, T: CLASS.tally(made.engine, made.qs, a.rows) };
}
/** Close the board: the refresh stops and the class's taps leave the map. */
function closeBoard() {
  const was = boardState().open;
  stopRefresh(); clearMap(); armDelete = false;
  if (panel) panel.style.display = 'none';
  if (langOff) { langOff(); langOff = null; }
  return was;
}

/* ══ THE LOOK — iOS-like, on the app's own variables (css/intmap.css), the quest panel's own idiom ═══════ */
const CSS = [
  '#quest-class-panel.qcb{display:none;top:70px;left:50%;right:auto;transform:translateX(-50%);z-index:calc(var(--z-sheet) - 49);width:min(400px,calc(100vw - 24px));max-height:min(78vh,700px);overflow-y:auto;overscroll-behavior:contain;box-sizing:border-box;}',
  '.qcb .qcb-head{display:flex;align-items:center;gap:6px;cursor:move;}',
  '.qcb .qcb-head .tp-title{flex:1;}',
  '.qcb .tp-close,.qcb .qcb-back{width:32px;height:32px;border:none;border-radius:50%;background:var(--input-bg);color:var(--text-main);font-size:18px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;}',
  '.qcb .qcb-sub,.qcb .qcb-note,.qcb .qcb-meta{font-size:11.5px;color:var(--text-muted);margin:0 0 10px;line-height:1.45;}',
  '.qcb .qcb-err{font-size:12px;font-weight:600;line-height:1.45;padding:8px 10px;margin:6px 0;border-radius:10px;background:rgba(255,59,48,0.10);}',
  '.qcb .ai-test-btn{width:100%;margin-top:6px;}',
  '.qcb .qcb-go{background:var(--primary-fill);color:#fff;border-color:transparent;font-weight:600;}',
  '.qcb .qcb-acts{display:flex;gap:8px;}',
  '.qcb .qcb-sec{font-size:11.5px;font-weight:600;color:var(--text-muted);margin:12px 2px 6px;}',
  '.qcb .qcb-sets{display:flex;flex-direction:column;gap:6px;}',
  '.qcb .qcb-set{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:10px 12px;border-radius:12px;border:1px solid rgba(128,128,128,0.18);background:var(--input-bg);color:var(--text-main);font:inherit;cursor:pointer;}',
  '.qcb .qcb-set span:first-child{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0;}',
  '.qcb .qcb-set small{font-size:11.5px;color:var(--text-muted);}',
  '.qcb .qcb-badge{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(128,128,128,0.16);color:var(--text-muted);white-space:nowrap;}',
  '.qcb .qcb-badge.on{background:rgba(52,199,89,0.16);color:#1f9d45;}',
  '.qcb .qcb-q{font-size:13px;font-weight:700;margin:2px 0 8px;}',
  '.qcb .qcb-row{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:var(--text-muted);margin:4px 0 8px;}',
  '.qcb .qcb-row select{padding:4px 8px;border-radius:8px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);font:inherit;}',
  '.qcb .qcb-lab{display:block;font-size:12px;color:var(--text-muted);margin:4px 0;}',
  '.qcb #qcb-title-in,.qcb #qcb-link{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:10px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);font:inherit;margin-bottom:6px;}',
  '.qcb #qcb-link{font-size:11.5px;}',
  '.qcb .qcb-name{font-size:18px;font-weight:800;color:var(--primary-color);margin:2px 0 2px;line-height:1.25;}',
  '.qcb .qcb-link{margin:6px 0 4px;}',
  '.qcb .qcb-sum{display:flex;gap:8px;margin:12px 0 6px;}',
  '.qcb .qcb-sum div{flex:1;display:flex;flex-direction:column;align-items:center;padding:8px 4px;border-radius:12px;background:var(--input-bg);font-variant-numeric:tabular-nums;}',
  '.qcb .qcb-sum b{font-size:20px;font-weight:800;}',
  '.qcb .qcb-sum span{font-size:10.5px;color:var(--text-muted);text-align:center;}',
  '.qcb .qcb-hard{font-size:12.5px;font-weight:600;line-height:1.45;padding:8px 10px;margin:6px 0;border-radius:10px;background:rgba(255,149,0,0.12);}',
  '.qcb .qcb-qs{margin:0;padding:0 0 0 18px;font-size:12px;line-height:1.45;}',
  '.qcb .qcb-qs li{margin:6px 0;}',
  '.qcb .qcb-qs li.hard .qcb-ql{color:#c26a00;}',
  '.qcb .qcb-ql{display:block;font-weight:600;}',
  '.qcb .qcb-qs-s{color:var(--text-muted);font-variant-numeric:tabular-nums;}',
  '.qcb .qcb-map{display:inline-flex;align-items:center;gap:4px;margin-top:3px;padding:3px 8px;border-radius:999px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--primary-color);font:inherit;font-size:11.5px;font-weight:600;cursor:pointer;}',
  '.qcb .qcb-map.on{background:var(--primary-fill);color:#fff;border-color:transparent;}',
  '.qcb .qcb-yr{display:flex;align-items:flex-end;gap:1px;height:34px;margin-top:4px;}',
  '.qcb .qcb-yr i{flex:1;background:rgba(0,122,255,0.45);border-radius:2px 2px 0 0;}',
  '.qcb .qcb-yr i.truth{background:#34c759;}',
  '.qcb .qcb-yr-ax{display:flex;justify-content:space-between;font-size:10.5px;color:var(--text-muted);font-variant-numeric:tabular-nums;}',
  '.qcb .qcb-tbl{display:flex;flex-direction:column;gap:2px;}',
  '.qcb .qcb-tr{display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:8px;font-size:12.5px;}',
  '.qcb .qcb-tr:nth-child(odd){background:var(--input-bg);}',
  '.qcb .qcb-sn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;}',
  '.qcb .qcb-st{width:52px;text-align:right;font-variant-numeric:tabular-nums;}',
  '.qcb .qcb-ss{display:flex;gap:2px;}',
  '.qcb .qcb-ss i{width:7px;height:14px;border-radius:2px;}',
  '.qcb .qcb-ss i.g{background:#34c759;}',
  '.qcb .qcb-ss i.m{background:#ff9500;}',
  '.qcb .qcb-ss i.z{background:rgba(128,128,128,0.35);}',
  '.qcb .qcb-rm{width:24px;height:24px;border:none;border-radius:50%;background:transparent;color:var(--text-muted);font-size:15px;cursor:pointer;}',
  '.qcb .qcb-del{margin-top:14px;color:#ff3b30;}',
  '@media (max-width:640px){#quest-class-panel.qcb{top:auto;bottom:calc(12px + var(--safe-bottom));max-height:70dvh;}}',
].join('\n');

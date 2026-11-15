/* ============================================================================
 *  IntMap · js/atlas-text-map.js — A TEXT ON THE MAP OF ITS OWN TIME   (text-to-era-map)
 * ----------------------------------------------------------------------------
 *  「史料・紀行文・戦記・教材などの文章を貼ると、その時代の地図になる。」
 *
 *  A reader pastes a passage of 奥の細道 or of the Gallic War. ATLAS reads it — which words are places, which words say
 *  when — and calls `time.textMap` with what it read. Nothing here reads the text for meaning; there is no second AI
 *  call and no extractor. What this module does is the part that must not be left to a model's word:
 *
 *  ⚠ EVERY CLAIM ABOUT THE TEXT IS CHECKED AGAINST THE TEXT. A place is a place IN THE PASSAGE only if its spelling is
 *    in the passage; an instant is the passage's only if the words Atlas quotes for it are there. A name that is not in
 *    the text is reported `not_in_text` and drawn nowhere; a quotation that is not in the text moves no clock.
 *  ⚠ THE YEAR IS NEVER SUPPLIED FOR THE TEXT (利用者の決定: 文中の年だけで時計を動かす). When the words Atlas quotes
 *    can be read by code (js/where-when.js `parse`: 「元禄二とせ」 → 元禄2年 → 1689) the code's reading is the year and
 *    Atlas's must agree with it; when they cannot (a consular date: «M. Messala et M. Pisone consulibus»), Atlas's
 *    reading is used and SAID to be Atlas's. A year Atlas knows only from outside the passage (the work's date) is
 *    `inferred`: shown as a button marked 「推定・文中に記載なし」, never applied.
 *  ⚠ ONE INSTANT, THE OTHERS LISTED (利用者の決定). Atlas picks the passage's instant and says why; the other instants
 *    the passage states are buttons that move the clock there.
 *  ⚠ THE PLACES ARE PLACED BY map.compose (js/atlas-map-compose.js) WITH `era` — the historical city names and Pleiades
 *    first, then the ledger / gazetteer / web rungs every compose has — so a name that cannot be grounded is `unplaced`
 *    by name, never stood somewhere else ([[intmap-name-agreement-is-not-kind-agreement]]).
 *
 *  Imported on first use by js/atlas-cap-time.js, so the Atlas chunk does not carry it (check:perf).
 * ==========================================================================*/
import { ATTACH_LOG } from './atlas-attach-log.js';

/* ── the text the reader gave: this message, the earlier messages, and every text attachment of the conversation ── */
export function corpusOf(K) {
  const parts = [];
  try { if (K._lastUserMsg) parts.push(String(K._lastUserMsg)); } catch (_) { }
  try { (K._hist || []).forEach((h) => { const s = String((h && h.s) || ''); if (s.indexOf('User: ') === 0) parts.push(s.slice(6)); }); } catch (_) { }
  try { ATTACH_LOG.earlier((+K._curTurn || 0) + 1).forEach((r) => { if (r && r.kind === 'text' && r.text) parts.push(String(r.text)); }); } catch (_) { }
  return parts;
}

/* the comparison form: compatibility-folded, case-folded, with NO whitespace at all — a passage wraps its lines
   anywhere (Japanese has no spaces to keep), and a quotation copied across a line break is still the same words */
export function fold(s) {
  return String(s == null ? '' : s).normalize('NFKC').toLocaleLowerCase().replace(/[\s​]+/gu, '');
}
export function inText(needle, corpus) {
  const n = fold(needle);
  if (!n) return false;
  return corpus.some((p) => fold(p).indexOf(n) >= 0);
}

/* ── 漢数字 → digits, only where a year, month or day is counted (二条 is a street, 二年 is a year) ──
   「とせ」 is the classical counter for years (元禄二とせ); 元年 stays 元年 (js/where-when.js reads it). */
const KD = { '〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
const KU = { '十': 10, '百': 100, '千': 1000 };
function kanjiNumber(run) {
  if (!/[十百千]/.test(run)) return Number(run.split('').map((c) => KD[c]).join(''));   /* 一六八九 */
  let total = 0, cur = 0;
  for (const c of run) {
    if (c in KD) cur = KD[c];
    else { total += (cur || 1) * KU[c]; cur = 0; }
  }
  return total + cur;
}
export function countedDigits(s) {
  return String(s == null ? '' : s)
    .replace(/([〇零一二三四五六七八九十百千]+)\s*(とせ|年|月|日)/gu, (m, run, unit) => kanjiNumber(run) + (unit === 'とせ' ? '年' : unit))
    .replace(/(\d)\s*とせ/gu, '$1年');
}

/* ── one stated instant: is the quotation in the text, what does the code read in it, and does Atlas's reading agree ── */
export function readInstant(x, corpus, WW) {
  const quote = String((x && x.quote) || '').trim(), read = String((x && x.read) || '').trim();
  if (!quote) return { ok: false, reason: 'no_quote', quote, read };
  if (!inText(quote, corpus)) return { ok: false, reason: 'quote_not_in_text', quote, read };
  const byCode = WW.parse(countedDigits(quote)).when;
  const byAtlas = read ? WW.parse(countedDigits(read)) : null;
  if (byCode && byAtlas && byAtlas.when && byAtlas.when.y !== byCode.y) return { ok: false, reason: 'reading_disagrees', quote, read, codeYear: byCode.y, atlasYear: byAtlas.when.y };
  const when = byCode || (byAtlas && byAtlas.when) || null;
  if (!when) return { ok: false, reason: 'unreadable', quote, read };
  const parsed = byCode ? WW.parse(countedDigits(quote)) : byAtlas;
  if (parsed && parsed.problem && parsed.problem.code !== 'unknown-era') return { ok: false, reason: parsed.problem.code, quote, read, when };
  return { ok: true, quote, read, when, by: byCode ? 'code' : 'atlas' };
}

/* ── the era buttons in the reply: one listener for the document, installed on first use ── */
let wired = false;
function wire(WW) {
  if (wired || typeof document === 'undefined') return;
  wired = true;
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('.atl-era-yr[data-era]');
    if (!b) return;
    let w = null;
    try { w = JSON.parse(decodeURIComponent(b.getAttribute('data-era') || '')); } catch (_) { w = null; }
    if (w && Number.isFinite(+w.y)) { try { WW.applyWhen(w, { source: 'atlas' }); } catch (_) { } }
  });
}

/**
 * time.textMap — what Atlas read in the passage, checked against it, on the map of its time.
 * a.places[]   {name (as written in the text), as?, country?, kind?, role?}
 * a.when?      {quote (the words in the text that say when), read (that instant as a line: "1689", "58 BC", "元禄2年")}
 * a.others[]?  {quote, read}   other instants the text states — listed, not applied
 * a.inferred?  {read, reason}  an instant known from OUTSIDE the text — offered, never applied
 * a.title?
 */
export async function textMap(a, dctx, K) {
  const L = K.L, esc = K.esc;
  a = a || {};
  const WW = await import('./where-when.js');
  wire(WW);
  const corpus = corpusOf(K);
  const lang = (() => { try { return K.HOST.lang; } catch (_) { return 'en'; } })();
  const wt = (w) => WW.whenText(w, lang);

  /* the instant */
  const main = a.when ? readInstant(a.when, corpus, WW) : null;
  let clock = null;
  if (main && main.ok) clock = WW.applyWhen(main.when, { source: 'atlas' });
  const others = (Array.isArray(a.others) ? a.others : []).slice(0, 8).map((x) => readInstant(x, corpus, WW)).filter((x) => x.ok);
  let inferred = null;
  if (a.inferred && a.inferred.read && !(main && main.ok)) {
    const p = WW.parse(countedDigits(String(a.inferred.read)));
    if (p.when && !p.problem) inferred = { when: p.when, read: String(a.inferred.read), reason: String(a.inferred.reason || '').slice(0, 200) };
  }
  const applied = !!(main && main.ok && clock && clock.ok);

  /* the places: in the text, or not drawn */
  const asked = (Array.isArray(a.places) ? a.places : []).filter((p) => p && String(p.name || '').trim());
  const inside = [], outside = [];
  asked.forEach((p) => (inText(p.name, corpus) ? inside : outside).push(p));
  const notInText = outside.map((p) => ({ name: String(p.name).slice(0, 120), reason: 'not_in_text' }));

  let res = null;
  if (inside.length) {
    res = await K.COMPOSE.run({
      title: a.title || '', camera: 'fit',
      era: applied ? main.when : { y: null },   /* no stated instant: the historical records are still asked, at no particular year */
      items: inside.map((p) => ({ name: String(p.name), as: p.as, country: p.country, kind: p.kind, role: p.role })),
    }, dctx);
  }

  /* the era block, above the legend */
  const btn = (w, label, cls) => '<button class="atl-era-yr' + (cls ? ' ' + cls : '') + '" data-era="' + esc(encodeURIComponent(JSON.stringify({ y: w.y, m: w.m, d: w.d, precision: w.precision }))) + '">' + esc(label) + '</button>';
  let eh = '<div class="atl-era">';
  if (applied) {
    eh += '<div class="atl-era-h">' + esc(L('Map at ' + wt(main.when), '地図の時点: ' + wt(main.when))) + '</div>';
    eh += '<div class="atl-era-q">' + esc(main.by === 'code'
      ? L('from «' + main.quote + '» in the text', '文中の「' + main.quote + '」から')
      : L('«' + main.quote + '» in the text, read by Atlas as ' + main.read, '文中の「' + main.quote + '」を Atlas が ' + main.read + ' と読みました')) + '</div>';
  } else {
    eh += '<div class="atl-era-h">' + esc(L('The text states no year this map could use — the clock was not moved.', '文中に地図の時点にできる年の記載が無いため、時計は動かしていません。')) + '</div>';
    if (main && !main.ok) {
      const why = {
        no_quote: () => L('no words of the text were given for it', '文中のどの語句かが示されていません'),
        quote_not_in_text: () => L('these words are not in the text', 'この語句は文中にありません'),
        reading_disagrees: () => L('read as ' + main.codeYear + ' by the calendar, not ' + main.atlasYear, '暦の読みでは ' + main.codeYear + ' で、' + main.atlasYear + ' ではありません'),
        unreadable: () => L('not readable as a date', '日付として読めません'),
        'before-floor': () => L('earlier than Chronos reaches', 'Chronos が遡れる範囲より前です'),
        future: () => L('in the future', '未来の日付です'),
      }[main.reason];
      eh += '<div class="atl-era-q">' + esc('「' + main.quote + '」 — ' + (why ? why() : main.reason)) + '</div>';
    }
  }
  if (others.length || inferred) {
    eh += '<div class="atl-era-row">';
    others.forEach((o) => { eh += btn(o.when, wt(o.when) + ' 「' + o.quote.slice(0, 24) + '」'); });
    if (inferred) eh += btn(inferred.when, L('Estimated ' + wt(inferred.when) + ' (not in the text)', '推定 ' + wt(inferred.when) + '（文中に記載なし）'), 'inferred');
    eh += '</div>';
  }
  eh += '</div>';
  const nh = notInText.length ? '<div class="atl-cmp-un">' + esc(L('Not in the text, not placed', '文中に無いため配置せず')) + ': ' + esc(notInText.map((u) => u.name).join(', ')) + '</div>' : '';

  const era = { applied, clock: applied ? clock.iso : null, quote: main ? main.quote : null, read: main ? main.read : null, year: applied ? main.when.y : null,
    readBy: applied ? main.by : null, refused: main && !main.ok ? main.reason : (a.when ? null : 'no_instant_given'),
    others: others.map((o) => ({ quote: o.quote, year: o.when.y })), inferred: inferred ? { year: inferred.when.y, applied: false } : null };
  const note = 'The clock ' + (applied ? 'was set to the instant the text states' : 'was NOT moved') + '. `unplaced` items are NOT on the map — say so by name; `not_in_text` means the name you sent is not in the reader\'s text (send names exactly as written), `ambiguous` lists the places that share a historical name (add "country" or "as" and call again with the whole list). Never state a year the text does not; an `inferred` year is offered to the reader as a button, not applied.';

  if (!res) {
    return { ok: false, html: eh + nh, meta: { code: 'PLACE_NOT_FOUND', category: 'input', retryable: true, produced: [], message: 'None of the places is in the text.' },
      exec: { status: 'failed', era, unplaced: notInText, counts: { requested: asked.length, placed: 0, unplaced: notInText.length }, note } };
  }
  const ex = Object.assign({}, res.exec || {});
  ex.unplaced = (ex.unplaced || []).concat(notInText);
  ex.counts = Object.assign({}, ex.counts, { requested: asked.length, unplaced: ex.unplaced.length });
  if (res.ok && notInText.length && ex.status === 'ok') ex.status = 'partial';
  ex.era = era; ex.note = [note, ex.note].filter(Boolean).join('\n');
  const meta = Object.assign({}, res.meta || {}, { counts: ex.counts, era, partial: (res.meta && res.meta.partial) || (res.ok && notInText.length > 0) || undefined,
    produced: res.ok ? ['map', 'explanation'] : (res.meta && res.meta.produced) || [] });
  return { ok: res.ok, html: eh + (res.html || '') + nh, meta, exec: ex };
}

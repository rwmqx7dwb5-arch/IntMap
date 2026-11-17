/* ============================================================================
 *  IntMap · js/geopolitics-atlas.js — WHAT ATLAS RUNS FOR data.sanctions · data.unVote · data.borderCrossings
 *  (geopolitics-layers)
 * ----------------------------------------------------------------------------
 *  The three entries of js/atlas-cap-data.js fetch this file on first use, so the Atlas chunk does not carry it. Every
 *  answer is read from the same records with the same rules the map draws (js/geopolitics-core.js), and when an answer
 *  is put on the map (`show`) the count it reports is read back from the map after drawing — never the count it meant
 *  to draw (.agents/rules/one-pass-or-a-reason.md §4).
 *  A record that cannot be read says so (code UNAVAILABLE, retryable); a name no record knows says so (NOT_FOUND) —
 *  neither is ever «no sanctions», «no vote» or «no crossing».
 * ==========================================================================*/
import { IntMapTime } from './chronos.js';
import { IntMapLang } from './lang-registry.js';
import { placeIndex, findPlace, searchPlaces, placeName } from './world-flows-core.js';
import { sanctionsOn, searchVotes, findVote, voteAtOrBefore, decodeVote, sessionFile, nearestCrossings, crossingState, citizenship, VOTE_CODES } from './geopolitics-core.js';
import { loadRecord, PATHS, whenPackage } from './layer-pkg-geopolitics.js';
import './safe-html.js';

const esc = (s) => globalThis.IntMapSafe.html(String(s == null ? '' : s));
const PLACES = 'data/world-flows.json';   /* the place table world flows already ships (Natural Earth names en + ja, ISO alpha-3/alpha-2) */
/* IntMap's own words as the translation tuple the i18n gate counts (scripts/i18n-audit.mjs reads LA bound to pickArgs) */
const LA = IntMapLang.pickArgs();
const fail = (K, words, code, category, retryable, extra) => K.R(false, K.warn(esc(K.L(...words))), { meta: Object.assign({ code, category, retryable, produced: [], userGoalSatisfied: false }, extra || {}) });

/** switch a row on through its own box (the same `change` every reader's tick sends), then hand back the package */
async function rowOn(id) {
  const cb = /** @type {HTMLInputElement|null} */ (document.getElementById(id));
  if (!cb) return null;
  if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
  return whenPackage();
}
async function country(K, q) {
  const idx = await loadRecord(PLACES);
  const P = placeIndex(idx);
  const i = findPlace(P, q);
  const lg = (K.HOST && K.HOST.lang) || 'en';
  if (i >= 0) return { code: P.rows[i].c, name: placeName(P.rows[i], lg) };
  return { code: null, candidates: searchPlaces(P, q, 6).map((j) => ({ code: P.rows[j].c, name: placeName(P.rows[j], lg) })) };
}

/* ══ data.sanctions ══════════════════════════════════════════════════════════════════════════════════════════════ */
export async function sanctions(a, K) {
  const L = K.L;
  let S;
  try { S = await loadRecord(PATHS.sanctions); } catch (_) { return fail(K, LA('The sanctions record could not be read.', '制裁の記録を読み込めませんでした。'), 'UNAVAILABLE', 'transient', true); }
  const want = a.authority ? String(a.authority).toUpperCase() : null;
  if (want && !S.authorities.some((x) => x.id === want)) return fail(K, LA('The record holds the lists of US (OFAC), UK and EU only.', '記録にあるのは米国（OFAC）・英国・EU のリストだけです。'), 'NOT_FOUND', 'input', false, { authorities: S.authorities.map((x) => x.id) });
  const lists = S.authorities.map((x) => ({ id: x.id, list: x.list, publisher: x.publisher, asOf: x.listDate, parties: x.parties, licence: x.licence, url: x.url, unplaced: (S.unplaced[x.id] || {}).n || 0,
    measure: x.measure ? x.measure[0] : 'per party (stated in the list)' }));
  let body = '', facts;
  if (a.country) {
    const c = await country(K, a.country);
    if (!c.code) return fail(K, LA('No country by that name: ' + a.country, 'その名前の国はありません: ' + a.country), c.candidates.length ? 'AMBIGUOUS' : 'NOT_FOUND', 'input', false, { candidates: c.candidates });
    const r = sanctionsOn(S, c.code);
    const by = r.by.filter((b) => !want || b.authority === want);
    facts = { country: c, lists, by: by.map((b) => ({ authority: b.authority, parties: b.n, kinds: b.kinds, linkedBy: b.basis, implementingUN: b.un,
      measures: b.measures.slice(0, 12), regimes: b.regimes.slice(0, 15), firstDesignated: b.first, lastDesignated: b.last })) };
    body = K.note('✓ ' + esc(L('Sanctions lists — parties linked to ', '制裁リスト — 結び付く指定対象: ') + c.name))
      + (by.length ? '<ul style="margin:4px 0 4px 18px;padding:0">' + by.map((b) => '<li>' + esc(b.authority + ': ' + b.n + L(' parties', ' 件') + (b.regimes.length ? ' — ' + b.regimes.slice(0, 4).map((g) => g[0]).join(', ') : '')) + '</li>').join('') + '</ul>'
        : '<div>' + esc(L('None of the lists links a designated party to ' + c.name + '.', 'どのリストにも、' + c.name + ' に結び付く指定対象はありません。')) + '</div>');
  } else {
    const top = Math.max(1, Math.min(60, Math.round(+a.top || 15)));
    const per = {};
    for (const l of S.links) if (!want || l.a === want) (per[l.a] = per[l.a] || []).push({ country: l.c, name: (S.places[l.c] || {}).en || l.c, parties: l.n });
    for (const k of Object.keys(per)) per[k] = per[k].sort((x, y) => y.parties - x.parties).slice(0, top);
    facts = { lists, largest: per };
    body = K.note('✓ ' + esc(L('Sanctions lists — the countries each list links most designated parties to', '制裁リスト — 各リストが最も多くの指定対象を結び付けている国')))
      + Object.entries(per).map(([k, rows]) => '<div><b>' + esc(k) + '</b>: ' + esc(rows.slice(0, 6).map((r) => r.name + ' ' + r.parties).join(', ')) + '</div>').join('');
  }
  let drawn = null;
  if (a.show) {
    const api = await rowOn('dl-sanctions');
    if (api) { const d = await api.sanctionsFocus(facts.country ? facts.country.code : null, want ? [want] : null); drawn = d.drawn; body += '<div>' + esc(L('On the map: ' + drawn + ' lines', '地図に ' + drawn + ' 本の線')) + '</div>'; }
  }
  body += '<div style="font-size:12px;color:var(--text-muted)">' + esc(L('A party is linked to the country of its listed address, else its nationality, else its ship flag; one with addresses in several countries is counted in each. These are lists of designated parties, not every trade restriction. Lists as of ', '対象は記載された所在地の国、なければ国籍、なければ船籍の国に結び付けています。複数国に所在地がある対象は各国で数えます。これは指定対象の名簿で、すべての貿易規制ではありません。リストの時点: ') + lists.map((x) => x.id + ' ' + x.asOf).join(', ')) + '</div>';
  return K.R(true, body, { meta: { sanctions: Object.assign(facts, { drawnLines: drawn }), resultKey: 'data.sanctions:' + (facts.country ? facts.country.code : 'all') + ':' + (want || 'all') + ':' + (a.show ? 'show' : 'read') } });
}

/* ══ data.unVote ═════════════════════════════════════════════════════════════════════════════════════════════════ */
export async function unVote(a, K) {
  const L = K.L;
  let I;
  try { I = await loadRecord(PATHS.votes); } catch (_) { return fail(K, LA('The UN voting record could not be read.', '国連の投票記録を読み込めませんでした。'), 'UNAVAILABLE', 'transient', true); }
  const from = a.from || (a.year ? String(a.year) + '-01-01' : null), to = a.to || (a.year ? String(a.year) + '-12-31' : null);
  let row = null, matches = [];
  if (a.symbol || a.id != null) row = findVote(I, a.symbol || a.id);
  else if (a.query) { matches = searchVotes(I, a.query, { from, to, limit: Math.max(1, Math.min(40, +a.limit || 10)), finalOnly: !!a.finalOnly }); row = matches[0] || null; }
  else if (a.date) row = voteAtOrBefore(I, String(a.date).slice(0, 10));
  /* the clock's day; at the live clock that is today, and the last vote at or before it is the record's last */
  else row = voteAtOrBefore(I, new Date(IntMapTime.nowMs()).toISOString().slice(0, 10));
  if (!row) return fail(K, LA('No recorded vote in the record matches (the record holds recorded votes of 1946-01 – ' + I.last + ').', '一致する記録投票はありません（記録は 1946年1月〜' + I.last + ' の記録投票）。'), 'NOT_FOUND', 'input', false, { range: [I.first, I.last] });
  let v;
  try { v = decodeVote(I, await loadRecord(sessionFile(row.s)), row.id); } catch (_) { return fail(K, LA('The session file of that vote could not be read.', 'その採決の会期ファイルを読み込めませんでした。'), 'UNAVAILABLE', 'transient', true); }
  const nameOf = (c) => { const m = I.members.find((x) => x.c === c); return m ? (((K.HOST && K.HOST.lang) === 'jp' && m.ja) ? m.ja : m.n) : c; };
  const lists = { yes: [], no: [], abstain: [], absent: [] };
  for (const [c, ch] of Object.entries(v.by)) { const k = VOTE_CODES[ch]; if (k && lists[k]) lists[k].push(c); }
  let ask = null;
  if (a.country) {
    const c = await country(K, a.country);
    ask = c.code ? { code: c.code, name: c.name, vote: VOTE_CODES[v.by[c.code] || '-'] } : { query: a.country, vote: null, candidates: c.candidates };
  }
  /* the record's `descr` is the resolution's title in its newer rows and the motion in its older ones; `short` is the subject */
  const facts = { vote: { id: v.id, symbol: v.sym, date: v.d, title: v.ds || v.t, subject: v.t, important: v.important, amendment: v.amendment, paragraph: v.paragraph, issues: v.issues },
    totals: { yes: v.y, no: v.n, abstain: v.a, absent: v.x }, no: lists.no, abstain: lists.abstain, absent: lists.absent, yesCount: lists.yes.length, country: ask,
    otherMatches: matches.slice(1).map((m) => ({ id: m.id, symbol: m.sym, date: m.d, title: m.t })), record: { first: I.first, last: I.last, source: I.publisher, licence: I.licence } };
  let body = K.note('✓ ' + esc((v.sym || '') + ' · ' + v.d + ' — ' + (v.ds || v.t)))
    + '<div>' + esc(L('Yes ', '賛成 ') + v.y + L(' · No ', ' · 反対 ') + v.n + L(' · Abstain ', ' · 棄権 ') + v.a + L(' · Absent ', ' · 不参加 ') + v.x) + '</div>'
    + (lists.no.length && lists.no.length <= 25 ? '<div>' + esc(L('No: ', '反対: ') + lists.no.map(nameOf).join(', ')) + '</div>' : '')
    + (ask && ask.code ? '<div>' + esc(ask.name + ': ' + ask.vote) + '</div>' : '');
  if (a.show) {
    const api = await rowOn('dl-unvotes');
    if (api) {
      const d = await api.voteShow(v.id);
      facts.painted = d.painted; facts.notDrawn = d.notDrawn;
      body += '<div>' + esc(L('On the map: ' + d.painted + ' members coloured; clock moved to ' + v.d, '地図に ' + d.painted + ' か国を色分け。時計を ' + v.d + ' に移動')) + '</div>';
    }
  }
  body += '<div style="font-size:12px;color:var(--text-muted)">' + esc(L('Recorded votes only (adopted without a vote = not in the record). Voeten, Strezhnev & Bailey, UN General Assembly Voting Data (CC0).', '記録投票のみ（無投票採択は記録にありません）。出典: Voeten・Strezhnev・Bailey「UN General Assembly Voting Data」（CC0）。')) + '</div>';
  return K.R(true, body, { meta: { unVote: facts, resultKey: 'data.unVote:' + v.id + ':' + (a.country || '') + ':' + (a.show ? 'show' : 'read') } });
}

/* ══ data.borderCrossings ════════════════════════════════════════════════════════════════════════════════════════ */
export async function borderCrossings(a, K) {
  const L = K.L;
  const lng = +a.lng, lat = +a.lat;
  if (!isFinite(lng) || !isFinite(lat)) return fail(K, LA('Give the point to search from (lng, lat) — a border town or a crossing\'s name resolved first.', '探す地点（lng, lat）が必要です。国境の町や検問所の名前は先に座標へ解決してください。'), 'NEEDS_INPUT', 'input', false);
  let B;
  try { B = await loadRecord(PATHS.crossings); } catch (_) { return fail(K, LA('The border-crossing record could not be read.', '国境検問所の記録を読み込めませんでした。'), 'UNAVAILABLE', 'transient', true); }
  const ms = IntMapTime.nowMs();
  const n = Math.max(1, Math.min(20, Math.round(+a.limit || 5)));
  const near = nearestCrossings(B, lng, lat, n).map(({ c, km }) => {
    const st = crossingState(c, ms), cz = citizenship(c);
    return { osm: c.i, name: c.n || c.en || null, nameEn: c.en || null, lng: c.x, lat: c.y, km: +km.toFixed(1), state: st.state, stateNote: st.comment || st.token || null,
      timeZone: c.tz || null, hours: c.oh || null, whoMayCross: cz.words || null, modes: c.m || null, control: c.bc || null, operator: c.op || null, checked: c.cd || null };
  });
  const body = K.note('✓ ' + esc(L('Nearest mapped border control posts', '最寄りの国境検問所（OpenStreetMap）')))
    + '<ol style="margin:4px 0 4px 18px;padding:0">' + near.map((x) => '<li>' + esc((x.name || L('(unnamed)', '（名称なし）')) + ' — ' + x.km + ' km — ' + x.state + (x.hours ? ' (' + x.hours + ')' : '')) + '</li>').join('') + '</ol>'
    + '<div style="font-size:12px;color:var(--text-muted)">' + esc(L('Open or closed is read from the hours OpenStreetMap states, in each post\'s own time zone, at the clock\'s instant — not a live feed. «unstated» = no hours in OpenStreetMap; «unread» = hours IntMap does not evaluate. © OpenStreetMap contributors (ODbL).', '開閉は OpenStreetMap に記載された時刻表を、各検問所の現地時刻・時計の時刻で判定したもので、リアルタイムではありません。「unstated」は時刻表の記載なし、「unread」は IntMap が評価しない書式です。© OpenStreetMap contributors（ODbL）。')) + '</div>';
  let shown = null;
  if (a.show) {
    const api = await rowOn('dl-crossings');
    if (api) { const d = await api.crossingsShow(); shown = d.counts; }
  }
  return K.R(true, body, { meta: { borderCrossings: { at: new Date(ms).toISOString(), from: { lng, lat }, crossings: near, asOf: B.asOf, shownOnMap: shown }, resultKey: 'data.borderCrossings:' + lng.toFixed(3) + ',' + lat.toFixed(3) + ':' + n } });
}

/* ============================================================================
 *  IntMap · THIS PLACE'S PAST — a live news event, read against the ground's history   (news-with-history)
 * ----------------------------------------------------------------------------
 *  A news event's card can show, on request, what IntMap's historical records say about the ground the event stands
 *  on: the polities that held it (the place card's «This place through time»), its state's part in the recorded wars, and
 *  the national elections fought there. Only a map that holds both the live feed and the historical records can put
 *  the three beside the headline; Atlas reaches the same record through `news.eventPast` (js/atlas-cap-news.js).
 *
 *  ══ NOTHING IS READ HERE THAT ANOTHER SURFACE DOES NOT ALREADY READ ══════════════════════════════════════════════
 *    · the polities — js/place-history.js `placeHistory`, drawn by its `historyMarkup` and pressed through its
 *      `historyGo` (its `historyAction`, with the map brought to the ground): the same record, drawing and handler as the place card;
 *    · the wars — js/war-layer.js `atPoint` (through the eager door js/war-fronts.js), which asks the war record with
 *      the very rules the war fill paints by;
 *    · the elections — js/elections.js `atPoint`, the election layer's own index, files and district popup;
 *    · how precise the event's place is — the kind the members naming the event's own point give it (`placeKind`), judged by the SAME list the
 *      grouper uses to tell a representative point from a place (`DEFAULTS.representativeKinds`,
 *      supabase/functions/_shared/news-cluster.js).
 *  ⚠ A POINT THAT ONLY REPRESENTS A COUNTRY IS NOT A PLACE. An event placed on a country (or a first-level unit, or an
 *    organisation) sits on that unit's representative point, and the history of that point is not the history of the
 *    event's ground — so such an event gets the country's wars (by its CShapes code) and its national elections, and the
 *    card SAYS why there is no timeline. An event whose precision the record does not state is treated the same way.
 *  ⚠ WHAT NO RECORD STATES STAYS EMPTY: the timeline's gaps are shown as gaps, a war that the record does not take to
 *    this ground is listed as not reaching it (the record is silent — not «peace»), and a reader that could not be
 *    reached is named with its reason, never answered as «nothing here».
 *  Nothing is read until the reader asks (the card's button, or Atlas): the card costs one button and no request.
 *  Strings IntMap writes here are en + jp (CONSTITUTION.md §7). No emoji.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { DEFAULTS } from '../supabase/functions/_shared/news-cluster.js';
import './safe-html.js';
import { placeHistory, historyHtml, historyGo, forAtlas as historyForAtlas, ensureHistoryCss } from './place-history.js';

/* the two doors this section asks — both are published by their layer's factory on window (js/war-fronts.js eager, js/elections.js) */
const WARS = () => window.IntMapWarFronts, ELECTIONS = () => window.IntMapElections;
const esc = (s) => globalThis.IntMapSafe.html(String(s == null ? '' : s));   /* js/safe-html.js, imported above */

/**
 * eventPlace(item) — where a news event stands, and how precisely: `level` is
 *   'point'   the event names a place (a city, a site) — the point's own history is asked;
 *   'country' the point represents a country / first-level unit / organisation, or the record does not say — only the
 *             country is asked;
 *   'none'    the event has no location.
 */
export function eventPlace(item) {
  const a = (item && item.analysis) || {}, ev = (item && item._event) || {};
  const loc = Array.isArray(a.subjectLoc) && isFinite(a.subjectLoc[0]) && isFinite(a.subjectLoc[1]) ? a.subjectLoc : null;
  const kind = String(a.placeKind || '');   /* the kind of the event's OWN point (js/news-events.js `placeKind`) — not the representative article's subject */
  const name = a.subjectName || ev.place || '';
  if (!loc) return { level: 'none', why: 'event-not-located', kind, name, at: null };
  const rep = DEFAULTS.representativeKinds;
  const level = kind && rep.indexOf(kind) < 0 ? 'point' : 'country';
  return { level, why: level === 'point' ? null : (kind ? 'representative-point-of-' + kind : 'precision-not-stated'), kind, name, at: { lng: +loc[0], lat: +loc[1] } };
}

/** readPast(place) → { place, history, wars, elections } — the three readers at once; each section carries its own status */
export async function readPast(place) {
  if (!place || place.level === 'none' || !place.at) return { place, history: null, wars: null, elections: null };
  const { lng, lat } = place.at;
  const W = WARS(), E = ELECTIONS();
  const settle = (p, reason) => Promise.resolve().then(() => p()).then((v) => v, (e) => ({ status: 'unavailable', reason: String((e && e.reason) || (e && e.message) || reason) }));
  const [history, wars, elections] = await Promise.all([
    place.level === 'point' ? settle(() => placeHistory({ lng, lat }).then((r) => Object.assign({ status: 'ok' }, r)), 'history-failed') : Promise.resolve({ status: 'not-asked', reason: place.why }),
    W && typeof W.atPoint === 'function' ? settle(() => W.atPoint(lng, lat, { level: place.level }), 'wars-failed') : Promise.resolve({ status: 'unavailable', reason: 'war-record-not-loaded' }),
    E && typeof E.atPoint === 'function' ? settle(() => E.atPoint(lng, lat, { district: place.level === 'point' }), 'elections-failed') : Promise.resolve({ status: 'unavailable', reason: 'election-record-not-loaded' }),
  ]);
  return { place, history, wars, elections };
}

/* ── words ── */
function words(lang) {
  const L = IntMapLang.pick(() => lang);
  const pickName = (o) => (o && typeof o === 'object') ? (o[lang] || o.en || Object.values(o)[0] || '') : String(o || '');
  const warName = (w) => { try { const n = WARS() && WARS().label(w.id); if (n) return n; } catch (_) { /* the door names its rows */ } return pickName(w.name); };
  return { L, pickName, warName };
}
const kindWords = (L, kind) => ({
  country: L('a country', '国'), admin1: L('a first-level unit (a state, province or prefecture)', '第1級の行政区分（州・省・県など）'), org: L('an organisation', '組織'),
}[kind] || null);

/** the section as an HTML string — the news card and Atlas's bubble (`opts.inert`: no buttons) */
export function pastHtml(rec, lang, opts) {
  opts = opts || {};
  const { L, pickName, warName } = words(lang);
  const P = rec && rec.place;
  const h = [];
  if (!P || P.level === 'none') return '<div class="hn-why">' + esc(L('This event has no location, so there is no ground to read the past of.', 'この出来事には地点が無いので、過去を読む土地がありません。')) + '</div>';
  /* ── where, and how precisely ── */
  if (P.level === 'point') h.push('<div class="ep-where">' + esc(L('At the event\'s place', '出来事の地点') + (P.name ? ': ' + P.name : '')) + ' · ' + esc(P.at.lat.toFixed(4) + ', ' + P.at.lng.toFixed(4)) + '</div>');
  else {
    const kw = kindWords(L, P.kind);
    h.push('<div class="ep-where">' + esc(kw
      ? L('The event is placed on ' + kw + (P.name ? ' (' + P.name + ')' : '') + ': its point stands for the whole unit, not for where the event happened. So this shows the country\'s wars and national elections, not the history of one point.', 'この出来事の位置は' + kw + (P.name ? '（' + P.name + '）' : '') + 'の代表点で、出来事が起きた地点ではありません。そのため地点の歴史は出さず、その国の紛争と国政選挙だけを出します。')
      : L('The record does not state how precise this event\'s place is, so it is not treated as a point: this shows the country\'s wars and national elections, not the history of one point.', 'この出来事の位置がどれだけ精密かを記録が述べていないので、地点としては扱いません。地点の歴史は出さず、その国の紛争と国政選挙だけを出します。')) + '</div>');
  }
  /* ── who held the ground ── */
  if (P.level === 'point') {
    h.push('<div class="ep-sub">' + esc(L('Who held this ground', 'この土地を治めた政体')) + '</div>');
    const H = rec.history;
    if (!H) h.push('<div class="hn-why" data-pending>' + esc(L('Reading the historical records…', '歴史の記録を読み込み中…')) + '</div>');
    else if (H.status === 'unavailable') h.push('<div class="hn-why">' + esc(L('The historical border records could not be read (' + H.reason + ').', '歴史国境の記録を読み込めませんでした（' + H.reason + '）。')) + '</div>');
    else h.push(historyHtml(H, lang, { inert: !!opts.inert }));
  }
  /* ── the wars ── */
  h.push('<div class="ep-sub">' + esc(P.level === 'point' ? L('This ground in the recorded wars', '記録上の戦争とこの土地') : L('This country in the recorded wars', '記録上の戦争とこの国')) + '</div>');
  const Wr = rec.wars;
  if (!Wr) h.push('<div class="hn-why" data-pending>' + esc(L('Reading the war records…', '戦争の記録を読み込み中…')) + '</div>');
  else if (Wr.status === 'unavailable') h.push('<div class="hn-why">' + esc(L('The war records could not be read (' + Wr.reason + ').', '戦争の記録を読み込めませんでした（' + Wr.reason + '）。')) + '</div>');
  else if (Wr.status === 'none') h.push('<div class="hn-why">' + esc(P.level === 'point' ? L('No border record names a country at this point, so no war record can be asked.', 'この地点に国を描く国境の記録が無いため、戦争の記録に問えません。') : L('No border record names a country at the event’s representative point, so no war record can be asked.', 'この出来事の代表点に国を描く国境の記録が無いため、戦争の記録に問えません。')) + '</div>');
  else {
    if (Wr.level === 'country' && Wr.country) h.push('<div class="ep-note">' + esc(L('Country: ' + Wr.country.name + ' (CShapes, Gleditsch–Ward code ' + Wr.country.gw + '). Each war is asked of this country’s present land: every state whose borders held part of it during the war is listed with its share of that land and the side the war record gives it — front lines inside are not applied.', '国: ' + Wr.country.name + '（CShapes・Gleditsch–Ward コード ' + Wr.country.gw + '）。戦争ごとに、この国の今の国土に問います: 戦争中にその一部を国境に含んでいた国を、国土に占める割合と、戦争の記録がその国に与える陣営とともに挙げます。国内の前線による分割は含めていません。')) + '</div>');
    const reached = Wr.wars.filter((w) => w.involved), silent = Wr.wars.filter((w) => !w.involved);
    reached.forEach((w) => {
      const wi = Wr.wars.indexOf(w);
      const head = esc(warName(w)) + ' <span class="ep-when">' + esc(w.span[0] + ' – ' + w.span[1]) + '</span>';
      h.push('<div class="ep-war">' + (opts.inert ? '<div class="ep-war-h">' + head + '</div>' : '<button type="button" class="ep-war-h ep-go" data-ep="war:' + esc(String(wi)) + '">' + head + '</button>'));
      const sided = w.periods.filter((p) => p.faction !== 'NEUTRAL');
      if (!sided.length) h.push('<div class="ep-note">' + esc(w.listed
        ? L('The record lists this ground but puts it on no side for the whole war.', '記録はこの土地を挙げているが、戦争の全期間でどの陣営にも置いていない。')
        : L('The record does not put this ground’s state on a side; it is here only because of the dated events below.', '記録はこの土地の国をどの陣営にも置いていない。ここに出るのは下の日付つきの出来事があるためだけ。')) + '</div>');
      w.periods.forEach((p) => {
        const side = p.faction === 'NEUTRAL' ? L('on no side in the record', '記録上どの陣営でもない') : pickName(p.side) || p.faction;
        /* (news-past-fixes) a state that is not the one holding this ground now is its predecessor's record, said on the row */
        const whose = p.state + ' · gw ' + p.gw + (p.share != null && p.share < 100 ? ' · ' + L('about ' + Math.max(1, p.share) + '% of the present land', '今の国土の約 ' + Math.max(1, p.share) + '%') : '');
        h.push('<div class="ep-per"><i style="background:' + esc(p.faction === 'NEUTRAL' ? 'rgba(128,128,128,0.45)' : (p.col || '#888')) + '"></i><span class="ep-when">' + esc(p.from + ' – ' + p.to) + '</span> <b>' + esc(side) + '</b> <span class="ep-src">' + esc(whose) + '</span>'
          + (p.predecessor ? ' <span class="ep-pre">' + esc(L('predecessor state’s record', '前身の国の記録')) + '</span>' : '') + '</div>');
      });
      if (w.periods.some((p) => p.predecessor)) h.push('<div class="ep-note">' + esc(P.level === 'point'
        ? L('Rows marked «predecessor state’s record» are the war record of a state that held this ground then — not of the state that holds it now.', '「前身の国の記録」の行は、当時この土地を含んでいた国の戦争の記録で、今この土地を持つ国のものではありません。')
        : L('Rows marked «predecessor state’s record» are the war record of a state that held part of this country’s present land then — not of this country, which did not yet hold it.', '「前身の国の記録」の行は、当時この国の今の国土の一部を含んでいた国の戦争の記録で、この国自身のものではありません（この国は当時その土地を持っていませんでした）。')) + '</div>');
      if (w.events.length) {
        const kinds = Wr.kinds || {};
        const li = w.events.map((e) => '<li><span class="ep-when">' + esc(e.d + (e.d2 && e.d2 !== e.d ? ' – ' + e.d2 : '')) + '</span> ' + esc(pickName(e.name))
          + (e.kind && kinds[e.kind] ? ' <span class="ep-src">' + esc(pickName(kinds[e.kind].name)) + '</span>' : '')
          + (e.wiki ? ' <a href="https://en.wikipedia.org/wiki/' + esc(encodeURIComponent(e.wiki)) + '" target="_blank" rel="noopener">' + esc(L('article', '記事')) + '</a>' : '') + '</li>').join('');
        h.push('<details class="ep-ev"><summary>' + esc(P.level === 'point'
          ? L(w.events.length + ' dated events of the record in the country this ground lay in', 'この土地が属した国で記録された日付つきの出来事 ' + w.events.length + ' 件')
          : L(w.events.length + ' dated events of the record on this country’s present land', 'この国の今の国土で記録された日付つきの出来事 ' + w.events.length + ' 件')) + '</summary><ul>' + li + '</ul></details>');
      }
      h.push('</div>');
    });
    if (!reached.length) h.push('<div class="hn-why">' + esc(P.level === 'point' ? L('None of the wars IntMap records day by day lists this ground’s state or has a dated event in it.', 'IntMap が日ごとに記録している戦争のうち、この土地の国を挙げるものも、そこでの日付つきの出来事を持つものもありません。') : L('None of the wars IntMap records day by day lists this country or has a dated event in it.', 'IntMap が日ごとに記録している戦争のうち、この国を挙げるものも、そこでの日付つきの出来事を持つものもありません。')) + '</div>');
    else if (silent.length) h.push('<div class="ep-note">' + esc(L('Listing neither this state nor an event in it: ', 'この国を挙げず、そこでの出来事も無い戦争: ') + silent.map(warName).join(' · ')) + '</div>');
    if (reached.length) h.push('<div class="ep-note">' + esc(L('A side is the one the war record, and the war layer’s colours, put this ground’s state on: it says the state was a party to the war, not that fighting reached this place. The dated events say where something is recorded.', '陣営は、戦争の記録（と戦争レイヤーの色）がこの土地の国を置く側です。交戦国であったことを述べるもので、ここが戦場になったことを意味しません。どこで何があったかは日付つきの出来事が述べます。')) + '</div>');
    h.push('<div class="ep-note">' + esc(L('The war record holds ' + Wr.wars.length + ' wars, drawn day by day — not every conflict in history. A war missing here is one IntMap has no record of, not a statement that there was none.', '戦争の記録は日ごとに描く ' + Wr.wars.length + ' 件の戦争で、歴史上のすべての紛争ではありません。ここに無い戦争は IntMap に記録が無いということで、無かったという意味ではありません。')) + '</div>');
    if (Wr.src) h.push('<div class="acp-src">' + esc(L('Record: ', '記録: ') + Wr.src) + '</div>');
  }
  /* ── the elections ── */
  h.push('<div class="ep-sub">' + esc(P.level === 'point' ? L('National elections fought here', 'この土地の国政選挙') : L('This country\'s national elections', 'この国の国政選挙')) + '</div>');
  const El = rec.elections;
  if (!El) h.push('<div class="hn-why" data-pending>' + esc(L('Reading the election records…', '選挙の記録を読み込み中…')) + '</div>');
  else if (El.status === 'unavailable') h.push('<div class="hn-why">' + esc(L('The election records could not be read (' + El.reason + ').', '選挙の記録を読み込めませんでした（' + El.reason + '）。')) + '</div>');
  else if (El.status === 'none') h.push('<div class="hn-why">' + esc(P.level === 'point' ? L('This point lies in no district of the national elections IntMap holds.', 'この地点は、IntMap が持つ国政選挙のどの選挙区にも入っていません。') : L('The event’s representative point lies in no district of the national elections IntMap holds, so no election of this country can be named.', 'この出来事の代表点は IntMap が持つ国政選挙のどの選挙区にも入っていないため、この国の選挙を挙げられません。')) + '</div>');
  else {
    El.polities.forEach((p) => {
      h.push('<div class="ep-pol"><b>' + esc(p.name) + '</b>');
      p.bodies.forEach((b) => {
        const head = esc(b.body + ' · ' + b.date);
        h.push('<div class="ep-body">' + (opts.inert ? '<div class="ep-war-h">' + head + '</div>' : '<button type="button" class="ep-war-h ep-go" data-ep="elec:' + esc(b.election) + '">' + head + '</button>'));
        if (b.status === 'unavailable') h.push('<div class="hn-why">' + esc(L('The results could not be read (' + b.reason + ').', '結果を読み込めませんでした（' + b.reason + '）。')) + '</div>');
        else {
          const top = b.seats.filter((s) => s.seats > 0).slice(0, 4);
          if (top.length) h.push('<div class="ep-seats">' + top.map((s) => '<span><i style="background:' + esc(s.col || '#888') + '"></i>' + esc(s.name) + ' ' + esc(String(s.seats)) + '</span>').join('') + (b.seatsTotal ? '<span class="ep-src">' + esc(L('of ' + b.seatsTotal + ' seats', '定数 ' + b.seatsTotal)) + '</span>' : '') + '</div>');
          if (b.district) {
            const D = b.district;
            const li = D.candidates.map((c) => '<li' + (c.won ? ' class="ep-won"' : '') + '><i style="background:' + esc((c.party && c.party.col) || '#888') + '"></i>' + esc(c.name) + ' <span class="ep-src">' + esc((c.party && c.party.name) || '') + '</span>' + (c.votes != null ? ' <span class="ep-when">' + esc(Number(c.votes).toLocaleString()) + '</span>' : '') + '</li>').join('');
            h.push('<details class="ep-ev"' + (opts.inert ? ' open' : '') + '><summary>' + esc(L('District here: ', 'この地点の選挙区: ') + D.name + (D.native ? ' (' + D.native + ')' : '') + (D.winner ? ' — ' + D.winner.name : '')) + '</summary>'
              + (!D.recorded ? '<div class="ep-note">' + esc(L('No result is recorded for this district.', 'この選挙区の結果は記録されていません。')) + '</div>'
                : '<ul class="ep-cands">' + li + '</ul><div class="ep-note">' + esc(D.total != null ? L('Total votes cast: ', '総投票数: ') + Number(D.total).toLocaleString() : L('The record does not carry a vote count for this district.', 'この選挙区の得票数は記録にありません。')) + '</div>')
              + '</details>');
          }
        }
        if (b.src) h.push('<div class="acp-src">' + esc(b.src + (b.lic ? ' · ' + b.lic : '')) + '</div>');
        h.push('</div>');
      });
      h.push('</div>');
    });
    h.push('<div class="ep-note">' + esc(P.level === 'point' ? L('The newest election of each chamber IntMap holds whose districts contain this point.', 'IntMap が持つ各議院の最新の選挙のうち、その選挙区がこの地点を含むもの。') : L('The newest election of each chamber IntMap holds that was fought in this country (asked at the event’s representative point; no district is named, because the point is not where the event happened).', 'IntMap が持つ各議院の最新の選挙のうち、この国で行われたもの（出来事の代表点で問い合わせ。代表点は出来事の起きた場所ではないので、選挙区は挙げません）。')) + '</div>');
  }
  return h.join('');
}

/** the record for Atlas — the same three sections, without markup */
export function forAtlas(rec) {
  const P = rec && rec.place;
  if (!P || P.level === 'none') return { place: P || null, note: 'the event has no location' };
  const out = { place: { name: P.name, kind: P.kind || null, level: P.level, why: P.why, lng: P.at.lng, lat: P.at.lat } };
  const H = rec.history;
  out.history = !H ? null : H.status === 'not-asked' ? { notAsked: H.reason } : H.status === 'unavailable' ? { unavailable: H.reason } : historyForAtlas(H);
  const Wr = rec.wars;
  if (Wr && Wr.status === 'ok') {
    out.wars = { level: Wr.level, country: Wr.country, recordHolds: Wr.wars.length, src: Wr.src,
      involved: Wr.wars.filter((w) => w.involved).map((w) => ({ id: w.id, name: (w.name && w.name.en) || w.id, span: w.span,
        periods: w.periods.map((p) => ({ from: p.from, to: p.to, side: p.faction === 'NEUTRAL' ? 'none in the record' : ((p.side && p.side.en) || p.faction), state: p.state, gw: p.gw,
          predecessorRecord: !!p.predecessor, shareOfPresentLandPct: p.share == null ? undefined : p.share })),
        events: w.events.map((e) => ({ d: e.d, d2: e.d2, name: (e.name && e.name.en) || '', kind: e.kind })) })),
      notInvolved: Wr.wars.filter((w) => !w.involved).map((w) => w.id) };
  } else out.wars = Wr ? { [Wr.status]: Wr.reason || true } : null;
  const El = rec.elections;
  if (El && El.status === 'ok') out.elections = El.polities.map((p) => ({ polity: p.id, name: p.name, chambers: p.bodies.map((b) => ({ election: b.election, body: b.body, date: b.date, seatsTotal: b.seatsTotal, status: b.status,
    seats: (b.seats || []).filter((s) => s.seats > 0).map((s) => ({ party: s.name, seats: s.seats })), district: b.district ? { name: b.district.name, native: b.district.native || null, recorded: b.district.recorded, winner: b.district.winner ? b.district.winner.name : null, candidates: b.district.candidates.map((c) => ({ name: c.name, party: c.party && c.party.name, votes: c.votes, won: c.won })), totalVotes: b.district.total } : null, src: b.src, lic: b.lic })) }));
  else out.elections = El ? { [El.status]: El.reason || 'no district of the held elections contains the point' } : null;
  return out;
}

const EVENT_PAST_CSS = [
  '.ep-where{font-size:12px;color:var(--text-muted);line-height:1.5;margin:2px 0 6px;}',
  '.ep-sub{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin:12px 0 4px;}',
  '.ep-war,.ep-body{margin:4px 0 8px;}',
  '.ep-pol>b{font-size:12.5px;}',
  '.ep-war-h{display:block;width:100%;text-align:left;font:inherit;font-size:12.5px;font-weight:650;color:var(--text-main);background:none;border:none;border-radius:8px;padding:3px 6px;margin:0 -6px;}',
  '.ep-go{cursor:pointer;} .ep-go:hover{background:var(--input-bg);} .ep-go:active{transform:scale(0.99);}',
  '@media (pointer:coarse){.ep-go{min-height:44px;}}',
  '.ep-when{font-size:11.5px;font-weight:400;color:var(--text-muted);font-variant-numeric:tabular-nums;}',
  '.ep-pre{font-size:10.5px;font-weight:600;color:var(--text-muted);border:1px solid var(--glass-border);border-radius:6px;padding:0 5px;}',
  '.ep-per{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;font-size:12px;margin:2px 0;}',
  '.ep-per i,.ep-seats i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:4px;font-style:normal;}',
  '.ep-seats{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:12px;margin:2px 0;}',
  '.ep-src{font-size:10.5px;color:var(--text-muted);}',
  '.ep-note{font-size:11px;color:var(--text-muted);line-height:1.5;margin:4px 0;}',
  '.ep-ev summary{font-size:11.5px;color:var(--primary-color);cursor:pointer;margin:3px 0;}',
  '.ep-ev ul{margin:2px 0 4px 16px;padding:0;font-size:11.5px;line-height:1.5;}',
  '.ep-ev a{color:var(--primary-color);text-decoration:none;}',
  '.ep-cands{list-style:none;margin-left:0 !important;}',
  '.ep-cands i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:5px;font-style:normal;}',
  '.ep-won{font-weight:650;}',
].join('\n');
export function ensureCss() {
  ensureHistoryCss();
  try { if (!document.getElementById('im-event-past-css')) { const st = document.createElement('style'); st.id = 'im-event-past-css'; st.textContent = EVENT_PAST_CSS; document.head.appendChild(st); } } catch (_) { /* no document */ }
}

/**
 * mount(el, item, HOST) — the news card's section, after its button was pressed: reads the three records for the
 * event's place and draws them into `el`; a row's press moves the clock (a polity), opens the war on its first day
 * at this ground (a war) or the election layer on that election (an election). → the record.
 */
export async function mount(el, item, HOST) {
  ensureCss();
  const lang = () => { try { return HOST.lang || 'en'; } catch (_) { return 'en'; } };
  const place = eventPlace(item);
  let rec = { place, history: null, wars: null, elections: null };
  el.innerHTML = pastHtml(rec, lang());
  rec = await readPast(place);
  if (!el.isConnected) return rec;
  el.innerHTML = pastHtml(rec, lang());
  el.onclick = (ev) => {
    const t = ev.target && ev.target.closest ? ev.target.closest('[data-hn],[data-ep]') : null;
    if (!t) return;
    /* (exploration-flows) the same helper the place card presses through: the clock moves AND the map goes to the event's ground */
    if (t.dataset.hn) { historyGo(rec.history, t.dataset.hn, lang, place.at); return; }
    const k = t.dataset.ep || '';
    if (k.indexOf('war:') === 0) {
      const w = rec.wars && rec.wars.wars[+k.slice(4)], W = WARS();
      if (!w || !W) return;
      const first = w.periods.find((p) => p.faction !== 'NEUTRAL') || w.periods[0];
      /* (news-past-fixes) through the war's Layers-panel row, like the checkbox and Atlas `<war>.show`: calling the layer
         directly drew the fill while the row stayed unticked and the share link left it out */
      Promise.resolve(W.show(w.id, first ? first.from : '')).catch(() => { /* the layer states its own failure */ });
    } else if (k.indexOf('elec:') === 0) {
      const E = ELECTIONS(); if (!E) return;
      /* (news-past-fixes) the election is chosen BEFORE the switch and the map goes to it (js/elections.js `open`) */
      Promise.resolve(E.open(k.slice(5))).catch(() => { /* the layer states its own failure */ });
    }
  };
  return rec;
}

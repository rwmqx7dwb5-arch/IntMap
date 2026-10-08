/* ============================================================================
 *  IntMap · js/journey-through-time.js — ONE JOURNEY, ASKED AT SEVERAL INSTANTS   (atlas-product)
 * ----------------------------------------------------------------------------
 *  «Paris to Istanbul: which states would the traveller have passed through in 1913, in 1925, today?»
 *  The route panel has answered the TODAY half since #R184 («Borders»: the countries a route crosses, in order,
 *  and how far it runs in each). The border records the era layer draws hold the other halves — CShapes 2.0 by the
 *  day from 1886, OpenHistoricalMap and Cliopatria before it, the era sheets below — and nothing could ask them
 *  about a LINE: the year book asks about a year, «This place through time» about a point.
 *
 *  This asks a line. For each instant it walks the same samples the route panel walks (js/routing-ops.js — the one
 *  sampler and the one point-in-polygon test) over the collection the map draws at that instant
 *  (js/time-borders.js `collectionAt`, the call the era layer and the year book draw from), and returns, in order,
 *  the polities the line runs through, how far, and where it crosses from one to the next. Then it puts the
 *  instants side by side: which polities the line meets at one instant and not at another.
 *  Atlas reaches it as `time.journey` (js/atlas-cap-time.js) and draws one instant's answer on the map, coloured
 *  by polity; the route panel's «Historical network» asks it of the computed route for the year in its field.
 *
 *  ⚠ IT SAYS ONLY WHAT THE RECORD DRAWS (.agents/rules/historical-verification.md):
 *    · a polity is named because the record draws it at that instant over that sample, under the record's name in
 *      the reader's language (js/year-book.js `nameIn` — the year book's reading of the same features);
 *    · where the record draws TWO shapes over one place (a realm over its members is set aside as `within`; two
 *      claims are not), both are named and the stretch is marked as an overlap — no one of them is chosen;
 *    · where the record draws nothing, the stretch is SEA or LAND THE RECORD DOES NOT COVER, told apart by today's
 *      land outlines (Natural Earth) — «no record» is never written as «no state»;
 *    · a polity is compared across instants by the name the records write, and the answer says so: the records
 *      do not share identifiers across eras (CShapes' state-system codes begin in 1886);
 *    · the record that answered each instant names itself (`recordOf`), and an instant no record could be read for
 *      says that, instead of being answered as empty (.agents/rules/one-pass-or-a-reason.md §5).
 *  ⚠ THE LENGTHS ARE ALONG THE LINE THAT WAS ASKED — a great circle between the waypoints, or the computed route —
 *    not the road a traveller of that year took (the panel's historical-network search is that question), and a
 *    crossing is located to half a sample step (the step is in the answer).
 *  Strings IntMap writes here are en + jp (CONSTITUTION.md §7). No emoji.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { nameIn, esc, bordersNow } from './year-book.js';
import { borderSamples, greatCircleLine, featureAt, featuresAt, wrapLng, countryOutlines } from './routing-ops.js';

/* the longest straight piece of a great-circle leg before it is sampled. Measured: at 25 km the chord of a
   great circle departs from the arc by under 15 m at any latitude (sagitta = L²/8R), far inside the sampler's own
   step (≥ 200 m) — finer adds vertices and no accuracy; coarser starts to bend a long leg off its course. Invalid
   if the sampler's floor (js/routing-ops.js BORDER_SAMPLE.minStepM) drops below ~15 m. */
const GREAT_CIRCLE_STEP_M = 25000;

/* ══ INSTANTS ═════════════════════════════════════════════════════════════════════════════════════
   A year lands on mid-June at noon — the reading time.yearbook and the clock give a bare year (js/atlas-cap-time.js
   `yearbook`), so «1920» here is the world the year book and the map show for 1920. A date is that day at noon.
   Years are astronomical (0 is 1 BC), as everywhere in Chronos. */
const DATE_RE = /^(-?\d{1,6})-(\d{1,2})-(\d{1,2})$/;
export function instantOf(spec, nowDate) {
  if (spec && spec.now) { const d = nowDate || new Date(); return { now: true, when: d, year: d.getFullYear(), iso: null }; }
  if (spec && spec.date != null) {
    const m = DATE_RE.exec(String(spec.date).trim()); if (!m) return null;
    const y = +m[1], mo = +m[2], da = +m[3]; if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    const d = new Date(0); d.setFullYear(y, mo - 1, da); d.setHours(12, 0, 0, 0);
    if (d.getMonth() !== mo - 1) return null;   /* 31 February is not a day */
    return { now: false, when: d, year: y, iso: (y < 0 ? '-' + String(-y).padStart(6, '0') : String(y).padStart(4, '0')) + '-' + String(mo).padStart(2, '0') + '-' + String(da).padStart(2, '0') };
  }
  if (spec && spec.year != null && isFinite(+spec.year)) {
    const y = Math.round(+spec.year), d = new Date(0); d.setFullYear(y, 5, 15); d.setHours(12, 0, 0, 0);
    return { now: false, when: d, year: y, iso: null };
  }
  return null;
}
/** the instant in words, in the reader's language */
export function instantLabel(I, lang) {
  const t = (en, jp) => IntMapLang.t(lang, en, jp);
  if (I.now) return t('Today', '今日');
  const yl = I.year <= 0 ? t((1 - I.year) + ' BC', '紀元前' + (1 - I.year) + '年') : t(String(I.year), I.year + '年');
  if (!I.iso) return yl;
  const md = I.iso.slice(-5);
  return t(yl.replace(/ BC$/, '') + '-' + md + (I.year <= 0 ? ' BC' : ''), yl + (+md.slice(0, 2)) + '月' + (+md.slice(3)) + '日');
}

/* ══ ONE INSTANT ══════════════════════════════════════════════════════════════════════════════════ */
/* today's outlines (Natural Earth, window.countryGeo): the name in the reader's language — the columns
   js/countries-ui.js reads for the Countries list */
function modernName(p, lang) {
  const en = String(p.NAME_EN || p.ADMIN || p.NAME || '').trim();
  const col = lang === 'jp' ? 'NAME_JA' : 'NAME_' + String(lang || 'en').toUpperCase();
  return { en, local: String(p[col] || en).trim() };
}

/** the line to sample: waypoints joined along great circles, or a route's own coordinates */
export function lineOf(waypoints, opts) {
  return (opts && opts.asRoute) ? waypoints.map((p) => [+p[0], +p[1]]) : greatCircleLine(waypoints.map((p) => [+p[0], +p[1]]), GREAT_CIRCLE_STEP_M);
}

/**
 * journeyAt(coords, instant, deps) — the polities along one line at one instant.
 *   deps: { borders: js/time-borders.js (window.IntMapTimeBorders), land: () => today's country FeatureCollection
 *           (window.countryGeo) or null, lang }
 *   → { instant, record:{tier, src}|null, modern, legs:[{key, km}], runs:[{kind, key, names:[{en,local}], under, within, fromM, toM, i0, i1}],
 *       polities:[{key, names, km}], sequence:[key…], crossings:[{from, to, atKm, lng, lat}], stepM, totalKm, failed? }
 *   kinds: 'polity' (one) · 'overlap' (two or more the record draws at once) · 'unnamed' (a shape the record draws
 *   without a name) · 'norecord' (land the record does not cover) · 'sea' · 'outside' (nothing drawn, and no land
 *   outlines to tell sea from land)
 */
export async function journeyAt(coords, instant, deps, samples) {
  const lang = deps.lang || 'en';
  const S = samples || borderSamples(coords);
  const out = { instant, record: null, modern: false, runs: [], polities: [], sequence: [], crossings: [], stepM: S.pts.length > 1 ? Math.round(S.total / (S.pts.length - 1)) : 0, totalKm: S.total / 1000 };
  const landFC = deps.land ? deps.land() : null;
  const land = landFC && Array.isArray(landFC.features) && landFC.features.length ? landFC.features : null;
  let feats = null, modern = !!instant.now;
  if (!modern) {
    const TB = deps.borders;
    if (!TB || typeof TB.collectionAt !== 'function') return Object.assign(out, { failed: 'history-borders-not-loaded' });
    let c = null; try { c = await TB.collectionAt(instant.when); } catch (_) { c = null; }
    if (c && c.modern) modern = true;
    else if (c && c.fc && Array.isArray(c.fc.features)) {
      feats = c.fc.features;
      let rec = c.record || null; try { if (!rec && TB.recordOf) rec = TB.recordOf(c.tier); } catch (_) { rec = null; }
      out.record = { tier: c.tier || null, src: (rec && rec.src) || null };
    } else return Object.assign(out, { failed: 'record-not-readable' });
  }
  if (modern) {
    if (!land) return Object.assign(out, { failed: 'country-outlines-not-loaded' });
    out.modern = true; feats = land; out.record = { tier: 'modern', src: 'Natural Earth admin-0 (today’s borders)' };
  }

  /* what each sample is inside */
  const at = S.pts.map((p) => {
    const lng = wrapLng(p.lng), hit = featuresAt(lng, p.lat, feats);
    if (!hit.length) {
      if (modern) return { kind: 'sea', key: '~sea' };
      if (!land) return { kind: 'outside', key: '~outside' };
      return featureAt(lng, p.lat, land) ? { kind: 'norecord', key: '~norecord' } : { kind: 'sea', key: '~sea' };
    }
    const named = new Map(), within = new Map(); let unnamed = 0, under = null;
    for (const f of hit) {
      const pr = f.properties || {};
      const nm = modern ? modernName(pr, lang) : { en: nameIn(pr, 'en'), local: nameIn(pr, lang) };
      if (!nm.en) { unnamed++; continue; }
      if (!modern && pr._realm) { within.set(nm.en, nm); continue; }
      if (!named.has(nm.en)) named.set(nm.en, nm);
      if (!modern && !under) under = pr.SUBJECTO || pr.PARTOF || null;
    }
    /* a realm is set aside only when a member is drawn under it; a realm alone IS what the record draws there */
    if (!named.size && within.size) { for (const [k, v] of within) named.set(k, v); within.clear(); }
    if (!named.size) return { kind: 'unnamed', key: '~unnamed' };
    const names = [...named.values()].sort((a, b) => (a.en < b.en ? -1 : a.en > b.en ? 1 : 0));
    return { kind: names.length > 1 ? 'overlap' : 'polity', key: names.map((n) => n.en).join(' / '), names, under: names.length > 1 ? null : under, within: [...within.values()] };
  });

  /* consecutive samples with the same answer are one run; a crossing is placed halfway between the two samples */
  const mid = (i) => (i <= 0 ? 0 : i >= S.pts.length ? S.total : (S.pts[i - 1].d + S.pts[i].d) / 2);
  for (let i = 0; i < at.length; i++) {
    const last = out.runs[out.runs.length - 1];
    if (last && last.key === at[i].key) { last.i1 = i; continue; }
    out.runs.push(Object.assign({ i0: i, i1: i }, at[i], { names: at[i].names || [] }));
  }
  for (const r of out.runs) { r.fromM = mid(r.i0); r.toM = r.i1 === at.length - 1 ? S.total : mid(r.i1 + 1); }

  /* the polities in the order the line meets them — sea and unrecorded land between two stretches of the same polity
     are not a crossing (the route panel's rule: «a land→sea→land pair with the same country either side collapses») */
  const byKey = new Map(), seq = [];
  for (const r of out.runs) {
    if (r.kind === 'sea' || r.kind === 'norecord' || r.kind === 'outside') continue;
    const P = byKey.get(r.key) || { key: r.key, kind: r.kind, names: r.names, under: r.under || null, within: r.within || [], km: 0 };
    P.km += (r.toM - r.fromM) / 1000; byKey.set(r.key, P);
    if (!seq.length || seq[seq.length - 1].key !== r.key) {
      if (seq.length) { const p = S.pts[r.i0]; out.crossings.push({ from: seq[seq.length - 1].key, to: r.key, atKm: r.fromM / 1000, lng: wrapLng(p.lng), lat: p.lat }); }
      seq.push({ key: r.key, km: 0 });
    }
    seq[seq.length - 1].km += (r.toM - r.fromM) / 1000;   /* this stretch only — a polity met twice is two legs, and its total is in `polities` */
  }
  out.legs = seq;
  out.sequence = seq.map((r) => r.key);
  out.polities = [...byKey.values()];
  out.gapKm = { sea: 0, norecord: 0, outside: 0 };
  for (const r of out.runs) if (out.gapKm[r.kind] != null) out.gapKm[r.kind] += (r.toM - r.fromM) / 1000;
  out._samples = S;
  return out;
}

/** journeys(coords, instants, deps) — every instant, and what differs between them */
export async function journeys(coords, instants, deps) {
  const S = borderSamples(coords);
  const list = [];
  for (const I of instants) list.push(await journeyAt(coords, I, deps, S));
  /* a polity the line meets at some instants and not at others — by the name the records write (see the header) */
  const ok = list.filter((j) => !j.failed);
  const seen = new Map();
  ok.forEach((j, n) => { for (const P of j.polities) { if (P.kind !== 'polity') continue; const e = seen.get(P.key) || { key: P.key, names: P.names, at: [] }; e.at.push(n); seen.set(P.key, e); } });
  const differs = ok.length > 1 ? [...seen.values()].filter((e) => e.at.length < ok.length) : [];
  return { journeys: list, differs, okCount: ok.length, samples: S };
}

/* ══ WHAT ATLAS RECEIVES — JSON-safe, the record's names, the lengths rounded to the step they were measured at ══ */
export function forAtlas(R, lang) {
  const nm = (P) => P.kind === 'unnamed' ? null : P.names.map((n) => (n.local && n.local !== n.en ? n.local + ' (' + n.en + ')' : n.en)).join(' / ');
  const r1 = (x) => Math.round(x * 10) / 10;
  return {
    comparedBy: 'the name each border record draws (the records share no identifier across eras)',
    lengthsAre: 'km along the line asked (great circle between the waypoints, or the computed route) — not the road a traveller of that year took',
    instants: R.journeys.map((j) => Object.assign({ at: instantLabel(j.instant, 'en') },
      j.failed ? { failed: j.failed } : {
        record: j.record, drawsTodaysBorders: j.modern || undefined, sampleStepM: j.stepM, totalKm: r1(j.totalKm),
        legs: j.legs.map((g) => { const P = j.polities.find((x) => x.key === g.key); return Object.assign({ name: P ? nm(P) : g.key, km: r1(g.km) }, P && P.kind === 'unnamed' ? { unnamed: true } : {}); }),
        polities: j.polities.map((P) => Object.assign({ name: nm(P), km: r1(P.km) }, P.kind === 'overlap' ? { overlap: 'the record draws these at the same place; none is chosen' } : {}, P.kind === 'unnamed' ? { unnamed: 'a shape the record draws without a name' } : {}, P.under ? { under: P.under } : {}, P.within && P.within.length ? { within: P.within.map((w) => w.en) } : {})),
        crossings: j.crossings.length, crossingPoints: j.crossings.map((c) => ({ from: c.from, to: c.to, atKm: r1(c.atKm), lng: +c.lng.toFixed(3), lat: +c.lat.toFixed(3) })),
        notCovered: { seaKm: r1(j.gapKm.sea), landWithNoRecordKm: r1(j.gapKm.norecord), undeterminedKm: r1(j.gapKm.outside) },
      })),
    onlyAtSomeInstants: R.differs.map((e) => ({ name: e.names.map((n) => n.en).join(' / '), metAt: e.at.map((n) => instantLabel(R.journeys.filter((j) => !j.failed)[n].instant, 'en')) })),
    lang,
  };
}

/* ══ THE READER'S ANSWER — one block per instant, then what differs. `colors` maps a key to the swatch drawn on the
   map for the instant that is drawn (null for the others). ══ */
function failText(code, t) {
  if (code === 'history-borders-not-loaded') return t('The historical border records are not loaded.', '歴史国境の記録が読み込まれていません。');
  if (code === 'record-not-readable') return t('No border record could be read for this instant.', 'この時点の国境の記録を読み込めませんでした。');
  if (code === 'country-outlines-not-loaded') return t('Today’s country outlines are not loaded yet.', '現在の国境データがまだ読み込まれていません。');
  return t('Could not be read.', '読み込めませんでした。');
}
export function answerHtml(R, lang, opts) {
  const o = opts || {}, t = (en, jp) => IntMapLang.t(lang, en, jp);
  const km = (x) => Math.round(x).toLocaleString(lang === 'jp' ? 'ja-JP' : 'en-US') + ' km';
  const sw = (c) => c ? '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px;background:' + esc(c) + ';"></span>' : '';
  const nmOf = (P) => P.names.map((n) => n.local || n.en).join(' / ');
  let h = '';
  R.journeys.forEach((j, n) => {
    const head = esc(instantLabel(j.instant, lang)) + (o.drawn === n ? ' <span style="color:var(--text-muted);font-weight:400;">' + esc(t('(drawn on the map)', '（地図に描画）')) + '</span>' : '');
    if (j.failed) { h += '<div style="margin-top:6px;"><b>' + head + '</b> — ' + esc(failText(j.failed, t)) + '</div>'; return; }
    const cols = o.drawn === n ? (o.colors || {}) : {};
    const seq = j.legs.map((g) => { const k = g.key, P = j.polities.find((x) => x.key === k); return P ? sw(cols[k]) + '<b>' + esc(nmOf(P)) + '</b> <span style="color:var(--text-muted);">' + esc(km(g.km)) + '</span>' + (P.kind === 'overlap' ? ' <span style="color:var(--text-muted);">' + esc(t('(drawn by two claims at once)', '（2 つの主張が重なる）')) + '</span>' : '') + (P.kind === 'unnamed' ? ' <span style="color:var(--text-muted);">' + esc(t('(drawn without a name)', '（名前の無い形）')) + '</span>' : '') + (P.under ? ' <span style="color:var(--text-muted);">' + esc(t('under ', '従属先 ') + P.under) + '</span>' : '') : esc(k); }).join(' → ');
    const gap = [];
    if (j.gapKm.sea >= 1) gap.push(t('sea ', '海 ') + km(j.gapKm.sea));
    if (j.gapKm.norecord >= 1) gap.push(t('land the record does not cover ', '記録の無い陸地 ') + km(j.gapKm.norecord));
    if (j.gapKm.outside >= 1) gap.push(t('not drawn by the record ', '記録が描いていない区間 ') + km(j.gapKm.outside));
    h += '<div style="margin-top:6px;"><b>' + head + '</b> — ' + esc(t(j.crossings.length + (j.crossings.length === 1 ? ' crossing' : ' crossings'), '国境越え ' + j.crossings.length + ' 回'))
      + '<div style="line-height:1.6;">' + (seq || esc(t('The line meets no polity the record draws.', 'この線は記録が描く政体のどれにも入りません。'))) + '</div>'
      + (gap.length ? '<div style="font-size:11px;color:var(--text-muted);">' + esc(gap.join(' · ')) + '</div>' : '')
      + '<div style="font-size:11px;color:var(--text-muted);">' + esc(t('Record: ', '記録: ') + ((j.record && j.record.src) || (j.record && j.record.tier) || '')) + '</div></div>';
  });
  if (R.differs.length) {
    const ok = R.journeys.filter((j) => !j.failed);
    h += '<div style="margin-top:8px;"><b>' + esc(t('Met at some instants only', '一部の時点でだけ通る政体')) + '</b><div style="line-height:1.6;">'
      + R.differs.map((e) => esc(e.names.map((x) => x.local || x.en).join(' / ')) + ' <span style="color:var(--text-muted);">(' + esc(e.at.map((i) => instantLabel(ok[i].instant, lang)).join(', ')) + ')</span>').join(' · ') + '</div></div>';
  }
  const st = R.journeys.find((j) => !j.failed);
  h += '<div style="margin-top:6px;font-size:10.5px;color:var(--text-muted);line-height:1.45;">' + esc(t(
    'Lengths are along the line asked' + (o.asRoute ? ' (the computed route)' : ' (great circles between the places)') + ', sampled every ' + (st ? st.stepM : '—') + ' m — not the road a traveller of the time took. Polities are the ones each border record draws, under its names, and are compared across instants by those names. Sea and land the record does not cover are told apart with today’s land outlines (Natural Earth).',
    '長さは問われた線に沿った値です' + (o.asRoute ? '（計算した経路）' : '（地点間の大圏）') + '。' + (st ? st.stepM : '—') + ' m ごとに判定。当時の旅人が通った道ではありません。政体は各時点の国境の記録が描くものをその名で示し、時点間の比較もその名で行います。海と記録の無い陸地は現在の陸地の輪郭（Natural Earth）で区別しています。')) + '</div>';
  return h;
}

/* ══ ON THE MAP — one instant's answer as coloured stretches of the line ══════════════════════════════
   One LineString per run, coloured by polity (the colour of a key is fixed for the call, so two stretches of one
   polity share it), sea and unrecorded land in grey and fainter. The caller owns the line layer
   (js/atlas-console.js `_hlLines` / `paintLines`); this only describes what goes on it. */
const GREY = '#8e8e93';   /* the system grey the app's muted text and inactive marks use (iOS systemGray) */
function lineFeatures(j, colorOf, lang) {
  const S = j._samples, cols = {}, out = [];
  let n = 0;
  const label = instantLabel(j.instant, lang);
  for (const r of j.runs) {
    const coords = S.pts.slice(r.i0, Math.min(S.pts.length, r.i1 + 2)).map((p) => [p.lng, p.lat]);
    if (coords.length < 2) continue;
    const grey = r.kind === 'sea' || r.kind === 'norecord' || r.kind === 'outside';
    if (!grey && !cols[r.key]) cols[r.key] = colorOf(n++);
    const nm = grey ? IntMapLang.t(lang, r.kind === 'sea' ? 'sea' : 'no record', r.kind === 'sea' ? '海' : '記録なし') : r.names.map((x) => x.local || x.en).join(' / ') || IntMapLang.t(lang, 'unnamed shape', '名前の無い形');
    out.push({ geo: { type: 'LineString', coordinates: coords }, color: grey ? GREY : cols[r.key], w: grey ? 2 : 4, op: grey ? 0.5 : 0.95, name: label + ' · ' + nm + ' · ' + Math.round(r.fromM / 1000) + ' km' });
  }
  return { lines: out, colors: cols };
}

/* ══ ATLAS — `time.journey` (js/atlas-cap-time.js). Fetched with this module on first use, so the Atlas chunk does not
   carry it. Atlas chooses the waypoints and the instants; nothing here chooses for it. With no instant the answer is
   for the instant on the clock — what the map is showing — as time.coverage and time.yearbook read it. ══ */
const DRAW_PREFIX = 'journey:';
export async function atlasRun(a, K) {
  const R = K.R, warn = K.warn, L = K.L, note = K.note, HOST = K.HOST;
  let lang = 'en'; try { lang = (HOST && HOST.lang) || 'en'; } catch (_) { lang = 'en'; }
  /* the waypoints — coordinates as given, or names IntMap places itself (the model names, IntMap resolves) */
  const wps = [];
  if (Array.isArray(a.points)) for (const p of a.points) if (Array.isArray(p) && isFinite(+p[0]) && isFinite(+p[1])) wps.push({ lng: +p[0], lat: +p[1], name: '' });
  if (!wps.length) {
    const names = Array.isArray(a.places) ? a.places.slice() : [];
    if (!names.length && a.from != null && a.to != null) names.push(a.from, ...(Array.isArray(a.via) ? a.via : []), a.to);
    for (const n of names) {
      const g = await K.geocode(String(n));
      if (!g) return R(false, warn(esc(L('IntMap could not place «' + n + '». Give coordinates, or name a place IntMap holds.', '「' + n + '」を地図上に特定できませんでした。座標を指定するか、IntMap が持つ地名で言い直してください。'))));
      wps.push({ lng: +g.lng, lat: +g.lat, name: g.name || String(n) });
    }
  }
  if (wps.length < 2) return R(false, warn(esc(L('A journey needs at least two places (names or coordinates).', '道のりには 2 つ以上の地点（地名か座標）が必要です。'))));
  /* the instants, in the order Atlas gave them */
  const specs = [];
  for (const y of (Array.isArray(a.years) ? a.years : a.year != null ? [a.year] : [])) specs.push({ year: y });
  for (const d of (Array.isArray(a.dates) ? a.dates : a.date != null ? [a.date] : [])) specs.push({ date: d });
  if (a.now) specs.push({ now: true });
  const instants = [];
  for (const s of specs) { const I = instantOf(s); if (!I) return R(false, warn(esc(L('«' + (s.date != null ? s.date : s.year) + '» is not a year or a YYYY-MM-DD date.', '「' + (s.date != null ? s.date : s.year) + '」は年でも YYYY-MM-DD 形式の日付でもありません。')))); instants.push(I); }
  if (!instants.length) {
    const { IntMapTime: T } = await import('./chronos.js');
    if (T.isLive()) instants.push(instantOf({ now: true }));
    else { const w = T.when(), y = w.getFullYear(); instants.push({ now: false, when: w, year: y, iso: (y < 0 ? '-' + String(-y).padStart(6, '0') : String(y).padStart(4, '0')) + '-' + String(w.getMonth() + 1).padStart(2, '0') + '-' + String(w.getDate()).padStart(2, '0') }); }
  }
  /* today's outlines: the present instant's polities, and the land that tells sea from «no record» in the past */
  try { if (K.ensureData) await K.ensureData(); } catch (_) { /* answered per instant below */ }
  const asRoute = !!a.asRoute;
  const line = lineOf(wps.map((p) => [p.lng, p.lat]), { asRoute });
  const res = await journeys(line, instants, { borders: bordersNow(), land: countryOutlines, lang });
  const title = '<b>' + esc(L('Journey through time', '時をまたぐ道のり')) + ' — ' + esc(wps.map((p) => p.name || (p.lat.toFixed(3) + ', ' + p.lng.toFixed(3))).join(' → ')) + '</b>';
  const exec = { journey: forAtlas(res, lang) };
  if (!res.okCount) return R(false, title + answerHtml(res, lang, { asRoute }), { exec });
  /* one instant on the map: the one Atlas names (1-based, in the order given), else the first that was read */
  const okIdx = res.journeys.map((j, i) => (j.failed ? -1 : i)).filter((i) => i >= 0);
  const want = (a.draw != null && isFinite(+a.draw)) ? Math.round(+a.draw) - 1 : -1;
  const drawn = okIdx.indexOf(want) >= 0 ? want : okIdx[0];
  /* a redraw of the same course replaces its own stretches (the course is the identity, js/atlas-cap-map.js drawLine) */
  const course = DRAW_PREFIX + wps.map((p) => p.lng.toFixed(5) + ',' + p.lat.toFixed(5)).join(' ');
  K._hlLines = K._hlLines.filter((l) => !(l && l.journey === course));
  const F = lineFeatures(res.journeys[drawn], (i) => K._hlPaletteColor(i), lang);
  for (const l of F.lines) { l.journey = course; l.key = course + ' ' + l.name; K._hlLines.push(l); }
  const okL = K.paintLines();
  try { let w = 180, s = 90, e = -180, n = -90; for (const p of line) { w = Math.min(w, p[0]); s = Math.min(s, p[1]); e = Math.max(e, p[0]); n = Math.max(n, p[1]); } if (e - w < 340) K.GE().camera.fitBounds([[w, s], [e, n]], { padding: 80, maxZoom: 8, duration: 900 }); } catch (_) { /* no renderer */ }
  exec.journey.drawnOnMap = okL ? instantLabel(res.journeys[drawn].instant, 'en') : null;
  const html = title + answerHtml(res, lang, { drawn: okL ? drawn : -1, colors: F.colors, asRoute })
    + note(esc(L('To see that instant’s borders under the line, move the clock to it.', '線の下にその時点の国境を出すには、時計をその時点へ動かしてください。')));
  return R(true, html, { exec, meta: Object.assign({ painted: { lines: okL ? F.lines.map((l) => l.name) : [] }, resultKey: 'time.journey:' + course + '@' + res.journeys.map((j) => instantLabel(j.instant, 'en')).join(',') + '#' + drawn }, okL ? {} : { partial: true }) });
}

/* ══ THE ROUTE PANEL — «Borders that year» in «Historical network» (js/routing-ui.js): the computed route, at the
   year in the panel's field and today, in the panel's own words. ══ */
export async function renderRoutePanel(target, coords, year, lang) {
  const res = await journeys(lineOf(coords, { asRoute: true }), [instantOf({ year }), instantOf({ now: true })], { borders: bordersNow(), land: countryOutlines, lang });
  if (target) target.innerHTML = '<h4>' + esc(IntMapLang.t(lang, 'Borders along this route — ' + year + ' and today', 'この経路の国境 — ' + year + ' 年と今日')) + '</h4>' + answerHtml(res, lang, { asRoute: true });
  return res;
}

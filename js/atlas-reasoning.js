/* ============================================================================
 *  IntMap · ATLAS — THE THREE ANSWERS THAT ARE A STRUCTURE, NOT A PARAGRAPH   (js/atlas-reasoning.js)
 * ----------------------------------------------------------------------------
 *  PRODUCT.md §4 lists twenty things Atlas is meant to do as a researcher. Three of them were
 *  reached only as prose the model composed from whatever it had fetched:
 *
 *    research.scenario   «if X happened, what follows?» — the answer was a simulator's raw output,
 *                        and nothing made it say what had been ASSUMED, what DATA the number stood on,
 *                        what the model does NOT represent and how UNCERTAIN it is.
 *    time.changes        «what changed between t0 and t1?» — every ingredient existed (the border
 *                        record, the war record, the statistics, the layer clock) and no door asked
 *                        them the same question over a period.
 *    panel.correlate     opened a panel and said «Correlation tool». The panel's r, rho and n were
 *                        visible to the reader and to nobody else, and it called a three-country
 *                        scatter «very strong» in the same words as a hundred-and-ninety-country one.
 *
 *  This file holds what is DECIDED in each, as pure functions of values (no DOM, no window), so
 *  tests/atlas-reasoning-checks.test.mjs can evaluate them rather than read them. The capabilities
 *  (js/atlas-cap-research.js, js/atlas-cap-time.js, js/atlas-cap-panel.js) gather the values and draw;
 *  the panel (js/analysis-correlate.js) calls the same `correlationReport`, so the reader's page and
 *  Atlas say the same thing.
 *
 *  ⚠ NOTHING HERE LIMITS ATLAS (CONSTITUTION.md §5). What is refused is an answer with an EMPTY FIELD —
 *  a scenario with no assumptions is not a scenario — and a word the sample cannot support. Atlas
 *  still chooses the model, the assumptions, the period and the region.
 *  ⚠ NOTHING HERE REPEATS A STEP (.agents/rules/one-pass-or-a-reason.md): a refusal names every
 *  missing field at once, and a partial result says what was not delivered rather than being re-run.
 * ==========================================================================*/

import { IntMapLang } from './lang-registry.js';

/** a sentence in the two languages IntMap writes in (CONSTITUTION.md §7): the array [en, jp] — `pickArgs()` hands back the very
    array it is given, so a sentence is ordinary data AND a call the translation audits read (scripts/i18n-pair-audit.mjs) */
const T = IntMapLang.pickArgs();
const text = T;

/* ══ 1 · research.scenario ═════════════════════════════════════════════════════════════════════════ */

/* WHAT EACH SIMULATOR STANDS ON AND DOES NOT REPRESENT is declared WITH the simulator — the `scenario` field of its entry in
   js/atlas-cap-sim.js (atlas-caps.js ENTRY_KEYS), beside its schema — and read here: `scenarioModels(entries)` turns the entries
   that declare one into the table the functions below take. The model's own argument vocabulary is its schema's properties (not a
   second list), its dispatch spelling is its row's, its method section is its `science`. A `sim.*` entry that states a method
   section but declares no scenario is held to a stated reason by tests/atlas-reasoning-checks.test.mjs (the universe is the entries). */
export function scenarioModels(entries) {
  const out = {};
  (entries || []).forEach((e) => {
    if (!e || !e.scenario) return;
    const S = e.scenario;
    out[e.row[0]] = { dispatch: e.row[1], science: e.science || null, subject: S.subject, baselineParam: S.baselineParam == null ? null : S.baselineParam,
      args: Object.keys((e.schema() || {}).properties || {}), data: S.data || [], excluded: S.excluded || [], uncertainty: S.uncertainty || [] };
  });
  return out;
}

const ISO_RE = /^-?\d{4,6}-\d{2}-\d{2}/;
const blank = (v) => v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);

/** which model a call named — by capability id, dispatch spelling or any alias the registry resolves.
    `resolve` is the registry's own `ofSpelling` (so an alias the row declares counts); a model whose entry declares no `scenario`
    is not a what-if this file can describe, and the refusal says which ones are. */
export function scenarioModelId(name, resolve, models) {
  const s = String(name == null ? '' : name).trim();
  if (!s) return null;
  if (models[s]) return s;
  let id = null;
  try { const row = resolve && resolve(s); id = row && row.id; } catch (_) { id = null; }
  if (id && models[id]) return id;
  const low = s.toLowerCase();
  return Object.keys(models).find((k) => k.toLowerCase() === low || models[k].dispatch.toLowerCase() === low) || null;
}

/** THE FRAME OF A SCENARIO — what the call stated, validated. A scenario with no assumption, no subject or no baseline
    is not a scenario: the refusal lists EVERY field that is empty at once (one call corrected, not several). */
export function scenarioFrame(a, resolve, models) {
  const missing = [];
  const modelId = scenarioModelId(a.model, resolve, models);
  if (!modelId) missing.push('model');
  const raw = Array.isArray(a.assumptions) ? a.assumptions : [];
  const assumptions = raw.map((x) => (x && typeof x === 'object') ? { name: String(x.name == null ? '' : x.name).trim(), value: x.value, basis: x.basis == null ? '' : String(x.basis) } : { name: '', value: undefined, basis: '' });
  if (!assumptions.length || assumptions.some((x) => !x.name || blank(x.value))) missing.push('assumptions');
  const hasPoint = a.lng != null && a.lat != null && isFinite(+a.lng) && isFinite(+a.lat);
  const place = String(a.place == null ? '' : a.place).trim();
  if (!hasPoint && !place) missing.push('subject');
  let baseline = a.baseline;
  if (typeof baseline === 'number' && isFinite(baseline)) baseline = String(Math.round(baseline));
  baseline = baseline == null ? '' : String(baseline).trim();
  if (!baseline) missing.push('baseline');
  return { ok: !missing.length, missing, modelId, assumptions, place, point: hasPoint ? { lng: +a.lng, lat: +a.lat } : null, baseline };
}

/** the arguments the model's own action is called with, and what became of each stated assumption and of the baseline.
    An assumption the model has no argument for is NOT silently dropped — it is returned `applied:false` and the report
    says the model does not represent it. A baseline given as a bare year is not turned into a date (that would be
    inventing the day, .agents/rules/historical-verification.md §2 ③): it is reported as not applied. */
export function scenarioCall(frame, models) {
  const M = models[frame.modelId];
  const args = { type: M.dispatch };
  if (frame.point) { args.lng = frame.point.lng; args.lat = frame.point.lat; if (frame.place) args[M.subject] = frame.place; }
  else args[M.subject] = frame.place;
  const rows = [];
  const live = /^(now|live|today|current)$/i.test(frame.baseline);
  const isoBaseline = ISO_RE.test(frame.baseline);
  frame.assumptions.forEach((x) => {
    if (M.baselineParam && x.name === M.baselineParam && (isoBaseline || live)) { rows.push({ name: x.name, value: x.value, basis: x.basis, applied: false, why: T('superseded by the scenario\'s baseline', 'シナリオの基準時点が優先された') }); return; }
    if (M.args.indexOf(x.name) >= 0) { args[x.name] = x.value; rows.push({ name: x.name, value: x.value, basis: x.basis, applied: true }); } else rows.push({ name: x.name, value: x.value, basis: x.basis, applied: false, why: T('not an input of this model — it is not represented in the result', 'このモデルの入力ではない — 結果には反映されていない') });
  });
  let baseline;
  if (!M.baselineParam) baseline = { given: frame.baseline, applied: false, why: T('this model takes no instant', 'このモデルは時刻を入力に取らない') };
  else if (live) baseline = { given: frame.baseline, applied: true, as: 'now', why: T('the model runs on the live field', 'モデルはライブの場で走る') };
  else if (isoBaseline) { args[M.baselineParam] = frame.baseline; baseline = { given: frame.baseline, applied: true, as: M.baselineParam }; }
  else baseline = { given: frame.baseline, applied: false, why: T('a bare year is not an instant, and the model needs one — it ran on the live field rather than on a day IntMap chose for you', '年だけでは時刻にならず、モデルは時刻を要する — IntMap が日を決めて代入せず、ライブの場で走らせた') };
  return { args, assumptions: rows, baseline };
}

/** THE FOUR FIELDS. `run` carries what the run itself reported (`ok`, `meta`) and `exposure` what research.impact added
    (`{ asked, ok, why }`). Returns { assumptions, dataUsed, excluded, uncertainty, baseline, complete } — `complete` is false
    while any of the four is empty, and the capability refuses to report a scenario that is not complete. */
export function scenarioReport(frame, call, run, exposure, models) {
  const M = models[frame.modelId];
  const dataUsed = M.data.slice();
  const excluded = M.excluded.slice();
  const uncertainty = M.uncertainty.slice();
  call.assumptions.forEach((x) => { if (!x.applied) excluded.push(T('Assumption «' + x.name + '» is recorded but not applied: ' + x.why[0], '前提「' + x.name + '」は記録のみで反映していない: ' + x.why[1])); });
  if (!call.baseline.applied) excluded.push(T('Baseline «' + call.baseline.given + '» is recorded but not applied: ' + call.baseline.why[0], '基準時点「' + call.baseline.given + '」は記録のみで反映していない: ' + call.baseline.why[1]));
  const meta = (run && run.meta) || {};
  if (frame.modelId === 'sim.pandemicRun') {
    const runs = call.args.runs != null ? +call.args.runs : 1;
    if (runs < 2) uncertainty.push(T('This is a single draw (runs = 1): no band is available, so it says nothing about how likely this ending is', '1 回の実行（runs = 1）なので幅がなく、この結末がどれほど起こりやすいかは何も述べていない'));
    else uncertainty.push(T(runs + ' runs: the answer is a median with a 10th–90th percentile band', runs + ' 回の実行: 中央値と 10〜90 パーセンタイルの幅で答えている'));
  }
  if (frame.modelId === 'sim.ashPlume' && meta.ash && meta.ash.peakDepositRelSE != null) uncertainty.push(T('Peak deposit ±' + Math.round(100 * meta.ash.peakDepositRelSE) + '% across the model\'s own seeds', '最大降灰厚は乱数の違いで ±' + Math.round(100 * meta.ash.peakDepositRelSE) + '%'));
  if (exposure && exposure.asked) {
    if (exposure.ok) { dataUsed.push(T('OpenStreetMap facilities and city population tags, USGS earthquakes of the last 7 days, IntMap country statistics (research.impact)', 'OpenStreetMap の施設・都市の人口タグ、直近 7 日の USGS 地震、IntMap の国別統計 (research.impact)')); excluded.push(T('Exposure counts only what OpenStreetMap lists in the radius; its coverage varies by region', '曝露は半径内に OpenStreetMap が載せているものだけを数える。被覆は地域で異なる')); }
    else excluded.push(T('The exposure analysis was asked for and did not complete' + (exposure.why ? ': ' + exposure.why : ''), '曝露の分析は求められたが完了しなかった' + (exposure.why ? ': ' + exposure.why : '')));
  }
  const complete = !!(call.assumptions.length && dataUsed.length && excluded.length && uncertainty.length);
  return { model: frame.modelId, ran: !!(run && run.ok), baseline: call.baseline, assumptions: call.assumptions, dataUsed, excluded, uncertainty, complete };
}

/* ══ 2 · time.changes ══════════════════════════════════════════════════════════════════════════════ */

/** a period's two ends, from what the call stated. A bare year is the year (never a day IntMap picked): the diff reads the map
    «as of the middle of that year», the same instant time.yearbook reads, and the answer says so. */
export function changesPeriod(a, minYear, nowMs) {
  const part = (v) => {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && isFinite(v)) return { year: Math.round(v), iso: null };
    const s = String(v).trim();
    if (/^-?\d{1,6}$/.test(s)) return { year: +s, iso: null };
    if (ISO_RE.test(s)) { const t = Date.parse(s); if (isFinite(t)) return { year: new Date(t).getUTCFullYear(), iso: s.slice(0, 10), ms: t }; }
    return null;
  };
  const t0 = part(a.from != null ? a.from : a.t0), t1 = part(a.to != null ? a.to : a.t1);
  const missing = [];
  if (!t0) missing.push('from');
  if (!t1) missing.push('to');
  if (missing.length) return { ok: false, code: 'needs-period', missing };
  const nowYear = new Date(nowMs).getUTCFullYear();
  if (t0.year < minYear || t1.year < minYear) return { ok: false, code: 'before-clock', min: minYear };
  if (t1.year > nowYear) return { ok: false, code: 'in-future', year: nowYear };
  const k = (p) => (p.iso ? p.ms : Date.UTC(p.year, 5, 15, 12));
  if (k(t1) <= k(t0)) return { ok: false, code: 'empty-period' };
  return { ok: true, t0, t1 };
}

const bboxOfGeometry = (g) => {
  let w = 180, s = 90, e = -180, n = -90, any = false;
  const walk = (c) => { if (typeof c[0] === 'number') { any = true; if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; } else for (const x of c) walk(x); };
  try { if (g && g.coordinates) walk(g.coordinates); } catch (_) { return null; }
  return any ? [w, s, e, n] : null;
};
export { bboxOfGeometry };
export const boxesMeet = (a, b) => !!a && !!b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/** the polities that are on the map at one end and not the other. `rowsA` / `rowsB` are year-book's `borders.largest` rows
    (`en` name, `name` in the reader's language, `km2`, `bbox`). `region` is a [w,s,e,n] box or null. Names are matched by their
    English name — the key the border record itself uses (js/year-book.js readYear). Areas are compared only where both ends
    state one; a polity is `reshaped` when its drawn area differs by more than `tolerance` (a fraction of the earlier area).
    The default is 0: an unchanged polity is the SAME geometry within one record, so any difference is a redraw, and they are
    ordered by size of change rather than cut at a number nobody measured. A caller may pass a tolerance to hide noise across
    two records. */
export function diffPolities(rowsA, rowsB, region, tolerance) {
  const tol = tolerance == null ? 0 : tolerance;
  const inRegion = (r) => !region || !r.bbox || boxesMeet(r.bbox, region);
  const A = new Map(), B = new Map();
  (rowsA || []).forEach((r) => { if (inRegion(r)) A.set(r.en, r); });
  (rowsB || []).forEach((r) => { if (inRegion(r)) B.set(r.en, r); });
  const appeared = [], gone = [], reshaped = [];
  for (const [k, r] of B) if (!A.has(k)) appeared.push({ name: r.name, en: k, km2: r.km2 });
  for (const [k, r] of A) if (!B.has(k)) gone.push({ name: r.name, en: k, km2: r.km2 });
  for (const [k, r] of B) {
    const was = A.get(k);
    if (!was || !(was.km2 > 0)) continue;
    const rel = (r.km2 - was.km2) / was.km2;
    if (Math.abs(rel) > tol) reshaped.push({ name: r.name, en: k, from: was.km2, to: r.km2, rel });
  }
  reshaped.sort((x, y) => Math.abs(y.rel) - Math.abs(x.rel));
  appeared.sort((x, y) => (y.km2 || 0) - (x.km2 || 0));
  gone.sort((x, y) => (y.km2 || 0) - (x.km2 || 0));
  return { appeared, gone, reshaped, countA: A.size, countB: B.size };
}

/** the statistics that moved: Maddison rows (`{code,name,pop,gdppc}`) at each end. A country is compared only when BOTH ends
    state the value — a value stated at one end only goes under `onlyOne`, never as a change from or to zero. */
export function diffEconomy(rowsA, rowsB, top) {
  const n = top || 8;
  const mapOf = (rows) => { const m = new Map(); (rows || []).forEach((r) => m.set(r.code, r)); return m; };
  const A = mapOf(rowsA), B = mapOf(rowsB);
  const pop = [], gdp = []; let onlyOne = 0;
  for (const [c, b] of B) {
    const a = A.get(c);
    if (!a) { if (b.pop != null || b.gdppc != null) onlyOne++; continue; }
    if (a.pop != null && b.pop != null && a.pop > 0) pop.push({ code: c, name: b.name, from: a.pop, to: b.pop, rel: (b.pop - a.pop) / a.pop });
    else if ((a.pop == null) !== (b.pop == null)) onlyOne++;
    if (a.gdppc != null && b.gdppc != null && a.gdppc > 0) gdp.push({ code: c, name: b.name, from: a.gdppc, to: b.gdppc, rel: (b.gdppc - a.gdppc) / a.gdppc });
    else if ((a.gdppc == null) !== (b.gdppc == null)) onlyOne++;
  }
  for (const c of A.keys()) if (!B.has(c)) onlyOne++;
  const byAbs = (x, y) => Math.abs(y.rel) - Math.abs(x.rel);
  pop.sort(byAbs); gdp.sort(byAbs);
  return { population: pop.slice(0, n), gdppc: gdp.slice(0, n), comparedPop: pop.length, comparedGdppc: gdp.length, onlyOne };
}

/** the layers a source states at one end and not the other (`LayerTime.coverage` results: `.stated` rows with `name`). */
export function diffLayers(covA, covB) {
  const names = (c) => new Set(((c && c.stated) || []).map((r) => r.name));
  const A = names(covA), B = names(covB);
  return { gained: [...B].filter((x) => !A.has(x)), lost: [...A].filter((x) => !B.has(x)), both: [...B].filter((x) => A.has(x)).length };
}

/** THE ORDERED LIST OF WHAT HAPPENED INSIDE THE PERIOD, most important first.
    Importance is a COUNT of records affected, and the item says what was counted — it is not a judgement of history:
      · a border-change DAY  =  polities that appear or end that day (1 each) + polities whose borders change (½ each);
      · a WAR                =  its dated events inside the period.
    Every item carries `date` only if a record states it; an item whose record states none is `date: null` and is listed
    after the dated ones at the same score (historical-verification.md §2 ③: no day is invented). A border day dated 1 January
    is flagged `maybeYearOnly` — the record may state only the year there, and the flag says so rather than guessing. */
export function rankChanges(borderDays, wars, region) {
  const items = [];
  (borderDays || []).forEach((d) => {
    const a = d.appeared || [], e = d.ended || [], r = d.reshaped || [];
    if (!a.length && !e.length && !r.length) return;
    items.push({ kind: 'border', date: d.date || null, score: a.length + e.length + 0.5 * r.length,
      basis: T(a.length + ' appear, ' + e.length + ' end, ' + r.length + ' change borders', a.length + ' が出現・' + e.length + ' が消滅・' + r.length + ' の境界が変化'),
      /* (hist-coverage-expansion) when the border reader says how precise the day is, that is the answer — a
         Cliopatria or sheet edge states the year alone; only without it is 1 January a guess */
      appeared: a, ended: e, reshaped: r, yearOnly: d.prec === 'year', maybeYearOnly: d.prec ? d.prec === 'year' : !!(d.date && /-01-01$/.test(d.date)) });
  });
  (wars || []).forEach((w) => {
    const n = (w.events || []).length;
    items.push({ kind: 'war', date: w.from || null, to: w.to || null, name: w.name, score: n,
      basis: T(n + ' dated event' + (n === 1 ? '' : 's') + ' in the period', '期間内の日付つきの出来事 ' + n + ' 件'), events: (w.events || []).slice(0, 6) });
  });
  const d = (x) => (x.date == null ? 1 : 0);
  items.sort((x, y) => (y.score - x.score) || (d(x) - d(y)) || (String(x.date) < String(y.date) ? -1 : String(x.date) > String(y.date) ? 1 : 0));
  return items;
}

/* ══ 3 · panel.correlate ═══════════════════════════════════════════════════════════════════════════ */

const pearson = (xs, ys) => {
  const n = xs.length; if (n < 3) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) { const x = xs[i], y = ys[i]; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; }
  const dx = n * sxx - sx * sx, dy = n * syy - sy * sy;
  if (dx <= 0 || dy <= 0) return null;
  return (n * sxy - sx * sy) / Math.sqrt(dx * dy);
};
const ranksOf = (a) => {
  const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(a.length); let i = 0;
  while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; }
  return r;
};
const _stats = { pearson, ranksOf };

/** the strength bands the Correlation panel has always used (0.2 wide) — the one scale, shared */
const BAND = 0.2;
function strengthBand(r) {
  const a = Math.abs(r);
  return a < BAND ? 0 : a < 2 * BAND ? 1 : a < 3 * BAND ? 2 : a < 4 * BAND ? 3 : 4;
}
const BAND_WORDS = [T('very weak', 'ごく弱い'), T('weak', '弱い'), T('moderate', '中程度の'), T('strong', '強い'), T('very strong', '非常に強い')];

/** 95% interval for a correlation by the Fisher z transform; Pearson's standard error is 1/sqrt(n-3), Spearman's is
    Bonett & Wright's sqrt((1+rho²/2)/(n-3)). Null for n < 4 (the transform needs n-3 > 0). */
function interval(r, n, kind) {
  if (r == null || n < 4) return null;
  if (Math.abs(r) >= 1) return [r, r];   /* a perfect line has no spread to put an interval on */
  const se = (kind === 'spearman' ? Math.sqrt((1 + r * r / 2) / (n - 3)) : 1 / Math.sqrt(n - 3));
  const z = Math.atanh(r), k = 1.959964;
  return [Math.tanh(z - k * se), Math.tanh(z + k * se)];
}

/** THE REPORT. `rows` are { id, name, x, y } with x / y NULL where the country has no value (kept, to be COUNTED as missing
    rather than dropped before anyone counts); `opts` { universe, xLog, yLog, xLabel, yLabel } — `universe` is how many
    countries the source could have supplied (so «missing» is a number against something). x and y are used as given (the caller
    has already applied any log transform; `xLog`/`yLog` only say that it did).

    Returns { n, missing:{ x, y, either, universe, nonPositiveLog }, pearson, spearman, ci:{pearson,spearman},
              assertion: 'none'|'tentative'|'stated', direction: 1|-1|0, band, outliers[], withoutOutliers,
              confirmed[], explanations[], counter[], limits[] }  — the four fields are lists of {en,jp} sentences.

    ⚠ WHAT THE WORDS MAY SAY IS DECIDED BY THE SAMPLE, not by the point estimate:
       · n < 4, or either 95% interval reaches 0   →  assertion 'none'. No strength word, no direction word: the sample cannot
         tell this from no relationship, and the report says so;
       · the intervals exclude 0 but are wider than one strength band (±BAND)  →  'tentative' («suggests», the band is a guess);
       · the intervals exclude 0 and are within one band  →  'stated'.
       The 0.2 is the width of the panel's own strength bands (BAND), so «stated» means the interval cannot straddle two labels
       by more than a neighbour. Expires only if the panel's bands change — they are one constant, here. */
export function correlationReport(rows, opts) {
  const o = opts || {};
  const universe = o.universe != null ? o.universe : rows.length;
  const ok = [];
  let missX = 0, missY = 0, missEither = 0;
  rows.forEach((r) => {
    const hx = r.x != null && isFinite(r.x), hy = r.y != null && isFinite(r.y);
    if (!hx) missX++; if (!hy) missY++; if (!hx || !hy) missEither++;
    if (hx && hy) ok.push(r);
  });
  const n = ok.length;
  const xs = ok.map((r) => r.x), ys = ok.map((r) => r.y);
  const r = pearson(xs, ys), rho = pearson(ranksOf(xs), ranksOf(ys));
  const ci = { pearson: interval(r, n, 'pearson'), spearman: interval(rho, n, 'spearman') };
  const excludes0 = (c) => !!c && (c[0] > 0 || c[1] < 0);
  const sameSign = r != null && rho != null && Math.sign(r) === Math.sign(rho);
  const widest = Math.max.apply(null, [ci.pearson, ci.spearman].filter(Boolean).map((c) => (c[1] - c[0]) / 2).concat([0]));
  let assertion = 'none';
  if (n >= 4 && excludes0(ci.pearson) && excludes0(ci.spearman) && sameSign) assertion = widest <= BAND ? 'stated' : 'tentative';
  const direction = r == null ? 0 : (r > 0 ? 1 : r < 0 ? -1 : 0);
  /* outliers: standardised residuals of the least-squares line; |z| ≥ 2.5 (about 1 in 80 under a normal error — a convention, not a
     measurement; it only chooses which cases are LISTED, and the largest are listed whatever the cut) */
  let outliers = [], withoutOutliers = null;
  if (n >= 4 && r != null) {
    const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
    let sxx = 0, sxy = 0; for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) * (xs[i] - mx); sxy += (xs[i] - mx) * (ys[i] - my); }
    const b = sxy / (sxx || 1), a0 = my - b * mx;
    const res = ys.map((y, i) => y - (a0 + b * xs[i]));
    const sd = Math.sqrt(res.reduce((s, v) => s + v * v, 0) / Math.max(1, n - 2)) || 1;
    const z = res.map((e) => e / sd);
    outliers = ok.map((row, i) => ({ id: row.id, name: row.name, x: row.x, y: row.y, z: z[i] })).filter((p) => Math.abs(p.z) >= 2.5).sort((p, q) => Math.abs(q.z) - Math.abs(p.z)).slice(0, 5);
    if (outliers.length) {
      const drop = new Set(outliers.map((p) => p.id));
      const keep = ok.filter((row) => !drop.has(row.id));
      const r2 = pearson(keep.map((q) => q.x), keep.map((q) => q.y));
      if (r2 != null) withoutOutliers = { n: keep.length, pearson: r2 };
    }
  }
  const f2 = (v) => (v == null ? '—' : (Math.round(v * 100) / 100).toFixed(2));
  const xl = o.xLabel || 'x', yl = o.yLabel || 'y';
  const fmtCI = (c) => (c ? '[' + f2(c[0]) + ', ' + f2(c[1]) + ']' : '—');
  const confirmed = [], explanations = [], counter = [], limits = [];
  if (assertion === 'none') {
    if (n < 4) confirmed.push(T('Nothing confirmed: n = ' + n + ' is too few to put an interval on a correlation.', '確認できたことはない: n = ' + n + ' では相関に区間を付けられない。'));
    else confirmed.push(T('Nothing confirmed: with n = ' + n + ' the data cannot be told apart from no relationship (r = ' + f2(r) + ', 95% interval ' + fmtCI(ci.pearson) + '; ρ = ' + f2(rho) + ', ' + fmtCI(ci.spearman) + ').', '確認できたことはない: n = ' + n + ' では関係なしと区別できない（r = ' + f2(r) + '、95% 区間 ' + fmtCI(ci.pearson) + '; ρ = ' + f2(rho) + '、' + fmtCI(ci.spearman) + '）。'));
  } else {
    const w = BAND_WORDS[strengthBand(r)], dirEn = direction > 0 ? 'positive' : 'negative', dirJp = direction > 0 ? '正の' : '負の';
    const lead = assertion === 'stated'
      ? T('A ' + w[0] + ' ' + dirEn + ' relationship between ' + xl + ' and ' + yl, xl + ' と ' + yl + ' の間に' + w[1] + dirJp + '関係')
      : T('The data suggest a ' + dirEn + ' relationship between ' + xl + ' and ' + yl + ' (its strength is not pinned down: the interval is wider than one band)', xl + ' と ' + yl + ' に' + dirJp + '関係がある可能性（強さは定まらない: 区間が 1 段階より広い）');
    confirmed.push(T(lead[0] + ' — r = ' + f2(r) + ' (95% ' + fmtCI(ci.pearson) + '), ρ = ' + f2(rho) + ' (95% ' + fmtCI(ci.spearman) + '), n = ' + n + '.', lead[1] + ' — r = ' + f2(r) + '（95% ' + fmtCI(ci.pearson) + '）、ρ = ' + f2(rho) + '（95% ' + fmtCI(ci.spearman) + '）、n = ' + n + '。'));
    explanations.push(T('Candidate: ' + xl + ' influences ' + yl + '. Not tested — a correlation does not order cause and effect.', '考えられる説明: ' + xl + ' が ' + yl + ' に影響する。未検証 — 相関は原因と結果の順序を示さない。'));
    explanations.push(T('Candidate: ' + yl + ' influences ' + xl + ' (the reverse direction).', '考えられる説明: ' + yl + ' が ' + xl + ' に影響する（逆向き）。'));
    explanations.push(T('Candidate: a third factor (income, region, history) moves both. Nothing here controls for one.', '考えられる説明: 第三の要因（所得・地域・歴史）が両方を動かす。ここでは何も統制していない。'));
    if (r != null && rho != null && Math.abs(rho) - Math.abs(r) > 0.15) explanations.push(T('ρ (' + f2(rho) + ') is clearly stronger than r (' + f2(r) + '): the relationship rises steadily but not along a straight line.', 'ρ (' + f2(rho) + ') が r (' + f2(r) + ') より明らかに強い: 直線ではないが一方向に増減する関係。'));
    else if (r != null && rho != null && Math.abs(r) - Math.abs(rho) > 0.15) explanations.push(T('r (' + f2(r) + ') is clearly stronger than ρ (' + f2(rho) + '): a few extreme points may be carrying the line.', 'r (' + f2(r) + ') が ρ (' + f2(rho) + ') より明らかに強い: 少数の極端な点が線を引っ張っている可能性。'));
  }
  if (outliers.length) {
    counter.push(T(outliers.length + ' case' + (outliers.length === 1 ? '' : 's') + ' the pattern does not explain (|standardised residual| ≥ 2.5): ' + outliers.map((p) => p.name + ' (' + (p.z > 0 ? '+' : '') + p.z.toFixed(1) + 'σ)').join(', '), 'この傾向で説明できない事例 ' + outliers.length + ' 件（標準化残差の絶対値 2.5 以上）: ' + outliers.map((p) => p.name + '（' + (p.z > 0 ? '+' : '') + p.z.toFixed(1) + 'σ）').join('、')));
    if (withoutOutliers) counter.push(T('Without them r = ' + f2(withoutOutliers.pearson) + ' (n = ' + withoutOutliers.n + ') against ' + f2(r) + ' with them.', 'それらを除くと r = ' + f2(withoutOutliers.pearson) + '（n = ' + withoutOutliers.n + '）、含めると ' + f2(r) + '。'));
  } else if (n >= 4) counter.push(T('No case sits 2.5 standard errors or more from the line, so no single country is overturning it.', '線から標準誤差 2.5 以上離れた事例はなく、1 か国で覆される関係ではない。'));
  else counter.push(T('Too few points to look for cases that break the pattern.', '傾向を崩す事例を探すには点が少なすぎる。'));
  limits.push(T('n = ' + n + ' of ' + universe + ' countries have both values.', '両方の値がある国は ' + universe + ' か国中 ' + n + ' か国。'));
  limits.push(T('Missing: ' + xl + ' for ' + missX + ', ' + yl + ' for ' + missY + ' (either: ' + missEither + ')' + (o.nonPositiveLog ? ' — of which ' + o.nonPositiveLog + ' are zero or negative, which a log scale cannot take' : '') + '. Missing values are not assumed to look like the rest.', '欠損: ' + xl + ' が ' + missX + '、' + yl + ' が ' + missY + '（どちらか: ' + missEither + '）' + (o.nonPositiveLog ? ' — うち ' + o.nonPositiveLog + ' 件はゼロ以下で、対数軸では取れない' : '') + '。欠損が残りと似ているとは仮定していない。'));
  limits.push(T('Country totals say nothing about individuals within a country (ecological correlation), and the values need not be from the same year.', '国ごとの集計値は国内の個人については何も述べない（生態学的相関）。値が同じ年のものとも限らない。'));
  return { n, missing: { x: missX, y: missY, either: missEither, universe, nonPositiveLog: o.nonPositiveLog || 0 }, pearson: r, spearman: rho, ci, assertion, direction, band: r == null ? null : strengthBand(r), outliers, withoutOutliers, confirmed, explanations, counter, limits };
}

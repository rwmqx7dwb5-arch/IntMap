/* ============================================================================
 *  wave4-refine — «Aftershock forecast»: the defects a review measured, each as the behaviour that was wrong
 * ----------------------------------------------------------------------------
 *    ① THE 95 % RANGE DID NOT COVER. With p and c fixed only a's posterior made the range, and the shipped test found the
 *       real M5+ count inside it in 117/137 sequences over a month and 105/137 over a year. Now a, p and c are learned on
 *       a grid: sequences simulated with a decay drawn from the prior are covered ~95 % (the fixed-shape forecast covers
 *       ~75 % of the same ones), the shipped hindcast's month and year coverage is back above 90 %, and the card and
 *       Atlas state the measured coverage beside the model's 95 %;
 *    ② THE COMPLETENESS WAS THE NETWORK'S TODAY, AT EVERY ERA: the sequence's own magnitudes raise it (maximum curvature
 *       + 0.2), and an old sequence whose completeness cannot be estimated is forecast from the prior alone and not checked;
 *    ③ THE WINDOWS ARE USGS'S FIXED 1 / 7 / 31 / 366 DAYS, not calendar arithmetic;
 *    ④ A CLOCK RECOMPUTE SCHEDULED BEFORE open() RAN AGAINST st.main = null (TypeError) — js/aftershock.js evaluated;
 *    ⑤ THE NUMBERS IN THE REFUSALS are the module's rules (AS / QH), not hand-written 300 km / 30 days / M5 / M5.5;
 *    ⑥ Q(s, x) WAS CUT AT 1000 TERMS: Q(10⁶, 10⁶) came out 0.659, not ½;
 *    ⑦ the card and the Atlas answer: lower bounds formatted, the «≥ this» row folded into M7+ for an M7.0, the past
 *       issue said to be computed from today's catalogue, window names in the reader's language, a deep mainshock
 *       noted, and an answer whose map was not drawn is not called satisfied.
 *  No network: every answer is a fixture or a simulation.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const C = await import('../js/aftershock-core.js');
const QHC = await import('../js/quake-history-core.js');
const RAW = JSON.parse(gunzipSync(readFileSync(new URL('../data/aftershock-regimes.json.gz', import.meta.url))).toString('utf8'));
const P = C.prepare(RAW);
const FIX = JSON.parse(src('tests/fixtures/aftershock-sequences.json'));
const HC = JSON.parse(src('data/aftershock-hindcast.json'));
const DAY = 86400000;

test('① a, p and c are learned: simulated sequences are covered ~95 %, the shipped test above 90 %, and the coverage is stated', () => {
  let seed = 20261116;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return (seed + 0.5) / 2147483648; };
  const normal = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
  const poisson = (lam) => { if (lam > 60) return Math.max(0, Math.round(lam + Math.sqrt(lam) * normal())); let k = 0, q = 1; const L = Math.exp(-lam); do { k++; q *= rnd(); } while (q > L); return k - 1; };
  /* a complete catalogue at M4.6 from the first instant (H = 0: no incomplete hours), so the simulation is exactly the model */
  const par = P.params['SZ-GENERIC'], Mm = 7.2, mc = { magCat: 4.6, F: 0, G: 100, H: 0 }, sd = C.aSigma(par, Mm);
  const shape = C.shapePrior(P, par);
  assert.ok(shape.nodes.length > 100 && shape.p.sd > 0.1 && shape.c.sdLog10 > 0.1, 'p and c carry a prior of their own width');
  const cum = []; let acc = 0; for (const n of shape.nodes) { acc += n.w; cum.push(acc); }
  const draw = () => { const u = rnd() * acc; return shape.nodes[cum.findIndex((c) => c >= u)]; };
  const Kn = shape.nodes.map((nd) => C.kIntegral(par, mc, Mm, 0, 1, nd.p, nd.c));
  const gain = (nd) => 10 ** (par.b * (Mm - 4.6)) * C.omoriIntegral(nd.p, nd.c, 1, 367);   /* the year after a day-one issue */
  /* the inverse of the Omori time density on [0, 1] day */
  const timeOf = (u, p, c) => { if (Math.abs(p - 1) < 1e-9) return c * Math.pow((1 + c) / c, u) - c; const e = 1 - p, a0 = Math.pow(c, e); return Math.pow(a0 + u * (Math.pow(1 + c, e) - a0), 1 / e) - c; };
  const trials = 240; let inside = 0, insideFixed = 0;
  for (let i = 0; i < trials; i++) {
    const nd = draw(), a = Math.max(par.aMin + 0.2, Math.min(par.aMax - 0.2, par.aMean + sd * normal()));
    const n = poisson(10 ** a * C.kIntegral(par, mc, Mm, 0, 1, nd.p, nd.c));
    const ts = []; for (let j = 0; j < n; j++) ts.push(timeOf(rnd(), nd.p, nd.c));
    const N = poisson(10 ** a * gain(nd));
    const f = C.mixture(C.posterior(par, Mm, n, (x, j) => Kn[j], { nodes: shape.nodes, sumLn: (c) => ts.reduce((q, t) => q + Math.log(t + c), 0) }), gain);
    if (N >= f.lo && N <= f.hi) inside++;
    const f0 = C.mixture(C.posterior(par, Mm, n, C.kIntegral(par, mc, Mm, 0, 1)), gain({ p: par.p, c: par.c }));
    if (N >= f0.lo && N <= f0.hi) insideFixed++;
  }
  assert.ok(inside / trials > 0.92 && inside / trials < 0.98, 'the year range covers ' + (100 * inside / trials).toFixed(1) + ' % of sequences whose decay varies as the prior says');
  assert.ok(insideFixed / trials < 0.85, 'and with the shape fixed it covered only ' + (100 * insideFixed / trials).toFixed(1) + ' % — the defect, in a world where it is known');

  /* the shipped test: before, the M5+ count fell inside 117/137 (month) and 105/137 (year). The floor 90 % is under the
     2026-11-16 build (127/136, 126/136) and above what the fixed shape scored — a return to it fails here */
  const cov = C.testedCoverage(HC);
  for (const k of ['month', 'year']) {
    const z = cov.rows.find((x) => x.window === k && x.mag === 5);
    assert.ok(z.inside >= 0.9, k + ' M5+: ' + (100 * z.inside).toFixed(1) + ' % inside');
    const s = HC.score.find((x) => x.window === k && x.mag === 5);
    assert.equal(z.inside, s.within / s.n, 'the stated coverage is the score\'s own within / n');
  }
  assert.ok(HC.rows.every((r) => Array.isArray(r.p) && r.p.length === 2 && typeof r.c === 'number'), 'every shipped row records the learned p and c');
  /* the words: what is stated is the model's 95 %, and beside it the measurement */
  const ui = src('js/aftershock.js'), sim = src('js/atlas-cap-sim.js');
  assert.doesNotMatch(ui, /range of the number \(95% of outcomes\)/, 'the card no longer calls the model\'s range «95% of outcomes»');
  assert.match(sim, /the model\\'s 95% range of the number/);
});

test('② completeness: the sequence raises it, and an old unestimable sequence is the prior alone', () => {
  /* a Gutenberg–Richter sample (b = 1) observed completely only above M5.0: the histogram's mode is the 5.0 bin */
  const mags = []; for (let i = 0; i < 400; i++) mags.push(+(4.95 - Math.log10(1 - (i + 0.5) / 400)).toFixed(2));
  for (let i = 0; i < 60; i++) mags.push(4.0 + (i % 9) / 10);   /* a thin, incomplete tail below */
  assert.deepEqual([C.estimateMc(mags, 3.95).mc, C.estimateMc(mags, 3.95).mode], [5.2, 5]);
  assert.equal(C.estimateMc(mags.slice(0, C.AS.MC_MIN_EVENTS - 1), 3.95).reason, 'few');
  assert.equal(C.estimateMc(mags.map((m) => m - 1.05), 3.95).reason, 'at-floor', 'a mode at the read\'s own floor says nothing above it');

  /* one real sequence with its magnitudes pushed up: the catalogue looks incomplete above the network floor */
  const s = FIX.sequences[2], main = C.normalise(s.mainshock), ev = s.features.map(C.normalise).filter(Boolean);
  const issue = main.t + 30 * DAY, now = Date.parse('2026-11-16T00:00:00Z');
  const base = C.run(P, main, ev, issue, { now });
  assert.equal(base.completeness.source, 'network');
  const thin = ev.map((e) => (e.id === main.id || e.mag == null ? e : Object.assign({}, e, { mag: e.mag < 5.3 ? e.mag + 0.6 : e.mag })));
  const r = C.run(P, main, thin, issue, { now });
  assert.equal(r.completeness.source, 'sequence'); assert.ok(r.completeness.magCat > r.completeness.networkMagCat);
  assert.ok(r.check.every((c) => c.state !== 'closed' || c.bins.every((b) => !b.checkable || b.mag >= r.completeness.magCat)), 'nothing below the raised completeness is scored');
  assert.ok(C.forAtlas(r).notes.some((n) => n.code === 'completeness-raised'));

  /* 1960: four aftershocks of M4.6+ recorded in the first day, older than the tested set — the prior alone, unchecked */
  const chile = { id: 'official19600522191120_30', t: Date.UTC(1960, 4, 22, 19, 11, 20), mag: 9.5, lng: -73.407, lat: -38.143, depthKm: 25, place: 'Chile' };
  const few = [0.2, 0.4, 0.6, 0.9].map((d, i) => ({ id: 'c' + i, t: chile.t + d * DAY, mag: 6, lng: -73.4, lat: -38.5, depthKm: 25 }));
  const old = C.run(P, chile, few, chile.t + DAY, { now });
  assert.equal(old.priorOnly, true);
  assert.equal(old.used, 0, 'no aftershock is fed to a likelihood whose completeness is unknown');
  assert.ok(Math.abs(old.posterior.mean - old.posterior.priorMean) < 0.02, 'a stays at its prior (it fell to −3.95 with the network floor): ' + old.posterior.mean);
  assert.ok(old.check.every((c) => c.state === 'closed' && c.bins.every((b) => !b.checkable)), 'and nothing is scored against what happened');
  assert.ok(C.forAtlas(old).notes.some((n) => n.code === 'prior-only' && n.testedFrom === C.AS.TESTED.from));
  /* the same handful of aftershocks in the tested era: the network floor stands, the data are used */
  const recent = Object.assign({}, chile, { t: Date.UTC(2020, 4, 22) });
  const r2 = C.run(P, recent, few.map((e) => Object.assign({}, e, { t: recent.t + (e.t - chile.t) })), recent.t + DAY, { now });
  assert.equal(r2.priorOnly, false); assert.equal(r2.used, 4);
  /* the hindcast's rule is the core's */
  assert.match(src('scripts/build-aftershock-hindcast.mjs'), /= C\.AS\.TESTED;/);
});

test('③ the windows are USGS\'s fixed 1, 7, 31 and 366 days', () => {
  for (const issue of [Date.UTC(2026, 0, 31, 6), Date.UTC(2025, 2, 1), Date.UTC(2026, 10, 9, 16, 0, 27)]) {
    assert.deepEqual(C.windows(issue).map((w) => (w.end - w.start) / DAY), [1, 7, 31, 366], new Date(issue).toISOString());
  }
  /* USGS's own forecast.json (the fixture) states the same day counts */
  const F = JSON.parse(src('tests/fixtures/aftershock-usgs-oaf.json'));
  const usgs = F.forecast.forecast.map((w) => Math.round((w.timeEnd - w.timeStart) / DAY));
  assert.deepEqual(usgs.filter((d) => [1, 7, 31, 366].includes(d)), usgs, 'USGS windows: ' + usgs.join(', '));
});

/* ── js/aftershock.js, evaluated: a DOM stand-in and a fetch that serves the fixtures ─────────────────────────────── */
async function card(seq, opts = {}) {
  const el = () => { const kids = new Map(); return { style: {}, innerHTML: '', textContent: '', title: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; },
    addEventListener() {}, appendChild() {}, querySelector(sel) { if (!kids.has(sel)) kids.set(sel, el()); return kids.get(sel); }, getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }, offsetWidth: 380 }; };
  globalThis.window = globalThis;
  const pop = el();
  globalThis.document = { getElementById: () => null, createElement: () => pop, head: { appendChild() {} }, body: { appendChild() {}, contains: () => true }, documentElement: el(), addEventListener() {} };
  globalThis.IntMapSafe = { html: (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
  const ctl = { gate: null };
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (ctl.gate && /eventid=/.test(u)) await ctl.gate;
    let body;
    if (/eventid=/.test(u)) body = seq.mainshock;
    else if (/\/count\?/.test(u)) body = { count: seq.features.length };
    else if (/\/query\?/.test(u)) body = { type: 'FeatureCollection', features: seq.features };
    else return new Response(readFileSync(new URL('../' + u.replace(/^.*?(data\/)/, '$1'), import.meta.url)), { status: 200 });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const { aftershock } = await import('../js/aftershock.js');
  const { IntMapTime } = await import('../js/chronos.js');
  /* canDraw true: with no map the drawing fails at once (st.paintError) instead of waiting for a map that never comes */
  const HOST = { lang: opts.lang || 'en', canDraw: () => true, makeDraggable() {}, bringToFront() {}, imToast() {} };
  return { A: aftershock(HOST), IntMapTime, ctl, body: () => pop.querySelector('#as-body').innerHTML };
}

test('④ a clock recompute scheduled for one earthquake does not run while the next is being read', async () => {
  const seq = FIX.sequences[0];
  const { A, IntMapTime, ctl } = await card(seq);
  const errors = [];
  const onErr = (e) => errors.push(e && e.message);
  process.on('unhandledRejection', onErr); process.on('uncaughtException', onErr);
  try {
    const first = await A.open({ eventId: seq.mainshock.id });
    assert.equal(first.ok, true, String(first.error));
    IntMapTime.set(new Date(seq.mainshock.properties.time + 3 * DAY), { source: 'test' });   /* schedules the 250 ms recompute */
    let release; ctl.gate = new Promise((res) => { release = res; });
    const second = A.open({ eventId: seq.mainshock.id });   /* st.main is null while this one reads */
    await new Promise((res) => setTimeout(res, 400));
    release(); ctl.gate = null;
    assert.equal((await second).ok, true);
    await new Promise((res) => setTimeout(res, 50));
    assert.deepEqual(errors, [], 'the recompute ran against the earthquake being read: ' + errors.join('; '));
  } finally {
    process.off('unhandledRejection', onErr); process.off('uncaughtException', onErr);
    IntMapTime.setNow({ source: 'test' }); A.close();
  }
});

test('⑤ ⑦ the card: lower bounds formatted, «≥ this» folded for an M7.0, the past issue and the measured coverage said', async () => {
  const kuma = FIX.sequences[0];   /* M7.0 — «≥ this» is the M7+ row */
  const { A, IntMapTime, body } = await card(kuma);
  try {
    IntMapTime.set(new Date(kuma.mainshock.properties.time + DAY), { source: 'test' });
    const r = await A.open({ eventId: kuma.mainshock.id });
    assert.equal(r.ok, true, String(r.error));
    const h = body(), tab = h.slice(h.indexOf('<table class="as-tab">'), h.indexOf('</table>'));
    assert.equal((tab.match(/<tr><td>/g) || []).length, 4, 'M3+, M5+, M6+ and one M7+ row (≥ this)');
    assert.match(tab, /M7\+ \(≥ this, M7\.0\)/);
    assert.match(h, /Computed from today&#39;s USGS catalogue|Computed from today's USGS catalogue/, 'the past issue says which catalogue it was computed from');
    const cov = C.testedCoverage(HC), m5 = (k) => Math.round(100 * cov.rows.find((x) => x.window === k && x.mag === 5).inside) + '%';
    assert.ok(h.includes('fell inside it ' + m5('day') + ' of the time over a day') && h.includes(m5('year') + ' over a year'), 'the card states the measured coverage');
    assert.ok(r.tested && r.tested.rows.length && r.computedFromTodaysCatalogue === true, 'and so does what Atlas is handed');
    assert.deepEqual(r.rules, { minMainshock: C.AS.MIN_MAIN, nearKm: QHC.QH.DEFAULT_RADIUS, nearDays: C.AS.LIST_DAYS, chooserMin: C.AS.LIST_MIN });
  } finally { IntMapTime.setNow({ source: 'test' }); A.close(); }

  const turkey = FIX.sequences[2];   /* thousands of M3+ in a year: the lower bound needs its separator too */
  const t = await card(turkey);
  t.IntMapTime.set(new Date(turkey.mainshock.properties.time + DAY), { source: 'test' });
  const r2 = await t.A.open({ eventId: turkey.mainshock.id });
  t.IntMapTime.setNow({ source: 'test' });
  assert.equal(r2.ok, true);
  const big = r2.forecast.flatMap((w) => w.bins).find((b) => b.count95[0] >= 1000);
  assert.ok(big, 'a range whose lower bound is in the thousands');
  assert.ok(t.body().includes(big.count95[0].toLocaleString('en') + '–' + big.count95[1].toLocaleString('en')), 'both bounds formatted: ' + big.count95.join('–'));
  t.A.close();
});

test('⑤ ⑦ the Atlas answer: refusals from the rules, window names in the reader\'s language, painted = 0 is not satisfied', async () => {
  const SIM = (await import('../js/atlas-cap-sim.js')).default;
  const e = SIM.find((x) => x.row[0] === 'sim.aftershocks');
  const s = FIX.sequences[0], main = C.normalise(s.mainshock);
  const run = C.run(P, main, s.features.map(C.normalise).filter(Boolean), main.t + DAY, { now: Date.parse('2026-11-16T00:00:00Z') });
  const rules = { minMainshock: 4.5, nearKm: 250, nearDays: 21, chooserMin: 6.5 };   /* not the shipped values: the words must follow them */
  const answer = (lang, reply) => {
    globalThis.window = globalThis;
    globalThis.IntMapLazy = { need: async () => {} };
    globalThis.IntMapAftershock = { open: async () => reply, issueAt() {} };
    const K = { R: (ok, html, extra) => Object.assign({ ok, html }, extra || {}), warn: (x) => x, esc: (x) => String(x), L: (en, jp) => (lang === 'jp' ? jp : en), geocode: async () => null };
    return e.run({ eventId: 'x' }, {}, K);
  };
  const near = await answer('en', { ok: false, errorKind: 'none-near', rules });
  assert.match(near.html, /within 250 km of that place in the 21 days/); assert.doesNotMatch(near.html, /300 km|30 days/);
  assert.match((await answer('jp', { ok: false, errorKind: 'too-small', rules })).html, /M4\.5 以上の本震/);
  assert.match((await answer('en', { ok: true, chooser: [], rules })).html, /M6\.5\+/);

  const ok = Object.assign({ ok: true, painted: 12, rules, tested: C.testedCoverage(HC) }, C.forAtlas(run));
  const jp = await answer('jp', ok);
  const after = jp.html.slice(jp.html.indexOf('その後の実際'));
  assert.match(after, /^その後の実際: 1日以内 M\d\+ \d+ \((幅の中|幅より少ない|幅より多い)\)/, 'the answer check in Japanese: ' + after.slice(0, 120));
  assert.doesNotMatch(jp.html.slice(jp.html.indexOf('その後の実際')), /\b(day|week|month|year|within|below|above)\b/);
  assert.equal(jp.meta.userGoalSatisfied, true);
  assert.match(jp.html, /公開した検証/, 'the measured coverage is in the answer');
  const notDrawn = await answer('en', Object.assign({}, ok, { painted: 0, paintError: null }));
  assert.equal(notDrawn.meta.userGoalSatisfied, false, 'the zone is not on the map: the goal is not met');
  assert.match(notDrawn.html, /had not drawn the zone yet/);
  const failed = await answer('en', Object.assign({}, ok, { painted: 0, paintError: 'style gone' }));
  assert.match(failed.html, /could not be drawn on the map: style gone/);
});

test('⑥ Q(s, x) at any size: ½ at the median of a million, the exact sum where it can be summed', () => {
  assert.ok(Math.abs(C.gammaQ(1e6, 1e6) - 0.5) < 0.001, 'Q(1e6, 1e6) = ' + C.gammaQ(1e6, 1e6));
  assert.ok(Math.abs(C.poissonCdf(1e6, 1e6) - 0.5) < 0.001, 'P(N ≤ 1e6 | 1e6) = ' + C.poissonCdf(1e6, 1e6));
  /* the exact Poisson sum in log space, on both sides of the switch to quadrature */
  const exact = (k, l) => { let lp = -l, m = lp; const acc = [lp]; for (let j = 1; j <= k; j++) { lp += Math.log(l / j); acc.push(lp); if (lp > m) m = lp; } let t = 0; for (const v of acc) t += Math.exp(v - m); return Math.min(1, Math.exp(m) * t); };
  for (const l of [2000, 9500, 1e4, 3e4, 1e5]) for (const z of [-5, -2, -0.5, 0, 0.5, 2, 5, 30]) {
    const k = Math.max(0, Math.round(l + z * Math.sqrt(l)));
    assert.ok(Math.abs(C.poissonCdf(k, l) - exact(k, l)) < 1e-8, 'P(N ≤ ' + k + ' | ' + l + ')');
  }
  assert.equal(C.poissonCdf(5e4, 4e4), 1, 'far above the mean (the integral underflows to −0 there; the side decides)');
  assert.equal(C.poissonCdf(3e4, 6e4), 0);
});

test('⑦ a deep mainshock is noted, by the conventional 70 km boundary', () => {
  const s = FIX.sequences[0], main = C.normalise(s.mainshock), ev = s.features.map(C.normalise).filter(Boolean);
  const deep = C.run(P, Object.assign({}, main, { depthKm: 410 }), ev, main.t + DAY, { now: main.t + DAY });
  assert.deepEqual(C.forAtlas(deep).notes.find((n) => n.code === 'deep'), { code: 'deep', depthKm: 410, boundaryKm: C.AS.DEEP_KM });
  assert.ok(!C.forAtlas(C.run(P, main, ev, main.t + DAY, { now: main.t + DAY })).notes.some((n) => n.code === 'deep'), 'Kumamoto (' + main.depthKm + ' km) is shallow');
});

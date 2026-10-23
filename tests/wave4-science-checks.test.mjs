/* ============================================================================
 *  wave4-science — «Aftershock forecast» (js/aftershock.js over js/aftershock-core.js): what Node can answer
 * ----------------------------------------------------------------------------
 *    ① the regime bundle decodes to the upstream's own counts, and the regime it names is the geology's (an ocean
 *       basin is stable oceanic, central Australia stable continental, Hawaii and Iceland hot spots, Japan a
 *       subduction zone, the California regions override the grid) — a transposed or shifted grid fails here;
 *    ② the prior is USGS's: σ(M) by GenericRJ_Parameters' formula, and no data leaves the prior where it was;
 *    ③ K (the expected complete count per 10^a) agrees with a brute-force integral, through the incomplete hours;
 *    ④ THE BAYESIAN MACHINERY IS CALIBRATED: sequences simulated from a drawn from the prior are forecast, and the
 *       future counts fall inside the 95 % ranges about 95 % of the time and «at least one» happens as often as forecast;
 *    ⑤ the shipped hindcast (data/aftershock-hindcast.json) follows from the shipped model: three REAL ComCat sequences
 *       (tests/fixtures/aftershock-sequences.json, the very requests the builder makes) recompute to its rows, and its
 *       score follows from its rows;
 *    ⑥ USGS's own product is read as USGS wrote it (a real forecast.json);
 *    ⑦ the requests: an earthquake's position is sent as the catalogue states it; a place the reader names is sent
 *       rounded (never the exact point); the link round-trips and refuses junk;
 *    ⑧ the doors and Atlas: the lazy module, the r209 member, the popup and command doors, the Tools row, the
 *       capability (science section, scenario, doc position, en + jp), the method page in en and ja.
 *  No network: every answer is a fixture.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import vm from 'node:vm';

const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const C = await import('../js/aftershock-core.js');
const H = await import('../scripts/build-aftershock-hindcast.mjs');
const B = await import('../scripts/build-aftershock-regimes.mjs');
const RAW = JSON.parse(gunzipSync(readFileSync(new URL('../data/aftershock-regimes.json.gz', import.meta.url))).toString('utf8'));
const P = C.prepare(RAW);

test('① the regime table decodes to the upstream\'s counts and names the geology\'s regime', () => {
  const dec = C.decodeRows(RAW.rows);
  assert.deepEqual(dec, B.decodeRows(RAW.rows), 'the reader and the builder read the rows the same way');
  const n = new Array(RAW.regimes.length).fill(0);
  for (const runs of dec) for (let i = 0; i < runs.length; i++) n[runs[i][1]] += (i + 1 < runs.length ? runs[i + 1][0] : RAW.grid.cols) - runs[i][0];
  assert.deepEqual(n, RAW.counts, 'every regime covers exactly the number of grid points the upstream table states');
  const at = (lng, lat) => C.regimeAt(P, lng, lat).regime;
  assert.equal(at(-140, 0), 'SOR-GENERIC', 'the open Pacific is stable oceanic');
  assert.equal(at(134, -25), 'SCR-GENERIC', 'central Australia is stable continental');
  assert.equal(at(100, 62), 'SCR-GENERIC', 'the Siberian craton is stable continental');
  assert.equal(at(-155.5, 19.4), 'ANSR-HOTSPOT', 'Hawaii is a hot spot');
  assert.equal(at(-19, 64.5), 'ANSR-HOTSPOT', 'Iceland is a hot spot');
  assert.match(at(139.7, 35.7), /^SZ-/, 'Tokyo is over a subduction zone');
  assert.match(at(-72, -36), /^SZ-/, 'central Chile is over a subduction zone');
  assert.equal(C.regimeAt(P, -117.599, 35.770).source, 'region', 'Ridgecrest falls in one of USGS\'s California regions first');
  assert.equal(at(-122.4, 37.8), 'CAL-NCSS', 'San Francisco is in the northern California network region');
  assert.equal(C.completenessAt(P, 135, 35).region, 'WORLD');
  assert.equal(C.completenessAt(P, -155.5, 19.4).region, 'HAWAII');
  for (const r of RAW.regimes) assert.ok(P.params[r.garcia], r.garcia + ' has generic parameters');
});

test('② the prior is USGS\'s, and no data leaves it where it was', () => {
  const par = P.params['ANSR-SHALCON'];
  const s = (M) => Math.sqrt(par.aSigma0 ** 2 + par.aSigma1 ** 2 / 10 ** Math.max(6, M));
  assert.equal(C.aSigma(par, 5.2), s(6), 'below M6 the spread is held at its M6 value');
  assert.ok(Math.abs(C.aSigma(par, 7.5) - s(7.5)) < 1e-12);
  const prior = C.posterior(par, 7, 0, 0);
  assert.ok(Math.abs(prior.mean - par.aMean) < 0.01, 'the prior mean is the regime\'s');
  assert.ok(Math.abs(prior.sd - C.aSigma(par, 7)) < 0.01, 'the prior spread is σ(Mm)');
  const many = C.posterior(par, 7, 400, 400 / 10 ** -2.0);
  assert.ok(Math.abs(many.mean - -2.0) < 0.02 && many.sd < 0.03, 'many aftershocks pin a down near their own value: ' + many.mean);
});

test('③ K agrees with a brute-force integral, through the incomplete first hours', () => {
  for (const [regime, mcName, Mm] of [['ANSR-SHALCON', 'WORLD', 7.8], ['CAL-SCSN', 'CAL-SCSN', 7.1], ['SZ-GENERIC', 'WORLD', 5.4]]) {
    const par = P.params[regime], mc = P.magComp[mcName];
    for (const [t1, t2] of [[0, 0.05], [0, 1], [0.3, 30]]) {
      const n = 400000, h = (t2 - Math.max(t1, 1e-9)) / n; let s = 0;
      for (let i = 0; i < n; i++) { const t = Math.max(t1, 1e-9) + (i + 0.5) * h; s += 10 ** (par.b * (Mm - C.mcAt(mc, Mm, t))) * (t + par.c) ** -par.p * h; }
      const k = C.kIntegral(par, mc, Mm, t1, t2);
      assert.ok(Math.abs(k - s) / s < 2e-3, regime + ' ' + t1 + '–' + t2 + ': ' + k + ' vs ' + s);
    }
  }
  assert.ok(Math.abs(C.omoriIntegral(1, 0.05, 0, 9.95) - Math.log(200)) < 1e-12, 'p = 1 is the logarithm');
  /* the Poisson CDF through the incomplete gamma (Q(k+1, λ)) against the plain sum of terms, small and large λ */
  for (const [k, lam] of [[0, 0.3], [3, 2.5], [40, 37.2], [180, 211.4]]) {
    let sum = 0, term = Math.exp(-lam); for (let i = 0; i <= k; i++) { sum += term; term *= lam / (i + 1); }
    assert.ok(Math.abs(C.poissonCdf(k, lam) - sum) < 1e-9, 'P(N ≤ ' + k + ' | ' + lam + ')');
  }
  assert.equal(C.gammaQ(3, 0), 1);
});

test('④ the forecast is calibrated on sequences simulated from the prior', () => {
  /* a drawn from the prior, a first day of complete aftershocks drawn from it, the next week forecast and drawn: for a
     Bayesian forecast this is calibrated by construction — unless the posterior, the mixture or its fractiles are wrong */
  let seed = 20261013;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return (seed + 0.5) / 2147483648; };
  const normal = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
  const poisson = (lam) => { if (lam > 60) return Math.max(0, Math.round(lam + Math.sqrt(lam) * normal())); let k = 0, p = 1; const L = Math.exp(-lam); do { k++; p *= rnd(); } while (p > L); return k - 1; };
  const par = P.params['SZ-GENERIC'], mc = P.magComp.WORLD, Mm = 7.2, sd = C.aSigma(par, Mm);
  const K = C.kIntegral(par, mc, Mm, 0, 1);
  /* M3+ for the range (hundreds of events: a near-continuous count, so 95 % means 95 % — at M5+ the integer counts make any
     range conservative and a wrong fractile would hide), M6+ for the probability of at least one */
  const g6 = 10 ** (par.b * (Mm - 6)) * C.omoriIntegral(par.p, par.c, 1, 8), g3 = 10 ** (par.b * (Mm - 3)) * C.omoriIntegral(par.p, par.c, 1, 8);
  const trials = 600; let inside = 0, below = 0, above = 0, pSum = 0, hit = 0;
  for (let i = 0; i < trials; i++) {
    const a = Math.max(par.aMin + 0.2, Math.min(par.aMax - 0.2, par.aMean + sd * normal()));
    const n = poisson(10 ** a * K);
    const post = C.posterior(par, Mm, n, K);
    const f3 = C.mixture(post, g3), f6 = C.mixture(post, g6);
    const n3 = poisson(10 ** a * g3), n6 = poisson(10 ** a * g6);
    if (n3 < f3.lo) below++; else if (n3 > f3.hi) above++; else inside++;
    pSum += f6.probability; if (n6 > 0) hit++;
  }
  const cover = inside / trials;
  assert.ok(cover > 0.925 && cover < 0.975, 'the 95 % range covers ' + (100 * cover).toFixed(1) + ' % of simulated outcomes');
  assert.ok(below / trials < 0.045 && above / trials < 0.045, 'neither tail holds much more than its 2.5 %: ' + below + ' below, ' + above + ' above');
  const meanP = pSum / trials, freq = hit / trials;
  assert.ok(Math.abs(meanP - freq) < 0.05, '«at least one M6+» forecast ' + meanP.toFixed(3) + ' against ' + freq.toFixed(3) + ' simulated');
});

test('⑤ the shipped hindcast follows from the shipped model (three real ComCat sequences)', () => {
  const FIX = JSON.parse(src('tests/fixtures/aftershock-sequences.json'));
  const HC = JSON.parse(src('data/aftershock-hindcast.json'));
  assert.equal(HC.rows.length, HC.set.count);
  assert.equal(JSON.stringify(H.score(HC.rows)), JSON.stringify(HC.score), 'the score is the rows\' score');
  for (const s of FIX.sequences) {
    const main = C.normalise(s.mainshock);
    const ev = s.features.map(C.normalise).filter(Boolean);
    const issue = main.t + HC.set.issueDays * 86400000;
    const r = C.run(P, main, ev, issue, { now: Date.parse('2026-10-13T00:00:00Z') });
    const shipped = HC.rows.find((x) => x.id === main.id);
    assert.ok(shipped, main.id + ' is in the hindcast');
    assert.deepEqual(H.row(r), shipped, main.id + ' recomputes to its shipped row');
    /* and the answer check is on the record as the catalogue has it: every closed window, magnitudes ≥ completeness only */
    for (const c of r.check) { assert.equal(c.state, 'closed'); for (const b of c.bins) if (b.checkable) assert.ok(b.mag >= r.completeness.magCat); }
    assert.ok(r.check[0].bins.some((b) => !b.checkable), 'M3 below the WORLD completeness is said to be uncheckable, not scored');
  }
});

test('⑥ USGS\'s own forecast is read as USGS wrote it', () => {
  const F = JSON.parse(src('tests/fixtures/aftershock-usgs-oaf.json'));
  assert.match(C.oafUrl(F.event), /^https:\/\/earthquake\.usgs\.gov\/product\/oaf\/.+\/forecast\.json$/);
  assert.equal(C.oafUrl({ properties: { products: {} } }), null, 'no product → no URL (USGS issued none)');
  const o = C.readOafForecast(F.forecast);
  assert.equal(o.windows.length, F.forecast.forecast.length);
  const wk = o.windows.find((w) => /Week/.test(w.label)), b6 = wk.bins.find((b) => b.mag === 6);
  const raw = F.forecast.forecast.find((w) => /Week/.test(w.label)).bins.find((b) => b.magnitude === 6);
  assert.equal(b6.probability, raw.probability); assert.deepEqual([b6.lo, b6.median, b6.hi], [raw.p95minimum, raw.median, raw.p95maximum]);
  assert.match(o.model, /aftershock model/i);
});

test('⑦ an earthquake\'s position is sent as stated; a named place only rounded; the link round-trips', () => {
  const u = new URL(C.catalogUrl('query', { lng: 130.7630, lat: 32.7906, radiusKm: 81.4, minMag: 3.95, startMs: Date.UTC(2016, 3, 15, 16, 25), endMs: Date.UTC(2017, 3, 16) }));
  assert.equal(u.searchParams.get('latitude'), '32.7906'); assert.equal(u.searchParams.get('maxradiuskm'), '82');
  assert.equal(u.searchParams.get('limit'), String(C.AS.CAP)); assert.equal(u.searchParams.get('eventtype'), 'earthquake');
  const n = new URL(C.nearUrl(130.7634, 32.7912, Date.UTC(2016, 3, 20)));
  assert.equal(n.searchParams.get('latitude'), '33'); assert.equal(n.searchParams.get('longitude'), '131');
  assert.doesNotMatch(n.href, /130\.76|32\.79/, 'the exact place is never sent');
  const picked = C.pickNear({ features: [
    { id: 'far', properties: { mag: 7.9, time: Date.UTC(2016, 3, 10) }, geometry: { coordinates: [135.9, 33.0] } },
    { id: 'near', properties: { mag: 7.0, time: Date.UTC(2016, 3, 15) }, geometry: { coordinates: [130.76, 32.79] } },
  ] }, { lng: 130.7634, lat: 32.7912 }, Date.UTC(2016, 3, 20));
  assert.equal(picked.id, 'near', 'the exact circle is applied on the device (the larger quake 480 km away is outside it)');
  assert.deepEqual(C.decodeLink('?' + C.encodeLink('us20005iis')), { eventId: 'us20005iis' });
  assert.equal(C.decodeLink('?as=%3Cscript%3E'), null); assert.equal(C.decodeLink('?qh=1,2'), null);
  const recent = C.listRecent({ features: [
    { id: 'a', properties: { mag: 6.1, time: Date.UTC(2026, 9, 1), type: 'earthquake' }, geometry: { coordinates: [0, 0] } },
    { id: 'b', properties: { mag: 5.0, time: Date.UTC(2026, 9, 2), type: 'earthquake' }, geometry: { coordinates: [0, 0] } },
    { id: 'c', properties: { mag: 6.5, time: Date.UTC(2026, 9, 3), type: 'quarry blast' }, geometry: { coordinates: [0, 0] } },
  ] }, Date.UTC(2026, 9, 13));
  assert.deepEqual(recent.map((e) => e.id), ['a'], 'the chooser lists earthquakes at or above its floor');
});

test('⑦b the Atlas summary carries the caveat, and a small mainshock is refused with the reason', () => {
  const FIX = JSON.parse(src('tests/fixtures/aftershock-sequences.json'));
  const s = FIX.sequences[0], main = C.normalise(s.mainshock);
  const r = C.run(P, main, s.features.map(C.normalise).filter(Boolean), main.t + 86400000, { now: Date.parse('2026-10-13T00:00:00Z') });
  const A = C.forAtlas(r);
  assert.match(A.caveat, /Not an official forecast/);
  assert.equal(A.forecast.length, 4); assert.ok(A.forecast.every((w) => w.bins.some((b) => b.asLargeAsMainshock)));
  assert.ok(A.answerCheck.length === 4 && A.answerCheck[0].bins.every((b) => ['within', 'below', 'above'].includes(b.verdict)));
  assert.throws(() => C.run(P, Object.assign({}, main, { mag: 4.6 }), [], main.t + 86400000), (e) => e.reason === 'too-small');
});

test('⑧ the doors, the capability and the method page', () => {
  assert.match(src('js/lazy-modules.js'), /aftershock: \{ publishes: 'IntMapAftershock', load: \(\) => import\('\.\/aftershock\.js'\)/);
  assert.match(src('tests/r209.spec.js'), /aftershock: \['IntMapAftershock', 'open'\]/);
  const wb = src('js/wb-layers.js');
  assert.match(wb, /IntMapOS\.register\('aftershock\.open'/); assert.match(wb, /data-as-open="'\+IntMapSafe\.html\(eid\)/); assert.match(wb, /\[\?&\]as=/);
  assert.match(src('js/quake-history.js'), /data-as-open="' \+ S\(e\.id\)/, 'the earthquake record\'s chosen quake opens it');
  assert.match(src('js/map-ui.js'), /id:'sim\.aftershocks', mod:'IntMapAftershock'/);
  assert.match(src('js/atlas-capabilities.js'), /\["sim\.aftershocks","aftershocks",[^\]]*"panel","panel\.aftershock,camera"[^\]]*"aftershock"\]/);
  const ctx = { window: {} };
  vm.createContext(ctx);
  for (const c of ['en', 'ja']) vm.runInContext(src('js/locales/pages.' + c + '.js'), ctx);
  const find = (v, id) => { let hit = null; (function f(x) { if (hit || !x || typeof x !== 'object') return; if (!Array.isArray(x) && x.id === id && Array.isArray(x.blocks)) { hit = x; return; } for (const y of Array.isArray(x) ? x : Object.values(x)) f(y); })(v); return hit; };
  for (const c of ['en', 'ja']) {
    const sec = find(ctx.window.IntMapPageI18N.doc(c).science, 'aftershock');
    assert.ok(sec, 'science.html#aftershock in ' + c);
    assert.ok(sec.blocks.filter((b) => b[0] === 'tex').length >= 4 && sec.blocks.some((b) => b[0] === 'lim'), c + ': the equations and the limits are stated');
  }
});

test('⑧b the Atlas entry: science section, a scenario over its own schema, its doc in the allotted range, en + jp', async () => {
  const SIM = (await import('../js/atlas-cap-sim.js')).default;
  const e = SIM.find((x) => x.row[0] === 'sim.aftershocks');
  assert.ok(e); assert.equal(e.science, 'aftershock');
  const props = Object.keys(e.schema().properties);
  assert.ok(props.includes(e.scenario.subject) && props.includes(e.scenario.baselineParam), 'the scenario names arguments of its own schema');
  for (const s of [...e.scenario.data, ...e.scenario.excluded, ...e.scenario.uncertainty]) assert.ok(Array.isArray(s) && s.length === 2 && /[ぁ-んァ-ヶ一-龯]/.test(s[1]), 'en + jp: ' + s[0]);
  assert.ok(e.doc.every((d) => d.at >= 560 && d.at <= 599), 'the doc sits in the allotted catalogue positions');
  assert.match(e.doc[0].text, /NOT an official forecast/);
});

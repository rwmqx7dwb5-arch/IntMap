/* (companies-elections-live) The company atlas and the national elections layer as live data.
 *
 *  Evaluates the pure parts with real inputs — the committed bytes where the claim is about them,
 *  synthetic ones where the rule is about a shape — and never touches the network:
 *    ① scripts/companies/refresh-plan.mjs orders a weekly batch: pending first, then oldest
 *    ② scripts/lib/elections-live.mjs: the declarations both ways, «overdue» by law, the refresh record
 *    ③ scripts/lib/elections-claims.mjs: a district split between two states on polling day is refused
 *       — proved on the committed geometry: reunified Germany drawn for 1979 is refused, the
 *       Federal Republic the pack now draws for 1979 is not
 *    ④ the committed index carries the receipts (fetchedAt, up, pack, refresh) the legend prints
 *    ⑤ scripts/upstream-liveness.mjs measures the election builds' upstreams too
 *    ⑥ the two weekly workflows are wired to the scripts that do the work
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));

const { plan, ages } = await import('../scripts/companies/refresh-plan.mjs');
const live = await import('../scripts/lib/elections-live.mjs');
const claims = await import('../scripts/lib/elections-claims.mjs');
const { buildProbes } = await import('../scripts/upstream-liveness.mjs');
const { validate } = await import('../scripts/lib/elections-schema.mjs');

const index = json('data/elections/index.json');
const decl = json('scripts/elections/upstreams.json');
const packIds = readdirSync(join(ROOT, 'scripts/elections')).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).map((f) => f.replace(/\.mjs$/, ''));
const readPart = (_k, f) => json('data/elections/' + f);

let _cs = null;
function cshapes() {
  if (_cs) return _cs;
  const prev = globalThis.window;
  globalThis.window = {};
  createRequire(import.meta.url)(join(ROOT, 'data/cshapes.js'));
  _cs = globalThis.window.__CSHAPES;
  if (prev === undefined) delete globalThis.window; else globalThis.window = prev;
  return _cs;
}

/* ── ① ── */
test('① the weekly company batch takes osmPending first, then the oldest profiles, and never more than the batch', () => {
  const rows = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
  const profiles = new Map([
    ['a', { generatedAt: '2026-08-23', osmPending: false }],
    ['b', { generatedAt: '2026-09-30', osmPending: true }],
    ['c', { generatedAt: '2026-08-01', osmPending: false }],
    ['d', { generatedAt: '2026-08-23', osmPending: true }],
    ['e', {}],                                       /* undated: oldest possible, not freshest */
  ]);
  const p = plan(rows, profiles, { batch: 4 });
  assert.deepEqual(p.ids, ['d', 'b', 'e', 'c']);
  assert.deepEqual(p.picked.map((x) => x.why), ['osmPending', 'osmPending', 'oldest', 'oldest']);
  assert.equal(p.pending, 2);
  assert.deepEqual(plan(rows, profiles, { batch: 0 }).ids, [], 'a zero batch is nothing, never «everything»');
  /* a company not in the index (a collapsed duplicate twin) is never planned */
  assert.ok(!plan(rows, new Map([['ghost', { osmPending: true }], ...profiles]), { batch: 99 }).ids.includes('ghost'));
  const a = ages(profiles, '2026-10-03');
  assert.equal(a.undated, 1);
  assert.equal(a.pending, 2);
});

test('① the committed atlas: every profile states the day it was built, and the plan reads it', async () => {
  const { readCommitted } = await import('../scripts/companies/refresh-plan.mjs');
  const { rows, profiles } = readCommitted(ROOT);
  assert.equal(rows.length, profiles.size);
  for (const [id, p] of profiles) assert.match(String(p.generatedAt), /^\d{4}-\d{2}-\d{2}$/, id);
  const p = plan(rows, profiles);
  assert.ok(p.ids.length > 0 && p.ids.length <= 120);
  assert.ok(p.picked.every((x, i, a) => i === 0 || !(a[i - 1].why === 'oldest' && x.why === 'osmPending')), 'pending never follows oldest');
});

/* ── ② ── */
test('② every pack declares its upstreams and the terms of its chambers, and nothing else is declared', () => {
  assert.deepEqual(live.checkDeclarations(decl, packIds, index), []);
  const missing = live.checkDeclarations({ packs: { ...decl.packs, zz: decl.packs.au } }, packIds, index);
  assert.ok(missing.some((m) => /zz is declared but/.test(m)));
  const { jp, ...rest } = decl.packs;
  assert.ok(live.checkDeclarations({ packs: rest }, packIds, index).some((m) => /pack jp declares nothing/.test(m)));
  const noTerm = JSON.parse(JSON.stringify(decl));
  noTerm.packs.jp.terms = noTerm.packs.jp.terms.filter((t) => t.body !== 'House of Councillors');
  assert.ok(live.checkDeclarations(noTerm, packIds, index).some((m) => /House of Councillors/.test(m)));
  const http = JSON.parse(JSON.stringify(decl));
  delete http.packs.kr.probes[0].why;
  assert.ok(live.checkDeclarations(http, packIds, index).some((m) => /over http without saying why/.test(m)));
});

test('② «overdue» is the law\'s interval, and a chamber nobody explained says so in en + jp', () => {
  const ix = {
    polities: [{ id: 'x', pack: 'p' }],
    elections: [{ polity: 'x', body: { en: 'H' }, date: '2018-11-06' }, { polity: 'x', body: { en: 'S' }, date: '2024-11-05' },
      { polity: 'x', body: { en: 'Sp' }, date: '2010-01-01' }],
  };
  const d = { packs: { p: { terms: [{ body: 'H', maxGapMonths: 24 }, { body: 'S', maxGapMonths: 24 }, { body: 'Sp', maxGapMonths: null }] } } };
  const due = live.dueOf(ix, d, '2026-10-03').get('x');
  const by = Object.fromEntries(due.map((b) => [b.body, b]));
  assert.equal(by.H.dueBy, '2020-11-06');
  assert.equal(by.H.overdue, true);
  assert.equal(by.S.overdue, false);
  assert.equal(by.Sp.dueBy, null, 'a body with no legal interval is never overdue');
  const r = live.refreshOf(due, [{ body: 'S', state: 'blocked', what: { en: 'w', jp: 'w' }, why: { en: 'because', jp: 'なぜなら' } }], '2026-10-03');
  const rb = Object.fromEntries(r.bodies.map((b) => [b.body, b]));
  assert.equal(rb.H.state, 'overdue');
  assert.ok(rb.H.why.en && rb.H.why.jp);
  assert.equal(rb.S.state, 'blocked');
  assert.equal(rb.Sp.state, 'current');
  /* month arithmetic does not invent a 31 February */
  const feb = live.dueOf({ polities: [{ id: 'y', pack: 'q' }], elections: [{ polity: 'y', body: { en: 'B' }, date: '2023-01-31' }] },
    { packs: { q: { terms: [{ body: 'B', maxGapMonths: 1 }] } } }, '2026-01-01').get('y')[0];
  assert.equal(feb.dueBy, '2023-02-28');
});

/* ── ③ ── */
test('③ a district split between two states on polling day is refused; one on its own state is not', () => {
  const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  /* two states side by side at the equator, 10° each, both in force throughout */
  const cs = { feats: [['A', 1, 1900, 1, 1, 2019, 12, 31, [[0]]], ['B', 2, 1900, 1, 1, 2019, 12, 31, [[1]]]], rings: [sq(0, 0, 10, 10), sq(10, 0, 20, 10)] };
  const fc = (geom) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { cd: 'd1' }, geometry: { type: 'Polygon', coordinates: [geom] } }] });
  const e = { id: 'x', date: '2000-01-01', geo: 'g' };
  const split = claims.territoryOf(e, fc(sq(2, 2, 16, 8)), cs);
  assert.equal(split.refused.length, 1, 'six of fourteen degrees in B is a split, not a coastline');
  assert.match(split.refused[0].where.join(), /^B /);
  /* a district whose edge crosses the border by a few km (two publishers' drawings) is not refused */
  const edge = claims.territoryOf({ ...e, geo: 'g2' }, fc(sq(2, 2, 10.05, 8)), cs);
  assert.equal(edge.refused.length, 0);
  /* after the record ends the claim is not asked — «could not look» is not «fine» */
  const late = claims.territoryOf({ ...e, date: '2024-01-01' }, fc(sq(2, 2, 16, 8)), cs);
  assert.equal(late.asked, false);
  assert.match(late.why, /CShapes ends 2019-12-31/);
});

test('③ on the committed geometry: reunified Germany drawn for 1979 is refused, the Federal Republic is not', () => {
  const cs = cshapes();
  const e1979 = index.elections.find((e) => e.id === 'eu-ep-1979');
  const e1994 = index.elections.find((e) => e.id === 'eu-ep-1994');
  assert.ok(e1979 && e1994);
  assert.notEqual(e1979.geo, e1994.geo, '1979 and 1994 were not fought on the same Germany');
  /* the 1994 outline IS reunified Germany; asked on the 1979 polling day it must be refused */
  const wrong = claims.territoryOf(e1979, readPart('geo', e1994.geo), cs, 'member-states');
  assert.ok(wrong.refused.some((r) => r.cd === 'DE' && /German Democratic Republic/.test(r.where.join())), JSON.stringify(wrong.refused));
  const right = claims.territoryOf(e1979, readPart('geo', e1979.geo), cs, 'member-states');
  assert.deepEqual(right.refused, []);
  assert.deepEqual(claims.territoryClaims(index, readPart, cs, (pid) => ((decl.packs[index.polities.find((p) => p.id === pid).pack] || {}).territory) || 'one-state').problems, []);
});

test('③ the inventory names the chamber in force in a year, its era and its districts in a box', () => {
  const inv = claims.enumerate(index, readPart, 1979, [5, 47, 16, 55]);
  const eu = inv.find((r) => r.election === 'eu-ep-1979');
  assert.ok(eu && eu.sameYear);
  assert.ok(eu.districts.some((d) => d.cd === 'DE' && /before 3 October 1990/.test(d.name)));
  const de = inv.find((r) => r.body === 'Bundestag');
  assert.equal(de.election, 'de-btw-1976', 'the Bundestag in force in 1979 was elected in 1976');
  assert.equal(de.sameYear, false);
});

/* ── ④ ── */
test('④ every election says when its results were taken and from whom; every polity its pack and its refresh', () => {
  assert.deepEqual(validate(index, (k, f) => readPart(k, f)), []);
  for (const e of index.elections) {
    assert.match(e.fetchedAt, /^\d{4}-\d{2}-\d{2}$/, e.id);
    assert.ok(e.fetchedFrom === 'build' || e.fetchedFrom === 'commit', e.id);
    assert.equal(e.up, decl.packs[index.polities.find((p) => p.id === e.polity).pack].name, e.id);
  }
  for (const p of index.polities) {
    assert.ok(packIds.includes(p.pack), p.id);
    assert.ok(p.refresh && /^\d{4}-\d{2}-\d{2}$/.test(p.refresh.checkedAt), p.id);
  }
  /* what the record is known to be missing, measured 2026-10-03, and said to the reader in en + jp */
  const state = (pid, body) => index.polities.find((p) => p.id === pid).refresh.bodies.find((b) => b.body === body);
  for (const [pid, body] of [['ca', 'House of Commons'], ['ru', 'State Duma — party-list vote'], ['us', 'House of Representatives']]) {
    const b = state(pid, body);
    assert.ok(b.state === 'blocked' || b.state === 'importable', pid + ' ' + b.state);
    assert.ok(b.why.en && b.why.jp, pid);
  }
});

test('④ a validate() that sees a row without its receipt rejects it', () => {
  const copy = JSON.parse(JSON.stringify(index));
  delete copy.elections[0].fetchedAt;
  copy.elections[1].fetchedAt = '1900-01-01';
  delete copy.polities[0].pack;
  copy.polities[1].refresh = { checkedAt: '2026-10-03', bodies: [{ body: 'X', last: '2020-01-01', state: 'blocked' }] };
  const errs = validate(copy, (k, f) => readPart(k, f)).join('\n');
  assert.match(errs, /fetchedAt \(the day/);
  assert.match(errs, /is before polling day/);
  assert.match(errs, /pack \(the scripts\/elections\/ file/);
  assert.match(errs, /must say why/);
});

/* ── ⑤ ── */
test('⑤ the nightly liveness probe asks every election upstream, each under its own identity', () => {
  const { probes, problems } = buildProbes(decl);
  assert.deepEqual(problems, []);
  const declared = Object.values(decl.packs).reduce((n, p) => n + p.probes.length, 0);
  assert.equal(probes.length, declared);
  assert.equal(new Set(probes.map((p) => p.host)).size, probes.length, 'two packs asking one host are two streaks');
  assert.ok(probes.some((p) => p.host === 'elections/ru: www.cikrf.ru'));
  assert.ok(read('scripts/upstream-liveness.mjs').includes('buildProbes(JSON.parse(fs.readFileSync(path.join(ROOT, BUILD_UPSTREAMS)'));
});

/* ── ⑥ ── */
test('⑥ the weekly workflows run the scripts that do the work and land through the shared lander', () => {
  const co = read('.github/workflows/companies-refresh.yml');
  assert.match(co, /schedule:/);
  assert.match(co, /node scripts\/companies\/refresh-plan\.mjs/);
  assert.match(co, /node scripts\/companies\/build\.mjs --only/);
  assert.match(co, /node scripts\/companies-audit\.mjs --gate/);
  assert.match(co, /uses: \.\/\.github\/actions\/land-bot-pr/);
  assert.match(co, /if \[ ! -s batch\.txt \]/, 'an empty plan must not become «--only» of everything');
  const el = read('.github/workflows/elections-refresh.yml');
  assert.match(el, /schedule:/);
  assert.match(el, /build-elections\.mjs --watch/);
  assert.match(el, /build-elections\.mjs --check/);
  assert.match(el, /uses: \.\/\.github\/actions\/land-bot-pr/);
  /* a dispatch input reaches a script through the environment only — never pasted into `run:` */
  for (const y of [co, el]) for (const line of y.split('\n').filter((l) => l.includes('github.event.inputs'))) {
    assert.match(line, /^\s+[A-Z_]+: \$\{\{ github\.event\.inputs\.[a-z]+ \}\}/, line);
  }
});

test('⑥ the legend and the panel print the receipts', () => {
  const js = read('js/elections.js');
  for (const s of ['refreshHtml', "L('Cannot be updated', '更新不能')", "L('Last checked', '最終確認')", 'startPlay', "'flip'", 'freshness:']) assert.ok(js.includes(s), s);
  const panel = read('js/company-panel.js');
  assert.ok(panel.includes("L('Fetched', '取得日')") && panel.includes('curProf.generatedAt'));
});

/* ── ⑦ (finishing) ── */
test('⑦ the native country names this layer shipped survive GISCO dropping them, and say where they came from', () => {
  const geo = readPart('geo', index.elections.find((e) => e.id === 'eu-ep-2024').geo);
  const at = geo.features.find((f) => f.properties.cd === 'AT').properties;
  assert.equal(at.n.native, 'Österreich');
  assert.equal(at.n.de, 'Österreich');
  assert.equal(at.n.fr, 'Autriche', 'what GISCO does state is still added');
  assert.equal(at.nativeFrom.file, 'eu-ms-2024.geo.json');
  assert.match(at.nativeFrom.committed, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(at.nativeFrom.stated, /GISCO/);
  /* every carried name carries its provenance; a name that is this file's own statement does not */
  for (const e of index.elections.filter((x) => x.polity === 'eu' && x.geo)) {
    for (const f of readPart('geo', e.geo).features) {
      if (f.properties.nativeFrom) assert.ok(f.properties.n.native, e.geo + ' ' + f.properties.cd);
    }
  }
  const de79 = readPart('geo', index.elections.find((e) => e.id === 'eu-ep-1979').geo).features.find((f) => f.properties.cd === 'DE').properties;
  assert.equal(de79.nativeFrom, undefined);
});

test('⑦ a box in longitude is an arc: Alaska is not in a box around Germany, and is in one across ±180', () => {
  assert.deepEqual(claims.lonArc([170, 179, -179, -130]), { west: 170, east: 230 });
  assert.ok(!claims.arcMeets(claims.lonArc([170, 179, -179, -130]), 5, 16));
  assert.ok(claims.arcMeets(claims.lonArc([170, 179, -179, -130]), -180, -160));
  assert.ok(claims.arcMeets(claims.lonArc([170, 179, -179, -130]), 175, -175), 'a box that itself crosses ±180');
  const ger = claims.enumerate(index, readPart, 1979, [5, 47, 16, 55]);
  assert.ok(!ger.some((r) => r.districts.some((d) => d.cd === 'ak-00')));
  const ak = claims.enumerate(index, readPart, 1979, [-180, 50, -160, 60]);
  assert.ok(ak.some((r) => r.districts.some((d) => d.cd === 'ak-00')));
});

test('⑦ Atlas can play, read the swing and read the freshness of the elections layer', () => {
  const reg = read('js/atlas-capabilities.js');
  for (const id of ['layers.electionPlay', 'layers.electionSwing', 'layers.electionFreshness']) assert.ok(reg.includes('["' + id + '"'), id);
  const cap = read('js/atlas-cap-layers.js');
  for (const fn of ['E.play()', 'E.swing()', 'E.freshness()', 'E.latest(p)']) assert.ok(cap.includes(fn), fn);
  const el = read('js/elections.js');
  for (const k of ['play:', 'swing:', 'freshness:', 'latest:']) assert.ok(el.includes(k), k);
});

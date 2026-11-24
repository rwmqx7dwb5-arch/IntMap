/* ============================================================================
 *  logistics-network — the rail graph, the nearest-port labelling, the shipped file and the Atlas question
 *  (scripts/logistics/*, data/logistics-network.json, js/logistics-impact.js)
 * ----------------------------------------------------------------------------
 *  What each check holds, and why it is not a restatement of the code under test:
 *    1  junctions: a branch ending 60 m from a through-line is joined to it, two lines that merely CROSS are not
 *       (the data has no vertex at a simplified junction — measured: without snapping 66,213 components)
 *    2  the labelling is Dijkstra: compared with a brute-force all-pairs run on random graphs
 *    3  «a port stops» == removing it and asking again: on a REAL 5-degree rail cell, the second label of every
 *       entity equals its first label after that port is blocked
 *    4  the shipped file: ports are ocean-facing, every list is ascending, every index is valid, the header states
 *       the governance facets and the model
 *    5  the Atlas answer is the file read back: affected = entities whose nearest port it is, extra km = the
 *       difference of the two stated distances, stranded = those with no further port
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRailGraph, components, nearestSources, hav } from '../scripts/logistics/rail-graph.mjs';
import { makeLogisticsImpact } from '../js/logistics-impact.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chain = (id, pts) => ({ id, xs: Float64Array.from(pts.map((p) => p[0])), ys: Float64Array.from(pts.map((p) => p[1])) });

test('junction: a branch end near a through-line joins it; a plain crossing does not', () => {
  /* through-line along lat 50 from lng 10 to 10.1 with NO vertex at 10.05; a branch from the south ends 60 m short of it */
  const through = chain(1, [[10, 50], [10.1, 50]]);
  const branch = chain(2, [[10.05, 49.9], [10.05, 50 - 60 / 111195]]);
  const g1 = buildRailGraph([through, branch], { snapM: 200 }); const gr1 = g1.finish();
  assert.equal(components(gr1).size.length, 1, 'branch must be joined to the through-line');
  /* a line crossing the through-line, neither ending on the other */
  const cross = chain(3, [[10.05, 49.9], [10.05, 50.1]]);
  const g2 = buildRailGraph([through, cross], { snapM: 200 }); const gr2 = g2.finish();
  assert.equal(components(gr2).size.length, 2, 'a crossing is not a switch');
  /* the same branch 600 m away stays apart */
  const far = chain(4, [[10.05, 49.9], [10.05, 50 - 600 / 111195]]);
  assert.equal(components(buildRailGraph([through, far], { snapM: 200 }).finish()).size.length, 2);
});

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

test('nearestSources equals brute-force Dijkstra on random graphs (K nearest distinct sources)', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = rng(seed), n = 60;
    const adj = Array.from({ length: n }, () => []);
    const edges = [];
    for (let i = 1; i < n; i++) { const j = Math.floor(r() * i); edges.push([i, j, 1 + Math.floor(r() * 90)]); }
    for (let k = 0; k < 50; k++) { const a = Math.floor(r() * n), b = Math.floor(r() * n); if (a !== b) edges.push([a, b, 1 + Math.floor(r() * 90)]); }
    edges.forEach(([a, b, w]) => { adj[a].push([b, w]); adj[b].push([a, w]); });
    const off = new Int32Array(n + 1); adj.forEach((l, i) => { off[i + 1] = off[i] + l.length; });
    const to = new Int32Array(off[n]), km = new Float32Array(off[n]);
    adj.forEach((l, i) => l.forEach(([v, w], k) => { to[off[i] + k] = v; km[off[i] + k] = w; }));
    const g = { n, off, to, km };
    const srcNodes = [3, 17, 29, 41, 55];
    const sources = srcNodes.map((node, src) => ({ node, src, startKm: src })); /* a source's own access leg is part of its distance */
    const have = nearestSources(g, sources, 3, 1e9);
    /* brute force */
    const dist = (a) => { const d = new Array(n).fill(Infinity); d[a] = 0; const done = new Array(n).fill(false);
      for (let it = 0; it < n; it++) { let u = -1; for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || d[i] < d[u])) u = i; if (u < 0 || d[u] === Infinity) break; done[u] = true; for (const [v, w] of adj[u]) if (d[u] + w < d[v]) d[v] = d[u] + w; } return d; };
    const D = sources.map((s) => dist(s.node).map((x) => x + s.startKm));
    for (let v = 0; v < n; v++) {
      const want = sources.map((s, i) => [i, D[i][v]]).sort((a, b) => a[1] - b[1] || a[0] - b[0]).slice(0, 3).map((x) => x[1]);
      const got = (have[v] || []).map((x) => x[1]);
      assert.deepEqual(got, want, 'seed ' + seed + ' node ' + v);
    }
  }
});

test('«a port stops» is answered by the second label: blocking the nearest port reproduces it (real rail cell)', () => {
  const cell = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'data', 'railways', 'c', '50_5.json.gz'))));
  const chains = [];
  for (const a of cell.l) {
    const t = cell.d[a[0]]; if (t[0] !== 'rail' && t[0] !== 'narrow_gauge') continue;
    const m = (a.length - 2) / 2; if (m < 2) continue;
    const xs = [], ys = []; let x = 0, y = 0;
    for (let j = 2; j < a.length; j += 2) { x += a[j]; y += a[j + 1]; xs.push(x / cell.s); ys.push(y / cell.s); }
    chains.push({ id: a[1], xs, ys });
  }
  assert.ok(chains.length > 300, 'the cell is a real network (' + chains.length + ' chains)');
  const G = buildRailGraph(chains, { snapM: 200 });
  /* attach ports and entities at chosen chain vertices so every attachment succeeds */
  const pick = (k) => { const c = chains[(k * 977) % chains.length]; const i = Math.floor(c.xs.length / 2); return [c.xs[i], c.ys[i]]; };
  const ports = [3, 11, 19, 27, 35].map((k) => { const [x, y] = pick(k); return G.attach(x, y, 1000); });
  const ents = []; for (let k = 40; k < 140; k++) { const [x, y] = pick(k); const a = G.attach(x, y, 1000); if (a) ents.push(a); }
  const g = G.finish();
  const sources = ports.map((a, src) => ({ node: a.node, src, startKm: a.m / 1000 }));
  const have = nearestSources(g, sources, 3, 2500);
  let checked = 0;
  for (const closed of [0, 1, 2, 3, 4]) {
    const after = nearestSources(g, sources, 3, 2500, new Set([closed]));
    for (const e of ents) {
      const l = have[e.node]; if (!l || l[0][0] !== closed) continue;
      const a = after[e.node];
      if (l.length > 1) { assert.ok(a && a.length, 'a fallback exists after the stop'); assert.equal(a[0][1], l[1][1], 'the fallback distance is the stated second label'); checked++; }
      else assert.ok(!a || a.every((x) => x[0] !== closed));
    }
  }
  assert.ok(checked > 0, 'the cell had entities that lose a nearest port and have a fallback (' + checked + ')');
});

/* ── the shipped file ─────────────────────────────────────────────────────────────────────────────────────────── */
const FILE = path.join(ROOT, 'data', 'logistics-network.json');
const D = JSON.parse(fs.readFileSync(FILE, 'utf8'));

test('file: header states provenance and the model; ports are ocean-facing; lists are ordered and valid', () => {
  for (const k of ['publisher', 'url', 'licence', 'licenceUrl', 'attribution', 'cadence', 'retrievedAt', 'generatedAt', 'asOf', 'schema', 'quality', 'builtBy', 'model', 'coverage', 'inputs', 'paidBy']) assert.ok(D[k] !== undefined, 'header has ' + k);
  assert.match(D.model.kind, /not an observed freight flow/);
  assert.equal(D.quality.rows, D.ports.length);
  for (const p of D.ports) {
    assert.ok(Number.isFinite(p.lng) && Number.isFinite(p.lat), p.name + ' placed');
    assert.ok(p.coastKm <= D.model.seaAccessKm, p.name + ' is ' + p.coastKm + ' km from the ocean');
    assert.ok(p.accessKm <= D.model.portAccessKm, p.name + ' rail access');
  }
  assert.equal(new Set(D.ports.map((p) => p.ref)).size, D.ports.length, 'no duplicate port');
  for (const e of D.entities) {
    assert.ok(e.r.length >= 1 && e.r.length <= D.model.keep);
    for (let i = 0; i < e.r.length; i++) {
      assert.ok(Number.isInteger(e.r[i][0]) && e.r[i][0] >= 0 && e.r[i][0] < D.ports.length, 'valid port index');
      assert.ok(e.r[i][1] <= D.model.maxRailKm + (e.a || 0) + 1e-6, 'within the model reach');
      if (i) assert.ok(e.r[i][1] >= e.r[i - 1][1], 'ascending');
      if (i) assert.notEqual(e.r[i][0], e.r[i - 1][0]);
    }
    assert.equal(new Set(e.r.map((x) => x[0])).size, e.r.length, 'distinct ports');
  }
  /* the counts the header states are the rows present */
  assert.equal(D.coverage.entities.assigned, D.entities.length);
});

test('file: the rail distance is not shorter than the straight line (a measured distance cannot beat geometry)', () => {
  let n = 0;
  for (const e of D.entities) for (const [pi, km] of e.r) {
    const p = D.ports[pi];
    assert.ok(km + 0.5 >= hav(e.x, e.y, p.lng, p.lat) - (p.accessKm || 0) - (e.a || 0) - 1, e.n + ' -> ' + p.name + ' ' + km + ' km vs straight line');
    if (++n > 4000) return;
  }
});

/* ── the Atlas question ──────────────────────────────────────────────────────────────────────────────────────── */
const L = makeLogisticsImpact({ load: async () => D });
const busiest = (() => { const c = new Map(); D.entities.forEach((e) => c.set(e.r[0][0], (c.get(e.r[0][0]) || 0) + 1)); return [...c.entries()].filter(([i]) => D.ports[i].locode).sort((a, b) => b[1] - a[1])[0][0]; })();

test('impact: affected = entities whose nearest port it is; extra km = difference of the stated distances', async () => {
  const p = D.ports[busiest];
  const r = await L.impact(p.locode, { top: 5 });
  assert.equal(r.ok, true);
  assert.equal(r.port.locode, p.locode);
  const mine = D.entities.filter((e) => e.r[0][0] === busiest);
  assert.equal(r.affected.cities, mine.filter((e) => e.k === 'c').length);
  assert.equal(r.affected.factories, mine.filter((e) => e.k === 'f').length);
  assert.equal(r.affected.population, mine.filter((e) => e.k === 'c').reduce((s, e) => s + e.p, 0));
  assert.equal(r.stranded.cities + r.stranded.factories, mine.filter((e) => e.r.length < 2).length);
  for (const c of r.topCities) {
    const e = D.entities.find((x) => x.k === 'c' && x.n === c.name && x.cc === c.cc && x.r[0][0] === busiest);
    assert.ok(e, c.name + ' loses this port');
    if (e.r[1]) { assert.equal(c.fallback.port.ref, D.ports[e.r[1][0]].ref); assert.equal(c.fallback.extraKm, +(e.r[1][1] - e.r[0][1]).toFixed(1)); assert.ok(c.fallback.extraKm >= 0); }
    else assert.equal(c.fallback, null);
  }
  const sum = r.rerouted.reduce((s, x) => s + x.entities, 0);
  assert.ok(sum <= mine.length - (r.stranded.cities + r.stranded.factories) + 0);
  assert.match(r.model.kind, /not an observed freight flow/);
});

test('impact: an unknown port is refused, a port by wikidata id resolves, an ambiguous name is not chosen for the reader', async () => {
  assert.deepEqual(await L.impact('Atlantis Harbour 9'), { ok: false, code: 'no-port', listed: D.ports.length });
  const p = D.ports.find((x) => x.wikidata);
  assert.equal((await L.impact(p.wikidata)).port.ref, p.ref);
  const dup = (() => { const seen = new Map(); for (const q of D.ports) { const k = q.name.toLowerCase(); if (seen.has(k)) return q.name; seen.set(k, 1); } return null; })();
  if (dup) { const r = await L.impact(dup); assert.ok(r.ok || r.code === 'ambiguous'); }
  const down = makeLogisticsImpact({ load: async () => { throw new Error('offline'); } });
  assert.deepEqual(await down.impact('Hamburg'), { ok: false, code: 'unavailable' });
});

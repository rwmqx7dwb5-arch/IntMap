/* hist-colonial-units — the colonial administrative units of Sub-Saharan Africa (Müller-Crepon, CC0) are drawn
   only as the historical review beside them allows (scripts/histsurveys/mullercrepon-review.json), ship in the
   non-commercial bundle because some frames are CShapes', and the archive reader finds a member by its name.
   Offline: reads committed bytes only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { centralDirectory, SOURCE } from '../scripts/histsurveys/mullercrepon.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const review = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/histsurveys/mullercrepon-review.json'), 'utf8')).snapshots;
const load = (rel) => { const w = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { window: w }); return w[Object.keys(w)[0]]; };
const isoOf = (d) => { const s = String(d.date); return /^\d+$/.test(s) ? s + '-01-01' : /^\d+-\d\d$/.test(s) ? s + '-01' : s; };
const spanOf = (k) => {
  const R = review[k], y = +k.split(' ')[1];
  return [R.inForceFrom ? isoOf(R.inForceFrom) : y + '-01-01', R.inForceTo ? isoOf(R.inForceTo) : (y + 1) + '-01-01'];
};
const iso = (y, m, d) => String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');

test('every reviewed snapshot states a level, its reason, and — when drawn — a source and an ordered span', () => {
  const keys = Object.keys(review);
  assert.ok(keys.length > 0);
  for (const k of keys) {
    const R = review[k];
    assert.match(k, /^[A-Z]{3} \d{4}$/, k);
    assert.ok(['region', 'district', 'exclude'].includes(R.level), k + ' level ' + R.level);
    assert.ok(String(R.why || '').length > 10, k + ' has no reason');
    if (R.level === 'exclude') continue;
    assert.ok((R.sources || []).some((s) => /^https?:\/\//.test(s.url || '')), k + ' is drawn without a source');
    const [a, b] = spanOf(k);
    assert.ok(a < b, k + ' span ' + a + ' → ' + b + ' is empty or reversed');
  }
});

test('the record is in the non-commercial bundle only, and the open one never carries it', () => {
  assert.equal(SOURCE.nonCommercial, true);
  const open = load('data/hist-admin-surveys.js');
  assert.ok(!open.feats.some((f) => f[10] === SOURCE.key), 'a Müller-Crepon row is in the open bundle');
  assert.ok(!(open.sources || {})[SOURCE.key]);
});

test('every shipped row belongs to a drawn snapshot, inside its reviewed span, with a derived end said so', () => {
  const nc = load('data/hist-admin-surveys-nc.js');
  const rows = nc.feats.map((f, i) => [f, i]).filter(([f]) => f[10] === SOURCE.key);
  assert.ok(rows.length > 0, 'no Müller-Crepon row shipped');
  assert.ok(nc.sources[SOURCE.key], 'shipped rows without the publisher credited');
  for (const [f, i] of rows) {
    const m = /^mullercrepon:([A-Z]{3} \d{4}):(.+)$/.exec(f[11]);
    assert.ok(m, 'id ' + f[11]);
    const R = review[m[1]];
    assert.ok(R && R.level !== 'exclude', f[11] + ' is drawn from a snapshot the review excludes');
    assert.ok(!(R.excludeUnits || []).some((x) => x[R.level] === m[2] && Object.keys(x).filter((k) => k === 'region' || k === 'district').length === 1), f[11] + ' is a unit the review excludes');
    const [a, b] = spanOf(m[1]);
    const s = iso(f[2], f[3], f[4]), e = iso(f[5], f[6], f[7]);
    assert.ok(s >= a && e <= b, f[11] + ' drawn ' + s + ' → ' + e + ' outside ' + a + ' → ' + b);
    assert.ok(['GBR', 'FRA', 'BEL', 'PRT', 'CONGO-FREE-STATE'].includes(f[12]) || f[12] === R.sovereign, f[11] + ' sovereign ' + f[12]);
    const d = nc.dates[i];
    if (!R.inForceTo && e === b) assert.equal(d.end.derived, true, f[11] + ': the snapshot-year end is derived and must say so');
  }
});

test('the archive reader finds a member by name from the end records alone', () => {
  const entries = [['a/readme.txt', Buffer.from('hello')], ['replication/data/col_units_full.geojson', Buffer.from('{"type":"FeatureCollection","features":[]}')]];
  const locals = [], central = [];
  let off = 0;
  for (const [name, raw] of entries) {
    const body = zlib.deflateRawSync(raw), n = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, n, body); central.push(ch, n); off += 30 + n.length + body.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  const zip = Buffer.concat([...locals, cd, eocd]);
  const tailStart = 10, tail = zip.subarray(tailStart);
  const dir = centralDirectory(tail, tailStart);
  const m = dir.get('replication/data/col_units_full.geojson');
  assert.ok(m);
  const lh = zip.subarray(m.off);
  const body = lh.subarray(30 + lh.readUInt16LE(26) + lh.readUInt16LE(28)).subarray(0, m.csz);
  assert.equal(zlib.inflateRawSync(body).toString(), entries[1][1].toString());
  assert.throws(() => centralDirectory(zip.subarray(off + 5), off + 5), /before the tail/);
});

/* ── the border-edge derivation of reconstructed units (scripts/build-hist-admin-recon.mjs clipTo / edge) ── */
import { edgeProblems, edgePolys } from '../scripts/build-hist-admin-recon.mjs';
const sq = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
const planar = (polys) => { let s = 0; for (const p of polys) p.forEach((r, i) => { let a = 0; for (let j = 0; j + 1 < r.length; j++) a += r[j][0] * r[j + 1][1] - r[j + 1][0] * r[j][1]; s += (i ? -1 : 1) * Math.abs(a) / 2; }); return s; };

test('edge: the line toward a foreign country is the edge set\'s, the atoms\' overhang abroad is cut, an island the atoms lack is taken', () => {
  /* the country's edge feature is [0,2]×[0,1] plus an island [5,6]×[0,1]; foreign features west [-1,0] and east [2,3].
     The atoms reach 0.1 into the west neighbour and stop 0.1 short of the east line. */
  const edgeGeom = new Map([['X-1', [sq(0, 0, 2, 1), sq(5, 0, 6, 1)]], ['W-1', [sq(-1, 0, 0, 1)]], ['E-1', [sq(2, 0, 3, 1)]]]);
  const atoms = [{ id: 'a1', polys: [sq(-0.1, 0, 1, 1)] }, { id: 'a2', polys: [sq(1, 0, 1.9, 1)] }];
  const bbox = (polys) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const p of polys) for (const [x, y] of p[0]) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } return [a, b, c, d]; };
  const foreign = [['W-1', 'WWW'], ['E-1', 'EEE']].map(([id, iso]) => ({ id, iso, polys: edgeGeom.get(id), box: bbox(edgeGeom.get(id)) }));
  const verts = (f) => new Set(f.polys.flatMap((p) => p.flatMap((r) => r.map(([x, y]) => x.toFixed(7) + ',' + y.toFixed(7)))));
  const ctx = { D: { atomSet: 'test-edge-atoms@' + process.pid }, eg: edgeGeom, foreign, all: atoms.map((a) => ({ ...a, box: bbox(a.polys) })), vertsOf: verts, memo: new Map() };
  const own = [sq(-0.1, 0, 1.9, 1)[0]].map((r) => [r]);
  const out = edgePolys(own, { atoms: ['a1', 'a2'], edge: { atoms: ['X-1'] } }, ctx);
  assert.ok(Math.abs(planar(out) - 3) < 1e-6, 'expected [0,2]×[0,1] plus the island = 3, got ' + planar(out));
  const xs = out.flatMap((p) => p[0].map(([x]) => x));
  assert.ok(Math.min(...xs) >= 0 - 1e-9, 'the overhang into the west neighbour was not cut');
  /* keep: toward a neighbour a dated fact shows the atoms right, their line is kept */
  const kept = edgePolys(own, { atoms: ['a1', 'a2'], edge: { atoms: ['X-1'], keep: ['WWW'] } }, { ...ctx, memo: new Map() });
  assert.ok(Math.min(...kept.flatMap((p) => p[0].map(([x]) => x))) < -0.05, 'keep did not keep the atoms\' line toward WWW');
});

test('edge: a declaration is refused when it has no clipTo, names a foreign or unknown feature, or two spans take one feature at once', () => {
  const cat = { 'ne@t': { XXX: [{ id: 'X-1' }, { id: 'X-2' }], YYY: [{ id: 'Y-1' }] } };
  const catOf = (s) => cat[s];
  const D = (spans, clipTo = { atomSet: 'ne@t', country: 'XXX', why: 'test' }) => ({ atomSet: 'gb@t', scope: { from: '2000-01-01', to: '2010-12-31' }, ...(clipTo ? { clipTo } : {}), units: spans.map((s, i) => ({ id: 'u' + i, spans: [s] })) });
  assert.deepEqual(edgeProblems(D([{ from: '2000-01-01', edge: { atoms: ['X-1'] } }, { from: '2000-01-01', edge: { atoms: ['X-2'] } }]), catOf), []);
  assert.match(edgeProblems(D([{ from: '2000-01-01', edge: { atoms: ['X-1'] } }], null), catOf).join(), /declares no clipTo/);
  assert.match(edgeProblems(D([{ from: '2000-01-01', edge: { atoms: ['Y-1'] } }]), catOf).join(), /is not a XXX atom/);
  assert.match(edgeProblems(D([{ from: '2000-01-01', edge: { atoms: ['X-1'] } }, { from: '2005-01-01', edge: { atoms: ['X-1'] } }]), catOf).join(), /both take edge atom X-1/);
  assert.deepEqual(edgeProblems(D([{ from: '2000-01-01', to: '2005-01-01', edge: { atoms: ['X-1'] } }, { from: '2005-01-01', edge: { atoms: ['X-1'] } }]), catOf), []);
});

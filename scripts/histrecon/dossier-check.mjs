#!/usr/bin/env node
/* ==========================================================================
 * scripts/histrecon/dossier-check.mjs   (hist-reconstruction)
 *
 * The machine half of a reconstruction dossier's review. A dossier (scripts/histrecon/dossiers/*.json)
 * states a country's first-level units as unions of ATOMS, one cited span at a time. This file refuses it
 * unless the four criteria the Meiji pilot was judged by hold for what can be judged without the map:
 *
 *   ③ partition   at every instant inside the scope, every atom of the country belongs to exactly ONE
 *                 unit span — or is named as outside the country's administration (`atomsOutside`) or as
 *                 not yet settled (`unresolved`, with the window and the atoms it withholds). Never two,
 *                 never none.
 *   ② counts      where a source states how many first-level units existed on a date, the dossier draws
 *                 that many (units still unresolved on that date are reported, not hidden).
 *   ④ citations   every span carries ≥1 source with a url and what it says.
 *      form       spans of a unit do not overlap; dates are ISO with a stated precision; atom ids exist.
 *
 * Criterion ① (agreement with an independent answer) needs geometry and is measured by
 * scripts/build-hist-admin-recon.mjs.
 *
 * Usage:  node scripts/histrecon/dossier-check.mjs <dossier.json> [more…]      exit 1 on any error
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_ANY = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const QID = /^Q\d+$/;

/** a date as the dossier writes it → the first day it can mean, plus its precision */
export function norm(d) {
  if (d == null) return null;
  const s = String(d);
  if (!ISO_ANY.test(s)) throw new Error('not an ISO date: ' + s);
  return s.length === 4 ? s + '-01-01' : s.length === 7 ? s + '-01' : s;
}
export function precisionOf(d) { const s = String(d); return s.length === 4 ? 'year' : s.length === 7 ? 'month' : 'day'; }
const addDay = (iso) => new Date(Date.parse(iso + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);

/** the windows [from, to) a dossier entry (span / unresolved / atomsOutside) occupies inside the scope */
function windowOf(e, scope) {
  const a = e.from != null ? norm(e.from) : scope.from;
  const b = e.to != null ? norm(e.to) : scope.end;
  return [a < scope.from ? scope.from : a, b > scope.end ? scope.end : b];
}

export function checkDossier(D, atomsByCountry) {
  const err = [], warn = [];
  const E = (m) => err.push(m), W = (m) => warn.push(m);
  if (!D || typeof D !== 'object') return { err: ['not an object'], warn };
  if (!/^[A-Z]{3}$/.test(D.country || '')) E('country must be ISO3');
  const catAll = atomsByCountry[D.country];
  if (!catAll) { E('no atoms for country ' + D.country + ' in atom set ' + D.atomSet); return { err, warn }; }
  /* a dossier may cover only some groups of a polity's atoms (e.g. the 1897 guberniyas of one region of the
     Russian Empire); then ③ is judged over those atoms only, and no two dossiers may share a group */
  let cat = catAll;
  if (D.atomGroups) {
    const g = new Set(D.atomGroups);
    for (const x of g) if (!catAll.some((a) => a.group === x)) E('atomGroups: no atom belongs to group ' + x);
    cat = catAll.filter((a) => g.has(a.group));
  }
  const known = new Set(cat.map((a) => a.id));
  const sc = D.scope || {};
  let scope;
  try { scope = { from: norm(sc.from), end: addDay(norm(sc.to)) }; } catch (e) { E('scope: ' + e.message); return { err, warn }; }
  if (!(scope.from < scope.end)) E('scope.from must precede scope.to');

  const breaks = new Set([scope.from, scope.end]);
  const occupy = []; // {atom, a, b, who, kind}
  const unitIds = new Set();
  for (const u of D.units || []) {
    if (!u.id) { E('a unit has no id'); continue; }
    if (unitIds.has(u.id)) E('duplicate unit id ' + u.id);
    unitIds.add(u.id);
    if (!u.names || !u.names.en) E(u.id + ': names.en missing');
    if (!u.names || !u.names.ja) W(u.id + ': names.ja missing');
    if (u.wikidata != null && !QID.test(u.wikidata)) E(u.id + ': wikidata not a QID: ' + u.wikidata);
    const spans = (u.spans || []).slice();
    if (!spans.length) E(u.id + ': no spans');
    const ws = [];
    spans.forEach((s, k) => {
      const tag = u.id + ' span ' + k;
      try {
        if (s.from == null) throw new Error('from missing');
        if (!ISO_ANY.test(String(s.from)) || (s.to != null && !ISO_ANY.test(String(s.to)))) throw new Error('dates must be YYYY, YYYY-MM or YYYY-MM-DD');
        const pf = precisionOf(s.from);
        if (s.precision && s.precision !== pf) E(tag + ': precision «' + s.precision + '» but from is written at ' + pf + ' precision');
      } catch (e) { E(tag + ': ' + e.message); return; }
      const [a, b] = windowOf(s, scope);
      if (!(norm(s.from) < (s.to != null ? norm(s.to) : '9999'))) E(tag + ': from must precede to');
      if (norm(s.from) < scope.from) E(tag + ': starts before scope.from');
      if (!(a < b)) return;
      ws.push([a, b, k]);
      breaks.add(a); breaks.add(b);
      const atoms = s.atoms || [];
      if (!atoms.length) E(tag + ': no atoms');
      const seen = new Set();
      for (const id of atoms) {
        if (!known.has(id)) E(tag + ': unknown atom ' + id);
        if (seen.has(id)) E(tag + ': atom listed twice ' + id);
        seen.add(id);
        occupy.push({ atom: id, a, b, who: tag, kind: 'unit', unit: u.id });
      }
      const src = s.sources || [];
      if (!src.length) E(tag + ': no source');
      for (const x of src) {
        if (!x || !/^https?:\/\//.test(x.url || '')) E(tag + ': a source has no url');
        if (!x || !x.says) E(tag + ': a source does not say what it states');
        else if (x.says.split(/\s+/).length > 40 && !/[぀-ヿ一-鿿]/.test(x.says)) W(tag + ': «says» is long (' + x.says.split(/\s+/).length + ' words) — paraphrase, do not quote');
      }
    });
    ws.sort((p, q) => (p[0] < q[0] ? -1 : 1));
    for (let i = 1; i < ws.length; i++) if (ws[i][0] < ws[i - 1][1]) E(u.id + ': spans ' + ws[i - 1][2] + ' and ' + ws[i][2] + ' overlap');
  }
  for (const o of D.atomsOutside || []) {
    if (!known.has(o.atom)) E('atomsOutside: unknown atom ' + o.atom);
    if (!o.why) E('atomsOutside ' + o.atom + ': no reason');
    const [a, b] = windowOf(o, scope);
    if (a < b) { breaks.add(a); breaks.add(b); occupy.push({ atom: o.atom, a, b, who: 'outside', kind: 'outside' }); }
  }
  for (const [k, r] of (D.unresolved || []).entries()) {
    if (!r.what || !r.why) E('unresolved ' + k + ': what/why missing');
    if (!r.checked || !r.checked.length) E('unresolved ' + k + ' («' + (r.what || '') + '»): say what was checked');
    for (const id of r.atoms || []) {
      if (!known.has(id)) E('unresolved ' + k + ': unknown atom ' + id);
      const [a, b] = windowOf(r, scope);
      if (a < b) { breaks.add(a); breaks.add(b); occupy.push({ atom: id, a, b, who: 'unresolved ' + k, kind: 'unresolved' }); }
    }
  }

  // ③ partition, interval by interval
  const pts = [...breaks].filter((d) => d >= scope.from && d <= scope.end).sort();
  const byAtom = new Map();
  for (const o of occupy) { if (!byAtom.has(o.atom)) byAtom.set(o.atom, []); byAtom.get(o.atom).push(o); }
  const gaps = new Map(), overl = new Map();
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    for (const id of known) {
      const live = (byAtom.get(id) || []).filter((o) => o.a <= a && o.b >= b);
      if (live.length === 0) { const k = id; if (!gaps.has(k)) gaps.set(k, []); gaps.get(k).push(a + '…' + b); }
      else if (live.length > 1) { const k = id + ' ← ' + live.map((o) => o.who).join(' + '); if (!overl.has(k)) overl.set(k, []); overl.get(k).push(a + '…' + b); }
    }
  }
  const nm = new Map(cat.map((x) => [x.id, x.name]));
  for (const [id, w] of gaps) E('③ atom ' + id + ' (' + nm.get(id) + ') belongs to no unit on ' + compact(w));
  for (const [k, w] of overl) E('③ atom ' + k + ' on ' + compact(w));

  // ② counts
  for (const c of D.counts || []) {
    let t;
    try { t = norm(c.date); } catch (e) { E('counts: ' + e.message); continue; }
    if (!(c.sources || []).length) E('counts ' + c.date + ': no source');
    if (t < scope.from || t >= scope.end) { W('counts ' + c.date + ' lies outside the scope'); continue; }
    const live = new Set(occupy.filter((o) => o.kind === 'unit' && o.a <= t && o.b > t).map((o) => o.unit));
    const pend = (D.unresolved || []).filter((r) => r.unit && windowOf(r, scope)[0] <= t && windowOf(r, scope)[1] > t).map((r) => r.unit);
    const n = live.size + new Set(pend).size;
    if (n !== c.n) (pend.length ? W : E)('② ' + c.date + ': sources state ' + c.n + ' units, the dossier has ' + live.size + ' drawn' + (pend.length ? ' + ' + new Set(pend).size + ' unresolved' : ''));
  }
  return { err, warn, units: unitIds.size, spans: (D.units || []).reduce((s, u) => s + (u.spans || []).length, 0) };
}
function compact(ws) { return ws.length <= 3 ? ws.join(', ') : ws[0] + ' … ' + ws[ws.length - 1] + ' (' + ws.length + ' intervals)'; }

/** the atom catalogue a dossier's atomSet names */
export async function atomsFor(atomSet) {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'atoms');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.mjs'))) {
    const m = await import(pathToFileURL(path.join(dir, f)).href);
    if (m.SET === atomSet) return m.catalogue();
  }
  throw new Error('no atom module declares SET = ' + atomSet + ' in scripts/histrecon/atoms/');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: node scripts/histrecon/dossier-check.mjs <dossier.json> …'); process.exit(2); }
  let bad = 0;
  const cats = new Map();
  for (const f of files) {
    let D;
    try { D = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.log('✖ ' + f + ': ' + e.message); bad++; continue; }
    if (!cats.has(D.atomSet)) cats.set(D.atomSet, await atomsFor(D.atomSet));
    const r = checkDossier(D, cats.get(D.atomSet));
    console.log((r.err.length ? '✖ ' : '✓ ') + path.basename(f) + ' — ' + (r.units || 0) + ' units, ' + (r.spans || 0) + ' spans, ' + r.err.length + ' error(s), ' + r.warn.length + ' warning(s)');
    for (const m of r.err.slice(0, 60)) console.log('   ✖ ' + m);
    if (r.err.length > 60) console.log('   … ' + (r.err.length - 60) + ' more');
    for (const m of r.warn.slice(0, 20)) console.log('   · ' + m);
    if (r.err.length) bad++;
  }
  process.exit(bad ? 1 : 0);
}

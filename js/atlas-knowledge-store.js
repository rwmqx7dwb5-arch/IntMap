/* ============================================================================
 *  IntMap · Atlas — THE KNOWLEDGE LAYER, AS DATA   (atlas-knowledge)                js/atlas-knowledge-store.js
 * ----------------------------------------------------------------------------
 *  Atlas keeps three kinds of memory, and only the first two existed:
 *    1. WORKING memory   — the turn in progress (js/atlas-state.js).
 *    2. the RECORD       — what was asked and answered, as it was (the investigation notebook,
 *                          js/atlas-notebook-store.js): a log, searched by words, never read as knowledge.
 *    3. CONSOLIDATED KNOWLEDGE — this module: statements pulled OUT of investigations, each with the
 *                          basis it rests on, the place / period / world object it is about, and a status
 *                          that says how far it may be trusted. It is loaded back, a few at a time, when
 *                          a new question touches the same ground.
 *
 *  ⚠ A PAST ANSWER IS NOT A FACT, AND THIS MODULE IS THE ENFORCEMENT. Nothing here is written from a turn
 *  automatically; Atlas states a claim and the CODE decides whether it may be kept as what it says it is:
 *    · `verified`  needs a basis that can be CHECKED AGAIN — a source URL that survives the evidence
 *                  registry's own canonicalisation (js/atlas-evidence.js, the one judge of a URL), or a
 *                  named IntMap dataset / calculation. Without one the claim is REFUSED as `verified`
 *                  (it may be kept as `inferred`). The call-scoped evidence id ("e3") is kept for trace
 *                  only: it names a record in ONE call's registry and means nothing in a later session,
 *                  so the URL and title are what is stored.
 *    · `inferred`  is the model's own reasoning from something; it must say what from (`basis`). It is
 *                  returned to a later turn labelled as inference and never merges into `verified`.
 *    · `stale`     is never chosen at the time of writing: a claim becomes stale when a newer one
 *                  `supersedes` it, and reads as expired when the period it was stated for has ended.
 *    · `contested` likewise comes from a relation: a claim that `contradicts` another marks BOTH, and
 *                  neither is deleted — recall shows the two side by side. IntMap does not pick a winner.
 *  No tombstones and no model call: judging "is this the same claim" or "is it still true" is Atlas's
 *  decision, expressed as supersedes / contradicts; this module only records it and refuses what has no
 *  basis (.agents/rules/no-ad-hoc-hardcoding.md: the rule sits on the fact, not on a list of cases).
 *
 *  THREE THINGS THAT MAKE IT WORK IN LATER ANALYSIS (not only be stored):
 *    · SAME OBJECT, NOT SAME SPELLING. A claim is tied to world objects by ref, and the ids the world graph gave
 *      those refs at the time are kept with it (`refKeys`: `wikidata:Q1`, `osm:node/5` ...). A later question that names
 *      the object by ANOTHER of its keys reaches the claim: `recall` is handed the keys of the question's refs and
 *      says `matchedVia: 'same-object'` when that, and not the literal ref, is what matched. Which keys an object has is
 *      the graph's to say (js/atlas-knowledge-identity.js); no alias table lives here.
 *    · TIME. `expired` (the period it was stated for has ended) was only the half stated at write time. A claim may
 *      also say how long it should be trusted without looking again (`recheckAfterDays`, Atlas's declaration; no
 *      default is invented), and `standing()` reports its age, whether a re-check is due, and whether a re-check found
 *      the source changed. Nothing is deleted by time: it is shown, and the question decides.
 *    · RE-CHECKING THE SOURCE. `applyRecheck` records what was observed when a claim's sources were read again:
 *      confirmed / changed / gone / unreachable, with what the page said now. Only `confirmed` on every web source
 *      renews the claim; `gone` on every source takes `verified` away (nothing is left to check again: the same rule
 *      that gate-keeps writing); `unreachable` changes nothing, because failing to look is not finding.
 *  No DOM, no network, no clock of its own (`now` is passed). js/atlas-knowledge.js is the page side
 *  (the reader's switch, the one store); js/atlas-cap-knowledge.js is what Atlas can do with it.
 * ==========================================================================*/

import { memoryBackend, idbBackend } from './atlas-notebook-store.js';
import { makeAtlasEvidence } from './atlas-evidence.js';
import { haversineKm } from '../supabase/functions/_shared/great-circle.js';   /* the one great-circle distance */

const VERSION = 1;
export const KINDS = ['verified', 'inferred', 'stale', 'contested'];
export const WRITE_KINDS = ['verified', 'inferred'];
const { canonicalizeUrl } = makeAtlasEvidence();

const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const arr = (x) => (Array.isArray(x) ? x : []);
const REF_RE = /^[a-z_]+:.{1,200}$/;    /* the same shape world_graph_nodes.ref is checked against */
const ID_RE = /^kn-[a-z0-9-]{4,64}$/;

export function newId(now) {
  const t = Math.floor(+now || Date.now()).toString(36);
  let r = ''; try { const a = new Uint8Array(6); globalThis.crypto.getRandomValues(a); r = Array.from(a, (b) => b.toString(16).padStart(2, '0')).join(''); }
  catch (_) { r = Math.random().toString(16).slice(2, 14); }
  return 'kn-' + t + '-' + r;
}

/** the identity of a statement for "have I already kept this": case, width and spacing folded */
export function statementKey(s) { return String(s || '').normalize('NFKC').toLowerCase().replace(/[\s　.,;:!?。、]+/g, ' ').trim(); }

const dateMs = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && isFinite(v)) return v;
  const s = String(v).trim();
  if (/^-?\d{4}$/.test(s)) return Date.UTC(+s, 0, 1);              /* a bare year is that year's start; validTo of a bare year is its end (below) */
  const ms = Date.parse(s); return isNaN(ms) ? null : ms;
};
const endOf = (v) => { const s = String(v == null ? '' : v).trim(); const ms = dateMs(v); return (/^-?\d{4}$/.test(s) && ms != null) ? Date.UTC(+s + 1, 0, 1) - 1 : ms; };

/** one evidence entry Atlas names → what is stored, or null when it cannot be checked again */
export function normalizeEvidence(e) {
  if (!e || typeof e !== 'object') return null;
  const out = { evidenceId: str(e.id || e.evidenceId, 12) || undefined, title: str(e.title, 180), publisher: str(e.publisher, 90), date: str(e.date || e.publishedAt, 32) || undefined };
  if (e.url) {
    const c = canonicalizeUrl(e.url);
    if (!c.ok) return { rejected: c.reason || 'bad_url', url: String(e.url).slice(0, 200) };
    return Object.assign(out, { origin: 'web', url: c.url, canonicalUrl: c.key, host: c.host, title: out.title || c.host });
  }
  const origin = e.origin === 'calculation' ? 'calculation' : (e.origin === 'app_data' || e.dataset ? 'app_data' : '');
  const label = str(e.dataset || e.label, 120);
  if (origin && label) return Object.assign(out, { origin, label });
  return null;
}

/** Atlas's statement → { claim } or { error: {code, why} }. `now` and `existing` (for relations) are the caller's. */
export function claimFromInput(a, now, existing, ctx) {
  const statement = str(a && a.statement, 1000);
  if (statement.length < 3) return { error: { code: 'needs_statement', why: 'a claim needs its statement' } };
  const kind = String((a && a.kind) || 'inferred').toLowerCase();
  if (WRITE_KINDS.indexOf(kind) < 0) return { error: { code: 'kind_not_writable', why: '"' + kind + '" is not chosen when writing — stale and contested come from supersedes / contradicts' } };
  const ev = arr(a.evidence).map(normalizeEvidence).filter(Boolean);
  const bad = ev.filter((x) => x.rejected), good = ev.filter((x) => !x.rejected);
  const basis = str(a.basis, 600);
  if (kind === 'verified' && !good.length) return { error: { code: 'verified_needs_source', why: 'a verified claim needs a source that can be checked again (a URL, or a named IntMap dataset / calculation)' + (bad.length ? ' — rejected: ' + bad.map((x) => x.url + ' (' + x.rejected + ')').join(', ') : '') + '. Keep it as "inferred" with its basis if it has none.' } };
  if (kind === 'inferred' && !basis) return { error: { code: 'inferred_needs_basis', why: 'an inferred claim must say what it was inferred from (basis)' } };
  const place = a.place && typeof a.place === 'object' ? { name: str(a.place.name, 120), lng: +a.place.lng, lat: +a.place.lat } : null;
  const placed = !!(place && isFinite(place.lng) && isFinite(place.lat) && Math.abs(place.lng) <= 180 && Math.abs(place.lat) <= 90);
  const refs = Array.from(new Set(arr(a.refs).map((r) => String(r).trim()).filter((r) => REF_RE.test(r)))).slice(0, 12);
  const fromMs = dateMs(a.validFrom), toMs = endOf(a.validTo);
  if (fromMs != null && toMs != null && fromMs > toMs) return { error: { code: 'period_reversed', why: 'validFrom is after validTo' } };
  const rel = (x) => Array.from(new Set(arr(x).map((i) => String(i).trim()).filter((i) => ID_RE.test(i)))).slice(0, 12);
  const contradicts = rel(a.contradicts), supersedes = rel(a.supersedes);
  if (existing) {
    const missing = contradicts.concat(supersedes).filter((i) => !existing.has(i));
    if (missing.length) return { error: { code: 'unknown_claim', why: 'no kept claim with id ' + missing.join(', ') } };
  }
  const days = +a.recheckAfterDays;
  if (a.recheckAfterDays != null && !(days >= 1 && days <= 3650)) return { error: { code: 'recheck_period_invalid', why: 'recheckAfterDays is a number of days between 1 and 3650 (or leave it out: no default is invented)' } };
  /* the keys the world graph gave each ref when it was kept: the caller resolves them (async); this only holds what it was handed, for refs it kept */
  const refKeys = {};
  if (ctx && ctx.refKeys && typeof ctx.refKeys === 'object') refs.forEach((r) => { const ks = arr(ctx.refKeys[r]).map((k) => String(k)).filter((k) => /^[a-z_]+:.{1,200}$/i.test(k)); if (ks.length) refKeys[r] = Array.from(new Set(ks)).slice(0, 24); });
  return { claim: {
    v: VERSION, kind, statement, basis: basis || undefined,
    sources: good.map((x) => Object.assign({}, x)),
    place: (place && (place.name || placed)) ? { name: place.name || undefined, lng: placed ? place.lng : undefined, lat: placed ? place.lat : undefined } : undefined,
    validFromMs: fromMs, validToMs: toMs,
    refs, refKeys: Object.keys(refKeys).length ? refKeys : undefined, recheckAfterMs: days >= 1 ? Math.round(days * 864e5) : undefined, contradicts, supersedes,
    topic: str(a.topic, 80) || undefined,
    lang: str(a.lang, 12) || undefined,
    rejectedEvidence: bad.length ? bad.map((x) => x.url) : undefined,
  } };
}

export function normalize(e) {
  if (!e || typeof e !== 'object' || !ID_RE.test(String(e.id || ''))) return null;
  const statement = str(e.statement, 1000); if (!statement) return null;
  const kind = KINDS.indexOf(e.kind) >= 0 ? e.kind : 'inferred';
  const o = Object.assign({}, e, { v: VERSION, id: String(e.id), kind, statement, at: +e.at || 0, updatedAt: +e.updatedAt || +e.at || 0,
    sources: arr(e.sources), refs: arr(e.refs), contradicts: arr(e.contradicts), supersedes: arr(e.supersedes) });
  /* ⚠ a kept `verified` with nothing to check is not verified, whatever the row says (a hand-edited store, an old build) */
  if ((kind === 'verified') && !o.sources.length && !o.wasKind) o.kind = 'inferred';
  return o;
}


/** has the period this claim was stated for ended? (derived at read time — nothing is rewritten) */
export const expired = (c, now) => c.validToMs != null && +now > c.validToMs;

const DAY = 864e5;
/** how a kept claim stands against time and against its sources, at `now`: derived at read time, nothing is rewritten */
export function standing(c, now) {
  const base = c.verifiedAt || c.at || 0;
  const ageDays = base ? Math.max(0, Math.floor((+now - base) / DAY)) : null;
  const web = (c.sources || []).filter((s) => s.url);
  return {
    ageDays,
    periodEnded: expired(c, now),
    recheckDue: c.recheckAfterMs != null && base > 0 && (+now - base) > c.recheckAfterMs,
    recheckAfterDays: c.recheckAfterMs != null ? Math.round(c.recheckAfterMs / DAY) : undefined,
    sourceChanged: !!c.sourceChanged,
    lastCheckedAt: c.lastCheckedAt || undefined,
    neverChecked: web.length > 0 && !web.some((s) => s.lastCheck),
  };
}

/** every key a claim answers to: its refs, and the keys the graph gave them when it was kept */
export const claimKeys = (c) => { const out = new Set(arr(c.refs)); Object.keys(c.refKeys || {}).forEach((r) => arr(c.refKeys[r]).forEach((k) => out.add(k))); return out; };

export const OUTCOMES = ['confirmed', 'changed', 'gone', 'unreachable'];
/** record what was seen when a claim's sources were read again. results: [{ source: url | dataset label, outcome, note? }]
    → { claim, applied[], rejected[] } (a new object; nothing is mutated). confirmed / changed must say what the source says now (note). */
export function applyRecheck(claim, results, now) {
  const applied = [], rejected = [];
  const sources = arr(claim.sources).map((s) => Object.assign({}, s));
  arr(results).forEach((r) => {
    const outcome = String((r && r.outcome) || '').toLowerCase();
    const raw = String((r && r.source) || '').trim();
    if (OUTCOMES.indexOf(outcome) < 0) { rejected.push({ source: raw, code: 'outcome_unknown', why: 'outcome is one of ' + OUTCOMES.join(', ') }); return; }
    let key = raw; if (/^https?:/i.test(raw)) { const c = canonicalizeUrl(raw); key = c.ok ? c.key : raw; }
    const s = sources.find((x) => (x.canonicalUrl && x.canonicalUrl === key) || (x.label && x.label === raw) || (x.url && x.url === raw));
    if (!s) { rejected.push({ source: raw, code: 'not_a_source_of_this_claim', why: "the claim's sources are: " + sources.map((x) => x.url || x.label).join(', ') }); return; }
    const note = str(r.note, 300);
    if ((outcome === 'confirmed' || outcome === 'changed') && note.length < 3) { rejected.push({ source: raw, code: 'needs_note', why: outcome + ' must say what the source says now (note): a re-check nobody can read back is not one' }); return; }
    s.lastCheck = { at: +now, outcome, note: note || undefined };
    applied.push({ source: s.url || s.label, outcome });
  });
  const out = Object.assign({}, claim, { sources, updatedAt: +now });
  if (applied.length) {
    out.lastCheckedAt = +now;
    const web = sources.filter((s) => s.url);
    const last = (s) => (s.lastCheck ? s.lastCheck.outcome : null);
    if (web.length && web.every((s) => last(s) === 'confirmed')) { out.verifiedAt = +now; out.sourceChanged = false; }
    if (web.some((s) => last(s) === 'changed')) out.sourceChanged = true;
    /* nothing left to check again: no longer verified (the write rule, applied to what the world did since) */
    if (sources.length && sources.every((s) => s.lastCheck && s.lastCheck.outcome === 'gone') && out.kind === 'verified') {
      out.wasKind = out.wasKind || 'verified'; out.kind = 'inferred';
      out.basis = out.basis || ('Was verified from ' + sources.map((s) => s.url || s.label).join(', ') + '; none of those was found when read again.');
    }
  }
  return { claim: out, applied, rejected };
}

const terms = (q) => String(q || '').normalize('NFKC').toLowerCase().split(/[\s　]+/).filter(Boolean);

/** Rank what a question needs. ⚠ A query is a FILTER ON WHAT IT NAMES: terms (any may match, ranked by how many),
    a place + radius, a world ref, a date the claim's period must contain. Verified outranks inferred, which outranks
    contested; stale is left out unless asked for (and counted). */
export function recall(claims, q, now, opts) {
  q = q || {};
  const T = terms(q.query || q.text), want = Array.isArray(q.kinds) && q.kinds.length ? q.kinds : null;
  const refs = arr(q.refs).concat(q.ref ? [q.ref] : []).map(String);
  const at = q.at != null ? dateMs(q.at) : null;
  const near = q.near && isFinite(+q.near.lng) && isFinite(+q.near.lat) ? { lng: +q.near.lng, lat: +q.near.lat, km: +q.near.km > 0 ? +q.near.km : 300 } : null;
  const keysOf = (opts && opts.keysOf) || null;   /* ref -> the keys the world graph gives it (the caller resolved them); absent: literal refs only */
  const wantKeys = new Set(); refs.forEach((r) => { wantKeys.add(r); arr(keysOf && keysOf[r]).forEach((k) => wantKeys.add(k)); });
  let omittedStale = 0;
  const rows = [];
  (claims || []).forEach((c) => {
    if (!want && c.kind === 'stale' && !q.includeStale) { omittedStale++; return; }
    if (want && want.indexOf(c.kind) < 0) return;
    let score = 0;
    if (T.length) {
      const hay = [c.statement, c.topic, c.place && c.place.name, c.basis, ...(c.sources || []).map((s) => s.title)].join('\n').normalize('NFKC').toLowerCase();
      const hit = T.filter((t) => hay.indexOf(t) >= 0).length; if (!hit) return; score += hit / T.length;
    }
    let via = null;
    if (refs.length) {
      if (refs.some((r) => (c.refs || []).indexOf(r) >= 0)) { score += 1; via = 'ref'; }
      else if (Array.from(claimKeys(c)).some((k) => wantKeys.has(k))) { score += 0.9; via = 'same-object'; }
      else return;
    }
    const st = standing(c, now);
    if (q.due && !(st.recheckDue || st.periodEnded || st.sourceChanged)) return;
    if (near) {
      if (!(c.place && isFinite(c.place.lng) && isFinite(c.place.lat))) return;
      const d = haversineKm(near.lng, near.lat, c.place.lng, c.place.lat); if (d > near.km) return; score += 1 - d / (near.km * 2);
    }
    if (at != null) { if ((c.validFromMs != null && at < c.validFromMs) || (c.validToMs != null && at > c.validToMs)) return; score += 0.5; }
    const tier = c.kind === 'verified' ? 2 : c.kind === 'inferred' ? 1 : 0;
    rows.push({ c, score, tier, via, st });
  });
  rows.sort((x, y) => (y.score - x.score) || (y.tier - x.tier) || (y.c.updatedAt - x.c.updatedAt));
  const out = rows.map((r) => Object.assign({}, r.c, { expired: r.st.periodEnded, standing: r.st }, r.via === 'same-object' ? { matchedVia: 'same-object' } : {}));
  return { claims: out, omittedStale };
}

/** "load only what is needed": the first claims whose rendered text fits the budget (never fewer than one) */
export function withinBudget(claims, budgetChars, limit) {
  const out = []; let used = 0;
  for (const c of claims) {
    if (out.length >= limit) break;
    const cost = c.statement.length + (c.basis ? c.basis.length : 0) + 120;
    if (out.length && used + cost > budgetChars) break;
    out.push(c); used += cost;
  }
  return { shown: out, cut: claims.length - out.length };
}

/** the store: remember() applies the relations, so a stale / contested mark is the store's doing and not the caller's */
export function makeKnowledgeStore(backend) {
  const B = backend || memoryBackend();
  let cache = null; const subs = [];
  const emit = () => subs.slice().forEach((f) => { try { f(); } catch (_) { } });
  const load = async () => { if (cache) return cache; const all = await B.all(); cache = new Map(); (all || []).forEach((e) => { const n = normalize(e); if (n) cache.set(n.id, n); }); return cache; };
  const API = {
    async list() { const m = await load(); return Array.from(m.values()).sort((a, b) => b.updatedAt - a.updatedAt); },
    async get(id) { const m = await load(); const e = m.get(String(id)); return e ? JSON.parse(JSON.stringify(e)) : null; },
    async count() { return (await load()).size; },
    /** keep one claim (claimFromInput's result). Same statement + same place → merged into the kept one. → { claim, merged, marked[] } */
    async remember(claim, now) {
      const m = await load(); const t = +now || Date.now();
      const key = statementKey(claim.statement);
      const twin = Array.from(m.values()).find((c) => statementKey(c.statement) === key && (c.place && c.place.name || '') === (claim.place && claim.place.name || '') && c.kind !== 'stale');
      const marked = [];
      let n;
      if (twin) {
        const seen = new Set(twin.sources.map((s) => s.canonicalUrl || s.label));
        const sources = twin.sources.concat(claim.sources.filter((s) => !seen.has(s.canonicalUrl || s.label)));
        const kind = (twin.kind === 'contested' || twin.kind === 'stale') ? twin.kind : (sources.length && claim.kind === 'verified' ? 'verified' : twin.kind);
        n = normalize(Object.assign({}, twin, { kind, sources, basis: twin.basis || claim.basis, refs: Array.from(new Set(twin.refs.concat(claim.refs))),
          contradicts: Array.from(new Set(twin.contradicts.concat(claim.contradicts))), supersedes: Array.from(new Set(twin.supersedes.concat(claim.supersedes))), updatedAt: t }));
      } else {
        n = normalize(Object.assign({}, claim, { id: newId(t), at: t, updatedAt: t }));
      }
      const touch = async (id, patch) => { const cur = m.get(id); if (!cur) return; const u = normalize(Object.assign({}, cur, patch, { updatedAt: t })); await B.put(u); m.set(id, u); marked.push(id); };
      for (const id of n.supersedes) { const cur = m.get(id); if (cur && cur.kind !== 'stale') await touch(id, { kind: 'stale', wasKind: cur.wasKind || cur.kind, supersededBy: n.id }); }
      if (n.contradicts.length) {
        n.wasKind = n.wasKind || n.kind; n.kind = 'contested';
        for (const id of n.contradicts) { const cur = m.get(id); if (cur && cur.kind !== 'stale') await touch(id, { kind: 'contested', wasKind: cur.wasKind || cur.kind, contradicts: Array.from(new Set(cur.contradicts.concat([n.id]))) }); }
      }
      await B.put(n); m.set(n.id, n); emit();
      return { claim: JSON.parse(JSON.stringify(n)), merged: !!twin, marked };
    },
    /** apply what a re-read of the sources observed -> { claim, applied, rejected } | null when no such claim */
    async recheck(id, results, now) {
      const m = await load(); const cur = m.get(String(id)); if (!cur) return null;
      const r = applyRecheck(cur, results, +now || Date.now());
      if (!r.applied.length) return { claim: JSON.parse(JSON.stringify(cur)), applied: [], rejected: r.rejected };
      const n = normalize(r.claim); await B.put(n); m.set(n.id, n); emit();
      return { claim: JSON.parse(JSON.stringify(n)), applied: r.applied, rejected: r.rejected };
    },
    /** the account copy's way in: a claim exactly as it is (its id, times and marks already decided); the newer of two is kept */
    async adopt(e) { const n = normalize(e); if (!n) return false; const m = await load(); const cur = m.get(n.id); if (cur && cur.updatedAt >= n.updatedAt) return false; await B.put(n); m.set(n.id, n); emit(); return true; },
    /** note (or clear, with 0) which claims the account copy holds, WITHOUT touching updatedAt and without telling listeners (a sync mark is not a change of knowledge) */
    async markSynced(ids, at) { const m = await load(); for (const id of ids) { const cur = m.get(String(id)); if (!cur) continue; const n = Object.assign({}, cur, { syncedAt: +at || undefined }); await B.put(n); m.set(n.id, n); } },
    async forget(id) { const m = await load(); if (!m.has(String(id))) return false; await B.del(String(id)); m.delete(String(id)); emit(); return true; },
    async clear() { await B.clear(); cache = new Map(); emit(); },
    on(fn) { if (typeof fn === 'function') subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
  };
  return API;
}

export { memoryBackend, idbBackend };

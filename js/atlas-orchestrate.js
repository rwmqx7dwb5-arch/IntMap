/* ============================================================================
 *  IntMap · Atlas orchestration — what is built ON the delegation substrate   (js/atlas-orchestrate.js)
 * ----------------------------------------------------------------------------
 *  js/atlas-delegate.js is the part that must not change when the way work is organised does: a contract, a result,
 *  an executor, an event log. This file is the part that is built on it and may be replaced piece by piece:
 *
 *    integrate(results)        what several results SAY TOGETHER — one deduplicated set of findings and sources with
 *                              who found each, the places more than one worker covered (and whether their numbers
 *                              differ), what nobody could establish, who did not return and why, the cost and the
 *                              wall clock. It decides nothing: Atlas reads it and decides what is true.
 *    mergeFacts(results,{resolve})  what the results STATE as data (`facts`: subject, attribute, value, unit, time, source,
 *                              evidence id) grouped by real-world OBJECT and attribute — agree / conflict / single / missing,
 *                              a conflict carrying every observation's source and evidence. Re-exported from
 *                              js/atlas-fact-merge.js, which says how a name becomes an object (it does not list names).
 *    fanOut(items, template)   contracts from a list — the same piece of work asked of each item
 *    verifyContract(taskId)    a contract for a second worker that checks what the first one claimed (the input is
 *                              the first one's result, so the checker starts from its findings, not from scratch)
 *    makeCapabilityExecutor    runs ONE read-only IntMap capability with given arguments — no model, no cost, exact
 *    makeRouterExecutor        sends a contract to the executor for its `kind`
 *
 *  Pure: no DOM, no network, no globals. The capability executor is handed the function that actually runs a
 *  capability (the page's kernel) and the function that says whether one may be run from here; this file knows
 *  neither. tests/atlas-orchestration-checks.test.mjs runs every export.
 * ==========================================================================*/

export { mergeFacts, normalizeFacts, normalizeFact, makeFactResolver } from './atlas-fact-merge.js';

const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const USABLE = (st) => st === 'done' || st === 'partial';

/* A text with its case, runs of space and surrounding punctuation taken out — what two spellings of one claim, place or
   title have in common. Letters and digits of every script are kept (\p{L}\p{N}); nothing is transliterated. */
export function fold(v) {
  const t = String(v == null ? '' : v).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

/* A URL with what does not identify the page taken out: the fragment, tracking parameters, a trailing slash, the scheme
   and a leading www. Two citations of the same page then compare equal. Not parseable → compared as folded text. */
export function canonicalUrl(u) {
  const raw = s(u, 800);
  if (!raw) return '';
  try {
    const x = new URL(raw);
    const keep = [];
    x.searchParams.forEach((v, k) => { if (!/^(utm_|fbclid$|gclid$|mc_(cid|eid)$|ref$|ref_src$)/i.test(k)) keep.push([k, v]); });
    keep.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const q = keep.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
    return x.hostname.replace(/^www\./i, '').toLowerCase() + x.pathname.replace(/\/+$/, '') + (q ? '?' + q : '');
  } catch (_) { return fold(raw); }
}

/* the figures in a claim, as comparable strings: 1,234 and 1234 are the same figure; a year-like 4-digit number is a
   figure too (a date that differs is a difference worth saying) */
function figuresOf(text) {
  const out = new Set();
  String(text || '').replace(/\d[\d,]*(?:\.\d+)?/g, (m) => { const n = m.replace(/,/g, ''); if (n) out.add(String(Number(n))); return m; });
  return out;
}
const sameSet = (a, b) => a.size === b.size && Array.from(a).every((x) => b.has(x));

/* integrate(results) — results are makeDelegation().run() output (any order, any states) */
export function integrate(results) {
  const rs = (Array.isArray(results) ? results : []).filter((r) => r && typeof r === 'object');
  const byState = {};
  rs.forEach((r) => { byState[r.state] = (byState[r.state] || 0) + 1; });
  const usable = rs.filter((r) => USABLE(r.state));

  const findings = [];
  const seen = new Map();   // fold(claim)|fold(place)|date → index in findings
  usable.forEach((r) => (r.findings || []).forEach((f) => {
    if (!f || !f.claim) return;
    const k = fold(f.claim) + '|' + fold(f.place) + '|' + s(f.date, 40);
    if (seen.has(k)) { const at = findings[seen.get(k)]; if (at.alsoFoundBy.indexOf(r.id) < 0 && at.task !== r.id) at.alsoFoundBy.push(r.id); return; }
    seen.set(k, findings.length);
    findings.push(Object.assign({}, f, { task: r.id, alsoFoundBy: [] }));
  }));

  const sources = [];
  const srcAt = new Map();  // canonicalUrl → index in sources
  const addSource = (url, title, task) => {
    const c = canonicalUrl(url);
    if (!c) return;
    if (!srcAt.has(c)) { srcAt.set(c, sources.length); sources.push({ url: s(url, 500), title: s(title, 200), citedBy: [] }); }
    const at = sources[srcAt.get(c)];
    if (!at.title && title) at.title = s(title, 200);
    if (at.citedBy.indexOf(task) < 0) at.citedBy.push(task);
  };
  usable.forEach((r) => { (r.sources || []).forEach((x) => addSource(x && x.url, x && x.title, r.id)); (r.findings || []).forEach((f) => { if (f && f.source) addSource(f.source, '', r.id); }); });

  /* PLACES MORE THAN ONE WORKER COVERED — and whether the figures they gave for it agree. "Differ" is a flag for Atlas
     to look at, not a verdict: two workers can give different figures for different things at one place. */
  const byPlace = new Map();
  findings.forEach((f) => {
    const p = fold(f.place);
    if (!p) return;
    [f.task].concat(f.alsoFoundBy).forEach((t) => {
      if (!byPlace.has(p)) byPlace.set(p, { place: f.place, claims: [] });
      byPlace.get(p).claims.push({ task: t, claim: f.claim });
    });
  });
  const placeOverlaps = [];
  byPlace.forEach((g) => {
    const tasks = Array.from(new Set(g.claims.map((c) => c.task)));
    if (tasks.length < 2) return;
    const perTask = tasks.map((t) => { const all = new Set(); g.claims.filter((c) => c.task === t).forEach((c) => figuresOf(c.claim).forEach((x) => all.add(x))); return all; }).filter((x) => x.size);
    const numbersDiffer = perTask.length >= 2 && !perTask.every((x) => sameSet(x, perTask[0]));
    placeOverlaps.push({ place: g.place, tasks, claims: g.claims, numbersDiffer });
  });

  const gaps = [];
  usable.forEach((r) => (r.gaps || []).forEach((g) => gaps.push({ task: r.id, gap: g })));

  /* who did not return, and in WHICH way — `unobservable` is not `failed` (one-pass-or-a-reason §5) */
  const unreturned = rs.filter((r) => !USABLE(r.state)).map((r) => ({ task: r.id, state: r.state, code: r.code || undefined, summary: s(r.summary, 300) || undefined }));

  return {
    coverage: { tasks: rs.length, usable: usable.length, byState },
    findings, sources, placeOverlaps, gaps, unreturned,
    cost: {
      usd: rs.reduce((m, r) => m + (Number(r.costUsd) || 0), 0),
      calls: rs.reduce((m, r) => m + (Number(r.calls) || 0), 0),
      /* the tasks ran at the same time, so the wait was the slowest one; the sum is the work done */
      wallMs: rs.reduce((m, r) => Math.max(m, Number(r.ms) || 0), 0),
      workMs: rs.reduce((m, r) => m + (Number(r.ms) || 0), 0),
    },
  };
}

/* fanOut(items, template, opts?) → contracts. template is a function (item, index) → contract fields, or a string in
   which `{item}` is replaced by the item (a string item, or item.name / item.goal / item.label of an object item).
   ids are `<prefix><n>`, so a later contract can name an earlier one as an input. */
export function fanOut(items, template, opts) {
  const o = opts || {};
  const prefix = s(o.prefix, 20) || 'item';
  return (Array.isArray(items) ? items : []).map((it, i) => {
    const label = (it && typeof it === 'object') ? s(it.name || it.goal || it.label, 200) : s(it, 200);
    const base = typeof template === 'function' ? template(it, i) : { goal: String(template || '').split('{item}').join(label) };
    return Object.assign({ id: prefix + (i + 1) }, base || {});
  });
}

/* verifyContract(taskId, opts?) → a contract for a second worker that checks the claims a first task returned. It
   names the first as an input, so its prompt carries that task's summary, findings and gaps (atlas-delegate.js
   workerPrompt), and it starts only when the first has ended usable. */
export function verifyContract(taskId, opts) {
  const o = opts || {};
  return {
    id: s(o.id, 64) || ('verify-' + s(taskId, 56)),
    goal: s(o.goal, 1500) || ('Independently check the claims worker "' + s(taskId, 64) + '" returned, using different sources from the ones it cited where you can. For each claim say whether you found it supported, unsupported or contradicted, and give a source URL for what you found.'),
    returns: s(o.returns, 500) || 'One finding per checked claim: the claim, "supported" / "unsupported" / "contradicted", and the source. List in "gaps" every claim you could not check.',
    inputs: [{ from: s(taskId, 64) }],
  };
}

/* verifyOutcome(pairs) — what a checking worker said about the claims of the task it checked.
     pairs: [{ of: <the checked task's result>, by: <the checker's result> }]
   A claim is matched to the checker's finding by its text (fold(), exactly equal): the checker is asked to repeat the claim
   verbatim (atlas-delegate.js WORKER_SYSTEM). A claim the checker did not repeat — or a checker that did not return — is
   `unchecked`, never guessed to be supported. The outcome is a report for Atlas to read, not a ruling. */
export function verifyOutcome(pairs) {
  const checked = [];
  const counts = { supported: 0, unsupported: 0, contradicted: 0, unchecked: 0 };
  const verifiers = [];
  (Array.isArray(pairs) ? pairs : []).forEach((p) => {
    const of = p && p.of, by = p && p.by;
    if (!of) return;
    const ok = !!by && USABLE(by.state);
    verifiers.push({ task: by ? by.id : undefined, of: of.id, state: by ? by.state : 'not_started', code: (by && by.code) || undefined });
    const said = new Map();
    if (ok) (by.findings || []).forEach((f) => { if (f && f.claim && f.verdict && !said.has(fold(f.claim))) said.set(fold(f.claim), f); });
    (of.findings || []).forEach((f) => {
      if (!f || !f.claim) return;
      const hit = said.get(fold(f.claim));
      const verdict = hit ? hit.verdict : 'unchecked';
      counts[verdict] += 1;
      checked.push({ task: of.id, claim: f.claim, verdict, source: (hit && hit.source) || undefined });
    });
  });
  return { checked, counts, verifiers };
}

/* plain text of a capability's HTML card: tags out, the few entities a card writes decoded, space collapsed */
export function htmlToText(html) {
  return String(html == null ? '' : html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

/* makeCapabilityExecutor({ run, classify })
     run(capabilityId, args, { signal }) → Promise<{ ok, html?, text?, meta?, code?, status? }>  — the page's kernel
     classify(capabilityId) → 'read' | 'unknown' | 'other'  — 'read' only for a capability that reads and writes nothing
   A capability that is not `read` is REFUSED here (state `refused`, `capability_not_read_only`), the way a server
   refusal is: an observed answer, not a failure. Without `classify` nothing is allowed — a worker lane that cannot say
   what it is running does not run it. */
export function makeCapabilityExecutor(o) {
  const opt = o || {};
  const run = opt.run, classify = opt.classify;
  if (typeof run !== 'function') throw new Error('makeCapabilityExecutor: run is required');
  return {
    id: 'capability@page',
    async run(task, ctx) {
      const cap = s(task.capability, 80);
      const kind = typeof classify === 'function' ? classify(cap) : 'other';
      if (kind === 'unknown') return { state: 'refused', code: 'capability_unknown', summary: 'No capability named "' + cap + '" exists here.' };
      if (kind !== 'read') return { state: 'refused', code: 'capability_not_read_only', summary: '"' + cap + '" is not a read-only capability, so a delegated task may not run it; run it yourself.' };
      const intent = ctx.emit('effect.intent', { capability: cap });
      let out;
      try {
        out = await run(cap, task.args || {}, { signal: ctx.signal });
      } catch (e) {
        if (ctx.signal && ctx.signal.aborted) return { state: 'cancelled' };
        ctx.emit('effect.failed', { intent: intent.id, code: 'threw' });
        return { state: 'failed', code: 'capability_threw', summary: s(e && e.message, 400) };
      }
      ctx.emit('effect.done', { intent: intent.id, costUsd: 0, capability: cap });
      const text = s(out && (out.text != null ? out.text : htmlToText(out.html)), 4000);
      if (!out || out.ok === false) return { state: 'failed', code: s(out && out.code, 60) || 'capability_failed', detail: { status: Number(out && out.status) || undefined }, summary: text };
      return { state: 'done', summary: text, data: out.meta, calls: 0, costUsd: 0 };
    },
  };
}

/* makeRouterExecutor({ worker, capability }) — the executor a delegation is given when its contracts may be of
   more than one kind. A kind with no executor behind it is refused (`kind_unsupported`), not run as another kind. */
export function makeRouterExecutor(o) {
  const opt = o || {};
  const by = { worker: opt.worker || null, capability: opt.capability || null };
  return {
    id: 'router',
    async run(task, ctx) {
      const kind = task && task.kind === 'capability' ? 'capability' : 'worker';
      const ex = by[kind];
      if (!ex || typeof ex.run !== 'function') return { state: 'refused', code: 'kind_unsupported', summary: 'This page has no executor for tasks of kind "' + kind + '".' };
      return ex.run(task, ctx);
    },
  };
}

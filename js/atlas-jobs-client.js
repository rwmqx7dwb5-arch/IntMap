/* ============================================================================
 *  IntMap · Atlas durable jobs — the page's side of them   (js/atlas-jobs-client.js)
 * ----------------------------------------------------------------------------
 *  The server half is supabase/functions/atlas-jobs (create + the lease loop) and the tables of
 *  supabase/migrations/20261123130000_atlas_durable_jobs.sql. This file is everything the PAGE does with them:
 *
 *    makeJobsClient({ sb, endpoint, authHeaders })   start / list / get / cancel / amend — a reader's own rows (RLS) and
 *                                                    the two owner RPCs; nothing here can read another reader's job
 *    jobFacts(job, tasks)                            the job as plain data (what Atlas is handed, what the card shows)
 *    jobText(facts)                                  the same, as the text an answer is written from
 *    renderJobCard(facts, { L, esc })                the card: progress, each finished piece AS IT FINISHES, cancel, amend
 *    mountJobCards(client, { L, esc })               makes every `[data-atl-job]` card live: it polls while the job runs,
 *                                                    stops when the job ends or the card leaves the page, and wires the buttons
 *
 *  WHY A JOB IS NOT A TURN. A conversation turn is bounded in steps, calls and seconds (js/atlas-agent.js) because someone is
 *  waiting for it and a runaway turn costs them. A job is a different unit: it has its own fences (a cost cap, a concurrency
 *  limit, a stop switch — atlas-jobs/index.ts) and it outlives the tab. The turn starts it and ENDS; the job's pieces are
 *  read later, from here, whenever the reader (or Atlas) comes back. No turn limit was raised to make room for it.
 *
 *  Everything outside is passed in, so a node test runs it against a fake.   ⚠ no DOM at import time.
 * ==========================================================================*/

import './safe-html.js';   /* publishes globalThis.IntMapSafe — the one encoder every card text and href below goes through */
import { s, stable, digestOf, jobGeometryTypes, readJobArtifactFeatures, readJobArtifactValue } from './atlas-job-core.js';

const TERMINAL = new Set(['done', 'partial', 'failed', 'cancelled']);   /* partial: some pieces finished and some did not (gis-result-handoff) */
const TASK_ENDED = new Set(['done', 'partial', 'failed', 'refused', 'cancelled']);
const micros = (n) => (Number(n) || 0) / 1e6;

/* a short, stable text of a list of contracts: the job's idempotency key is built from it, so the same request started twice
   in one turn is ONE job (nothing charged or started twice) and a request in a later turn is a new one */
export function planDigest(tasks) {
  const t = stable(tasks || []);
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function makeJobsClient(o) {
  const { sb, endpoint, authHeaders } = o || {};
  const fetchFn = (o && o.fetch) || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  const need = () => { if (!sb) throw Object.assign(new Error('Sign in to use background jobs.'), { code: 'no_session' }); return sb; };
  const reads = new Map();
  async function readJob(id) {
    const db = need();
    const [j, t] = await Promise.all([
      db.from('atlas_jobs').select('*').eq('id', id).maybeSingle(),
      Promise.resolve().then(() => db.from('atlas_job_tasks').select('task_id,status,code,deps,contract,result,cost_micros,calls,started_at,ended_at').eq('job_id', id).order('task_id'))
        .catch((error) => ({ error })),
    ]);
    if (j.error) throw new Error('job_read:' + s(j.error.message, 120));
    return j.data ? jobFacts(j.data, t.data || [], t.error ? 'tasks_unavailable' : '') : null;
  }
  return {
    /* start({ tasks, title?, idem, images? }) → (images: { name: [data URL, …] } — what the tasks' `images` names resolved to on the page; the server keeps them with the job) → { ok, jobId?, created?, status?, code?, status_http? } — the server states every refusal by name */
    async start(a) {
      if (!fetchFn || !endpoint) return { ok: false, code: 'not_configured' };
      const headers = typeof authHeaders === 'function' ? await authHeaders() : { 'Content-Type': 'application/json' };
      let r;
      try { r = await fetchFn(endpoint, { method: 'POST', headers, body: JSON.stringify({ op: 'create', idem: a.idem, title: a.title || '', tasks: a.tasks, ...(a.images && typeof a.images === 'object' ? { images: a.images } : null) }) }); }
      catch (e) { return { ok: false, code: 'unreachable' }; }
      let j = null; try { j = await r.json(); } catch (_) { j = null; }
      if (!r.ok || !j || !j.jobId) return { ok: false, code: (j && (j.code || j.error)) || ('http_' + r.status), at: j?.at, from: j?.from, task: j?.task, capability: j?.capability, httpStatus: r.status, available: j && Array.isArray(j.available) ? j.available : undefined };
      return { ok: true, jobId: j.jobId, created: j.created === true, status: j.status };
    },
    async list(limit) {
      const { data, error } = await need().from('atlas_jobs').select('id,title,status,stop_reason,tasks_total,tasks_done,spent_micros,cost_cap_micros,amend_count,created_at,ended_at').order('created_at', { ascending: false }).limit(Math.min(Math.max(Number(limit) || 10, 1), 30));
      if (error) throw new Error('jobs_read:' + s(error.message, 120));
      return data || [];
    },
    get(id) {
      if (!reads.has(id)) reads.set(id, readJob(id).finally(() => reads.delete(id)));
      return reads.get(id);
    },
    async cancel(id) { const r = await need().rpc('atlas_job_cancel', { p_job: id }); if (r.error) return { ok: false, code: s(r.error.message, 80) }; return { ok: true, state: r.data }; },
    /* resume(id, only?) — put back in the queue what did not finish (failed, refused, cancelled); done pieces are never run again (RPC atlas_job_resume) → { ok, state } where state is the RPC's word: queued | running | nothing_to_resume | disabled | not_found */
    async resume(id, only) { const r = await need().rpc('atlas_job_resume', { p_job: id, p_only: Array.isArray(only) && only.length ? only.map((x) => s(x, 64)).slice(0, 8) : null }); if (r.error) return { ok: false, code: s(r.error.message, 80) }; return { ok: r.data === 'queued', state: r.data }; },
    async amend(id, note) { const r = await need().rpc('atlas_job_amend', { p_job: id, p_note: s(note, 1000) }); if (r.error) return { ok: false, code: s(r.error.message, 80) }; return { ok: true, state: r.data }; },
    /* (gis-result-handoff) revise(id, note, { tasks?, keep? }) — a change of request that names the pieces it affects: `tasks` are their new contracts
       (an existing id replaces that piece), `keep` the finished pieces that still hold. Planned as a whole on the server (atlas-jobs op "revise") →
       { ok, version?, revised?, kept?, code?, at? } */
    async revise(id, note, o) {
      if (!fetchFn || !endpoint) return { ok: false, code: 'not_configured' };
      const headers = typeof authHeaders === 'function' ? await authHeaders() : { 'Content-Type': 'application/json' };
      let r;
      try { r = await fetchFn(endpoint, { method: 'POST', headers, body: JSON.stringify({ op: 'revise', jobId: id, note: s(note, 1000), tasks: (o && Array.isArray(o.tasks)) ? o.tasks : [], keep: (o && Array.isArray(o.keep)) ? o.keep.map((x) => s(x, 64)) : [] }) }); }
      catch (e) { return { ok: false, code: 'unreachable' }; }
      let j = null; try { j = await r.json(); } catch (_) { j = null; }
      if (!r.ok || !j || !(Number(j.version) >= 1)) return { ok: false, code: (j && (j.code || j.error)) || ('http_' + r.status), at: j && j.at };
      return { ok: true, version: Number(j.version), revised: j.revised || [], kept: j.kept || [] };
    },
    /* (gis-result-handoff) output(jobId, taskId) — the WHOLE output a piece made (its FeatureCollection), read from its row or, when it was kept beside
       the row, from its parts in order → { ok, features, output, sources } | { ok:false, code } — a part that is missing is said, never a shorter answer */
    async output(jobId, taskId, kind) {
      const db = need();
      const t = await db.from('atlas_job_tasks').select('task_id,result').eq('job_id', jobId).eq('task_id', taskId).maybeSingle();
      if (t.error) return { ok: false, code: 'task_unavailable' };
      if (!t.data) return { ok: false, code: 'not_found' };
      const r = t.data.result || {};
      const d = r.data || {};
      const o = d.output || null;
      const sources = Array.isArray(r.outputSources) ? r.outputSources : (Array.isArray(r.sources) ? r.sources : []);
      if (!o || kind === 'research') {
        const value = researchOf(r);
        return value ? { ok: true, value, output: researchRef(jobId, taskId, r, value), sources } : { ok: false, code: 'no_output' };
      }
      if (o.format === 'json') {
        const got = await readJobArtifactValue(db, 'atlas_job_artifacts', jobId, taskId, d);
        if (!got.ok) return got;
        const features = got.value?.type === 'FeatureCollection' ? got.value.features : undefined;
        return { ...got, ...(features ? { features } : {}), output: o, sources };
      }
      if (o.stored !== 'artifact') return d.result && Array.isArray(d.result.features) ? { ok: true, value: d.result, features: d.result.features, output: o, sources } : { ok: false, code: 'no_output' };
      const got = await readJobArtifactFeatures(db, 'atlas_job_artifacts', jobId, taskId, o);
      return got.ok ? { ...got, value: { ...o.header, type: 'FeatureCollection', features: got.features }, output: o, sources } : got;
    },
  };
}

/* jobFacts(jobRow, taskRows) → the job as plain data. A task that has ended carries its result NOW — a job that is still
   running shows the pieces that finished (the reader does not wait for the last one to see the first). */
function researchOf(r) {
  if (!Array.isArray(r.facts) && !Array.isArray(r.notFound)) return null;
  return { facts: r.facts || [], notFound: r.notFound || [], evidence: r.evidence || null };
}
function researchRef(jobId, taskId, r, value) {
  return { id: 'job:' + jobId + '/' + taskId + '/research', version: digestOf(stable({ value, sources: r.sources, conditions: r.conditionsVersion })), kind: 'research', task: taskId, count: value.facts.length };
}
export function jobFacts(job, tasks, tasksError = '') {
  const list = (tasksError ? [] : tasks || []).map((t) => {
    const r = t.result || {};
    const c = t.contract || {};
    const research = researchOf(r);
    return {
      id: t.task_id, kind: c.kind || 'worker', title: s(c.capability ? (c.capability + (c.args && Object.keys(c.args).length ? ' ' + stable(c.args) : '')) : c.goal, 160),
      state: t.status, code: t.code || '', ended: TASK_ENDED.has(t.status),
      deps: Array.isArray(t.deps) ? t.deps.map((d) => String(d)) : [], endedAt: t.ended_at || null,
      summary: s(r.summary, 1500),
      /* (gis-dataset-slots) THE FINDINGS THEMSELVES, not their count. A worker's figures (the claim, the source, the words or raw values it rests on) were reduced
         to a number here, so Atlas, reading the ended job, said the result held no figures and recomputed them on the page (production 2026-11-28). */
      findings: Array.isArray(r.findings) ? r.findings.filter((x) => x && x.claim).map((x) => ({ claim: s(x.claim, 800), source: s(x.source, 400), excerpt: s(x.excerpt, 800) })) : [],
      gaps: Array.isArray(r.gaps) ? r.gaps.map((g) => s(g, 300)) : [],
      sources: Array.isArray(r.sources) ? r.sources.map((x) => ({ url: s(x && x.url, 500), title: s(x && x.title, 200) })) : [],
      facts: research?.facts || [], notFound: research?.notFound || [], evidence: research?.evidence || null,
      research: research ? researchRef(job.id, t.task_id, r, research) : null,
      costUsd: micros(t.cost_micros),
      /* (server-capability-lane) a map-changing capability the job SAVED for the page — applyParked runs it when the reader is back */
      parked: r.parked && typeof r.parked.capability === 'string' ? { capability: s(r.parked.capability, 80), args: (r.parked.args && typeof r.parked.args === 'object') ? r.parked.args : {} } : null,
      /* (gis-result-handoff) what the piece MADE (its output's id, version, count, columns, sources, where it is kept) and which outputs it READ —
         the structured result, not only its summary; the features themselves are read with client.output when they are wanted */
      output: outputOf(r),
      reads: Array.isArray(r.reads) ? r.reads.map((x) => ({ id: s(x && x.id, 120), version: s(x && x.version, 40), count: Number(x && x.count) || 0, ok: !!(x && x.ok) })) : [],
      requestVersion: Number(r.requestVersion) || 0, conditionsVersion: r.conditionsVersion == null ? Number(r.requestVersion) || 0 : Number(r.conditionsVersion) || 0,
    };
  });
  const jr = job.result && typeof job.result === 'object' ? job.result : {};
  const staleIds = new Set((Array.isArray(jr.stale) ? jr.stale : []).map((x) => x && x.id));
  const requestVersion = Math.max(Number(jr.requestVersion) || 0, Number(job.amend_count) || 0);
  for (const t of list) if (t.ended && t.conditionsVersion < requestVersion) staleIds.add(t.id);
  for (let i = 0; i < list.length; i++) {
    const before = staleIds.size;
    for (const t of list) if (t.ended && t.deps.some((d) => staleIds.has(d))) staleIds.add(t.id);
    if (staleIds.size === before) break;
  }
  list.forEach((t) => { t.stale = staleIds.has(t.id); });
  const ended = list.filter((t) => t.ended).length;
  return {
    id: job.id, title: s(job.title, 200), status: job.status, stopReason: job.stop_reason || '', running: !TERMINAL.has(job.status),
    tasksTotal: Number(job.tasks_total) || list.length, tasksEnded: tasksError ? null : ended, tasksError, tasksDone: Number(job.tasks_done) || list.filter((t) => t.state === 'done' || t.state === 'partial').length,
    amends: Number(job.amend_count) || 0, spentUsd: micros(job.spent_micros), capUsd: micros(job.cost_cap_micros),
    unknownCostCalls: Number(job.unknown_cost_calls) || 0, unreconciledUsd: micros(job.unreconciled_micros),
    createdAt: job.created_at, endedAt: job.ended_at || null, error: s(job.error, 300),
    result: job.result && typeof job.result.summary === 'string' ? s(job.result.summary, 6000) : '',
    incomplete: Array.isArray(jr.incomplete) ? jr.incomplete.map((x) => ({ id: s(x && x.id, 64), state: s(x && x.state, 20), code: s(x && x.code, 60) })) : [],
    requestVersion,
    tasks: list,
  };
}
function outputOf(r) {
  const data = r?.data;
  const o = data?.output;
  if (!o || typeof o !== 'object') return null;
  const geometryTypes = Array.isArray(o.geometryTypes) ? o.geometryTypes :
    Array.isArray(data.result?.features) ? jobGeometryTypes(data.result.features) : null;
  return { id: s(o.id, 120), version: s(o.version, 40), count: Number(o.count) || 0, columns: Array.isArray(o.columns) ? o.columns.slice(0, 60).map((c) => s(c, 80)) : [],
    kind: o.kind, ref: o.ref, path: o.path, origin: o.origin, provenance: o.provenance, format: o.format,
    geometryTypes, sources: Array.isArray(o.sources) ? o.sources.filter((u) => typeof u === 'string') : [], bytes: Number(o.bytes) || 0, stored: o.stored === 'artifact' ? 'artifact' : 'inline', parts: Number(o.parts) || 0 };
}

/* ══ APPLYING WHAT A JOB SAVED FOR THE PAGE  (server-capability-lane) ═══════════════════════════════════
   A job that names a capability which changes the map or the session cannot run it on the server (no map there): the task ends `done` with
   `parked` (js/atlas-server-class.js, supabase/functions/_shared/atlas-job-runner.js). This runs those operations, in task order, through
   `apply` — the page's own executor (a program bridge granted 'state', so the same gate a turn goes through) — once each. "Once" is held on THIS
   device in `memory` ({ has(key), add(key) }); a refused operation is recorded as refused and not retried (one-pass-or-a-reason §5).
   applyParked(facts, apply, memory) → [{ task, capability, ok, why? }] — what it did THIS call; an operation done earlier is not in it. */
export async function applyParked(f, apply, memory) {
  const out = [];
  if (!f || f.tasksError || f.status === 'cancelled' || typeof apply !== 'function') return out;
  /* ⚠ THE ORDER IS THE PLAN'S, NOT THE ALPHABET'S. The tasks arrive sorted by their NAME (the query orders by task_id), so «draw» ran before
     «move to 1850» and drew the present (reproduced 2026-11-27). A parked operation runs after every task it starts from: a topological order over
     `deps`, ties broken by when the server ended each (the order it ran them in), then by name. */
  const all = f.tasks || [];
  const byId = new Map(all.map((t) => [t.id, t]));
  const ordered = [], seen = new Set(), visiting = new Set();
  const stamp = (t) => (t.endedAt ? Date.parse(t.endedAt) || 0 : 0);
  const sorted = all.slice().sort((x, y) => (stamp(x) - stamp(y)) || String(x.id).localeCompare(String(y.id)));
  const visit = (t) => {
    if (seen.has(t.id) || visiting.has(t.id)) return;
    visiting.add(t.id);
    (t.deps || []).forEach((d) => { const up = byId.get(d); if (up) visit(up); });
    visiting.delete(t.id); seen.add(t.id); ordered.push(t);
  };
  sorted.forEach(visit);
  const attempts = memory ? (memory.attempts || (memory.attempts = new Map())) : null;
  const failures = memory ? (memory.failures || (memory.failures = new Map())) : null;
  const notApplied = new Set();   // a task whose operation did not take effect holds back the ones that start from it
  for (const t of ordered) {
    if (!t.parked || t.state !== 'done') continue;
    /* A kept result may be valid under later conditions, but is still the same execution.
       Version zero retains the key written by earlier clients. */
    const key = parkedKey(f, t);
    if (t.stale) { notApplied.add(t.id); continue; }
    if (memory && memory.has(key)) continue;
    const blocker = (t.deps || []).find((d) => notApplied.has(d));
    if (blocker) { notApplied.add(t.id); out.push({ task: t.id, capability: t.parked.capability, ok: false, applied: false, why: 'its predecessor "' + blocker + '" did not take effect' }); continue; }
    const existing = attempts?.get(key);
    if (existing) {
      if (!(await existing)?.ok) notApplied.add(t.id);
      continue;
    }
    const attempt = Promise.resolve().then(() => apply(t.parked))
      .catch((e) => ({ ok: false, why: s(e && e.message, 120) || 'threw' }));
    attempts?.set(key, attempt);
    const r = await attempt;
    const ok = !!(r && r.ok);
    /* ⚠ «APPLIED» IS WRITTEN AFTER THE EFFECT WAS OBSERVED, NOT BEFORE THE ATTEMPT. The mark went in first, so an operation that failed was already
       «done» and a fetch of the same job never drew it. `ok` here is the page's own read-back (js/atlas-cap-jobs.js parkedApplier: observed !== false). */
    const why = ok ? '' : s(r && r.why, 160);
    if (ok) { if (memory) memory.add(key); } else { notApplied.add(t.id); failures?.set(key, { ok, why }); }
    out.push({ task: t.id, capability: t.parked.capability, ok, applied: ok, why });
  }
  return out;
}

function parkedKey(f, t) {
  const version = t.requestVersion ?? t.conditionsVersion ?? 0;
  return String(f.id) + '/' + t.id + (version > 0 ? '@' + version : '');
}

export function deviceJobFacts(f, memory, applied = []) {
  const byTask = new Map(applied.map((a) => [a.task, a]));
  const pending = [];
  const tasks = f.tasks.map((t) => {
    if (!t.parked) return t;
    const key = parkedKey(f, t);
    const receipt = byTask.get(t.id) || memory?.failures?.get(key);
    const confirmed = !t.stale && (receipt?.ok || memory?.has(key));
    const application = confirmed ? 'applied' : f.status === 'cancelled' ? 'cancelled' : t.stale ? 'stale' : receipt ? 'failed' : 'pending';
    if (application !== 'applied' && application !== 'cancelled') pending.push({ id: t.id, state: application, code: 'browser_application', why: receipt?.why });
    return { ...t, application };
  });
  if (!pending.length) return { ...f, tasks };
  const incomplete = (f.incomplete || []).filter((t) => !pending.some((p) => p.id === t.id));
  return { ...f, tasks, status: f.status === 'done' ? 'awaiting_application' : f.status, serverStatus: f.status,
    incomplete: incomplete.concat(pending), applicationsPending: pending.length,
    tasksDone: Math.max(0, f.tasksDone - pending.length), tasksEnded: Math.max(0, f.tasksEnded - pending.length) };
}

/* The page's independent job readers share in-flight applications. Storage carries successful receipts across loads. */
const parkedMemories = new WeakMap();
export function deviceParkedMemory(w) {
  const win = w || (typeof window !== 'undefined' ? window : globalThis);
  if (parkedMemories.has(win)) return parkedMemories.get(win);
  const KEY = 'intmap.atlas.jobs.applied';
  const seen = new Set();
  try { JSON.parse((win.localStorage && win.localStorage.getItem(KEY)) || '[]').forEach((k) => seen.add(String(k))); } catch (_) { /* start empty */ }
  const memory = { has: (k) => seen.has(k), add: (k) => { seen.add(k); try { if (win.localStorage) win.localStorage.setItem(KEY, JSON.stringify(Array.from(seen).slice(-500))); } catch (_) { /* the device refused */ } } };
  parkedMemories.set(win, memory);
  return memory;
}

/* jobText(facts) — plain text, the facts first (Atlas reads the top of a card's text) */
export function jobText(f, filed) {
  const progress = f.tasksError ? 'task details unavailable' : f.tasksEnded + ' of ' + f.tasksTotal + ' pieces ended';
  const head = 'Job ' + f.id + (f.title ? ' "' + f.title + '"' : '') + ': ' + f.status + (f.stopReason ? ' (' + f.stopReason + ')' : '') + ' — ' + progress + ', $' + f.spentUsd.toFixed(3) + ' of $' + f.capUsd.toFixed(2) + (f.unknownCostCalls ? ', cost unknown for ' + f.unknownCostCalls + ' request(s)' : '') + (f.unreconciledUsd ? ', $' + f.unreconciledUsd.toFixed(3) + ' kept against the allowance after an expired lease' : '') + (f.amends ? ', ' + f.amends + ' instruction change(s)' : '') + '.';
  /* (gis-result-handoff) what each piece MADE is stated as data — the output's id, version, count, columns and sources — so the next step (a further
     filter, a join, the map) can name it: "@<piece>:data.result" in a later job, or the dataset the page filed it as (work.job restore) */
  const geometry = (types) => types?.length ? ', geometry: ' + types.join(', ') : (types ? ', no geometry' : ', geometry types unreported');
  const outputs = filed?.datasets?.map((d) => {
    const restore = { type: 'work', action: 'restore', id: filed.workId, product: d.product };
    return '- ' + d.task + (d.stale ? ' [computed under an earlier version of the request]' : '') + ': ' + d.output + ' v' + d.version + ' · GeoJSON, ' + d.count + ' feature(s)' + geometry(d.geometryTypes) + (d.title ? ' · ' + d.title : '') + ' · session import ' + JSON.stringify(restore);
  }) || [];
  if (outputs.length) outputs.unshift('Stored GeoJSON results (session import preserves their geometry; the returned dataset ID is accepted by map.drawDataset / gisDraw):');
  const out = (o) => o ? ' | output ' + o.id + ' v' + o.version + ': ' + o.count + ' feature(s), GeoJSON' + geometry(o.geometryTypes) + (o.columns.length ? ', columns ' + o.columns.slice(0, 20).join(',') : '') + (o.sources.length ? ', from ' + o.sources.join(' ') : '') + (o.stored === 'artifact' ? ' (kept whole beside the row, ' + o.parts + ' part(s))' : '') : '';
  const rows = f.tasks.map((t) => '- ' + t.id + ' [' + t.state + (t.code ? ' / ' + t.code : '') + ']' + (t.stale ? ' [computed under an earlier version of the request: ' + t.conditionsVersion + ' of ' + (f.requestVersion || 0) + ' — redo it with jobs.amend revise, or keep it]' : '') + (t.summary ? ': ' + t.summary : (t.ended ? '' : ' (not finished)')) + out(t.output) + (t.findings.length ? '\n  findings: ' + t.findings.map((x, i) => '[' + (i + 1) + '] ' + x.claim + (x.source ? ' (' + x.source + ')' : '') + (x.excerpt ? ' — "' + x.excerpt + '"' : '')).join('\n  ') : '') + (t.gaps.length ? ' | not established: ' + t.gaps.join('; ').slice(0, 300) : ''));
  const inc = (f.incomplete || []).length ? ['', 'NOT FINISHED (the job is ' + f.status + ', not done): ' + f.incomplete.map((x) => x.id + ' ' + x.state + (x.code ? ' (' + x.code + ')' : '')).join('; ')] : [];
  const research = f.tasks.filter((t) => t.research).map((t) => '- ' + t.id + ': ' + t.research.id + ' v' + t.research.version + ' · ' + t.facts.length + ' facts · jobs.status {outputTask:"' + t.id + '",outputKind:"research"}');
  return [head].concat(outputs, research, rows, inc, f.result ? ['', 'Combined: ' + f.result.slice(0, 2000)] : []).join('\n');
}

const URL_OK = /^https?:\/\//i;
/* a URL that starts an href goes through window.IntMapSafe.url (js/safe.js); with it absent (a node test) nothing becomes a link */
const safeUrl = (u) => { try { return (typeof window !== 'undefined' && window.IntMapSafe && window.IntMapSafe.url) ? String(window.IntMapSafe.url(u) || '') : ''; } catch (_) { return ''; } };

/* the one encoder is window.IntMapSafe.html (js/safe-html.js); with it absent nothing is rendered rather than rendered unescaped */
const escHtml = (v) => { try { return String(globalThis.IntMapSafe.html(v == null ? '' : String(v))); } catch (_) { return ''; } };

/* renderJobCard(facts, { L }) → HTML (the inside of a card; mountJobCards wraps it) */
export function renderJobCard(f, h) {
  const L = h.L;
  const esc = (v) => escHtml(v);   /* the file's own delegate to the one encoder — a card is built from third-party text (a worker's findings), never from the caller's escaper */
  const word = (st) => ({ queued: L('waiting', '待機中'), running: L('running', '実行中'), done: L('done', '完了'), partial: L('partly', '一部'), failed: L('failed', '失敗'), refused: L('refused', '拒否'), cancelled: L('cancelled', '取消'), awaiting_application: L('waiting for this device', '端末での適用待ち'), pending: L('waiting for this device', '端末での適用待ち'), applied: L('applied on this device', 'この端末に適用済み'), stale: L('request changed', '依頼条件が変更済み') })[st] || st;
  const pct = f.tasksTotal ? Math.round((f.tasksEnded / f.tasksTotal) * 100) : 0;
  const rows = f.tasks.map((t) => {
    const src = t.sources.filter((x) => URL_OK.test(x.url)).map((x) => { const u = safeUrl(x.url); return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(x.title || x.url) + '</a>' : esc(x.title || x.url); }).join(' · ');
    return '<li style="margin:4px 0;"><b>' + esc(t.title || t.id) + '</b> — ' + esc(word(t.application || t.state)) + (t.code && !t.application ? ' (' + esc(t.code) + ')' : '')
      + (t.summary ? '<div style="opacity:.85;">' + esc(t.summary.slice(0, 700)) + '</div>' : '')
      + (t.gaps.length ? '<div style="opacity:.6;">' + esc(L('Not established: ', '不明だった点: ') + t.gaps.join('; ').slice(0, 300)) + '</div>' : '')
      + (src ? '<div style="opacity:.7;">' + src + '</div>' : '') + '</li>';
  }).join('');
  const unfinished = !f.running && f.tasks.some((t) => t.state === 'failed' || t.state === 'refused' || t.state === 'cancelled');
  const resume = unfinished ? '<div style="margin-top:6px;"><button type="button" data-atl-job-resume>' + esc(L('Run the unfinished pieces again', '終わっていない分だけもう一度実行')) + '</button></div>' : '';
  const canApply = f.tasks.some((t) => t.application === 'failed');
  const apply = canApply ? '<button type="button" data-atl-job-apply>' + esc(L('Apply the remaining changes', '残りの変更を適用')) + '</button>' : '';
  const controls = resume + apply + (f.running
    ? '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;"><button type="button" data-atl-job-cancel>' + esc(L('Stop', '止める')) + '</button>'
      + '<input type="text" data-atl-job-note maxlength="1000" placeholder="' + esc(L('Change the instructions while it runs', '実行中に指示を追加')) + '" style="flex:1;min-width:140px;">'
      + '<button type="button" data-atl-job-send>' + esc(L('Send', '送信')) + '</button></div>'
    : '');
  const fin = !f.running && f.result ? '<div style="margin-top:6px;"><b>' + esc(L('Combined', '統合した結果')) + '</b><div>' + esc(f.result.slice(0, 2500)) + '</div></div>' : '';
  return '<div style="font-weight:600;">' + esc(f.title || L('Background job', 'バックグラウンドの仕事')) + ' — ' + esc(word(f.status === 'queued' ? 'queued' : f.status)) + '</div>'
    + '<div style="opacity:.7;">' + esc(f.tasksError ? L('Task details could not be loaded.', 'タスク明細を取得できませんでした。') : L(f.tasksEnded + ' of ' + f.tasksTotal + ' pieces ended', f.tasksTotal + ' 件中 ' + f.tasksEnded + ' 件が終了')) + ' · $' + f.spentUsd.toFixed(3) + ' / $' + f.capUsd.toFixed(2)
    + (f.unknownCostCalls ? ' · ' + esc(L(f.unknownCostCalls + ' request(s) with unknown cost', '費用未確認 ' + f.unknownCostCalls + ' 件')) : '')
    + (f.unreconciledUsd ? ' · ' + esc(L('Unreconciled allowance $', '精算未確認の予算枠 $') + f.unreconciledUsd.toFixed(3)) : '')
    + (f.amends ? ' · ' + esc(L(f.amends + ' change(s)', '指示変更 ' + f.amends + ' 回')) : '') + '</div>'
    + '<div style="height:4px;background:rgba(127,127,127,.25);border-radius:2px;margin:4px 0;"><div style="height:4px;width:' + pct + '%;background:currentColor;border-radius:2px;"></div></div>'
    + '<ul style="margin:2px 0 0 16px;padding:0;">' + rows + '</ul>' + fin + controls
    + (f.error ? '<div style="opacity:.7;">' + esc(f.error) + '</div>' : '');
}

/* the wrapper a result card carries; the contents are filled (and refreshed) by mountJobCards */
export function jobCardShell(id, f, h) {
  return '<div class="atl-job" data-atl-job="' + h.esc(id) + '" style="font-size:12px;line-height:1.5;">' + (f ? renderJobCard(f, h) : '') + '</div>';
}

/* poll cadence: observation 2026-11-20 — a task takes 30–90 s, so a 5 s poll shows each piece within a few seconds of its end
   without a request per second; it stops with the job. Expires if jobs move to Realtime — then subscribe instead of polling. */
const POLL_MS = 5000;
const cardMounts = new WeakMap();

/* mountJobCards(getClient, h, { root?, pollMs? }) → { stop() } — idempotent per page; `getClient()` may return null (not signed in) */
export function mountJobCards(getClient, h, o) {
  const root = (o && o.root) || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof MutationObserver === 'undefined') return { stop() {} };
  if (cardMounts.has(root)) {
    const mount = cardMounts.get(root);
    mount.update(getClient, h);
    return mount;
  }
  const pollMs = (o && o.pollMs) || POLL_MS;
  const live = new WeakSet(), groups = new Map(), ended = new Set();
  let stopped = false;
  const paint = (el, f) => {
    if (!f) { el.textContent = h.L('This job is no longer available.', 'この仕事はもう存在しません。'); return; }
    const typed = el.querySelector('[data-atl-job-note]'), keep = typed ? typed.value : '', focused = !!typed && typeof document !== 'undefined' && document.activeElement === typed;
    el.innerHTML = renderJobCard(f, h);
    const again = el.querySelector('[data-atl-job-note]');   /* a repaint must not eat what the reader is typing */
    if (again && keep) { again.value = keep; if (focused) { try { again.focus(); } catch (_) { /* nothing to focus */ } } }
  };
  async function tick(id, group) {
    if (stopped || group.pending) return group.pending;
    clearTimeout(group.timer);
    group.pending = (async () => {
      group.cards.forEach((el) => { if (!el.isConnected) group.cards.delete(el); });
      if (!group.cards.size) { groups.delete(id); return false; }
      const client = getClient();
      if (!client) return false;
      let f;
      try { f = await client.get(id); } catch (_) { return true; }
      if (stopped) return false;
      if (f) {
        const memory = h.memory || deviceParkedMemory();
        if (group.retry) {
          group.retry = false;
          for (const task of f.tasks) {
            const key = parkedKey(f, task);
            const attempt = task.parked && memory.attempts?.get(key);
            if (attempt && !(await attempt)?.ok) {
              memory.attempts.delete(key);
              memory.failures?.delete(key);
            }
          }
        }
        f = deviceJobFacts(f, memory, await applyParked(f, h.apply, memory));
      }
      group.cards.forEach((el) => { if (el.isConnected) paint(el, f); });
      if (!f) return false;
      await onEnd(f);
      return f.running || !!f.tasksError;
    })();
    try {
      if (await group.pending && !stopped) group.timer = setTimeout(() => tick(id, group), pollMs);
    } finally { group.pending = null; }
  }
  async function onEnd(f) {
    const stamp = f.id + ':' + (f.endedAt || '');
    if (!f.running && !f.tasksError && !f.applicationsPending && typeof h.onEnded === 'function' && !ended.has(stamp)) {
      ended.add(stamp);
      try { await h.onEnded(f); } catch (_) { ended.delete(stamp); }
    }
  }
  const wire = (el) => {
    el.addEventListener('click', async (ev) => {
      const t = ev.target && ev.target.closest ? ev.target.closest('[data-atl-job-cancel],[data-atl-job-send],[data-atl-job-resume],[data-atl-job-apply]') : null;
      if (!t || stopped) return;
      const c = getClient(); if (!c) return;
      const id = el.getAttribute('data-atl-job');
      const group = groups.get(id);
      t.disabled = true;
      try {
        if (t.hasAttribute('data-atl-job-cancel')) await c.cancel(id);
        else if (t.hasAttribute('data-atl-job-resume')) await c.resume(id);
        else if (t.hasAttribute('data-atl-job-apply') && group) group.retry = true;
        else { const inp = el.querySelector('[data-atl-job-note]'); const note = inp ? String(inp.value || '').trim() : ''; if (note) { await c.amend(id, note); if (inp) inp.value = ''; } }
      } finally { t.disabled = false; }
      if (group?.pending) await group.pending.catch(() => {});
      if (group) await tick(id, group);
    });
  };
  const start = (el) => {
    if (live.has(el) && groups.get(el.getAttribute('data-atl-job'))?.cards.has(el)) return;
    if (!live.has(el)) { live.add(el); wire(el); }
    const id = el.getAttribute('data-atl-job');
    if (!groups.has(id)) groups.set(id, { cards: new Set(), pending: null, timer: null });
    const group = groups.get(id);
    group.cards.add(el);
    void tick(id, group);
  };
  const scan = () => {
    for (const [id, group] of groups) {
      group.cards.forEach((el) => { if (!el.isConnected) group.cards.delete(el); });
      if (!group.cards.size && !group.pending) { clearTimeout(group.timer); groups.delete(id); }
    }
    root.querySelectorAll('[data-atl-job]').forEach(start);
  };
  const mo = new MutationObserver(scan);
  mo.observe(root.body || root, { childList: true, subtree: true });
  const mount = {
    update(client, handlers) { getClient = client; h = handlers; scan(); },
    stop() { stopped = true; mo.disconnect(); groups.forEach((g) => clearTimeout(g.timer)); groups.clear(); cardMounts.delete(root); },
  };
  cardMounts.set(root, mount);
  scan();
  return mount;
}

/* ── the page's own wiring: the signed-in Supabase client (window.sb) and its token, the same door ai-proxy is called through (js/ai-core.js aiAuthHeaders) ── */
async function pageAuthHeaders(w) {
  const headers = { 'Content-Type': 'application/json' };
  let token = '';
  try { const r = await w.sb.auth.getSession(); token = (r && r.data && r.data.session && r.data.session.access_token) || ''; } catch (_) { /* signed out */ }
  if (w.SUPABASE_ANON_KEY) { headers.apikey = w.SUPABASE_ANON_KEY; if (!token) headers.Authorization = 'Bearer ' + w.SUPABASE_ANON_KEY; }
  if (token) headers.Authorization = 'Bearer ' + token;
  return { headers, signedIn: !!token };
}
const pageClients = new WeakMap();
export function pageJobsClient(w) {
  const win = w || (typeof window !== 'undefined' ? window : null);
  if (!win || !win.sb || !win.SUPABASE_URL) return null;
  const endpoint = String(win.SUPABASE_URL).replace(/\/$/, '') + '/functions/v1/atlas-jobs';
  const old = pageClients.get(win);
  if (old?.sb === win.sb && old.endpoint === endpoint) return old.client;
  const client = makeJobsClient({ sb: win.sb, endpoint, authHeaders: async () => (await pageAuthHeaders(win)).headers });
  pageClients.set(win, { sb: win.sb, endpoint, client });
  return client;
}

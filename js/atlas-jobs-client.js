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
import { s, stable, jobGeometryTypes, readJobArtifactFeatures } from './atlas-job-core.js';

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
  return {
    /* start({ tasks, title?, idem, images? }) → (images: { name: [data URL, …] } — what the tasks' `images` names resolved to on the page; the server keeps them with the job) → { ok, jobId?, created?, status?, code?, status_http? } — the server states every refusal by name */
    async start(a) {
      if (!fetchFn || !endpoint) return { ok: false, code: 'not_configured' };
      const headers = typeof authHeaders === 'function' ? await authHeaders() : { 'Content-Type': 'application/json' };
      let r;
      try { r = await fetchFn(endpoint, { method: 'POST', headers, body: JSON.stringify({ op: 'create', idem: a.idem, title: a.title || '', tasks: a.tasks, ...(a.images && typeof a.images === 'object' ? { images: a.images } : null) }) }); }
      catch (e) { return { ok: false, code: 'unreachable' }; }
      let j = null; try { j = await r.json(); } catch (_) { j = null; }
      if (!r.ok || !j || !j.jobId) return { ok: false, code: (j && (j.code || j.error)) || ('http_' + r.status), at: j && j.at, httpStatus: r.status, available: j && Array.isArray(j.available) ? j.available : undefined };
      return { ok: true, jobId: j.jobId, created: j.created === true, status: j.status };
    },
    async list(limit) {
      const { data, error } = await need().from('atlas_jobs').select('id,title,status,stop_reason,tasks_total,tasks_done,spent_micros,cost_cap_micros,amend_count,created_at,ended_at').order('created_at', { ascending: false }).limit(Math.min(Math.max(Number(limit) || 10, 1), 30));
      if (error) throw new Error('jobs_read:' + s(error.message, 120));
      return data || [];
    },
    async get(id) {
      const db = need();
      const [j, t] = await Promise.all([
        db.from('atlas_jobs').select('*').eq('id', id).maybeSingle(),
        db.from('atlas_job_tasks').select('task_id,status,code,deps,contract,result,cost_micros,calls,started_at,ended_at').eq('job_id', id).order('task_id'),
      ]);
      if (j.error) throw new Error('job_read:' + s(j.error.message, 120));
      if (!j.data) return null;
      return jobFacts(j.data, (t && t.data) || []);
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
    async output(jobId, taskId) {
      const db = need();
      const t = await db.from('atlas_job_tasks').select('task_id,result').eq('job_id', jobId).eq('task_id', taskId).maybeSingle();
      if (t.error || !t.data) return { ok: false, code: 'not_found' };
      const r = t.data.result || {};
      const d = r.data || {};
      const o = d.output || null;
      if (!o) return { ok: false, code: 'no_output' };
      const sources = Array.isArray(r.outputSources) ? r.outputSources : (Array.isArray(r.sources) ? r.sources : []);
      if (o.stored !== 'artifact') return d.result && Array.isArray(d.result.features) ? { ok: true, features: d.result.features, output: o, sources } : { ok: false, code: 'no_output' };
      const got = await readJobArtifactFeatures(db, 'atlas_job_artifacts', jobId, taskId, o);
      return got.ok ? { ...got, output: o, sources } : got;
    },
  };
}

/* jobFacts(jobRow, taskRows) → the job as plain data. A task that has ended carries its result NOW — a job that is still
   running shows the pieces that finished (the reader does not wait for the last one to see the first). */
export function jobFacts(job, tasks) {
  const list = (tasks || []).map((t) => {
    const r = t.result || {};
    const c = t.contract || {};
    return {
      id: t.task_id, kind: c.kind || 'worker', title: s(c.capability ? (c.capability + (c.args && Object.keys(c.args).length ? ' ' + stable(c.args) : '')) : c.goal, 160),
      state: t.status, code: t.code || '', ended: TASK_ENDED.has(t.status),
      deps: Array.isArray(t.deps) ? t.deps.map((d) => String(d)) : [], endedAt: t.ended_at || null,
      summary: s(r.summary, 1500),
      /* (gis-dataset-slots) THE FINDINGS THEMSELVES, not their count. A worker's figures (the claim, the source, the words or raw values it rests on) were reduced
         to a number here, so Atlas, reading the ended job, said the result held no figures and recomputed them on the page (production 2026-11-28). */
      findings: Array.isArray(r.findings) ? r.findings.filter((x) => x && x.claim).map((x) => ({ claim: s(x.claim, 800), source: s(x.source, 400), excerpt: s(x.excerpt, 800) })) : [],
      gaps: Array.isArray(r.gaps) ? r.gaps.map((g) => s(g, 300)) : [],
      sources: Array.isArray(r.sources) ? r.sources.slice(0, 8).map((x) => ({ url: s(x && x.url, 400), title: s(x && x.title, 160) })) : [],
      costUsd: micros(t.cost_micros),
      /* (server-capability-lane) a map-changing capability the job SAVED for the page — applyParked runs it when the reader is back */
      parked: r.parked && typeof r.parked.capability === 'string' ? { capability: s(r.parked.capability, 80), args: (r.parked.args && typeof r.parked.args === 'object') ? r.parked.args : {} } : null,
      /* (gis-result-handoff) what the piece MADE (its output's id, version, count, columns, sources, where it is kept) and which outputs it READ —
         the structured result, not only its summary; the features themselves are read with client.output when they are wanted */
      output: outputOf(r),
      reads: Array.isArray(r.reads) ? r.reads.slice(0, 20).map((x) => ({ id: s(x && x.id, 120), version: s(x && x.version, 40), count: Number(x && x.count) || 0, ok: !!(x && x.ok) })) : [],
      requestVersion: Number(r.requestVersion) || 0, conditionsVersion: r.conditionsVersion == null ? Number(r.requestVersion) || 0 : Number(r.conditionsVersion) || 0,
    };
  });
  const jr = job.result && typeof job.result === 'object' ? job.result : {};
  const staleIds = new Set((Array.isArray(jr.stale) ? jr.stale : []).map((x) => x && x.id));
  list.forEach((t) => { t.stale = staleIds.has(t.id); });
  const ended = list.filter((t) => t.ended).length;
  return {
    id: job.id, title: s(job.title, 200), status: job.status, stopReason: job.stop_reason || '', running: !TERMINAL.has(job.status),
    tasksTotal: Number(job.tasks_total) || list.length, tasksEnded: ended, tasksDone: Number(job.tasks_done) || list.filter((t) => t.state === 'done' || t.state === 'partial').length,
    amends: Number(job.amend_count) || 0, spentUsd: micros(job.spent_micros), capUsd: micros(job.cost_cap_micros),
    createdAt: job.created_at, endedAt: job.ended_at || null, error: s(job.error, 300),
    result: job.result && typeof job.result.summary === 'string' ? s(job.result.summary, 6000) : '',
    incomplete: Array.isArray(jr.incomplete) ? jr.incomplete.slice(0, 20).map((x) => ({ id: s(x && x.id, 64), state: s(x && x.state, 20), code: s(x && x.code, 60) })) : [],
    requestVersion: Number(jr.requestVersion) || 0,
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
  if (!f || typeof apply !== 'function') return out;
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
  const notApplied = new Set();   // a task whose operation did not take effect holds back the ones that start from it
  for (const t of ordered) {
    if (!t.parked || t.state !== 'done') continue;
    /* A kept result may be valid under later conditions, but is still the same execution.
       Version zero retains the key written by earlier clients. */
    const version = t.requestVersion ?? t.conditionsVersion ?? 0;
    const key = String(f.id) + '/' + t.id + (version > 0 ? '@' + version : '');
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
    if (ok) { if (memory) memory.add(key); } else notApplied.add(t.id);
    out.push({ task: t.id, capability: t.parked.capability, ok, applied: ok, why: ok ? '' : s(r && r.why, 160) });
  }
  return out;
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
  const head = 'Job ' + f.id + (f.title ? ' "' + f.title + '"' : '') + ': ' + f.status + (f.stopReason ? ' (' + f.stopReason + ')' : '') + ' — ' + f.tasksEnded + ' of ' + f.tasksTotal + ' pieces ended, $' + f.spentUsd.toFixed(3) + ' of $' + f.capUsd.toFixed(2) + (f.amends ? ', ' + f.amends + ' instruction change(s)' : '') + '.';
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
  return [head].concat(outputs, rows, inc, f.result ? ['', 'Combined: ' + f.result.slice(0, 2000)] : []).join('\n');
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
  const word = (st) => ({ queued: L('waiting', '待機中'), running: L('running', '実行中'), done: L('done', '完了'), partial: L('partly', '一部'), failed: L('failed', '失敗'), refused: L('refused', '拒否'), cancelled: L('cancelled', '取消') })[st] || st;
  const pct = f.tasksTotal ? Math.round((f.tasksEnded / f.tasksTotal) * 100) : 0;
  const rows = f.tasks.map((t) => {
    const src = t.sources.filter((x) => URL_OK.test(x.url)).map((x) => { const u = safeUrl(x.url); return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(x.title || x.url) + '</a>' : esc(x.title || x.url); }).join(' · ');
    return '<li style="margin:4px 0;"><b>' + esc(t.title || t.id) + '</b> — ' + esc(word(t.state)) + (t.code ? ' (' + esc(t.code) + ')' : '')
      + (t.summary ? '<div style="opacity:.85;">' + esc(t.summary.slice(0, 700)) + '</div>' : '')
      + (t.gaps.length ? '<div style="opacity:.6;">' + esc(L('Not established: ', '不明だった点: ') + t.gaps.join('; ').slice(0, 300)) + '</div>' : '')
      + (src ? '<div style="opacity:.7;">' + src + '</div>' : '') + '</li>';
  }).join('');
  const unfinished = !f.running && f.tasks.some((t) => t.state === 'failed' || t.state === 'refused' || t.state === 'cancelled');
  const resume = unfinished ? '<div style="margin-top:6px;"><button type="button" data-atl-job-resume>' + esc(L('Run the unfinished pieces again', '終わっていない分だけもう一度実行')) + '</button></div>' : '';
  const controls = resume + (f.running
    ? '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;"><button type="button" data-atl-job-cancel>' + esc(L('Stop', '止める')) + '</button>'
      + '<input type="text" data-atl-job-note maxlength="1000" placeholder="' + esc(L('Change the instructions while it runs', '実行中に指示を追加')) + '" style="flex:1;min-width:140px;">'
      + '<button type="button" data-atl-job-send>' + esc(L('Send', '送信')) + '</button></div>'
    : '');
  const fin = !f.running && f.result ? '<div style="margin-top:6px;"><b>' + esc(L('Combined', '統合した結果')) + '</b><div>' + esc(f.result.slice(0, 2500)) + '</div></div>' : '';
  return '<div style="font-weight:600;">' + esc(f.title || L('Background job', 'バックグラウンドの仕事')) + ' — ' + esc(word(f.status === 'queued' ? 'queued' : f.status)) + '</div>'
    + '<div style="opacity:.7;">' + esc(L(f.tasksEnded + ' of ' + f.tasksTotal + ' pieces ended', f.tasksTotal + ' 件中 ' + f.tasksEnded + ' 件が終了')) + ' · $' + f.spentUsd.toFixed(3) + ' / $' + f.capUsd.toFixed(2)
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
const ENDED_TOLD = new Set();   /* a job that ended is reported to its host once per page, however many cards poll it */

/* mountJobCards(getClient, h, { root?, pollMs? }) → { stop() } — idempotent per page; `getClient()` may return null (not signed in) */
export function mountJobCards(getClient, h, o) {
  const root = (o && o.root) || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof MutationObserver === 'undefined') return { stop() {} };
  const pollMs = (o && o.pollMs) || POLL_MS;
  const live = new WeakSet();
  const paint = async (el) => {
    const id = el.getAttribute('data-atl-job');
    const c = getClient();
    if (!c) return false;
    let f = null;
    try { f = await c.get(id); } catch (_) { return true; }   /* a failed read is not a finished job: try again next time */
    if (f && typeof h.apply === 'function') { try { f.appliedNow = await applyParked(f, h.apply, h.memory || deviceParkedMemory()); } catch (_) { /* the card still paints */ } }
    if (!f) { el.textContent = h.L('This job is no longer available.', 'この仕事はもう存在しません。'); return false; }
    const typed = el.querySelector('[data-atl-job-note]'), keep = typed ? typed.value : '', focused = !!typed && typeof document !== 'undefined' && document.activeElement === typed;
    if (f && !f.running && typeof h.onEnded === 'function' && !ENDED_TOLD.has(f.id + ':' + (f.endedAt || ''))) { ENDED_TOLD.add(f.id + ':' + (f.endedAt || '')); try { await h.onEnded(f); } catch (_) { /* the card still paints */ } }
    el.innerHTML = renderJobCard(f, h);
    const again = el.querySelector('[data-atl-job-note]');   /* a repaint must not eat what the reader is typing */
    if (again && keep) { again.value = keep; if (focused) { try { again.focus(); } catch (_) { /* nothing to focus */ } } }
    return f.running;
  };
  const wire = (el) => {
    el.addEventListener('click', async (ev) => {
      const t = ev.target && ev.target.closest ? ev.target.closest('[data-atl-job-cancel],[data-atl-job-send],[data-atl-job-resume]') : null;
      if (!t) return;
      const c = getClient(); if (!c) return;
      const id = el.getAttribute('data-atl-job');
      t.disabled = true;
      try {
        if (t.hasAttribute('data-atl-job-cancel')) await c.cancel(id);
        else if (t.hasAttribute('data-atl-job-resume')) await c.resume(id);
        else { const inp = el.querySelector('[data-atl-job-note]'); const note = inp ? String(inp.value || '').trim() : ''; if (note) { await c.amend(id, note); if (inp) inp.value = ''; } }
      } finally { t.disabled = false; }
      await paint(el);
    });
  };
  const start = (el) => {
    if (live.has(el)) return; live.add(el); wire(el);
    const tick = async () => { if (!el.isConnected) return; const more = await paint(el); if (more && el.isConnected) setTimeout(tick, pollMs); };
    tick();
  };
  const scan = () => { root.querySelectorAll('[data-atl-job]').forEach(start); };
  const mo = new MutationObserver(scan);
  mo.observe(root.body || root, { childList: true, subtree: true });
  scan();
  return { stop() { mo.disconnect(); } };
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
export function pageJobsClient(w) {
  const win = w || (typeof window !== 'undefined' ? window : null);
  if (!win || !win.sb || !win.SUPABASE_URL) return null;
  return makeJobsClient({ sb: win.sb, endpoint: String(win.SUPABASE_URL).replace(/\/$/, '') + '/functions/v1/atlas-jobs', authHeaders: async () => (await pageAuthHeaders(win)).headers });
}

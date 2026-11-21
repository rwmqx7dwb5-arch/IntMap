/* ============================================================================
 *  IntMap · Atlas durable jobs — the page's side of them   (js/atlas-jobs-client.js)
 * ----------------------------------------------------------------------------
 *  The server half is supabase/functions/atlas-jobs (create + the lease loop) and the tables of
 *  supabase/migrations/20261120140000_atlas_durable_jobs.sql. This file is everything the PAGE does with them:
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

import { s, stable } from './atlas-job-core.js';
import './safe-html.js';   /* publishes globalThis.IntMapSafe — the one encoder renderJobCard writes through, in Node as in the app */

const TERMINAL = new Set(['done', 'failed', 'cancelled']);
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
    /* start({ tasks, title?, idem }) → { ok, jobId?, created?, status?, code?, status_http? } — the server states every refusal by name */
    async start(a) {
      if (!fetchFn || !endpoint) return { ok: false, code: 'not_configured' };
      const headers = typeof authHeaders === 'function' ? await authHeaders() : { 'Content-Type': 'application/json' };
      let r;
      try { r = await fetchFn(endpoint, { method: 'POST', headers, body: JSON.stringify({ op: 'create', idem: a.idem, title: a.title || '', tasks: a.tasks }) }); }
      catch (e) { return { ok: false, code: 'unreachable' }; }
      let j = null; try { j = await r.json(); } catch (_) { j = null; }
      if (!r.ok || !j || !j.jobId) return { ok: false, code: (j && (j.code || j.error)) || ('http_' + r.status), at: j && j.at, httpStatus: r.status };
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
    async amend(id, note) { const r = await need().rpc('atlas_job_amend', { p_job: id, p_note: s(note, 1000) }); if (r.error) return { ok: false, code: s(r.error.message, 80) }; return { ok: true, state: r.data }; },
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
      summary: s(r.summary, 1500), findings: Array.isArray(r.findings) ? r.findings.length : 0, gaps: Array.isArray(r.gaps) ? r.gaps.map((g) => s(g, 300)) : [],
      sources: Array.isArray(r.sources) ? r.sources.slice(0, 8).map((x) => ({ url: s(x && x.url, 400), title: s(x && x.title, 160) })) : [],
      costUsd: micros(t.cost_micros),
    };
  });
  const ended = list.filter((t) => t.ended).length;
  return {
    id: job.id, title: s(job.title, 200), status: job.status, stopReason: job.stop_reason || '', running: !TERMINAL.has(job.status),
    tasksTotal: Number(job.tasks_total) || list.length, tasksEnded: ended, tasksDone: Number(job.tasks_done) || list.filter((t) => t.state === 'done' || t.state === 'partial').length,
    amends: Number(job.amend_count) || 0, spentUsd: micros(job.spent_micros), capUsd: micros(job.cost_cap_micros),
    createdAt: job.created_at, endedAt: job.ended_at || null, error: s(job.error, 300),
    result: job.result && typeof job.result.summary === 'string' ? s(job.result.summary, 6000) : '',
    tasks: list,
  };
}

/* jobText(facts) — plain text, the facts first (Atlas reads the top of a card's text) */
export function jobText(f) {
  const head = 'Job ' + f.id + (f.title ? ' "' + f.title + '"' : '') + ': ' + f.status + (f.stopReason ? ' (' + f.stopReason + ')' : '') + ' — ' + f.tasksEnded + ' of ' + f.tasksTotal + ' pieces ended, $' + f.spentUsd.toFixed(3) + ' of $' + f.capUsd.toFixed(2) + (f.amends ? ', ' + f.amends + ' instruction change(s)' : '') + '.';
  const rows = f.tasks.map((t) => '- ' + t.id + ' [' + t.state + (t.code ? ' / ' + t.code : '') + ']' + (t.summary ? ': ' + t.summary.slice(0, 600) : (t.ended ? '' : ' (not finished)')) + (t.gaps.length ? ' | not established: ' + t.gaps.join('; ').slice(0, 300) : ''));
  return [head].concat(rows, f.result ? ['', 'Combined: ' + f.result.slice(0, 2000)] : []).join('\n');
}

const URL_OK = /^https?:\/\//i;
/* a URL that starts an href goes through window.IntMapSafe.url (js/safe.js); with it absent (a node test) nothing becomes a link */
const safeUrl = (u) => { try { return (typeof window !== 'undefined' && window.IntMapSafe && window.IntMapSafe.url) ? String(window.IntMapSafe.url(u) || '') : ''; } catch (_) { return ''; } };

/* renderJobCard(facts, { L, esc }) → HTML (the inside of a card; mountJobCards wraps it) */
export function renderJobCard(f, h) {
  const L = h.L, esc = (s) => globalThis.IntMapSafe.html(s);   /* the one encoder (js/safe-html.js), not the caller's: a card is HTML built here */
  const word = (st) => ({ queued: L('waiting', '待機中'), running: L('running', '実行中'), done: L('done', '完了'), partial: L('partly', '一部'), failed: L('failed', '失敗'), refused: L('refused', '拒否'), cancelled: L('cancelled', '取消') })[st] || st;
  const pct = f.tasksTotal ? Math.round((f.tasksEnded / f.tasksTotal) * 100) : 0;
  const rows = f.tasks.map((t) => {
    const src = t.sources.filter((x) => URL_OK.test(x.url)).map((x) => { const u = safeUrl(x.url); return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(x.title || x.url) + '</a>' : esc(x.title || x.url); }).join(' · ');
    return '<li style="margin:4px 0;"><b>' + esc(t.title || t.id) + '</b> — ' + esc(word(t.state)) + (t.code ? ' (' + esc(t.code) + ')' : '')
      + (t.summary ? '<div style="opacity:.85;">' + esc(t.summary.slice(0, 700)) + '</div>' : '')
      + (t.gaps.length ? '<div style="opacity:.6;">' + esc(L('Not established: ', '不明だった点: ') + t.gaps.join('; ').slice(0, 300)) + '</div>' : '')
      + (src ? '<div style="opacity:.7;">' + src + '</div>' : '') + '</li>';
  }).join('');
  const controls = f.running
    ? '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;"><button type="button" data-atl-job-cancel>' + esc(L('Stop', '止める')) + '</button>'
      + '<input type="text" data-atl-job-note maxlength="1000" placeholder="' + esc(L('Change the instructions while it runs', '実行中に指示を追加')) + '" style="flex:1;min-width:140px;">'
      + '<button type="button" data-atl-job-send>' + esc(L('Send the note', 'メモを送る')) + '</button></div>'
    : '';
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
    if (!f) { el.textContent = h.L('This job is no longer available.', 'この仕事はもう存在しません。'); return false; }
    const typed = el.querySelector('[data-atl-job-note]'), keep = typed ? typed.value : '', focused = !!typed && typeof document !== 'undefined' && document.activeElement === typed;
    el.innerHTML = window.IntMapSafe.trusted(renderJobCard(f, h));   /* the card is built only from esc()'d values and numbers (renderJobCard) — judged there */
    const again = el.querySelector('[data-atl-job-note]');   /* a repaint must not eat what the reader is typing */
    if (again && keep) { again.value = keep; if (focused) { try { again.focus(); } catch (_) { /* nothing to focus */ } } }
    return f.running;
  };
  const wire = (el) => {
    el.addEventListener('click', async (ev) => {
      const t = ev.target && ev.target.closest ? ev.target.closest('[data-atl-job-cancel],[data-atl-job-send]') : null;
      if (!t) return;
      const c = getClient(); if (!c) return;
      const id = el.getAttribute('data-atl-job');
      t.disabled = true;
      try {
        if (t.hasAttribute('data-atl-job-cancel')) await c.cancel(id);
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

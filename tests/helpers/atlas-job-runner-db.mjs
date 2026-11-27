/* a fake of the job tables and RPCs, keeping the rules the runner depends on (supabase/migrations/…atlas_durable_jobs.sql, …atlas_job_handoff.sql) */
export function fakeDb(plan, o = {}) {
  const st = {
    job: { id: '11111111-2222-4333-8444-555555555555', user_id: 'u1', status: 'running', lease_holder: 'h1', cancel_requested: false, amends: o.amends || [], finished: null, title: 'handoff' },
    tasks: new Map(plan.map((t) => [t.id, { task_id: t.id, status: 'queued', code: '', deps: t.deps, contract: t.contract, result: null, key: t.key, progress: null, cost_micros: 0 }])),
    artifacts: [], events: [],
  };
  const j = st.job;
  const mine = (h) => j.lease_holder === h && j.status === 'running';
  const rpcs = {
    atlas_job_checkpoint: (a) => (!mine(a.p_holder) ? [{ ok: false, action: 'lost', amends: [] }] : [{ ok: true, action: 'go', amends: j.amends.slice() }]),
    atlas_job_reserve: (a) => mine(a.p_holder),
    atlas_job_settle: () => true,
    atlas_job_task_start: (a) => { const t = st.tasks.get(a.p_task); if (!mine(a.p_holder) || !t || t.status !== 'queued') return false; t.status = 'running'; return true; },
    atlas_job_task_progress: (a) => { const t = st.tasks.get(a.p_task); if (!mine(a.p_holder) || !t || t.status !== 'running') return false; t.progress = JSON.parse(JSON.stringify(a.p_progress)); if (a.p_yield) t.status = 'queued'; return true; },
    atlas_job_task_finish: (a) => { const t = st.tasks.get(a.p_task); if (!mine(a.p_holder) || !t || t.status !== 'running') return false; t.status = a.p_status; t.code = a.p_code; t.result = JSON.parse(JSON.stringify(a.p_result)); return true; },
    atlas_job_task_block: (a) => { const t = st.tasks.get(a.p_task); if (!t || t.status !== 'queued') return false; t.status = 'failed'; t.code = a.p_code; return true; },
    atlas_job_artifact_put: (a) => { const t = st.tasks.get(a.p_task); if (!mine(a.p_holder) || !t || t.status !== 'running' || !(a.p_part >= 0)) return false; st.artifacts = st.artifacts.filter((x) => !(x.task_id === a.p_task && x.part === a.p_part)); st.artifacts.push({ job_id: j.id, task_id: a.p_task, part: a.p_part, body: JSON.parse(JSON.stringify(a.p_body)) }); return true; },
    atlas_job_finish: (a) => { if (!mine(a.p_holder)) return false; j.status = a.p_status; j.stop_reason = a.p_stop_reason; j.result = a.p_result; j.finished = { status: a.p_status, reason: a.p_stop_reason, result: a.p_result }; j.lease_holder = null; j.ended_at = 'now'; return true; },
    atlas_job_release: (a) => { if (!mine(a.p_holder)) return false; j.lease_holder = null; return true; },
  };
  /* a tiny query builder: select().eq()…order()/maybeSingle(), awaited at any point */
  const query = (table) => {
    const where = [];
    let ord = null;
    const rows = () => {
      let list = table === 'atlas_job_tasks' ? Array.from(st.tasks.values()) : table === 'atlas_job_artifacts' ? st.artifacts : table === 'atlas_jobs' ? [j] : [];
      list = list.filter((r) => where.every(([k, v]) => (k === 'job_id' && table === 'atlas_job_tasks') ? v === j.id : (k === 'id' ? r.id === v : r[k] === v)));
      if (ord) list = list.slice().sort((a, b) => a[ord] - b[ord]);
      return JSON.parse(JSON.stringify(list));
    };
    const b = {
      select: () => b, eq: (k, v) => { where.push([k, v]); return b; }, order: (k) => { ord = k; return b; },
      maybeSingle: async () => ({ data: rows()[0] || null, error: null }),
      then: (res, rej) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
      insert: async (row) => { st.events.push(row); return { error: null }; },
    };
    return b;
  };
  return { st, rpc: async (name, args) => ({ data: rpcs[name](args), error: null }), from: query };
}

// ============================================================================
//  IntMap · _shared/atlas-job-runner.js — runs one durable job's tasks, a lease at a time  (atlas-durable-jobs)
// ----------------------------------------------------------------------------
//  The loop of supabase/functions/atlas-jobs, with every outside thing PASSED IN so a node test runs it against a fake:
//    db         { rpc(name, args) → { data, error }, from(table).select().eq() }   (a service-role supabase-js client)
//    callModel  (system, prompt, { web, signal }) → { text, usage, citations, model }   throws { code, status, timeout }
//    money      { estimate(promptChars, web) → micros, actual(usage, model) → micros }   (_shared/ai-provider.js prices)
//    now        () → ms
//
//  WHAT IT GUARANTEES (the tests hold each one):
//    · nothing runs without the lease: every write is an RPC that checks lease_holder, and a runner that lost the lease
//      (`lost`) stops without writing;
//    · before EVERY provider request it checkpoints (cancel / stop switch / what the reader changed) and reserves its
//      estimated cost against the job's cap — a refused reservation ends the task `refused` (cost_cap), no request is sent;
//    · a task finishes at most once (the RPC refuses a second finish), so a requeued task never writes twice;
//    · the reader's amendments reach the NEXT request of every task still to run, as the latest instructions;
//    · one request per attempt, and an attempt is repeated only after an OBSERVED failure (one-pass-or-a-reason §5):
//      a provider 5xx/timeout once, a wrong shape once with the reason named — never because nothing came back.
//  ⚠ NO TYPE ANNOTATIONS — scripts/static-checks.mjs parses committed .js/.ts as plain JavaScript.
// ============================================================================

import { readyTasks, shapeOf, workerSystem, workerPrompt, s } from "./atlas-job-core.js";

/* How many tasks of one job run at the same time. Observation 2026-11-20: research.delegate hands on 2 workers by default
   (DELEGATION_DEFAULTS.maxChildren in ai-proxy config.ts) and a worker request takes 30–90 s (dev-notes/2026-11-19-delegation-limits-stream.md);
   3 lets a default job's independent tasks overlap without a job holding more than three provider requests open.
   Expires if the default number of workers grows. Canonical: here. */
export const TASK_CONCURRENCY = 3;

/* parseJson(text) — the first JSON object in a model's answer, tolerating a code fence; null when there is none */
export function parseJson(text) {
  let t = String(text == null ? "" : text).trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (_) { return null; }
}

const transient = (e) => !!e && (e.code === "provider_unavailable" || e.code === "timeout" || e.timeout === true || (Number(e.status) >= 500 && Number(e.status) < 600));

async function rpc(db, name, args) {
  const r = await db.rpc(name, args);
  if (r && r.error) throw new Error("rpc_" + name + ":" + s(r.error.message, 120));
  return r ? r.data : null;
}
const first = (d) => (Array.isArray(d) ? d[0] : d);

async function event(db, job, kind, data) {
  try { await db.from("atlas_job_events").insert({ job_id: job.id, user_id: job.user_id, kind, data: data || {} }); } catch (_) { /* a record that fails never fails the work */ }
}

/* runTask — one task: start it, ask the model (checkpointed and reserved each time), finish it. → { state, lost? } */
async function runTask(ctx, task, inputs) {
  const { db, job, holder, callModel, money, leaseSeconds } = ctx;
  const started = await rpc(db, "atlas_job_task_start", { p_job: job.id, p_holder: holder, p_task: task.task_id });
  if (started !== true) return { state: "skipped" };
  const contract = task.contract || {};
  const taskView = { id: task.task_id, goal: contract.goal, returns: contract.returns, inputs };
  let calls = 0, cost = 0, web = true, why = "", note = "";
  const sources = [];
  const finish = async (status, code, result) => {
    await rpc(db, "atlas_job_task_finish", { p_job: job.id, p_holder: holder, p_task: task.task_id, p_status: status, p_code: code || "", p_result: result || null, p_cost: cost, p_calls: calls });
    return { state: status };
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const cp = first(await rpc(db, "atlas_job_checkpoint", { p_job: job.id, p_holder: holder, p_lease_seconds: leaseSeconds }));
    if (!cp || cp.ok !== true) return { state: "lost", lost: true };
    if (cp.action !== "go") return finish("cancelled", cp.action, null);
    const amends = Array.isArray(cp.amends) ? cp.amends : [];
    const prompt = workerPrompt(taskView, amends) + note;
    const system = ctx.system;
    const est = money.estimate(system.length + prompt.length, web);
    const reserved = await rpc(db, "atlas_job_reserve", { p_job: job.id, p_holder: holder, p_micros: est });
    if (reserved !== true) return finish("refused", "cost_cap", { summary: "", findings: [], gaps: ["The job's cost cap was reached before this piece could run."], sources });
    calls += 1;
    let env;
    try {
      env = await callModel(system, prompt, { web, signal: ctx.signal });
    } catch (e) {
      await rpc(db, "atlas_job_settle", { p_job: job.id, p_holder: holder, p_reserved: est, p_actual: 0 });
      await event(db, job, "task.request_failed", { task: task.task_id, code: s(e && e.code, 40), attempt });
      if (attempt === 0 && transient(e)) {
        if (e.timeout === true) { web = false; note = "\n\nA PREVIOUS ATTEMPT TIMED OUT. Web search is NOT available this time: answer only from what you reliably know, say plainly what you could not check, and give no source URL you cannot vouch for."; }
        else note = "\n\nA PREVIOUS ATTEMPT FAILED. Be concise: at most 5 findings, each one sentence, and say what you could not establish.";
        continue;
      }
      const refusal = e && (e.code === "provider_quota" || e.code === "spend_ceiling" || e.code === "share_ceiling");
      return finish(refusal ? "refused" : "failed", s(e && e.code, 40) || "error", { summary: s(e && e.message, 400), findings: [], gaps: [], sources });
    }
    const actual = money.actual(env.usage, env.model);
    cost += actual;
    await rpc(db, "atlas_job_settle", { p_job: job.id, p_holder: holder, p_reserved: est, p_actual: actual });
    (Array.isArray(env.citations) ? env.citations : []).forEach((c) => { if (c && c.url && !sources.some((x) => x.url === c.url)) sources.push({ url: s(c.url, 500), title: s(c.title, 200) }); });
    const sh = shapeOf(parseJson(env.text));
    if (sh.ok) return finish(web ? "done" : "partial", web ? "" : "degraded", Object.assign({}, sh.out, { sources, web: !!web }));
    why = sh.why;
    if (attempt === 0) { note = "\n\nYOUR PREVIOUS ANSWER COULD NOT BE USED: " + why + ". Return exactly the JSON object described, with a non-empty \"summary\"."; continue; }
  }
  return finish("failed", "shape", { summary: "", findings: [], gaps: ["The worker did not return the requested shape (" + why + ")."], sources });
}

/* runJob(ctx) — ctx: { db, job, holder, callModel, money, now, budgetMs, leaseSeconds, system, signal? }
   → { outcome: 'finished' | 'more' | 'lost' } — `more`: time ran out with work left; the lease is released for the next tick. */
export async function runJob(ctx) {
  const { db, job, holder, now, budgetMs, leaseSeconds } = ctx;
  const t0 = now();
  for (let guard = 0; guard < 64; guard++) {
    const cp = first(await rpc(db, "atlas_job_checkpoint", { p_job: job.id, p_holder: holder, p_lease_seconds: leaseSeconds }));
    if (!cp || cp.ok !== true) return { outcome: "lost" };
    if (cp.action !== "go") {
      await rpc(db, "atlas_job_finish", { p_job: job.id, p_holder: holder, p_status: "cancelled", p_stop_reason: cp.action === "kill_switch" ? "kill_switch" : "user", p_result: null, p_error: "" });
      return { outcome: "finished" };
    }
    const { data: rows, error } = await db.from("atlas_job_tasks").select("task_id,status,code,deps,contract,result,key").eq("job_id", job.id);
    if (error) throw new Error("tasks_read:" + s(error.message, 120));
    const tasks = (rows || []).map((r) => Object.assign({}, r, { id: r.task_id }));
    const { ready, blocked } = readyTasks(tasks);
    for (const b of blocked) await rpc(db, "atlas_job_task_block", { p_job: job.id, p_holder: holder, p_task: b.task_id, p_code: "input_unavailable" });
    if (blocked.length) continue;   /* re-read: a task that depended on a blocked one is now blocked too */
    const open = tasks.filter((t) => t.status === "queued" || t.status === "running");
    if (!open.length) return conclude(ctx, tasks);
    if (!ready.length) {   /* queued tasks that wait on a task that is still running — only a lapsed lease leaves that, and the claim requeued it */
      await rpc(db, "atlas_job_finish", { p_job: job.id, p_holder: holder, p_status: "failed", p_stop_reason: "stuck", p_result: null, p_error: "no task could start" });
      return { outcome: "finished" };
    }
    if (now() - t0 > budgetMs) { await rpc(db, "atlas_job_release", { p_job: job.id, p_holder: holder }); return { outcome: "more" }; }
    const byId = new Map(tasks.map((t) => [t.task_id, t]));
    const wave = ready.slice(0, TASK_CONCURRENCY);
    const results = await Promise.all(wave.map((t) => {
      const inputs = (t.deps || []).map((d) => { const r = (byId.get(d) || {}).result || {}; return { from: d, summary: r.summary, findings: r.findings, gaps: r.gaps }; });
      return runTask(ctx, t, inputs).catch(() => ({ state: "error" }));
    }));
    if (results.some((r) => r.lost)) return { outcome: "lost" };
    if (results.some((r) => r.state === "error")) {   /* an RPC failed under us: let go, the next claim requeues what was running */
      await rpc(db, "atlas_job_release", { p_job: job.id, p_holder: holder }).catch(() => {});
      return { outcome: "more" };
    }
  }
  await rpc(db, "atlas_job_finish", { p_job: job.id, p_holder: holder, p_status: "failed", p_stop_reason: "guard", p_result: null, p_error: "too many rounds" });
  return { outcome: "finished" };
}

async function conclude(ctx, tasks) {
  const { db, job, holder } = ctx;
  const ok = tasks.filter((t) => t.status === "done" || t.status === "partial");
  const capped = tasks.some((t) => t.status === "refused" && (t.code === "cost_cap" || (t.result && t.result.gaps && String(t.result.gaps[0] || "").indexOf("cost cap") >= 0)));
  const result = {
    summary: ok.map((t) => (t.result && t.result.summary) || "").filter(Boolean).join("\n\n"),
    tasks: tasks.map((t) => ({ id: t.task_id, state: t.status, summary: (t.result && t.result.summary) || "", findings: (t.result && t.result.findings) || [], gaps: (t.result && t.result.gaps) || [], sources: (t.result && t.result.sources) || [] })),
  };
  const everyCancelled = tasks.length > 0 && tasks.every((t) => t.status === "cancelled");
  const status = ok.length ? "done" : (everyCancelled ? "cancelled" : "failed");
  await rpc(db, "atlas_job_finish", { p_job: job.id, p_holder: holder, p_status: status, p_stop_reason: ok.length ? "" : (capped ? "cost_cap" : (everyCancelled ? "user" : "no_task_finished")), p_result: result, p_error: "" });
  return { outcome: "finished" };
}

export { workerSystem };

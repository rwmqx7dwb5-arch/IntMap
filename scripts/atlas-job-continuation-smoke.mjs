/* Read back an authenticated Atlas continuation probe from the real task, artifact and event tables.
   Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, ATLAS_JOBS_PROBE_ACCESS_TOKEN (dedicated reader),
   and ATLAS_JOBS_SECRET in the environment before running this script. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const POINTS = [[12.75, 48.125], [13.25, 48.5], [15.25, 48.75]];
const TERMINAL = new Set(['done', 'partial', 'failed', 'cancelled']);
const coordinates = features => features.map(f => {
  assert.equal(f.geometry?.type, 'Point');
  return f.geometry.coordinates;
});

export function verifyContinuation({ job, tasks, events, artifacts }) {
  assert.equal(job.status, 'done', 'probe must finish');
  assert.equal(Number(job.spent_micros), 0, 'probe spent no model budget');
  assert.deepEqual(job.result?.incomplete, []);
  const byId = new Map(tasks.map(t => [t.task_id, t]));
  assert.deepEqual([...byId.keys()].sort(), ['filter', 'load']);
  for (const t of byId.values()) {
    assert.equal(t.status, 'done', t.task_id);
    assert.equal(Number(t.calls), 0, t.task_id + ' must have made no model requests');
    assert.equal(Number(t.cost_micros), 0, t.task_id + ' must be free of model costs');
  }
  const names = events.map(e => e.data?.task ? e.kind + ':' + e.data.task : e.kind);
  assert.deepEqual(names, [
    'created', 'lease', 'task.started:load', 'task.ended:load',
    'lease', 'task.started:filter', 'task.ended:filter', 'ended',
  ], 'the first task must end before a distinct second lease starts the dependent task');
  const leases = events.filter(e => e.kind === 'lease');
  assert.ok(leases.every(e => typeof e.data?.holder === 'string' && e.data.holder.startsWith('edge:')));
  assert.notEqual(leases[0].data.holder, leases[1].data.holder);

  const saved = byId.get('load').result?.data?.output;
  assert.equal(saved?.id, 'job:' + job.id + '/load');
  assert.equal(saved?.stored, 'artifact');
  assert.ok(saved.parts > 1 && saved.parts === artifacts.length);
  assert.equal(saved.count, POINTS.length);
  assert.ok(saved.version);
  assert.deepEqual(artifacts.map(p => p.part), artifacts.map((_, i) => (saved.first ?? 0) + i));
  assert.ok(artifacts.every(p => p.body?.type === 'FeatureCollection' && (saved.first == null || p.body.version === saved.version)));
  assert.deepEqual(coordinates(artifacts.flatMap(p => p.body.features)), POINTS);

  const filtered = byId.get('filter').result;
  assert.deepEqual(filtered?.reads, [{ id: saved.id, version: saved.version, count: POINTS.length, ok: true }]);
  assert.equal(filtered.data?.output?.count, 2);
  assert.ok(filtered.data?.output?.version);
  assert.notEqual(filtered.data.output.version, saved.version);
  assert.deepEqual(coordinates(filtered.data.result.features), POINTS.slice(0, 2));
  return { jobId: job.id, slices: leases.length, artifactParts: saved.parts, inputVersion: saved.version,
    outputVersion: filtered.data.output.version, count: filtered.data.output.count, spentMicros: Number(job.spent_micros) };
}

export async function runContinuationSmoke(env, fetchFn = fetch) {
  const required = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'ATLAS_JOBS_PROBE_ACCESS_TOKEN', 'ATLAS_JOBS_SECRET'];
  const missing = required.filter(key => !env[key]);
  if (missing.length) throw new Error('Missing environment variables ' + missing.join(', '));
  const url = new URL(env.SUPABASE_URL);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!local && url.protocol !== 'https:') || url.username || url.password) throw new Error('Use a credential-free HTTPS Supabase URL');
  const headers = { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + env.ATLAS_JOBS_PROBE_ACCESS_TOKEN };
  const signal = AbortSignal.timeout(95_000);
  const request = async (route, init) => {
    const response = await fetchFn(new URL(route, url), { ...init, redirect: 'error', signal });
    if (!response.ok) throw new Error('Atlas continuation probe request returned HTTP ' + response.status + ' at ' + route.split('?')[0]);
    return response.json();
  };
  const receipt = await request('/functions/v1/atlas-jobs', {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'x-atlas-jobs-secret': env.ATLAS_JOBS_SECRET },
    body: JSON.stringify({ op: 'create', probe: true, idem: 'continuation-probe:' + randomUUID(), title: 'Atlas continuation probe' }),
  });
  assert.ok(receipt.probe === true && receipt.created === true && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(receipt.jobId), 'missing authorized probe receipt; check the Edge Function deployment');
  const jobId = receipt.jobId;
  const rows = (table, params) => request('/rest/v1/' + table + '?' + new URLSearchParams(params), { headers });
  let job;
  let interval = 200;
  try {
    for (;;) {
      [job] = await rows('atlas_jobs', { id: 'eq.' + jobId, select: 'id,status,spent_micros,result' });
      if (TERMINAL.has(job?.status)) break;
      await delay(interval, undefined, { signal });
      interval = Math.min(interval * 2, 2000);
    }
    const [tasks, events, artifacts] = await Promise.all([
      rows('atlas_job_tasks', { job_id: 'eq.' + jobId, select: 'task_id,status,calls,cost_micros,result' }),
      rows('atlas_job_events', { job_id: 'eq.' + jobId, select: 'kind,data', order: 'id.asc' }),
      rows('atlas_job_artifacts', { job_id: 'eq.' + jobId, task_id: 'eq.load', select: 'part,body', order: 'part.asc' }),
    ]);
    return verifyContinuation({ job, tasks, events, artifacts });
  } catch (error) {
    if (signal.aborted) throw new Error('Atlas continuation probe ' + jobId + ' did not reach a verified terminal state in 95 seconds; last status ' + (job?.status || 'unknown'));
    throw new Error('Atlas continuation probe ' + jobId + ': ' + error.message, { cause: error });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await runContinuationSmoke(process.env)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

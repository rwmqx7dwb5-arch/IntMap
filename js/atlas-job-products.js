/* ============================================================================
 *  IntMap · what a finished background job leaves, as work products   (js/atlas-job-products.js)
 * ----------------------------------------------------------------------------
 *  A durable job (supabase/functions/atlas-jobs) ends on the server; its pieces are rows that are purged after 30 days.
 *  The reader's own record of work is the work store (js/atlas-work-store.js — products of one job: tables, code, charts,
 *  documents, answers, kept on this device and comparable by version). This is the seam between the two:
 *
 *    · the job gets ONE work, with an id derived from the job's id (`wk-job-<uuid>`), so the same job is always the same
 *      work — a second call finds it, it never makes a second;
 *    · each piece that ended with something to say becomes an `answer` product, the combined result a `document` product;
 *    · a product whose content has not changed is NOT filed again; one that has (a resumed job that now finished the piece
 *      it had failed) becomes the NEXT VERSION, and the earlier one stays comparable (work.job compare) — nothing overwritten;
 *    · the working memory is told the job is owed (kind 'job': it survives the turn that started it) and told when it ended.
 *
 *  Pure ES module: the store and the memory are passed in, so tests/exec-platform-checks.test.mjs runs this file.
 * ==========================================================================*/
import { withProduct, currentProducts, normalizeWork, PRODUCT_KINDS } from './atlas-work-store.js';
import { jobGeometryTypes } from './atlas-job-core.js';

/* the work's id for a job — `wk-` + a name no notebook turn can have (normalizeWork: /^wk-[a-z0-9-]{4,64}$/) */
export function jobWorkId(jobId) { return 'wk-job-' + String(jobId || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 52); }

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

/* productsOfJob(facts) → [{ kind, name, content, note }] — what the finished job's facts (js/atlas-jobs-client.js jobFacts) say, as products */
export function productsOfJob(f) {
  const out = [];
  for (const t of (f && f.tasks) || []) {
    if (!(t.state === 'done' || t.state === 'partial') || !t.summary) continue;
    const src = (t.sources || []).filter((x) => x && x.url).map((x) => '- ' + (x.title ? x.title + ' — ' : '') + x.url).join('\n');
    const text = t.summary + (t.gaps && t.gaps.length ? '\n\nNot established:\n' + t.gaps.map((g) => '- ' + g).join('\n') : '') + (src ? '\n\nSources:\n' + src : '')
      + (t.parked ? '\n\nSaved for the map (applied when the page was open): ' + t.parked.capability : '');
    out.push({ kind: 'answer', name: clip(t.id + ' — ' + (t.title || t.kind), 100), content: { text: clip(text, 200000) }, note: 'background job ' + f.id + ' · piece ' + t.id + (t.state === 'partial' ? ' (partly)' : '') });
  }
  if (f && f.result) out.push({ kind: 'document', name: 'Combined result', content: { format: 'markdown', text: clip(f.result, 400000) }, note: 'background job ' + f.id + ' · combined' });
  return out;
}

const same = (a, b) => { try { return JSON.stringify(a) === JSON.stringify(b); } catch (_) { return false; } };

/* (gis-result-handoff) WHAT A PIECE MADE IS FILED AS DATA, NOT ONLY AS ITS SUMMARY. A piece whose result states an `output` (a data.gis answer: its
   features, kept whole on the server) becomes a `dataset` product — the features themselves when they fit the store (PRODUCT_KINDS.dataset.maxBytes),
   otherwise a reference to where the server keeps them whole — with where it came from (`from`: the job, the piece, the source files' addresses) and the
   version of its bytes. `readOutput(taskId)` is the jobs client's output() (js/atlas-jobs-client.js). Measured 2026-11-27: the job's 500-point
   dataset was not among the products at all (answer 2, document 1). */
const DATASET_INLINE_BYTES = PRODUCT_KINDS.dataset.maxBytes - 4096;   /* the store's own ceiling, less the product's few fields around the features */
async function datasetsOfJob(f, readOutput, existing) {
  const out = [];
  for (const t of (f && f.tasks) || []) {
    if (!(t.state === 'done' || t.state === 'partial') || !t.output) continue;
    const o = t.output;
    const from = { job: f.id, task: t.id, url: o.sources[0] || undefined, urls: o.sources, output: o.id, version: o.version };
    const note = 'background job ' + f.id + ' · piece ' + t.id + ' · output ' + o.id + ' v' + o.version + (o.sources.length ? ' · from ' + o.sources.join(' ') : '') + (t.stale ? ' · computed under an earlier version of the request' : '');
    const name = clip('dataset — ' + t.id + (t.title ? ' — ' + t.title : ''), 100);
    const previous = existing.find((p) => p.kind === 'dataset' && p.name === name && same(p.from, from));
    if (Array.isArray(previous?.content.features)) {
      out.push(previous);
      continue;
    }
    let got = null;
    if (o.bytes && o.bytes <= DATASET_INLINE_BYTES && typeof readOutput === 'function') { try { got = await readOutput(t.id); } catch (_) { got = null; } }
    if (got?.ok && got.output?.version !== o.version) continue;
    if (got && got.ok && Array.isArray(got.features)) out.push({ kind: 'dataset', name, content: { format: 'geojson', features: got.features }, note, from });
    else out.push({ kind: 'dataset', name, content: { format: 'geojson', ref: { job: f.id, task: t.id, version: o.version }, count: o.count, columns: o.columns }, note: note + (got && !got.ok ? ' · read back later (' + got.code + ')' : ' · kept whole on the server, read back with restore'), from });
  }
  return out;
}

/* saveJobAsWork(facts, store, { now? }) → { ok, workId, saved:[names], unchanged:n, refused:[{name,problem}] } | { ok:false, why }
   Only an ENDED job is filed (a running job has pieces still to come); `store` is a work store (get/put). */
export async function saveJobAsWork(f, store, o) {
  if (!f || !f.id) return { ok: false, why: 'no-job' };
  if (f.running) return { ok: false, why: 'still-running' };
  if (!store || typeof store.get !== 'function' || typeof store.put !== 'function') return { ok: false, why: 'no-store' };
  const now = (o && +o.now) || Date.now();
  const id = jobWorkId(f.id);
  let work = await store.get(id);
  const list = productsOfJob(f).concat(await datasetsOfJob(f, o && o.readOutput, currentProducts(work)));
  if (!list.length) return { ok: false, why: 'nothing-to-file' };
  if (!work) {
    work = normalizeWork({ id, at: now, updatedAt: now, goal: clip(f.title || ('Background job ' + f.id), 4000), summary: clip(f.result, 16000), status: f.status === 'done' ? 'done' : 'blocked', products: [], note: 'Made from the background job ' + f.id + ' (js/atlas-job-products.js).' });
    if (!work) return { ok: false, why: 'invalid-work' };
  }
  const saved = [], refused = [], datasets = [];
  let unchanged = 0;
  for (const p of list) {
    const cur = currentProducts(work).find((x) => x.kind === p.kind && x.name === p.name);
    const r = withProduct(work, p, now);
    if (r.problem) { refused.push({ name: p.name, problem: r.problem }); continue; }
    const identical = cur && same(cur.content, r.product.content) && same(cur.from, r.product.from);
    const product = identical ? cur : r.product;
    if (identical) unchanged++;
    else { work = r.work; saved.push(p.name); }
    if (product.kind === 'dataset') {
      const { task, output, version } = product.from;
      const fact = f.tasks.find((t) => t.id === task);
      const geometryTypes = fact.output.geometryTypes ?? (Array.isArray(product.content.features) ? jobGeometryTypes(product.content.features) : null);
      datasets.push({ task, title: fact.title, output, version, product: product.id, count: product.content.count, geometryTypes, stale: !!fact.stale });
    }
  }
  work = Object.assign({}, work, { status: f.status === 'done' && !(f.tasks || []).some((t) => t.state === 'failed' || t.state === 'refused' || t.state === 'cancelled') ? 'done' : 'blocked', summary: clip(f.result || work.summary, 16000), updatedAt: saved.length ? now : work.updatedAt });
  if (saved.length || unchanged === list.length) { try { await store.put(work); } catch (e) { return { ok: false, why: 'not-saved', detail: clip(e && e.message, 120) }; } }
  return { ok: true, workId: id, saved, unchanged, refused, datasets };
}

/* fileRunToWork(run, args, store, workId) → { ok, saved:[names] } | { ok:false, why }
   A Python run's own record, filed in the work it belongs to (the open one — WORK_STATE.current): the PROGRAM as a `code` product, and — when it was
   granted the capability bridge — the HISTORY of its calls as a `document` product (grants, the counts, every call with its outcome, and how many were
   not logged). Both are versioned by name: the same program run again is a new version of the same product, and an identical one is not filed twice.
   A run with no open work files nothing (there is nowhere to put it, and one is never made behind the reader's back). */
export async function fileRunToWork(run, a, store, workId) {
  if (!run || !run.ok) return { ok: false, why: 'run-not-ok' };
  if (!workId || !store || typeof store.get !== 'function') return { ok: false, why: 'no-work' };
  let work = await store.get(workId);
  if (!work) return { ok: false, why: 'no-work' };
  const title = clip((a && a.title) || 'python run', 60);
  const list = [];
  if (a && a.code) list.push({ kind: 'code', name: 'program: ' + title, content: { language: 'python', text: clip(a.code, 900000) }, note: 'compute.run' + (run.codeSha256 ? ' · sha256 ' + run.codeSha256.slice(0, 16) : '') });
  const b = run.bridge;
  if (b && b.summary) {
    const s = b.summary;
    const lines = ['# Capability calls of the run "' + title + '"', '', 'Granted: ' + (b.grants || []).join(' + ') + ' · ' + s.executed + ' run · ' + (s.repeats || 0) + ' repeats answered, not re-run'
      + (s.unobserved ? ' · ' + s.unobserved + ' not observed' : '') + (b.logOmitted ? ' · ' + b.logOmitted + ' calls not logged' : '') + (b.logSha256 ? ' · log sha256 ' + String(b.logSha256).slice(0, 16) : ''), ''];
    if (Object.keys(s.refused || {}).length) lines.push('Refused: ' + JSON.stringify(s.refused), '');
    lines.push('| # | capability | ok | note | arguments |', '|---|---|---|---|---|');
    (b.calls || []).slice(0, 2000).forEach((c) => lines.push('| ' + c.seq + ' | ' + (c.capability || c.kind) + ' | ' + (c.ok ? 'yes' : 'no') + ' | ' + [c.refused, c.alreadyDone ? 'already done' : '', c.why, c.observed === false ? 'not observed' : ''].filter(Boolean).join(', ') + ' | ' + String(c.args || '').replace(/\|/g, '/').slice(0, 120) + ' |'));
    list.push({ kind: 'document', name: 'capability calls: ' + title, content: { format: 'markdown', text: clip(lines.join('\n'), 1500000) }, note: 'cap-bridge history of compute.run' });
  }
  const saved = [];
  for (const p of list) {
    const cur = currentProducts(work).find((x) => x.kind === p.kind && x.name === p.name);
    if (cur && same(cur.content, p.content)) continue;
    const r = withProduct(work, p, Date.now());
    if (r.problem) continue;
    work = r.work; saved.push(p.name);
  }
  if (saved.length) { try { await store.put(work); } catch (e) { return { ok: false, why: 'not-saved' }; } }
  return { ok: true, saved };
}

/* the working memory's side: a job that was started is OWED until it is read at its end (kind 'job' survives the turn that wrote it) */
export function noteJobStarted(wm, f) {
  if (!wm || typeof wm.open !== 'function' || !f) return;
  try { wm.open(jobOwedText(f), 'job'); } catch (_) { /* memory is context, never a gate */ }
}
export function noteJobEnded(wm, f) {
  if (!wm || typeof wm.resolve !== 'function' || !f) return;
  try { wm.resolve(jobOwedText(f)); } catch (_) { /* memory is context, never a gate */ }
}
export const jobOwedText = (f) => 'Background job ' + f.id + (f.title ? ' "' + clip(f.title, 80) + '"' : '') + ' is running on the server — read it with jobs.status when it has ended';

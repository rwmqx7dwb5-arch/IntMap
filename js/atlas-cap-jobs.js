/* ============================================================================
 *  IntMap · Atlas capabilities — the `jobs.*` namespace   (js/atlas-cap-jobs.js)
 * ----------------------------------------------------------------------------
 *  Atlas's way into the durable jobs of supabase/functions/atlas-jobs: start a long piece of work that keeps running on
 *  the server after the turn and the tab are gone, look at it later, stop it, change what it was asked. The page half is
 *  js/atlas-jobs-client.js; this file is only the four capabilities and what each says to the planner.
 *
 *  ⚠ A JOB IS A UNIT OF ITS OWN, NOT A LONGER TURN. A turn is bounded in steps, calls and seconds because a reader waits
 *  on it (js/atlas-agent.js). `jobs.start` returns in one request and the turn ENDS; the work is read back with `jobs.status`
 *  whenever the reader returns, and each piece shows up as it finishes. No turn limit was raised for this (CONSTITUTION.md §5).
 *  The job's own fences — a cost cap per job, concurrency per reader and per project, a stop switch — are the server's.
 *
 *  See js/atlas-caps.js for what an entry holds; the columns of `row` are at «THE TABLE» in js/atlas-capabilities.js.
 * ==========================================================================*/
import { str, int, bool, list, obj, one } from './atlas-caps.js';
import { serverClass } from './atlas-server-class.js';
import { pageJobsClient, planDigest, jobText, jobCardShell, mountJobCards, applyParked, deviceParkedMemory } from './atlas-jobs-client.js';

/* what an ENDED job leaves: one work in the work store (js/atlas-job-products.js) and the memory told it is no longer owed. The work store is loaded
   when it is needed — a page that never ends a job never loads it. Returns the line Atlas reads, or ''. */
async function fileEnded(K, f) {
  try { const P = await import('./atlas-job-products.js'); P.noteJobEnded(K.workingMemory, f);
    /* (gis-result-handoff) a piece's output is read whole from the server and filed as a dataset product (js/atlas-job-products.js datasetsOfJob) */
    const client = pageJobsClient(), readOutput = client ? (taskId) => client.output(f.id, taskId) : null;
    const W = await import('./atlas-cap-work.js'); const r = await P.saveJobAsWork(f, W.workStore(), { readOutput });
    const ds = r.ok ? r.saved.filter((n) => /^dataset — /.test(n)) : [];
    return r.ok ? ' Filed on this device as work ' + r.workId + ' (' + r.saved.length + ' new product(s), ' + r.unchanged + ' unchanged' + (ds.length ? '; datasets: ' + ds.join(', ') + ' — put one on the map or into the next step with work.job restore' : '') + ') — open it with work.job.' : '';
  } catch (_) { return ''; }
}

/* the page's side of a parked operation: the SAME gate a turn and a program go through (K.programBridge → makeExecute), granted only 'state' (map and session, no persist, no external) */
function parkedApplier(K, dctx) {
  return async (p) => {
    if (typeof K.programBridge !== 'function') return { ok: false, why: 'no executor here' };
    const h = K.programBridge({ turn: dctx || {}, grants: ['state'], forbid: (cap) => (cap && /^jobs[.]/.test(cap.id)) ? 'a job does not start or stop jobs from the page it came back to' : null });
    try { const r = await h.bridge.handle({ v: 1, seq: 1, kind: 'call', capability: p.capability, args: p.args || {} }); return { ok: !!(r && r.ok && r.observed !== false), why: r && r.ok ? '' : String((r && (r.why || r.refused)) || 'refused') }; }
    finally { try { h.bridge.cancel('done'); } catch (_) { /* closed */ } try { h.close(); } catch (_) { /* closed */ } }
  };
}

/* what the server says when it refuses, in the reader's words (the codes are atlas-jobs/index.ts's); null for a code with no sentence of its own */
function refusal(L, code) {
  switch (code) {
    case 'no_session': case 'auth': return L('Background jobs need a signed-in account.', 'バックグラウンドの仕事にはログインが必要です。');
    case 'not_configured': return L('Background jobs are not available on this page.', 'このページではバックグラウンドの仕事を使えません。');
    case 'disabled': return L('Background jobs are switched off on the server.', 'サーバでバックグラウンドの仕事が停止されています。');
    case 'limit': return L("Today's AI allowance is used up, so no job was started.", '今日の AI の利用枠を使い切ったため、仕事は始まりませんでした。');
    case 'quota_unavailable': return L('The usage allowance could not be checked, so no job was started.', '利用枠を確認できなかったため、仕事は始まりませんでした。');
    case 'nothing_to_resume': return L('Nothing to resume.', '再開するものはありません。');
    case 'capability_unsupported_on_server': return L('A capability task named something the server cannot run without a page; use a worker task, or run that capability yourself.', '指定された能力はページ無しのサーバでは実行できません。調査の仕事にするか、自分で実行してください。');
    case 'images_unavailable': return L('An image the job was told to show its workers could not be found, so no job was started.', '仕事の子に見せるよう指定された画像が見つからなかったため、仕事は始まりませんでした。');
    case 'images_missing': case 'images_invalid': case 'images_too_large': return L('The images for this job could not be sent (missing, not an image, or too large), so no job was started.', 'この仕事の画像を送れなかった（欠落・画像でない・大きすぎる）ため、仕事は始まりませんでした。');
    case 'kind_unsupported': return L('That kind of task cannot run on the server.', 'その種類の仕事はサーバでは実行できません。');
    default: return null;
  }
}

export default [
  {
    /* the card carries the job's whole state and live controls; the model is handed the same facts as text. `explicit`: it spends the project's
       money on the reader's behalf with nobody watching, so after outside text has been in front of the model it asks the reader first (column 8) */
    policy: { delegates: true },   /* (capability-facets) starts other model work */
    row: ['jobs.start',                 'jobStart',       'startJob,backgroundResearch,runInBackground,longTask',        'research','none',    '',                       'explanation',         'external','explicit','',         ''],
    ui: { none: '2026-11-20' },
    phrases: () => ['バックグラウンドで調べて', '閉じても続けて', '時間のかかる調査', '後で結果を見る', '裏で調べて'].concat(['in the background', 'keep going after I close', 'long research', 'check back later', 'run it as a job']),
    doc: [
      { in: 'research.analyze', at: 36, text: 'START A BACKGROUND JOB (it keeps running on the server after this turn AND after the tab is closed; you can look, change it and stop it while it runs): {"type":"jobStart","title"?:str,"tasks":[{"id"?:str,"goal":str,"returns"?:str,"inputs"?:[{"from":task id}]} (a researcher: web search, returns findings with sources) | {"id"?:str,"kind":"capability","capability":ID,"args":{…}} (one READ capability that has a server twin, run with no model at no cost — a capability task works on a WHOLE table in one call, so a mechanical step over many rows (a spatial operation such as data.gis over every row, a statistic) is one task, not one model decision per row; a capability that CHANGES THE MAP OR THE SESSION (a layer, the camera, a panel, the clock) cannot run on a server, so the job SAVES it and the page applies it when the reader next opens IntMap; any other capability is refused BY NAME and the refusal lists every one that runs on the server, with its arguments) | {"id"?:str,"goal":str,"tools":[capability ids with a server twin]} (a researcher that ALSO calls those capabilities itself, as many rounds as it needs inside the cost cap of the job, and builds its answer on what they return)] up to 8,"fresh"?:bool} — a researcher task may also carry "images":[names of the reader\'s attachments, or "@view" for the map frames captured this turn] (it is SHOWN those images, which are sent to the server with the job) and "maxOutput":n (the most it may write in one answer) — for work that is big, slow or can wait: 「時間がかかってもいいので調べて」「閉じても続けて」「裏で調べて」「後で結果を見たい」. It returns AT ONCE with a job card (progress, each piece as it ends, a Stop button and a box to change the instructions); END YOUR TURN there, tell the reader the job runs on its own, and read it later with {"type":"jobStatus"}. Do not wait for it in this turn and do not poll it. A task\'s "inputs" names tasks of the same list whose findings it builds on. A job costs one of the reader\'s daily AI uses and is capped at $1; two may run at a time per reader. Use research.delegate instead when the answer is wanted in THIS turn.' },
    ],
    schema: () => ({ type: 'object', required: ['tasks'], properties: { title: str(), fresh: bool(), tasks: list({ type: 'object', properties: { id: str(), kind: one('worker', 'capability'), goal: str(), returns: str(), capability: str(), args: obj(), tools: list(str()), images: list(str()), maxOutput: int(1, 128000), inputs: list({ type: 'object', required: ['from'], properties: { from: str() } }) } }, 1, 8) } }),
    async run(a, dctx, K) {
      const R = K.R, L = K.L, esc = K.esc, warn = K.warn;
      const fail = (code, extra) => { const m = refusal(L, code); const have = extra && Array.isArray(extra.available) && extra.available.length ? ' ' + L('What the server can run: ', 'サーバが実行できるもの: ') + extra.available.map((c) => c.id + ' ' + (c.args || '')).join(' | ') : ''; const notes = extra && Array.isArray(extra.notes) && extra.notes.length ? ' ' + extra.notes.join(' ') : ''; return R(false, warn(esc((m || L('The job could not be started (' + code + ').', '仕事を開始できませんでした (' + code + ')。')) + notes + have)), { meta: Object.assign({ status: 'failed', code }, extra || null) }); };
      const tasks = Array.isArray(a && a.tasks) ? a.tasks : [];
      if (!tasks.length) return fail('no_tasks');
      const client = pageJobsClient();
      if (!client) return fail('no_session');
      /* (atlas-jobs-reliability) THE IMAGES A WORKER TASK NAMES ARE READ HERE, where the attachments and the map frames are, and travel with the job: a server has neither.
         The same names resolve the same way research.delegate resolves them (js/atlas-delegate.js imageSourceOf / resolveTaskImages). A name that cannot be shown refuses the job BY NAME —
         a worker that was not shown what it was told to look at must not answer as if it had been. */
      const named = Array.from(new Set(tasks.flatMap((t) => (t && t.kind !== 'capability' && Array.isArray(t.images) ? t.images : []).map((n) => String(n)).filter(Boolean))));
      let images;
      if (named.length) {
        const D = await import('./atlas-delegate.js');
        const src = D.imageSourceOf({ ATTACH_LOG: K.ATTACH_LOG, VFRAMES: K.VFRAMES, _curTurn: K._curTurn });
        images = {};
        const unseen = [];
        for (const name of named) { const got = D.resolveTaskImages([name], src); if (got.urls.length) images[name] = got.urls; else unseen.push(got.notes[0] || ('"' + name + '" could not be shown')); }
        if (unseen.length) return fail('images_unavailable', { notes: unseen });
      }
      /* the key of THIS request: the same list asked twice in one turn is one job (nothing charged or started twice); a later turn is a new job; fresh:true forces one */
      const idem = 'atl:' + String(K._curTurnKey || 'page').replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 60) + ':' + planDigest(tasks) + (a.fresh === true ? ':' + Date.now().toString(36) : '');
      const r = await client.start({ tasks, title: a.title || '', idem, images });
      if (!r.ok) return fail(r.code === 'bad_plan' ? 'bad_plan' : r.code, { at: r.at, httpStatus: r.httpStatus, available: r.available });
      let f = null; try { f = await client.get(r.jobId); } catch (_) { f = null; }
      mountJobCards(() => pageJobsClient(), { L, esc, apply: parkedApplier(K, dctx), onEnded: (g) => fileEnded(K, g) });
      try { const P = await import('./atlas-job-products.js'); P.noteJobStarted(K.workingMemory, { id: r.jobId, title: a.title || '' }); } catch (_) { /* memory is context */ }
      /* what each capability task will DO, said from the registry's own record (js/atlas-server-class.js): run on the server, or saved for the page */
      const where = tasks.filter((t) => t && t.kind === 'capability' && t.capability).map((t) => { let c = null; try { c = K.CAPS && K.CAPS.resolve(t.capability); } catch (_) { c = null; } const k = c ? serverClass(c) : ''; return k === 'parkable' ? t.capability + ': ' + L('saved, applied when you next open IntMap', '保存し、次に IntMap を開いたとき適用') : (k === 'read' ? t.capability + ': ' + L('runs on the server', 'サーバで実行') : ''); }).filter(Boolean);
      const lead = '<div style="font-size:12px;margin-bottom:4px;">' + esc(r.created ? L('Started in the background — it keeps running after you close this tab. Come back and ask for its status any time.', 'バックグラウンドで開始しました。このタブを閉じても続きます。いつでも戻って状況を確認できます。') : L('This request was already started; here is that job.', 'この依頼は既に開始済みです。その仕事を表示します。')) + (where.length ? '<div>' + esc(where.join(' · ')) + '</div>' : '') + '</div>';
      return R(true, lead + jobCardShell(r.jobId, f, { L, esc }), { meta: { status: 'completed', produced: ['explanation'], job: { id: r.jobId, created: r.created, status: (f && f.status) || r.status, tasks: tasks.length } } });
    },
  },
  {
    /* spends the project's money on the reader's behalf with nobody watching, exactly as jobs.start does — so it asks first after outside text has been in front of the model (column 8) */
    policy: { delegates: true },   /* (capability-facets) restarts other model work */
    row: ['jobs.resume',                'jobResume',      'resumeJob,retryJob,continueJob,rerunFailed',                  'research','none',    '',                       'explanation',         'external','explicit','',         ''],
    ui: { none: '2026-11-21' },
    phrases: () => ['続きから再開', '失敗した分だけやり直して', '止めた調査を続けて'].concat(['resume the job', 'retry what failed', 'continue the stopped job']),
    doc: [
      { in: 'research.analyze', at: 40, text: 'RESUME A BACKGROUND JOB: {"type":"jobResume","id":job id,"only"?:[task ids]} = a job that was stopped, hit its cost cap or has pieces that failed or were refused: ONLY those pieces run again (the ones that finished are kept and never run or paid for twice; what the job already spent still counts against its cap). 「失敗した分だけやり直して」「止めたところから続けて」.' },
    ],
    schema: () => ({ type: 'object', required: ['id'], properties: { id: str(), only: list(str()) } }),
    async run(a, dctx, K) {
      const R = K.R, L = K.L, esc = K.esc, warn = K.warn;
      const client = pageJobsClient();
      if (!client) return R(false, warn(esc(refusal(L, 'no_session'))), { meta: { status: 'failed', code: 'no_session' } });
      const id = String((a && a.id) || '');
      const r = await client.resume(id, a && a.only);
      const said = { running: L('That job is still running — there is nothing to resume.', 'その仕事はまだ実行中です。再開するものはありません。'), nothing_to_resume: L('Every piece of that job finished — there is nothing to run again.', 'その仕事の分担はすべて終わっています。やり直すものはありません。'), not_found: L('No such job of yours.', 'その仕事は見つかりません。') };
      if (!r.ok) return R(false, warn(esc(said[r.state] || refusal(L, r.state || r.code) || L('The job could not be resumed (' + (r.state || r.code) + ').', '仕事を再開できませんでした (' + (r.state || r.code) + ')。'))), { meta: { status: 'failed', code: r.state || r.code } });
      let f = null; try { f = await client.get(id); } catch (_) { f = null; }
      mountJobCards(() => pageJobsClient(), { L, esc, apply: parkedApplier(K, dctx), onEnded: (g) => fileEnded(K, g) });
      return R(true, '<div style="font-size:12px;margin-bottom:4px;">' + esc(L('Resumed — only the unfinished pieces run again; the finished ones are kept.', '再開しました。終わっていない分だけ実行し、終わった分はそのまま使います。')) + '</div>' + jobCardShell(id, f, { L, esc }), { meta: { status: 'completed', produced: ['explanation'], job: { id, status: (f && f.status) || 'queued', resumed: true } } });
    },
  },
  {
    /* ingests external: a finished piece is a worker's findings from the open web, which carry third-party sentences */
    row: ['jobs.status',                'jobStatus',      'jobs,myJobs,listJobs,jobProgress,backgroundStatus',           'research','none',    '',                       'explanation',         'read',    'none',   '',         '', 'external'],
    ui: { none: '2026-11-20' },
    phrases: () => ['調査の状況', '裏で動いている仕事', '結果はどうなった', '途中経過'].concat(['job status', 'how is the research going', 'what did the background job find', 'my jobs']),
    doc: [
      { in: 'research.analyze', at: 37, text: 'LOOK AT BACKGROUND JOBS: {"type":"jobStatus","id"?:job id,"limit"?:1-30} = with an id, THAT job: its state, each piece and what it found SO FAR (a job that is still running already carries the pieces that ended), the cost, and the combined result once it is done; without one, the reader\'s recent jobs (newest first). Use it when the reader comes back — 「さっきの調査どうなった」「結果を見せて」 — and when they ask what is running. A running job is not waited for: report what has ended and say the rest is still running.' },
    ],
    schema: () => ({ type: 'object', properties: { id: str(), limit: int(1, 30) } }),
    async run(a, dctx, K) {
      const R = K.R, L = K.L, esc = K.esc, warn = K.warn;
      const client = pageJobsClient();
      if (!client) return R(false, warn(esc(refusal(L, 'no_session'))), { meta: { status: 'failed', code: 'no_session' } });
      try {
        if (a && a.id) {
          const f = await client.get(String(a.id));
          if (!f) return R(false, warn(esc(L('No such job of yours.', 'その仕事は見つかりません。'))), { meta: { status: 'failed', code: 'job_not_found' } });
          const apply = parkedApplier(K, dctx);
          const applied = await applyParked(f, apply, deviceParkedMemory());
          mountJobCards(() => pageJobsClient(), { L, esc, apply, onEnded: (g) => fileEnded(K, g) });
          const filed = !f.running ? await fileEnded(K, f) : '';
          const appliedLine = filed + (applied.length ? ' Applied to the map just now: ' + applied.map((x) => x.capability + (x.ok ? ' ok' : ' refused (' + x.why + ')')).join('; ') : '');
          return R(true, '<div style="display:none">' + esc(jobText(f) + appliedLine) + '</div>' + jobCardShell(f.id, f, { L, esc }), { meta: { status: 'completed', produced: ['explanation'], job: { id: f.id, status: f.status, running: f.running, tasksEnded: f.tasksEnded, tasksTotal: f.tasksTotal, spentUsd: f.spentUsd }, jobFacts: f } });
        }
        const rows = await client.list(a && a.limit);
        const items = rows.map((j) => '<li><code>' + esc(j.id) + '</code> — ' + esc(j.status) + (j.stop_reason ? ' (' + esc(j.stop_reason) + ')' : '') + ' · ' + esc(L(j.tasks_done + ' of ' + j.tasks_total + ' done', j.tasks_total + ' 件中 ' + j.tasks_done + ' 件完了')) + (j.title ? ' · ' + esc(j.title) : '') + '</li>').join('');
        return R(true, '<div style="font-size:12px;"><b>' + esc(rows.length ? L('Your recent background jobs', '最近のバックグラウンドの仕事') : L('You have no background jobs.', 'バックグラウンドの仕事はありません。')) + '</b><ul style="margin:2px 0 0 16px;padding:0;">' + items + '</ul></div>',
          { meta: { status: 'completed', produced: ['explanation'], jobs: rows.map((j) => ({ id: j.id, status: j.status, stopReason: j.stop_reason, tasksDone: j.tasks_done, tasksTotal: j.tasks_total, title: j.title, createdAt: j.created_at })) } });
      } catch (e) {
        return R(false, warn(esc(L('The jobs could not be read.', '仕事を読み込めませんでした。'))), { meta: { status: 'failed', code: 'jobs_unavailable' } });
      }
    },
  },
  {
    row: ['jobs.cancel',                'jobCancel',      'cancelJob,stopJob,stopBackground',                            'research','none',    '',                       'explanation',         'session', 'none',   '',         ''],
    ui: { none: '2026-11-20' },
    doc: [
      { in: 'research.analyze', at: 38, text: '{"type":"jobCancel","id":job id} = STOP a background job: it ends at its next checkpoint, before its next provider request (what already ended stays readable). Safe to repeat. 「あの調査を止めて」.' },
    ],
    schema: () => ({ type: 'object', required: ['id'], properties: { id: str() } }),
    async run(a, dctx, K) {
      const R = K.R, L = K.L, esc = K.esc, warn = K.warn;
      const client = pageJobsClient();
      if (!client) return R(false, warn(esc(refusal(L, 'no_session'))), { meta: { status: 'failed', code: 'no_session' } });
      const r = await client.cancel(String((a && a.id) || ''));
      if (!r.ok) return R(false, warn(esc(L('The job could not be stopped (' + r.code + ').', '仕事を止められませんでした (' + r.code + ')。'))), { meta: { status: 'failed', code: r.code } });
      return R(true, '<div style="font-size:12px;">' + esc(L('Stop requested — the job ends before its next request.', '停止を依頼しました。次のリクエストの前に終了します。')) + '</div>', { meta: { status: 'completed', produced: ['explanation'], job: { id: String(a.id), cancelRequested: true } } });
    },
  },
  {
    row: ['jobs.amend',                 'jobAmend',       'amendJob,changeJob,tellJob,addInstruction',                   'research','none',    '',                       'explanation',         'session', 'none',   '',         ''],
    ui: { none: '2026-11-20' },
    doc: [
      { in: 'research.analyze', at: 39, text: '{"type":"jobAmend","id":job id,"note":str,"revise"?:[{"id":piece id, …its new contract}],"keep"?:[piece ids]} = CHANGE A JOB: the note is read before the NEXT provider request of every piece still to run and outranks the original goal wherever they differ. 「それは日本の分だけにして」「その結論は出典を厳しめに」. The arguments of a capability piece were fixed when it was planned, and a piece that already ended is what it was: jobStatus marks each piece computed under an earlier version of the request. To redo what the change affects, give "revise" (the new contracts of those pieces, with the same ids; an argument "@A:data.result" hands the whole result of piece A on) and "keep" (the finished pieces that still hold, such as the national data when only the city changed). Revised pieces and everything built on them run again; kept pieces are not run or paid for again; a job that had ended runs again.' },
    ],
    schema: () => ({ type: 'object', required: ['id', 'note'], properties: { id: str(), note: str(), revise: list(obj()), keep: list(str()) } }),
    async run(a, dctx, K) {
      const R = K.R, L = K.L, esc = K.esc, warn = K.warn;
      const client = pageJobsClient();
      if (!client) return R(false, warn(esc(refusal(L, 'no_session'))), { meta: { status: 'failed', code: 'no_session' } });
      const note = String((a && a.note) || '').trim();
      if (!note) return R(false, warn(esc(L('An instruction is needed.', '追加する指示が必要です。'))), { meta: { status: 'failed', code: 'note_missing' } });
      const revise = Array.isArray(a && a.revise) ? a.revise : [], keep = Array.isArray(a && a.keep) ? a.keep.map(String) : [];
      if (revise.length || keep.length) {
        const v = await client.revise(String((a && a.id) || ''), note, { tasks: revise, keep });
        if (!v.ok) return R(false, warn(esc((refusal(L, v.code) || L('The change could not be applied (' + v.code + ').', '変更を適用できませんでした (' + v.code + ')。')) + (v.at ? ' [' + v.at + ']' : ''))), { meta: { status: 'failed', code: v.code, at: v.at } });
        mountJobCards(() => pageJobsClient(), { L, esc, apply: parkedApplier(K, dctx), onEnded: (g) => fileEnded(K, g) });
        return R(true, '<div style="font-size:12px;">' + esc(L('Changed (request version ' + v.version + '): redone — ' + (v.revised.join(', ') || 'none') + '; kept as they are — ' + (v.kept.join(', ') || 'none') + '. What was built on a redone piece runs again.', '変更しました（依頼の版 ' + v.version + '）。やり直す分: ' + (v.revised.join(', ') || 'なし') + '／そのまま使う分: ' + (v.kept.join(', ') || 'なし') + '。やり直す分に依存する分も再実行します。')) + '</div>', { meta: { status: 'completed', produced: ['explanation'], job: { id: String(a.id), amended: true, version: v.version, revised: v.revised, kept: v.kept } } });
      }
      const r = await client.amend(String((a && a.id) || ''), note);
      if (!r.ok) return R(false, warn(esc(L('The instruction could not be added (' + r.code + ').', '指示を追加できませんでした (' + r.code + ')。'))), { meta: { status: 'failed', code: r.code } });
      return R(true, '<div style="font-size:12px;">' + esc(L('Added — the job reads it before its next request.', '追加しました。次のリクエストの前に仕事が読みます。')) + '</div>', { meta: { status: 'completed', produced: ['explanation'], job: { id: String(a.id), amended: true } } });
    },
  },
];

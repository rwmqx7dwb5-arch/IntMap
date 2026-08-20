#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TASK_RE = /<!--\s*HANDOFF:TASK\s+id="([A-Za-z0-9_-]+)"\s*-->\s*([\s\S]*?)<!--\s*HANDOFF:END\s+id="\1"\s*-->/g;
const VALID_ID = /^[A-Za-z][A-Za-z0-9_-]*-\d{3,}$/;

const TEMPLATE = `# IntMap → Claude Handoff

<!-- GPT-EDITOR-CONTRACT
This file is the single semantic handoff from ChatGPT to Claude for IntMap implementation work.

ChatGPT owns this file. As the user discovers things over time, continuously refactor their fragments, observations, screenshots, comparisons, changed ideas, and new requirements into clear implementation tasks here. Do not merely append a transcript.

Rules for ChatGPT:
- When ChatGPT Work is granted this folder, edit only HANDOFF.md.
- Keep only implementation-relevant requirements; remove duplication and reconcile later changes with earlier text.
- Never mark Claude completion or user verification here. Status is mechanical and stored elsewhere.
- Keep stable task IDs. Create a new ID only for a genuinely separate implementation task.
- Every active task must use the exact marker shape below. Do not alter the marker syntax.
- Do not add status checkboxes.

Task shape (replace <TASK-ID>; this example is intentionally not parseable as an active task):
<!-- HANDOFF:TASK id="<TASK-ID>" -->
## <TASK-ID> — Short title

### Requirements
- ...

### Done when
- ...
<!-- HANDOFF:END id="<TASK-ID>" -->
GPT-EDITOR-CONTRACT -->

`;

function canonicalRepoRoot() {
  if (process.env.INTMAP_CANONICAL_REPO) return path.resolve(process.env.INTMAP_CANONICAL_REPO);
  const main = path.join(os.homedir(), 'OneDrive', 'IntMap');
  return existsSync(path.join(main, 'CLAUDE.md')) ? main : REPO_ROOT;
}

function context(overrides = {}) {
  const repoRoot = overrides.repoRoot || canonicalRepoRoot();
  const handoffDir = overrides.handoffDir || process.env.INTMAP_HANDOFF_DIR || path.join(repoRoot, 'GPT-HANDOFF');
  const stateDir = overrides.stateDir || process.env.INTMAP_HANDOFF_STATE_DIR || path.join(os.homedir(), '.intmap-handoff');
  return {
    repoRoot,
    handoffDir,
    handoffFile: path.join(handoffDir, 'HANDOFF.md'),
    stateDir,
    stateFile: path.join(stateDir, 'state.json'),
    archiveFile: path.join(stateDir, 'archive.md'),
  };
}

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

async function atomicWrite(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, text, 'utf8');
  try { await rename(temp, file); }
  catch (error) { await rm(temp, { force: true }); throw error; }
}

async function init(ctx) {
  await mkdir(ctx.handoffDir, { recursive: true });
  await mkdir(ctx.stateDir, { recursive: true });
  if (!(await exists(ctx.handoffFile))) await atomicWrite(ctx.handoffFile, TEMPLATE);
  if (!(await exists(ctx.stateFile))) await atomicWrite(ctx.stateFile, `${JSON.stringify({ version: 1, tasks: {} }, null, 2)}\n`);
}

function taskHash(raw) {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function parseTasks(document) {
  const tasks = [];
  const seen = new Set();
  TASK_RE.lastIndex = 0;
  let match;
  while ((match = TASK_RE.exec(document))) {
    const id = match[1];
    if (!VALID_ID.test(id)) throw new Error(`Invalid task id: ${id}`);
    if (seen.has(id)) throw new Error(`Duplicate task id: ${id}`);
    seen.add(id);
    const raw = match[0];
    const body = match[2].trim();
    tasks.push({
      id,
      title: body.match(/^##\s+(.+)$/m)?.[1]?.trim() || id,
      raw,
      hash: taskHash(raw),
      start: match.index,
      end: match.index + raw.length,
    });
  }
  return tasks;
}

async function readState(ctx) {
  await init(ctx);
  try {
    const state = JSON.parse(await readFile(ctx.stateFile, 'utf8'));
    if (state?.version !== 1 || !state.tasks || typeof state.tasks !== 'object') throw new Error('unsupported schema');
    return state;
  } catch (error) {
    throw new Error(`Cannot read state (${ctx.stateFile}): ${error.message}`);
  }
}

async function saveState(ctx, state) {
  await atomicWrite(ctx.stateFile, `${JSON.stringify(state, null, 2)}\n`);
}

function newStateEntry() {
  return {
    claudeComplete: false,
    userVerified: false,
    completedHash: null,
    claudeCompletedAt: null,
    userVerifiedAt: null,
    reworkRequestedAt: null,
  };
}

function syncState(state, tasks) {
  const ids = new Set(tasks.map((task) => task.id));
  let changed = false;
  for (const task of tasks) {
    if (!state.tasks[task.id]) { state.tasks[task.id] = newStateEntry(); changed = true; }
    const entry = state.tasks[task.id];
    if (entry.claudeComplete && entry.completedHash !== task.hash) {
      state.tasks[task.id] = newStateEntry();
      changed = true;
    }
  }
  for (const id of Object.keys(state.tasks)) {
    if (!ids.has(id)) { delete state.tasks[id]; changed = true; }
  }
  return changed;
}

async function snapshot(ctx) {
  await init(ctx);
  const document = await readFile(ctx.handoffFile, 'utf8');
  const tasks = parseTasks(document);
  const state = await readState(ctx);
  if (syncState(state, tasks)) await saveState(ctx, state);
  return { document, tasks, state };
}

function view(task, state) {
  const entry = state.tasks[task.id] || newStateEntry();
  const current = entry.claudeComplete && entry.completedHash === task.hash;
  return {
    id: task.id,
    title: task.title,
    claudeComplete: Boolean(current),
    userVerified: Boolean(current && entry.userVerified),
  };
}

async function prepare(ctx, quiet = false) {
  const before = await snapshot(ctx);
  const completed = before.tasks.filter((task) => {
    const entry = before.state.tasks[task.id];
    return entry?.claudeComplete && entry?.userVerified && entry.completedHash === task.hash;
  });

  if (completed.length) {
    if (await readFile(ctx.handoffFile, 'utf8') !== before.document) {
      throw new Error('HANDOFF.md changed while prepare was running; nothing was removed. Run prepare again.');
    }
    const stamp = new Date().toISOString();
    await appendFile(ctx.archiveFile, `\n\n# Archived ${stamp}\n${completed.map((task) => `\n${task.raw.trim()}\n`).join('')}`, 'utf8');
    let document = before.document;
    for (const task of [...completed].sort((a, b) => b.start - a.start)) {
      document = document.slice(0, task.start) + document.slice(task.end);
      delete before.state.tasks[task.id];
    }
    document = document.replace(/\n{4,}/g, '\n\n\n').trimEnd() + '\n';
    await atomicWrite(ctx.handoffFile, document);
    await saveState(ctx, before.state);
  }

  const current = await snapshot(ctx);
  if (!quiet) {
    console.log(`Handoff: ${current.tasks.length} active task(s)`);
    console.log(`Source: ${ctx.handoffFile}`);
    for (const task of current.tasks) {
      const status = view(task, current.state);
      console.log(`- ${task.id}: ${status.claudeComplete ? 'Claude done / user review pending' : 'ready for Claude'} — ${task.title}`);
    }
    if (completed.length) console.log(`Archived and removed ${completed.length} fully verified task(s).`);
  }
  return current;
}

async function claudeDone(ctx, ids) {
  if (!ids.length) throw new Error('Usage: node scripts/handoff.mjs claude-done <TASK-ID> [...]');
  const data = await snapshot(ctx);
  const byId = new Map(data.tasks.map((task) => [task.id, task]));
  const now = new Date().toISOString();
  for (const id of ids) {
    const task = byId.get(id);
    if (!task) throw new Error(`Active task not found: ${id}`);
    data.state.tasks[id] = {
      claudeComplete: true,
      userVerified: false,
      completedHash: task.hash,
      claudeCompletedAt: now,
      userVerifiedAt: null,
      reworkRequestedAt: null,
    };
  }
  await saveState(ctx, data.state);
  console.log(`Claude completion recorded: ${ids.join(', ')}`);
}

async function userReview(ctx, id, action) {
  const data = await snapshot(ctx);
  const task = data.tasks.find((item) => item.id === id);
  if (!task) throw new Error(`Active task not found: ${id}`);
  const entry = data.state.tasks[id];
  const now = new Date().toISOString();
  if (action === 'approve') {
    if (!entry.claudeComplete || entry.completedHash !== task.hash) throw new Error('Claude has not completed the current version yet.');
    entry.userVerified = true;
    entry.userVerifiedAt = now;
    entry.reworkRequestedAt = null;
  } else if (action === 'rework') {
    data.state.tasks[id] = { ...newStateEntry(), reworkRequestedAt: now };
  } else {
    throw new Error('Unknown review action');
  }
  await saveState(ctx, data.state);
}

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}

function page(token) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>IntMap Handoff</title><style>
:root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light dark}*{box-sizing:border-box}body{margin:0;background:#f5f5f7;color:#1d1d1f}main{max-width:760px;margin:auto;padding:30px 18px 70px}h1{font-size:30px;margin:0 0 6px}header p{margin:0 0 22px;color:#6e6e73}.grid{display:grid;gap:14px}.card{background:#fff;border-radius:24px;padding:20px;box-shadow:0 8px 28px #0000000d}.id{font-size:12px;color:#86868b}.title{font-size:18px;font-weight:700;margin:5px 0 15px}.pill{display:inline-block;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:650;background:#fff3d6;color:#8a5a00;margin-bottom:18px}.pill.done{background:#e6f6ea;color:#19713a}.actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}button{border:0;border-radius:15px;padding:14px;font:inherit;font-weight:700;background:#007aff;color:#fff;cursor:pointer}button.secondary{background:#ececf0;color:#1d1d1f}button:disabled{opacity:.35;cursor:not-allowed}.empty{text-align:center;color:#6e6e73;padding:45px}.error{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);display:none;background:#1d1d1f;color:#fff;padding:10px 14px;border-radius:14px;max-width:calc(100% - 30px)}
@media(prefers-color-scheme:dark){body{background:#000;color:#f5f5f7}.card{background:#1c1c1e}.id,header p,.empty{color:#98989d}.pill{background:#493714;color:#ffd36a}.pill.done{background:#153c22;color:#78d993}button.secondary{background:#2c2c2e;color:#f5f5f7}}@media(max-width:520px){.actions{grid-template-columns:1fr}}
</style></head><body><main><header><h1>IntMap Handoff</h1><p>確認したら、押すだけです。</p></header><section id="tasks" class="grid"></section></main><div id="error" class="error"></div><script>
const TOKEN=${JSON.stringify(token)},root=document.getElementById('tasks'),err=document.getElementById('error');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
async function api(url,options={}){options.headers={...(options.headers||{}),'X-Handoff-Token':TOKEN};const r=await fetch(url,{cache:'no-store',...options}),j=await r.json();if(!r.ok)throw new Error(j.error||'Request failed');return j}
function fail(m){err.textContent=m;err.style.display='block';clearTimeout(fail.t);fail.t=setTimeout(()=>err.style.display='none',3000)}
async function review(id,action){try{await api('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action})});refresh()}catch(e){fail(e.message)}}
async function refresh(){try{const d=await api('/api/tasks');root.innerHTML=d.tasks.length?d.tasks.map(t=>'<article class="card"><div class="id">'+esc(t.id)+'</div><div class="title">'+esc(t.title)+'</div><span class="pill '+(t.claudeComplete?'done':'')+'">'+(t.userVerified?'あなたの確認済み':t.claudeComplete?'Claude 実装済み':'Claude 実装待ち')+'</span><div class="actions"><button '+(!t.claudeComplete||t.userVerified?'disabled':'')+' onclick="review(\''+t.id+'\',\'approve\')">✓ 確認OK</button><button class="secondary" onclick="review(\''+t.id+'\',\'rework\')">↩ 修正必要</button></div></article>').join(''):'<div class="card empty">確認待ちはありません。</div>'}catch(e){fail(e.message)}}refresh();setInterval(refresh,2000);
</script></body></html>`;
}

async function requestBody(req) {
  let text = '';
  for await (const chunk of req) { text += chunk; if (text.length > 16_384) throw new Error('Request too large'); }
  return text ? JSON.parse(text) : {};
}

function openBrowser(url) {
  try {
    const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch { /* URL is printed as a fallback. */ }
}

async function ui(ctx) {
  await prepare(ctx, true);
  const token = randomUUID();
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/') {
        const html = page(token);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html), 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'" });
        return res.end(html);
      }
      if (req.headers['x-handoff-token'] !== token) return json(res, 403, { error: 'Forbidden' });
      if (req.method === 'GET' && url.pathname === '/api/tasks') {
        const data = await snapshot(ctx);
        return json(res, 200, { tasks: data.tasks.map((task) => view(task, data.state)) });
      }
      if (req.method === 'POST' && url.pathname === '/api/review') {
        const { id, action } = await requestBody(req);
        if (typeof id !== 'string' || typeof action !== 'string') throw new Error('Invalid request');
        await userReview(ctx, id, action);
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: 'Not found' });
    } catch (error) { return json(res, 400, { error: error.message }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/`;
  console.log(`IntMap handoff review: ${url}`);
  console.log('Close this terminal window to stop the review UI.');
  openBrowser(url);
}

async function status(ctx) {
  const data = await snapshot(ctx);
  console.log(`Handoff: ${data.tasks.length} active task(s)`);
  console.log(`Source: ${ctx.handoffFile}`);
  console.log(`State: ${ctx.stateFile}`);
  for (const task of data.tasks) {
    const item = view(task, data.state);
    console.log(`- ${task.id}: Claude=${item.claudeComplete ? 'done' : 'pending'}, User=${item.userVerified ? 'verified' : 'pending'} — ${task.title}`);
  }
}

async function selfTest() {
  const root = path.join(os.tmpdir(), `intmap-handoff-${process.pid}-${randomUUID()}`);
  const ctx = context({ repoRoot: root, handoffDir: path.join(root, 'GPT-HANDOFF'), stateDir: path.join(root, 'state') });
  const task = `<!-- HANDOFF:TASK id="IM-001" -->\n## IM-001 — Test\n\n### Requirements\n- A\n\n### Done when\n- B\n<!-- HANDOFF:END id="IM-001" -->\n`;
  try {
    await init(ctx);
    await atomicWrite(ctx.handoffFile, TEMPLATE + task);
    if ((await snapshot(ctx)).tasks.length !== 1) throw new Error('parse failed');
    await claudeDone(ctx, ['IM-001']);
    let data = await snapshot(ctx);
    if (!view(data.tasks[0], data.state).claudeComplete) throw new Error('completion failed');
    await userReview(ctx, 'IM-001', 'approve');
    await prepare(ctx, true);
    if ((await snapshot(ctx)).tasks.length !== 0) throw new Error('compaction failed');
    if (!(await exists(ctx.archiveFile))) throw new Error('archive missing');

    await atomicWrite(ctx.handoffFile, TEMPLATE + task);
    await claudeDone(ctx, ['IM-001']);
    await atomicWrite(ctx.handoffFile, TEMPLATE + task.replace('- A', '- A changed'));
    data = await snapshot(ctx);
    if (view(data.tasks[0], data.state).claudeComplete) throw new Error('changed spec did not invalidate completion');
    console.log('handoff self-test: PASS');
  } finally { await rm(root, { recursive: true, force: true }); }
}

async function main() {
  const ctx = context();
  const [command = 'status', ...args] = process.argv.slice(2);
  if (command === 'init') {
    await init(ctx);
    console.log(`GPT folder: ${ctx.handoffDir}`);
    console.log(`Edit target: ${ctx.handoffFile}`);
    console.log('Open only that GPT folder in ChatGPT Work.');
  } else if (command === 'prepare') await prepare(ctx);
  else if (command === 'status') await status(ctx);
  else if (command === 'claude-done') await claudeDone(ctx, args);
  else if (command === 'ui') await ui(ctx);
  else if (command === 'self-test') await selfTest();
  else throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => { console.error(`handoff: ${error.message}`); process.exitCode = 1; });

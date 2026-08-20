#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  appendFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const TASK_RE = /<!--\s*HANDOFF:TASK\s+id="([A-Za-z0-9_-]+)"\s*-->\s*([\s\S]*?)<!--\s*HANDOFF:END\s+id="\1"\s*-->/g;
const VALID_ID = /^[A-Za-z][A-Za-z0-9_-]*-\d{3,}$/;

const TEMPLATE = `# IntMap → Claude Handoff

<!-- GPT-EDITOR-CONTRACT
This file is the single semantic handoff from ChatGPT to Claude for IntMap implementation work.

ChatGPT owns this file. When the user gives fragments, observations, screenshots, comparisons, changed ideas, or new requirements over time, continuously refactor those inputs into clear implementation tasks here rather than merely appending a chat transcript.

Rules for ChatGPT:
- Edit only this HANDOFF.md when this folder is the granted local Work scope.
- Keep only implementation-relevant requirements. Remove duplication and reconcile later user changes with earlier text.
- Do not mark Claude completion or user verification in this file; state is managed mechanically elsewhere.
- Keep stable task IDs. Create a new ID only for a genuinely separate implementation task.
- A task must be enclosed by the exact markers shown below so the bridge can track it.
- Do not edit or remove the marker syntax.
- Do not add status checkboxes; the review UI owns status.

Task format:
<!-- HANDOFF:TASK id="IM-001" -->
## IM-001 — Short title

### Requirements
- ...

### Done when
- ...
<!-- HANDOFF:END id="IM-001" -->

The task format above is an example inside this comment, not an active task.
GPT-EDITOR-CONTRACT -->

`;

function canonicalRepoRoot() {
  if (process.env.INTMAP_CANONICAL_REPO) return path.resolve(process.env.INTMAP_CANONICAL_REPO);
  const oneDrive = path.join(os.homedir(), 'OneDrive', 'IntMap');
  if (existsSync(path.join(oneDrive, 'CLAUDE.md'))) return oneDrive;
  return REPO_ROOT;
}

function makeContext(overrides = {}) {
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

async function fileExists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function writeAtomic(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, content, 'utf8');
  try {
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

async function ensureInitialized(ctx) {
  await mkdir(ctx.handoffDir, { recursive: true });
  await mkdir(ctx.stateDir, { recursive: true });
  if (!(await fileExists(ctx.handoffFile))) await writeAtomic(ctx.handoffFile, TEMPLATE);
  if (!(await fileExists(ctx.stateFile))) {
    await writeAtomic(ctx.stateFile, `${JSON.stringify({ version: 1, tasks: {} }, null, 2)}\n`);
  }
}

function normalizedForHash(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

function hashTask(raw) {
  return createHash('sha256').update(normalizedForHash(raw), 'utf8').digest('hex');
}

function parseTasks(document) {
  const tasks = [];
  const seen = new Set();
  TASK_RE.lastIndex = 0;
  let match;
  while ((match = TASK_RE.exec(document))) {
    const id = match[1];
    if (!VALID_ID.test(id)) throw new Error(`Invalid handoff task id: ${id}`);
    if (seen.has(id)) throw new Error(`Duplicate handoff task id: ${id}`);
    seen.add(id);
    const raw = match[0];
    const body = match[2].trim();
    const heading = body.match(/^##\s+(.+)$/m)?.[1]?.trim() || id;
    tasks.push({
      id,
      title: heading,
      body,
      raw,
      hash: hashTask(raw),
      start: match.index,
      end: match.index + raw.length,
    });
  }
  return tasks;
}

async function readState(ctx) {
  await ensureInitialized(ctx);
  try {
    const parsed = JSON.parse(await readFile(ctx.stateFile, 'utf8'));
    if (!parsed || parsed.version !== 1 || typeof parsed.tasks !== 'object' || !parsed.tasks) {
      throw new Error('unsupported schema');
    }
    return parsed;
  } catch (error) {
    throw new Error(`Cannot read handoff state (${ctx.stateFile}): ${error.message}`);
  }
}

async function saveState(ctx, state) {
  await writeAtomic(ctx.stateFile, `${JSON.stringify(state, null, 2)}\n`);
}

function syncState(state, tasks) {
  const taskIds = new Set(tasks.map((task) => task.id));
  let changed = false;

  for (const task of tasks) {
    if (!state.tasks[task.id]) {
      state.tasks[task.id] = {
        claudeComplete: false,
        userVerified: false,
        completedHash: null,
        claudeCompletedAt: null,
        userVerifiedAt: null,
        reworkRequestedAt: null,
      };
      changed = true;
    }
    const entry = state.tasks[task.id];
    if (entry.claudeComplete && entry.completedHash !== task.hash) {
      entry.claudeComplete = false;
      entry.userVerified = false;
      entry.completedHash = null;
      entry.claudeCompletedAt = null;
      entry.userVerifiedAt = null;
      changed = true;
    }
  }

  for (const id of Object.keys(state.tasks)) {
    if (!taskIds.has(id)) {
      delete state.tasks[id];
      changed = true;
    }
  }
  return changed;
}

async function readSnapshot(ctx, { saveSyncedState = true } = {}) {
  await ensureInitialized(ctx);
  const document = await readFile(ctx.handoffFile, 'utf8');
  const tasks = parseTasks(document);
  const state = await readState(ctx);
  const changed = syncState(state, tasks);
  if (changed && saveSyncedState) await saveState(ctx, state);
  return { document, tasks, state };
}

function taskView(task, state) {
  const entry = state.tasks[task.id];
  const specCurrent = Boolean(entry?.claudeComplete && entry.completedHash === task.hash);
  return {
    id: task.id,
    title: task.title,
    claudeComplete: Boolean(entry?.claudeComplete && specCurrent),
    userVerified: Boolean(entry?.userVerified && specCurrent),
    specCurrent,
    claudeCompletedAt: entry?.claudeCompletedAt || null,
    userVerifiedAt: entry?.userVerifiedAt || null,
  };
}

async function appendArchive(ctx, tasks) {
  if (!tasks.length) return;
  await mkdir(ctx.stateDir, { recursive: true });
  const stamp = new Date().toISOString();
  let text = `\n\n# Archived ${stamp}\n`;
  for (const task of tasks) text += `\n${task.raw.trim()}\n`;
  await appendFile(ctx.archiveFile, text, 'utf8');
}

async function prepare(ctx, { quiet = false } = {}) {
  const snapshot = await readSnapshot(ctx);
  const done = snapshot.tasks.filter((task) => {
    const entry = snapshot.state.tasks[task.id];
    return entry?.claudeComplete && entry?.userVerified && entry.completedHash === task.hash;
  });

  let document = snapshot.document;
  let state = snapshot.state;

  if (done.length) {
    const liveBeforeWrite = await readFile(ctx.handoffFile, 'utf8');
    if (liveBeforeWrite !== snapshot.document) {
      throw new Error('HANDOFF.md changed while preparing. Nothing was removed; rerun prepare.');
    }

    await appendArchive(ctx, done);
    const ranges = done
      .map((task) => ({ start: task.start, end: task.end }))
      .sort((a, b) => b.start - a.start);
    for (const range of ranges) document = `${document.slice(0, range.start)}${document.slice(range.end)}`;
    document = document.replace(/\n{4,}/g, '\n\n\n').trimEnd() + '\n';
    await writeAtomic(ctx.handoffFile, document);
    for (const task of done) delete state.tasks[task.id];
    await saveState(ctx, state);
  }

  const current = await readSnapshot(ctx);
  if (!quiet) {
    console.log(`Handoff: ${current.tasks.length} active task(s)`);
    console.log(`Source: ${ctx.handoffFile}`);
    for (const task of current.tasks) {
      const view = taskView(task, current.state);
      const status = view.claudeComplete ? (view.userVerified ? 'verified' : 'awaiting user verification') : 'ready for Claude';
      console.log(`- ${task.id}: ${task.title} [${status}]`);
    }
    if (done.length) console.log(`Archived and removed ${done.length} fully verified task(s).`);
  }
  return current;
}

async function markClaudeDone(ctx, ids) {
  if (!ids.length) throw new Error('Usage: node scripts/handoff.mjs claude-done <TASK-ID> [...]');
  const snapshot = await readSnapshot(ctx);
  const byId = new Map(snapshot.tasks.map((task) => [task.id, task]));
  const now = new Date().toISOString();
  for (const id of ids) {
    const task = byId.get(id);
    if (!task) throw new Error(`Active handoff task not found: ${id}`);
    const entry = snapshot.state.tasks[id];
    entry.claudeComplete = true;
    entry.userVerified = false;
    entry.completedHash = task.hash;
    entry.claudeCompletedAt = now;
    entry.userVerifiedAt = null;
    entry.reworkRequestedAt = null;
  }
  await saveState(ctx, snapshot.state);
  console.log(`Claude completion recorded: ${ids.join(', ')}`);
}

async function setUserReview(ctx, id, action) {
  const snapshot = await readSnapshot(ctx);
  const task = snapshot.tasks.find((candidate) => candidate.id === id);
  if (!task) throw new Error(`Active handoff task not found: ${id}`);
  const entry = snapshot.state.tasks[id];
  const now = new Date().toISOString();

  if (action === 'approve') {
    if (!entry.claudeComplete || entry.completedHash !== task.hash) {
      throw new Error('Claude has not completed the current version of this task yet.');
    }
    entry.userVerified = true;
    entry.userVerifiedAt = now;
    entry.reworkRequestedAt = null;
  } else if (action === 'rework') {
    entry.claudeComplete = false;
    entry.userVerified = false;
    entry.completedHash = null;
    entry.claudeCompletedAt = null;
    entry.userVerifiedAt = null;
    entry.reworkRequestedAt = now;
  } else {
    throw new Error(`Unknown review action: ${action}`);
  }

  await saveState(ctx, snapshot.state);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function uiHtml() {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>IntMap Handoff Review</title>
<style>
:root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light dark;background:#f5f5f7;color:#1d1d1f}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#f5f5f7;color:#1d1d1f}
main{width:min(760px,100%);margin:0 auto;padding:32px 18px 80px}header{padding:8px 4px 20px}h1{font-size:30px;line-height:1.15;margin:0 0 8px;font-weight:750;letter-spacing:-.02em}header p{margin:0;color:#6e6e73;font-size:15px}.grid{display:grid;gap:14px}.card{background:rgba(255,255,255,.92);border:1px solid rgba(0,0,0,.06);border-radius:24px;padding:20px;box-shadow:0 10px 35px rgba(0,0,0,.06)}.task-title{font-size:18px;font-weight:700;line-height:1.35;margin:0}.id{font-size:12px;color:#86868b;margin-bottom:6px;font-variant-numeric:tabular-nums}.status{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 18px}.pill{border-radius:999px;padding:7px 10px;font-size:12px;font-weight:650;background:#ececf0;color:#515154}.pill.done{background:#e6f6ea;color:#19713a}.pill.wait{background:#fff3d6;color:#8a5a00}.actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}button{appearance:none;border:0;border-radius:15px;padding:14px 12px;font:inherit;font-weight:700;cursor:pointer;transition:transform .08s ease,opacity .2s ease;background:#007aff;color:white}button:active{transform:scale(.985)}button.secondary{background:#ececf0;color:#1d1d1f}button:disabled{opacity:.38;cursor:not-allowed}.empty{padding:44px 20px;text-align:center;color:#6e6e73}.error{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1d1d1f;color:white;border-radius:14px;padding:11px 14px;max-width:calc(100% - 32px);font-size:13px;display:none}
@media(prefers-color-scheme:dark){:root,body{background:#000;color:#f5f5f7}.card{background:#1c1c1e;border-color:#2c2c2e;box-shadow:none}.id,header p,.empty{color:#98989d}.pill{background:#2c2c2e;color:#d1d1d6}.pill.done{background:#153c22;color:#78d993}.pill.wait{background:#493714;color:#ffd36a}button.secondary{background:#2c2c2e;color:#f5f5f7}}
@media(max-width:520px){main{padding-top:20px}.actions{grid-template-columns:1fr}.card{border-radius:20px}}
</style>
</head>
<body>
<main><header><h1>IntMap Handoff</h1><p>確認したら、押すだけです。</p></header><section id="tasks" class="grid"></section></main><div id="error" class="error"></div>
<script>
const root=document.getElementById('tasks');const err=document.getElementById('error');
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
async function api(url,opts){const r=await fetch(url,{cache:'no-store',...opts});const j=await r.json();if(!r.ok)throw new Error(j.error||'Request failed');return j}
function showError(message){err.textContent=message;err.style.display='block';clearTimeout(showError.t);showError.t=setTimeout(()=>err.style.display='none',3500)}
async function review(id,action){try{await api('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action})});await refresh()}catch(e){showError(e.message)}}
async function refresh(){try{const data=await api('/api/tasks');if(!data.tasks.length){root.innerHTML='<div class="card empty">確認待ちはありません。</div>';return}root.innerHTML=data.tasks.map(t=>{const status=t.claudeComplete?(t.userVerified?'あなたの確認済み':'Claude 実装済み'):'Claude 実装待ち';const cls=t.userVerified||t.claudeComplete?'done':'wait';return '<article class="card"><div class="id">'+esc(t.id)+'</div><h2 class="task-title">'+esc(t.title)+'</h2><div class="status"><span class="pill '+cls+'">'+esc(status)+'</span></div><div class="actions"><button '+(!t.claudeComplete||t.userVerified?'disabled':'')+' onclick="review(\''+esc(t.id)+'\',\'approve\')">✓ 確認OK</button><button class="secondary" onclick="review(\''+esc(t.id)+'\',\'rework\')">↩ 修正必要</button></div></article>'}).join('')}catch(e){showError(e.message)}}
refresh();setInterval(refresh,2000);
</script>
</body></html>`;
}

async function readJsonBody(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 16_384) throw new Error('Request body too large');
  }
  return text ? JSON.parse(text) : {};
}

function openBrowser(url) {
  try {
    let command;
    let args;
    if (process.platform === 'win32') {
      command = 'cmd';
      args = ['/c', 'start', '', url];
    } else if (process.platform === 'darwin') {
      command = 'open';
      args = [url];
    } else {
      command = 'xdg-open';
      args = [url];
    }
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
  } catch {
    // The URL is printed even if automatic browser opening is unavailable.
  }
}

async function startUi(ctx) {
  await prepare(ctx, { quiet: true });
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/') {
        const html = uiHtml();
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': Buffer.byteLength(html),
          'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
        });
        res.end(html);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/tasks') {
        const snapshot = await readSnapshot(ctx);
        sendJson(res, 200, { tasks: snapshot.tasks.map((task) => taskView(task, snapshot.state)) });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/review') {
        const { id, action } = await readJsonBody(req);
        if (typeof id !== 'string' || typeof action !== 'string') throw new Error('Invalid review request');
        await setUserReview(ctx, id, action);
        sendJson(res, 200, { ok: true });
        return;
      }
      sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/`;
  console.log(`IntMap handoff review: ${url}`);
  console.log('Close this terminal window to stop the review UI.');
  openBrowser(url);
}

async function printStatus(ctx) {
  const snapshot = await readSnapshot(ctx);
  console.log(`Handoff: ${snapshot.tasks.length} active task(s)`);
  console.log(`Source: ${ctx.handoffFile}`);
  console.log(`State: ${ctx.stateFile}`);
  for (const task of snapshot.tasks) {
    const view = taskView(task, snapshot.state);
    console.log(`- ${task.id}: Claude=${view.claudeComplete ? 'done' : 'pending'}, User=${view.userVerified ? 'verified' : 'pending'} — ${task.title}`);
  }
}

async function selfTest() {
  const base = path.join(os.tmpdir(), `intmap-handoff-test-${process.pid}-${randomUUID()}`);
  const ctx = makeContext({
    repoRoot: base,
    handoffDir: path.join(base, 'GPT-HANDOFF'),
    stateDir: path.join(base, 'state'),
  });
  try {
    await ensureInitialized(ctx);
    const task = `<!-- HANDOFF:TASK id="IM-001" -->\n## IM-001 — Test task\n\n### Requirements\n- A\n\n### Done when\n- B\n<!-- HANDOFF:END id="IM-001" -->\n`;
    await writeAtomic(ctx.handoffFile, `${TEMPLATE}${task}`);
    let snapshot = await readSnapshot(ctx);
    if (snapshot.tasks.length !== 1) throw new Error('parse failed');
    await markClaudeDone(ctx, ['IM-001']);
    snapshot = await readSnapshot(ctx);
    if (!taskView(snapshot.tasks[0], snapshot.state).claudeComplete) throw new Error('Claude completion failed');
    await setUserReview(ctx, 'IM-001', 'approve');
    await prepare(ctx, { quiet: true });
    snapshot = await readSnapshot(ctx);
    if (snapshot.tasks.length !== 0) throw new Error('verified task was not compacted');
    if (!(await fileExists(ctx.archiveFile))) throw new Error('archive was not created');

    await writeAtomic(ctx.handoffFile, `${TEMPLATE}${task}`);
    await markClaudeDone(ctx, ['IM-001']);
    const changedTask = task.replace('- A', '- A changed');
    await writeAtomic(ctx.handoffFile, `${TEMPLATE}${changedTask}`);
    snapshot = await readSnapshot(ctx);
    if (taskView(snapshot.tasks[0], snapshot.state).claudeComplete) throw new Error('spec change did not invalidate completion');
    console.log('handoff self-test: PASS');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}

async function main() {
  const ctx = makeContext();
  const [command = 'status', ...args] = process.argv.slice(2);
  switch (command) {
    case 'init':
      await ensureInitialized(ctx);
      console.log(`GPT folder: ${ctx.handoffDir}`);
      console.log(`Edit target: ${ctx.handoffFile}`);
      console.log('Open only the GPT folder in ChatGPT Work. It contains the single GPT-owned handoff file.');
      break;
    case 'prepare':
      await prepare(ctx);
      break;
    case 'status':
      await printStatus(ctx);
      break;
    case 'claude-done':
      await markClaudeDone(ctx, args);
      break;
    case 'ui':
      await startUi(ctx);
      break;
    case 'self-test':
      await selfTest();
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(`handoff: ${error.message}`);
  process.exitCode = 1;
});

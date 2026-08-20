#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const REPOSITORY = 'rwmqx7dwb5-arch/IntMap';
const ISSUE_NUMBER = 225;
const TRUSTED_AUTHOR = 'rwmqx7dwb5-arch';
const VALID_ID = /^[A-Za-z][A-Za-z0-9_-]*-\d{3,}$/;
const TASK_RE = /<!--\s*HANDOFF:TASK\s+id="([A-Za-z0-9_-]+)"\s*-->\s*([\s\S]*?)<!--\s*HANDOFF:END\s+id="\1"\s*-->/g;
const EVENT_RE = /<!--\s*INTMAP-HANDOFF-EVENT\s+v=1\s+action=(upsert|cancel)\s+task=([A-Za-z0-9_-]+)\s*-->\s*([\s\S]*?)<!--\s*INTMAP-HANDOFF-EVENT-END\s*-->/g;

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
    archiveFile: path.join(stateDir, 'archive.md'),
    inboxStateFile: path.join(stateDir, 'inbox-state.json'),
  };
}

async function writeAtomic(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, content, 'utf8');
  try {
    const { rename } = await import('node:fs/promises');
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

function ensureHandoffInitialized(ctx) {
  if (existsSync(ctx.handoffFile)) return;
  const result = spawnSync(process.execPath, [path.join(ctx.repoRoot, 'scripts', 'handoff.mjs'), 'init'], {
    cwd: ctx.repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      INTMAP_HANDOFF_DIR: ctx.handoffDir,
      INTMAP_HANDOFF_STATE_DIR: ctx.stateDir,
      INTMAP_CANONICAL_REPO: ctx.repoRoot,
    },
  });
  if (result.status !== 0 || !existsSync(ctx.handoffFile)) {
    throw new Error('Could not initialize the local HANDOFF workspace.');
  }
}

async function readInboxState(ctx) {
  await mkdir(ctx.stateDir, { recursive: true });
  if (!existsSync(ctx.inboxStateFile)) return { version: 1, applied: {} };
  const parsed = JSON.parse(await readFile(ctx.inboxStateFile, 'utf8'));
  if (!parsed || parsed.version !== 1 || typeof parsed.applied !== 'object' || !parsed.applied) {
    throw new Error(`Unsupported inbox state: ${ctx.inboxStateFile}`);
  }
  return parsed;
}

function archivedTaskIds(text) {
  const ids = new Set();
  TASK_RE.lastIndex = 0;
  let match;
  while ((match = TASK_RE.exec(text || ''))) ids.add(match[1]);
  return ids;
}

function taskRanges(document) {
  const out = new Map();
  TASK_RE.lastIndex = 0;
  let match;
  while ((match = TASK_RE.exec(document))) {
    out.set(match[1], { start: match.index, end: match.index + match[0].length, raw: match[0] });
  }
  return out;
}

function parseCommentEvents(comment) {
  if (comment?.user?.login !== TRUSTED_AUTHOR) return [];
  const body = String(comment?.body || '');
  const events = [];
  EVENT_RE.lastIndex = 0;
  let match;
  while ((match = EVENT_RE.exec(body))) {
    const [, action, taskId, payload] = match;
    if (!VALID_ID.test(taskId)) continue;
    if (action === 'cancel') {
      events.push({ action, taskId, commentId: Number(comment.id), rawTask: null });
      continue;
    }
    const tasks = [...payload.matchAll(new RegExp(TASK_RE.source, 'g'))];
    if (tasks.length !== 1 || tasks[0][1] !== taskId) continue;
    events.push({ action, taskId, commentId: Number(comment.id), rawTask: tasks[0][0].trim() });
  }
  return events;
}

async function fetchAllComments() {
  const [owner, repo] = REPOSITORY.split('/');
  const all = [];
  for (let page = 1; page <= 50; page += 1) {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${ISSUE_NUMBER}/comments?per_page=100&page=${page}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'IntMap-handoff-inbox',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!response.ok) throw new Error(`GitHub inbox fetch failed: HTTP ${response.status}`);
    const pageItems = await response.json();
    if (!Array.isArray(pageItems)) throw new Error('GitHub inbox returned an unexpected payload.');
    all.push(...pageItems);
    if (pageItems.length < 100) break;
  }
  return all;
}

async function applyComments(ctx, comments, { quiet = false } = {}) {
  ensureHandoffInitialized(ctx);
  const [document, state, archive] = await Promise.all([
    readFile(ctx.handoffFile, 'utf8'),
    readInboxState(ctx),
    existsSync(ctx.archiveFile) ? readFile(ctx.archiveFile, 'utf8') : Promise.resolve(''),
  ]);

  const archived = archivedTaskIds(archive);
  const events = comments
    .flatMap(parseCommentEvents)
    .filter((event) => Number.isFinite(event.commentId))
    .sort((a, b) => a.commentId - b.commentId);

  let nextDocument = document;
  let appliedCount = 0;
  let ignoredArchived = 0;

  for (const event of events) {
    const lastApplied = Number(state.applied[event.taskId] || 0);
    if (event.commentId <= lastApplied) continue;

    if (archived.has(event.taskId)) {
      state.applied[event.taskId] = event.commentId;
      ignoredArchived += 1;
      continue;
    }

    const ranges = taskRanges(nextDocument);
    const existing = ranges.get(event.taskId);

    if (event.action === 'cancel') {
      if (existing) {
        nextDocument = `${nextDocument.slice(0, existing.start)}${nextDocument.slice(existing.end)}`
          .replace(/\n{4,}/g, '\n\n\n')
          .trimEnd() + '\n';
      }
    } else if (existing) {
      nextDocument = `${nextDocument.slice(0, existing.start)}${event.rawTask}${nextDocument.slice(existing.end)}`;
    } else {
      nextDocument = `${nextDocument.trimEnd()}\n\n${event.rawTask}\n`;
    }

    state.applied[event.taskId] = event.commentId;
    appliedCount += 1;
  }

  if (nextDocument !== document) await writeAtomic(ctx.handoffFile, nextDocument);
  await writeAtomic(ctx.inboxStateFile, `${JSON.stringify(state, null, 2)}\n`);

  if (!quiet) {
    console.log(`Global GPT inbox: ${appliedCount} new event(s) applied from IntMap issue #${ISSUE_NUMBER}.`);
    if (ignoredArchived) console.log(`Ignored ${ignoredArchived} event(s) for already user-verified task IDs.`);
    console.log(`Local handoff: ${ctx.handoffFile}`);
  }
  return { appliedCount, ignoredArchived, document: nextDocument, state };
}

async function pull(ctx) {
  const comments = await fetchAllComments();
  return applyComments(ctx, comments);
}

async function selfTest() {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'intmap-handoff-inbox-'));
  const ctx = makeContext({
    repoRoot: REPO_ROOT,
    handoffDir: path.join(temp, 'handoff'),
    stateDir: path.join(temp, 'state'),
  });
  await mkdir(ctx.handoffDir, { recursive: true });
  await mkdir(ctx.stateDir, { recursive: true });
  await writeFile(ctx.handoffFile, '# Test\n\n<!-- HANDOFF:TASK id="IM-20260821-001" -->\n## IM-20260821-001 — Local draft\n\n### Requirements\n- local\n\n### Done when\n- local\n<!-- HANDOFF:END id="IM-20260821-001" -->\n', 'utf8');

  const event = (id, body, user = TRUSTED_AUTHOR) => ({ id, user: { login: user }, body });
  const upsert = (taskId, title, detail) => `<!-- INTMAP-HANDOFF-EVENT v=1 action=upsert task=${taskId} -->\n<!-- HANDOFF:TASK id="${taskId}" -->\n## ${taskId} — ${title}\n\n### Requirements\n- ${detail}\n\n### Done when\n- done\n<!-- HANDOFF:END id="${taskId}" -->\n<!-- INTMAP-HANDOFF-EVENT-END -->`;
  const cancel = (taskId) => `<!-- INTMAP-HANDOFF-EVENT v=1 action=cancel task=${taskId} -->\n<!-- INTMAP-HANDOFF-EVENT-END -->`;

  const comments = [
    event(10, upsert('IM-20260821-001', 'Blocked attacker', 'bad'), 'someone-else'),
    event(11, upsert('IM-20260821-001', 'Global replacement', 'new requirement')),
    event(12, upsert('IM-20260821-002', 'Second task', 'second requirement')),
  ];

  const first = await applyComments(ctx, comments, { quiet: true });
  if (first.appliedCount !== 2) throw new Error(`self-test: expected 2 applied events, got ${first.appliedCount}`);
  if (!first.document.includes('Global replacement') || first.document.includes('Blocked attacker')) {
    throw new Error('self-test: trusted-author replacement failed');
  }
  if (!first.document.includes('Second task')) throw new Error('self-test: new task append failed');

  const second = await applyComments(ctx, comments, { quiet: true });
  if (second.appliedCount !== 0) throw new Error('self-test: inbox import is not idempotent');

  const third = await applyComments(ctx, [...comments, event(13, cancel('IM-20260821-002'))], { quiet: true });
  if (third.document.includes('Second task')) throw new Error('self-test: cancel did not remove task');

  await writeFile(ctx.archiveFile, '\n<!-- HANDOFF:TASK id="IM-20260821-003" -->\narchived\n<!-- HANDOFF:END id="IM-20260821-003" -->\n', 'utf8');
  const fourth = await applyComments(ctx, [...comments, event(13, cancel('IM-20260821-002')), event(14, upsert('IM-20260821-003', 'Should stay archived', 'no resurrection'))], { quiet: true });
  if (fourth.document.includes('Should stay archived')) throw new Error('self-test: archived task was resurrected');

  await rm(temp, { recursive: true, force: true });
  console.log('handoff-inbox self-test passed');
}

const command = process.argv[2] || 'pull';
const ctx = makeContext();

try {
  if (command === 'pull') await pull(ctx);
  else if (command === 'self-test') await selfTest();
  else throw new Error('Usage: node scripts/handoff-inbox.mjs [pull|self-test]');
} catch (error) {
  console.error(`handoff-inbox: ${error.message}`);
  process.exitCode = 1;
}

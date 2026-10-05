#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ONE COMMAND FOR EVERYTHING ONLY A MACHINE SHOULD HAVE TO REWRITE   (proportional-finish)
 * ----------------------------------------------------------------------------
 *  The full `npm test` run moved off the session's machine and onto the PR's CI (AGENTS.md §4). What
 *  that run used to catch BEFORE the push and what a person then fixed by hand was, very often, not a
 *  product defect but bookkeeping: a generated file older than its inputs, or a ratchet ledger that
 *  still says 7 after the change took the tree to 6 («lower the ledger: … --update»). Each has its
 *  own writer and nothing ran them together, so the bookkeeping red would now surface as a red CI
 *  run, twelve minutes later. This runs them, once, before the commit.
 *
 *  ⚠ NOTHING HERE IS A LIST. Both halves are read from .gitattributes through scripts/merge-driver.mjs
 *  `declarations()` — the one declaration git already requires for these paths:
 *    · `intmap-merge=regen` files: every `intmap-regen` command (a function of tracked inputs — always
 *      safe to run). `!` commands need a build, a browser or the network; they are printed, not run.
 *    · ledgers with `intmap-tighten=<writer>`: the writer runs, and its result is KEPT ONLY WHEN EVERY
 *      MOVE TIGHTENS — a number down, an array member gone (order kept), a key gone. Anything else —
 *      a number up, a new name, a new key, a changed sentence, a reordering — is put back byte for
 *      byte and named. That direction is the ratchet's whole question (merge-driver.mjs: «its
 *      `--update` would ACCEPT whatever the tree holds»), and a person answers it, with a reason.
 *      `intmap-tighten-info` names the top-level keys a writer keeps as context (no gate reads them);
 *      those may move either way.
 *  ⚠ A LEDGER WITH NO `intmap-tighten` IS NOT TOUCHED: a measurement (durations, start-up sizes) or a
 *    floor whose safe direction is UP (the i18n coverage floor) is not a count that only falls.
 *
 *      node scripts/regen.mjs           run it (npm run regen)
 *      node scripts/regen.mjs --plan    print what it would run, run nothing
 * ==========================================================================*/
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { declarations } from './merge-driver.mjs';

const NL = '\n';

/**
 * Does `after` only tighten `before`? Returns the JSON paths that moved the other way (empty = yes).
 * Numbers may fall; arrays may lose members in place (the result must be a subsequence); objects may
 * lose keys. Every other difference — and every type change — is a move a person has to judge.
 * `info` names top-level keys that are context, not the ratchet.
 */
export function loosenings(before, after, at = '$', info = []) {
  if (typeof before === 'number' && typeof after === 'number') return after <= before ? [] : [`${at}: ${before} → ${after}`];
  if (Array.isArray(before) && Array.isArray(after)) {
    const key = (v) => JSON.stringify(v);
    const b = before.map(key);
    let i = 0;
    for (const x of after.map(key)) {
      while (i < b.length && b[i] !== x) i++;
      if (i === b.length) return [`${at}: ${x.length > 60 ? x.slice(0, 57) + '…' : x} is new or out of order`];
      i++;
    }
    return [];
  }
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (isObj(before) && isObj(after)) {
    const out = [];
    for (const k of Object.keys(after)) {
      if (at === '$' && info.includes(k)) continue;
      if (!Object.prototype.hasOwnProperty.call(before, k)) out.push(`${at}.${k}: new`);
      else out.push(...loosenings(before[k], after[k], `${at}.${k}`));
    }
    return out;
  }
  return JSON.stringify(before) === JSON.stringify(after) ? [] : [`${at}: changed`];
}

/** what this would run, from the declarations — generators, then ledger writers */
export function plan(decls) {
  const gen = new Map(), manual = new Map(), ledgers = [];
  for (const d of decls) {
    if (d.kind === 'regen') for (const c of d.regen) (c.manual ? manual : gen).set(c.text, c);
    if (d.kind === 'json' && d.tighten && d.tighten.length) ledgers.push({ path: d.path, cmds: d.tighten, info: d.tightenInfo || [] });
  }
  return { generators: [...gen.values()], manual: [...manual.values()], ledgers };
}

/* ⚠ IN PARALLEL. Every command writes its own file (the declarations give each path one writer), and
   run one after another they cost 2 min 14 s — MEASURED 2026-10-05, of which global-surface --update
   alone is 53 s. Run together, the whole costs about the slowest one. */
const runNode = (c, cwd) => new Promise((done) => {
  if (!(c.argv[0] && c.argv[0].endsWith('.mjs'))) { done({ status: 1, out: 'only node scripts are run automatically' }); return; }
  const ch = spawn(process.execPath, c.argv, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  ch.stdout.on('data', (d) => { out += d; });
  ch.stderr.on('data', (d) => { out += d; });
  ch.on('error', (e) => done({ status: 1, out: e.message }));
  ch.on('close', (status) => done({ status, out }));
});
const tail = (r) => String(r.out || '').trim().split(NL).slice(-5).map((l) => '      ' + l).join(NL);

export async function regen(cwd, { log = (s) => process.stdout.write(s + NL), decls = null } = {}) {
  const p = plan(decls || declarations(cwd));
  let ok = true;
  const tightened = [], refused = [];
  const gens = p.generators.map(async (c) => {
    const r = await runNode(c, cwd);
    if (r.status !== 0) { ok = false; log(`  ✗ ${c.text}${NL}${tail(r)}`); }
  });
  const ledgers = p.ledgers.map(async (l) => {
    const file = resolve(cwd, l.path);
    const before = existsSync(file) ? readFileSync(file, 'utf8') : null;
    let failed = false;
    for (const c of l.cmds) {
      const r = await runNode(c, cwd);
      if (r.status !== 0) { failed = true; ok = false; log(`  ✗ ${c.text} (${l.path})${NL}${tail(r)}`); }
    }
    const after = existsSync(file) ? readFileSync(file, 'utf8') : null;
    if (after === before) return;
    let moves;
    try {
      moves = before == null || after == null ? ['(file appeared or vanished)'] : loosenings(JSON.parse(before), JSON.parse(after), '$', l.info);
    } catch (e) { moves = [`(not JSON: ${e.message})`]; }
    if (failed || moves.length) {
      if (before != null) writeFileSync(file, before);
      if (!failed) refused.push({ path: l.path, moves });
    } else tightened.push(l.path);
  });
  await Promise.all([...gens, ...ledgers]);

  log(`regen: 生成物 ${p.generators.length} 本を再生成・台帳 ${p.ledgers.length} 本を確認`);
  for (const t of tightened) log(`  ↓ ${t}: 締める方向だけだったので書き換えた`);
  for (const r of refused) {
    log(`  ⚠ ${r.path}: 緩む方向の変化があるので元に戻した——判断が要る（理由を記録に書いてから writer を自分で走らせる）`);
    for (const m of r.moves.slice(0, 6)) log(`      ${m}`);
    if (r.moves.length > 6) log(`      … ほか ${r.moves.length - 6} 件`);
  }
  for (const c of p.manual) log(`  · ここでは走らせない（build・ブラウザ・ネットワークが要る）: ${c.text}`);
  let changed = '';
  try { changed = execFileSync('git', ['status', '--short'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\s+$/, ''); } catch { /* not a checkout */ }
  if (changed) log('regen: 作業ツリーの変更（確認して commit する）:' + NL + '  ' + changed.split(NL).join(NL + '  '));
  return { ok, tightened, refused, manual: p.manual.map((c) => c.text) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cwd = process.cwd();
  if (process.argv.includes('--plan')) {
    const p = plan(declarations(cwd));
    for (const c of p.generators) console.log(`generator  ${c.text}`);
    for (const l of p.ledgers) console.log(`tighten    ${l.cmds.map((c) => c.text).join(' ; ')}  → ${l.path}${l.info.length ? `  (context: ${l.info.join(', ')})` : ''}`);
    for (const c of p.manual) console.log(`not run    ${c.text}`);
  } else {
    regen(cwd).then((r) => process.exit(r.ok ? 0 : 1));
  }
}

#!/usr/bin/env node
/* ============================================================================
 *  IntMap · A RED NIGHT IS HANDED TO THE CHANGE THAT CAUSED IT  (delivery-quality)
 * ----------------------------------------------------------------------------
 *  scripts/deep-alarm.mjs names what failed last night; scripts/deep-history.mjs tells a regression
 *  (the same test red night after night) from a wobble. Neither says WHOSE it is, and that was the
 *  step nobody took: MEASURED 2026-10-03, tests/restored-layer-before-style.spec.js had been red four
 *  nights running (since 2026-09-28) in issue #275, and the ten merges that landed between the last
 *  night it passed and the first night it failed were nowhere on the page. A regression with no
 *  owner is a regression the next session also walks past — the nightly has not been green since
 *  2026-08-08.
 *
 *  So every regression is turned into a RANGE and a list of SUSPECTS:
 *
 *    range    = (the last read night it passed, the first night of its red streak] — two commits,
 *               taken from the nights themselves (deep-history.mjs classify → `good` / `bad`)
 *    suspects = the first-parent commits on main inside that range (each one a squash-merged PR),
 *               each with the EVIDENCE that ties it to the test:
 *                 · it edited the spec itself, or a helper the spec imports
 *                 · it edited a file in the spec's REACH (scripts/spec-reach.mjs) — and which file,
 *                   and why that file is in the reach (the path, global or identifier the spec spells)
 *
 *  ⚠ A SUSPECT IS NOT A VERDICT. The reach is static and cannot see what a spec touches only through
 *  the app's boot, so a commit with no evidence is still listed (as a count) and still in the range.
 *  The VERDICT is measured, not inferred: scripts/nightly-bisect.mjs runs the failing test at every
 *  commit of the range (.github/workflows/nightly-bisect.yml), and `--dispatch` here starts that run
 *  — once per regression and range, never twice (the run's name carries the key).
 *
 *      node scripts/nightly-blame.mjs                    the regressions, their ranges and suspects
 *      node scripts/nightly-blame.mjs --json             the same as JSON (worktree.mjs status reads it)
 *      node scripts/nightly-blame.mjs --markdown <file>  the issue section deep-alarm.mjs appends
 *      node scripts/nightly-blame.mjs --dispatch         start the bisect for every regression that has none
 *      … --include-run <id>                              read this still-running nightly as the newest night (CI)
 * ==========================================================================*/
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { history, specOf } from './deep-history.mjs';
import { buildIndex, specReach } from './spec-reach.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

export const BISECT_WORKFLOW = 'nightly-bisect.yml';

/** The test's title as Playwright's `-g` wants it: the id minus its file. */
export const titleOf = (id) => String(id).split(' › ').slice(1).join(' › ');

/** The key that makes a bisect run unique: the test and its range. It is the run's NAME
    (nightly-bisect.yml `run-name`), so «has this been bisected» is a question to the run list,
    not to a file anybody has to keep. */
export function bisectKey(r) {
  return `${r.id} @ ${r.good && r.good.sha}..${r.bad && r.bad.sha}`;
}

/* ── the range, from git ───────────────────────────────────────────────────────────────────── */
const git = (args, cwd = REPO) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });

/** first-parent commits in (good, bad], oldest first, each with its PR number and changed files —
    or `null` when git cannot answer (a shallow clone, an unknown sha): «could not read the range» is
    never reported as «nothing landed in it». */
export function commitsBetween(good, bad, cwd = REPO) {
  if (!good || !bad) return null;
  let out;
  try { out = git(['log', '--first-parent', '--reverse', '--name-only', '--format=@@%H%x09%s', `${good}..${bad}`], cwd); }
  catch { return null; }
  return parseLog(out);
}

/** `git log --name-only --format=@@%H<TAB>%s` → commits. Exported for the test. */
export function parseLog(out) {
  const commits = [];
  for (const line of String(out).split(/\r?\n/)) {
    if (line.startsWith('@@')) {
      const [sha, ...rest] = line.slice(2).split('\t');
      const subject = rest.join('\t');
      const m = /\(#(\d+)\)\s*$/.exec(subject);
      commits.push({ sha, subject, pr: m ? +m[1] : null, files: [] });
    } else if (line.trim() && commits.length) {
      commits[commits.length - 1].files.push(line.trim().replace(/\\/g, '/'));
    }
  }
  return commits;
}

/**
 * Rank the commits of one regression's range by the evidence that ties each to the spec.
 * @param {{ spec:string, files:string[], why:Record<string,string[]> }} reach
 * @param {Array<{sha:string, subject:string, pr:number|null, files:string[]}>} commits
 */
export function suspects(reach, commits) {
  const inReach = new Set(reach.files);
  const ranked = commits.map((c) => {
    const touchesSpec = c.files.includes(reach.spec);
    const hits = c.files.filter((f) => inReach.has(f)).map((f) => ({ file: f, why: reach.why[f] || [] }));
    /* the spec edited is the strongest evidence a static reading has: the claim itself changed */
    const score = (touchesSpec ? 1000 : 0) + hits.length;
    return { ...c, touchesSpec, hits, score };
  });
  const withEvidence = ranked.filter((c) => c.score > 0).sort((a, b) => b.score - a.score);
  return { withEvidence, without: ranked.filter((c) => c.score === 0) };
}

/** Every regression of a history, with its range and suspects. */
export function blame(h, { cwd = REPO, index = null } = {}) {
  if (!h || !h.known) return { known: false, why: (h && h.why) || 'history unknown' };
  let idx = index;
  const out = [];
  for (const r of h.regressions || []) {
    const spec = specOf(r.id);
    const row = { id: r.id, spec, title: titleOf(r.id), streak: r.streak, since: r.since, good: r.good || null, bad: r.bad || null,
      goodWasFlaky: !!r.goodWasFlaky, key: bisectKey(r) };
    if (!r.good || !r.good.sha) { row.range = null; row.why = '窓の中に、この test が通った晩が無い（範囲を作らない）'; out.push(row); continue; }
    const commits = commitsBetween(r.good.sha, r.bad.sha, cwd);
    if (!commits) { row.range = null; row.why = `git が ${r.good.sha}..${r.bad.sha} を答えられない（shallow clone か未取得）`; out.push(row); continue; }
    if (!idx) idx = buildIndex(cwd);
    const reach = specReach(spec, idx);
    row.range = { commits: commits.length };
    Object.assign(row, suspects(reach, commits));
    out.push(row);
  }
  return { known: true, regressions: out, mended: (h.mended || []).length, sporadic: (h.sporadic || []).length, read: h.read, nights: h.nights };
}

/* ── words ─────────────────────────────────────────────────────────────────────────────────── */
const short = (s, w) => (String(s).length > w ? String(s).slice(0, w - 1) + '…' : String(s));
const evidence = (c) => [c.touchesSpec ? 'spec そのものを変えた' : null,
  ...c.hits.slice(0, 3).map((x) => `${x.file}（${x.why.slice(0, 2).join(', ')}）`)].filter(Boolean).join(' / ')
  + (c.hits.length > 3 ? ` ほか ${c.hits.length - 3}` : '');

export function render(b) {
  if (!b.known) return `nightly-blame: 不明（${b.why}）`;
  const L = [`nightly-blame — 連続で赤の test ${b.regressions.length} 件（直近 ${b.nights} 晩・読めた ${b.read} 晩）`];
  for (const r of b.regressions) {
    L.push('', `■ ${short(r.id, 120)}`, `  ${r.streak} 晩連続（${r.since} から）`);
    if (!r.range) { L.push(`  範囲: なし — ${r.why}`); continue; }
    L.push(`  範囲: ${r.good.sha}（${r.good.day} 通過${r.goodWasFlaky ? '・再試行で' : ''}）..${r.bad.sha}（${r.bad.day} 赤）— main の commit ${r.range.commits} 本`);
    if (!r.withEvidence.length) L.push('  静的な手がかりのある commit は無い（boot を通じて触れている可能性 → bisect が測る）');
    for (const c of r.withEvidence) L.push(`  ・${c.pr ? '#' + c.pr : c.sha.slice(0, 8)} ${short(c.subject.replace(/\s*\(#\d+\)\s*$/, ''), 70)}\n      ${evidence(c)}`);
    if (r.without.length) L.push(`  （手がかりの無い commit ${r.without.length} 本: ${r.without.map((c) => (c.pr ? '#' + c.pr : c.sha.slice(0, 8))).join(' ')}）`);
    L.push(`  確定させる: gh workflow run ${BISECT_WORKFLOW} -f test='${r.id.replace(/'/g, "'\\''")}' -f good=${r.good.sha} -f bad=${r.bad.sha}`);
  }
  return L.join('\n');
}

/** The section deep-alarm.mjs appends to the nightly issue. `#123` in an issue body puts a
    cross-reference on PR #123's own timeline — the suspect is told without a comment per night. */
export function markdown(b) {
  if (!b.known) return `### Regressions and their suspects\n\nThe history of the nights could not be read (${b.why}).\n`;
  const L = ['### Regressions and their suspects', ''];
  if (!b.regressions.length) {
    L.push(`No test has been red on two consecutive read nights (window: ${b.nights} nights, ${b.read} read). `
      + `${b.mended} were red night after night and passed on the newest; ${b.sporadic} failed sporadically — \`node scripts/deep-history.mjs\` lists them.`);
    return L.join('\n') + '\n';
  }
  for (const r of b.regressions) {
    L.push(`#### \`${r.id}\``, '', `Red ${r.streak} nights running, since ${r.since}.`, '');
    if (!r.range) { L.push(`No range: ${r.why}`, ''); continue; }
    L.push(`Range: \`${r.good.sha}\` (${r.good.day}, passed) .. \`${r.bad.sha}\` (${r.bad.day}, red) — ${r.range.commits} commit(s) on main.`, '');
    if (r.withEvidence.length) {
      L.push('| change | evidence |', '|---|---|');
      for (const c of r.withEvidence) {
        const ev = [c.touchesSpec ? 'edited the spec itself' : null, ...c.hits.slice(0, 4).map((x) => `\`${x.file}\` (${x.why.slice(0, 2).join(', ')})`)].filter(Boolean).join('; ');
        L.push(`| ${c.pr ? '#' + c.pr : '`' + c.sha.slice(0, 8) + '`'} ${c.subject.replace(/\|/g, '\\|').replace(/\s*\(#\d+\)\s*$/, '').slice(0, 90)} | ${ev} |`);
      }
      L.push('');
    } else {
      L.push('No commit in the range touches a file this spec names (the reach is static; the bisect measures the rest).', '');
    }
    if (r.without.length) L.push(`Also in the range, with no static evidence: ${r.without.map((c) => (c.pr ? '#' + c.pr : '`' + c.sha.slice(0, 8) + '`')).join(' ')}`, '');
    L.push(`The bisect (\`${BISECT_WORKFLOW}\`) runs this test alone at every commit of the range and names the first one it fails on.`, '');
  }
  return L.join('\n');
}

/* ── dispatch: once per regression and range ──────────────────────────────────────────────── */
const gh = (args) => execFileSync('gh', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The keys of the bisect runs that already exist (any state). The run NAME carries the key. */
export function existingKeys(runsJson) {
  let list; try { list = JSON.parse(runsJson); } catch { return new Set(); }
  return new Set((list || []).map((r) => String(r.displayTitle || r.name || '').replace(/^bisect:\s*/, '')));
}

/** which regressions need a bisect started: a range exists and no run carries its key */
export function toDispatch(b, keys) {
  if (!b.known) return [];
  return b.regressions.filter((r) => r.range && r.range.commits > 0 && !keys.has(r.key));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const val = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const h = await history({ budgetMs: +val('--budget') || 120000, includeRun: val('--include-run') });
  const b = blame(h);
  if (argv.includes('--json')) process.stdout.write(JSON.stringify(b) + '\n');
  else console.log(render(b));
  if (val('--markdown')) writeFileSync(val('--markdown'), markdown(b));
  if (argv.includes('--dispatch')) {
    let keys;
    try { keys = existingKeys(gh(['run', 'list', '--workflow', BISECT_WORKFLOW, '--limit', '200', '--json', 'displayTitle'])); }
    catch (e) {
      /* «could not list the runs» must not become «none exist» — that would start a duplicate every night */
      console.error(`nightly-blame: could not list ${BISECT_WORKFLOW} runs — starting nothing (${String(e.message || e).split('\n')[0]})`);
      process.exit(0);
    }
    const todo = toDispatch(b, keys);
    for (const r of todo) {
      try {
        gh(['workflow', 'run', BISECT_WORKFLOW, '-f', `test=${r.id}`, '-f', `good=${r.good.sha}`, '-f', `bad=${r.bad.sha}`]);
        console.log(`nightly-blame: bisect started — ${r.key}`);
      } catch (e) { console.error(`nightly-blame: could not start the bisect for ${r.key}: ${String(e.message || e).split('\n')[0]}`); }
    }
    if (!todo.length) console.log('nightly-blame: every regression with a range already has its bisect');
  }
}

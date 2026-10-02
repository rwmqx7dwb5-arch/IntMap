#!/usr/bin/env node
/* ============================================================================
 *  IntMap · A MERGE THAT ONLY A MACHINE SHOULD HAVE TO RESOLVE   (generated-file-merge-driver)
 * ----------------------------------------------------------------------------
 *  MEASURED 2026-10-01: fifteen pull requests landed in parallel, and each merge turned the others
 *  DIRTY. Nearly every conflict was in a file no person writes — tests/perf-baseline.json (every
 *  time), tests/global-surface-baseline.json, the GENERATED ROWS of js/atlas-capabilities.js, the
 *  Atlas cassettes, tests/durations.json, TOTAL_BUDGET_S in scripts/test-budget.mjs, plan(N) in
 *  supabase/tests/00_structure_test.sql, and the counts the documents state. The resolution was the
 *  same mechanical procedure every time (take main's side, rerun the generator, add the two moves of
 *  a count together) and it was done by hand more than thirty times.
 *
 *  This is that procedure, as a git merge driver. .gitattributes assigns it per path — the one list
 *  git itself requires, so the declaration lives there and nowhere else:
 *
 *      <path>  merge=intmap-generated  intmap-merge=<kind>  [intmap-clash=sum|upstream]  [intmap-regen=<cmd>[;<cmd>]]
 *
 *    json    A LEDGER. Three-way merge by key, and by member for an array of names. A key only one
 *            side moved takes that side; a number BOTH sides moved takes `intmap-clash`: `sum` adds
 *            the two moves (a count — the ratchet ledgers), `upstream` takes main's value and says
 *            so (a measurement — durations, start-up sizes). A ledger is never regenerated here: its
 *            `--update` would ACCEPT whatever the tree holds, which is the ratchet's whole question.
 *    regen   A FUNCTION OF TRACKED INPUTS. Conflicting hunks inside a GENERATED … BEGIN/END region
 *            (or anywhere, when the file has no region) take main's side, and the generator named
 *            by `intmap-regen` is recorded to run once the merge is done. A conflict OUTSIDE the
 *            region is somebody's code and is left to a person, with markers.
 *    tokens  HAND-WRITTEN TEXT THAT CARRIES COUNTS. Each conflicting hunk is merged again token by
 *            token: an integer both sides moved becomes base + both moves, an insertion both sides
 *            made at one place keeps both (main's first). Anything else stays a conflict.
 *
 *  ⚠ THE WORKING TREE IS NOT THE MERGED TREE WHILE A DRIVER RUNS. MEASURED (git 2.54, merge-ort):
 *    during `git merge`, a file only main changed still holds the branch's bytes when the driver is
 *    called — merge-ort merges in memory and writes the tree at the end. A generator run from inside
 *    the driver would therefore read the wrong inputs. So the driver records, and
 *        node scripts/merge-driver.mjs --finish
 *    runs the recorded generators AFTER the merge (or rebase) is complete; `worktree.mjs status`
 *    says when something is waiting.
 *  ⚠ WHICH SIDE IS MAIN. In `git merge origin/main` main is %B; in `git rebase origin/main` (and a
 *    cherry-pick) the checkout being built on is main's, so main is %A. MEASURED both ways.
 *  ⚠ ANY DOUBT IS A CONFLICT, NEVER A GUESS. Whatever this cannot resolve is written back with
 *    ordinary conflict markers and a non-zero exit, exactly what git would have done without it.
 *  ⚠ THE DRIVER IS CONFIGURATION, NOT A TRACKED FILE. git reads `merge.intmap-generated.driver`
 *    from the repository's config, which every worktree of a clone shares (measured). `--install`
 *    writes it idempotently; scripts/worktree.mjs (`new` and `status`, i.e. every session start in
 *    both products) and scripts/master-sync.mjs (`--sync`) call it.
 *
 *      node scripts/merge-driver.mjs --install      register the driver in this clone's config
 *      node scripts/merge-driver.mjs --finish       run what a merge recorded (generators, notes)
 *      node scripts/merge-driver.mjs --pending      print what a merge recorded, without running it
 *      node scripts/merge-driver.mjs --list         print every declared path with its kind
 *      node scripts/merge-driver.mjs %O %A %B %L %P (git calls this)
 * ==========================================================================*/
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const DRIVER = 'intmap-generated';
export const KINDS = ['json', 'regen', 'tokens'];
/* ⚠ RELATIVE ON PURPOSE: git runs the driver from the top of the worktree being merged, so each
   worktree runs ITS OWN copy of this file. A branch older than this file still has the config (it
   is shared) — then the `test -f` arm falls back to git's own textual merge, markers and all,
   instead of a driver that cannot start (which git would read as «conflict, keep %A as it is»:
   MEASURED — the file is left holding one side with no markers at all). */
export const DRIVER_CMD = 'test -f scripts/merge-driver.mjs && exec node scripts/merge-driver.mjs %O %A %B %L %P'
  + ' || exec git merge-file --marker-size=%L -L ours -L base -L theirs %A %O %B';
export const DRIVER_NAME = 'IntMap generated files, ledgers and counts (scripts/merge-driver.mjs)';
const PENDING = 'intmap-merge-pending.json';

const runGit = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
const qGit = (args, cwd) => { try { return runGit(args, cwd).trim(); } catch { return ''; } };

/* ══ INSTALL ══════════════════════════════════════════════════════════════════════════════════
   Idempotent: a key already holding the right value is not written. Returns what it changed, so a
   caller can stay silent on the common path. Throws nothing — a session start must not fail on it. */
export function install(cwd = process.cwd()) {
  const want = { [`merge.${DRIVER}.name`]: DRIVER_NAME, [`merge.${DRIVER}.driver`]: DRIVER_CMD };
  const changed = [];
  try {
    if (!qGit(['rev-parse', '--git-dir'], cwd)) return { ok: false, changed, why: 'not a git repository' };
    for (const [k, v] of Object.entries(want)) {
      if (qGit(['config', '--get', k], cwd) === v) continue;
      runGit(['config', '--local', k, v], cwd);
      changed.push(k);
    }
    return { ok: true, changed };
  } catch (e) {
    return { ok: false, changed, why: String(e.message || e).split('\n')[0] };
  }
}
export const installed = (cwd = process.cwd()) => qGit(['config', '--get', `merge.${DRIVER}.driver`], cwd) === DRIVER_CMD;

/* ══ DECLARATIONS — read from git, never restated ═════════════════════════════════════════════ */
const ATTRS = ['merge', 'intmap-merge', 'intmap-clash', 'intmap-regen'];
function parseCheckAttr(out) {
  const by = new Map();
  for (const line of out.split('\n')) {
    const m = /^(.*): ([\w-]+): (.*)$/.exec(line);
    if (!m) continue;
    if (!by.has(m[1])) by.set(m[1], {});
    if (m[3] !== 'unspecified') by.get(m[1])[m[2]] = m[3];
  }
  return by;
}
/** the declaration for one path (as git resolves .gitattributes for it) */
export function declarationOf(path, cwd = process.cwd()) {
  const d = parseCheckAttr(qGit(['check-attr', ...ATTRS, '--', path], cwd)).get(path) || {};
  return d.merge === DRIVER ? { path, kind: d['intmap-merge'] || null, clash: d['intmap-clash'] || 'upstream', regen: parseRegen(d['intmap-regen']) } : null;
}
/** every tracked path the driver is assigned to */
export function declarations(cwd = process.cwd()) {
  const files = qGit(['ls-files', '-z'], cwd).split('\0').filter(Boolean);
  const r = spawnSync('git', ['check-attr', '--stdin', ...ATTRS], { cwd, input: files.join('\n') + '\n', encoding: 'utf8', maxBuffer: 1 << 28 });
  const out = [];
  for (const [path, d] of parseCheckAttr(r.stdout || '')) {
    if (d.merge !== DRIVER) continue;
    out.push({ path, kind: d['intmap-merge'] || null, clash: d['intmap-clash'] || 'upstream', regen: parseRegen(d['intmap-regen']) });
  }
  return out;
}
/* `intmap-regen` is one attribute value, so it has no spaces: commands are separated by `;`, the
   words of a command by `,`, and a leading `!` marks a command this must NOT run by itself (it needs
   a build, a browser or the network) — it is printed for a person instead. */
export function parseRegen(v) {
  if (!v || v === 'set' || v === 'unset') return [];
  return v.split(';').filter(Boolean).map((c) => {
    const manual = c.startsWith('!');
    const argv = (manual ? c.slice(1) : c).split(',').filter(Boolean);
    return { manual, argv, text: (argv[0] && argv[0].endsWith('.mjs') ? 'node ' : '') + argv.join(' ') };
  });
}

/* ══ WHICH SIDE IS MAIN ════════════════════════════════════════════════════════════════════════ */
/* One git call for every path the driver needs (a process start costs ~0.1-0.3 s on Windows, and a
   merge calls the driver once per file). */
const STATE = ['rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', PENDING];
function repoState(cwd) {
  const out = qGit(['rev-parse', ...STATE.flatMap((n) => ['--git-path', n]), '--symbolic-full-name', 'HEAD'], cwd).split('\n');
  const paths = Object.fromEntries(STATE.map((n, i) => [n, out[i] ? resolve(cwd, out[i]) : null]));
  const replaying = STATE.slice(0, 4).some((n) => paths[n] && existsSync(paths[n]));
  return { up: replaying || out[STATE.length] === 'refs/heads/main' ? 'a' : 'b', pending: paths[PENDING] };
}

/* ══ LINES: split keeping the terminator, so bytes come back out exactly as they went in ══════ */
const lines = (s) => (s.length ? s.match(/[^\n]*\n|[^\n]+$/g) : []);

/** git's own three-way line merge, re-parsed into stable text and conflict hunks */
function mergeFile(A, O, B) {
  const SZ = 41;   /* a marker size no file here uses, so its own content is never mistaken for one */
  const r = spawnSync('git', ['merge-file', '-p', '--diff3', `--marker-size=${SZ}`, '-L', 'a', '-L', 'o', '-L', 'b', A, O, B], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status == null || r.status < 0 || r.error) throw new Error('git merge-file failed: ' + (r.stderr || r.error));
  const segs = []; let cur = null; let state = 'text';
  const open = '<'.repeat(SZ) + ' a', base = '|'.repeat(SZ) + ' o', sep = '='.repeat(SZ), close = '>'.repeat(SZ) + ' b';
  for (const ln of lines(r.stdout)) {
    const t = ln.replace(/\r?\n$/, '');
    if (state === 'text' && t === open) { cur = { a: [], o: [], b: [] }; state = 'a'; continue; }
    if (state === 'a' && t === base) { state = 'o'; continue; }
    if ((state === 'a' || state === 'o') && t === sep) { state = 'b'; continue; }
    if (state === 'b' && t === close) { segs.push({ conflict: cur }); cur = null; state = 'text'; continue; }
    if (state === 'text') { const last = segs[segs.length - 1]; if (last && last.text != null) last.text += ln; else segs.push({ text: ln }); }
    else cur[state].push(ln);
  }
  if (state !== 'text') throw new Error('unterminated conflict in git merge-file output');
  return segs;
}

/* the conflict as a person sees it — git's labels, git's marker size, git's style */
function markers(h, L, style) {
  const nl = (arr) => { const s = arr.join(''); return s && !s.endsWith('\n') ? s + '\n' : s; };
  return '<'.repeat(L) + ' ours\n' + nl(h.a)
    + (style === 'merge' ? '' : '|'.repeat(L) + ' base\n' + nl(h.o))
    + '='.repeat(L) + '\n' + nl(h.b) + '>'.repeat(L) + ' theirs\n';
}

/* ══ TOKENS — a three-way merge inside one conflict hunk ══════════════════════════════════════ */
const TOKEN = /\r?\n|[^\S\r\n]+|\d{1,3}(?:,\d{3})+(?!\d)|\d+|[\p{L}\p{M}_$][\p{L}\p{M}\p{N}_$]*|[^]/gu;
export const tokenize = (s) => s.match(TOKEN) || [];
const INT = /^(?:\d{1,3}(?:,\d{3})+|\d+)$/;
const intOf = (t) => Number(t.replace(/,/g, ''));
/* An integer is a COUNT only when nothing around it says otherwise: not a date or a range (2026-10-01,
   12-14), a time (12:30), a decimal (1.63), a path or ratio (3/4), a PR or anchor (#873), a
   percentage — and not written with a leading zero. This is a description of what a count looks
   like, not a list of files or words: anything it refuses stays a conflict for a person. */
function countAt(toks, i) {
  const t = toks[i];
  if (!INT.test(t) || (t.length > 1 && t[0] === '0')) return false;
  const p = toks[i - 1], n = toks[i + 1], dig = (x) => /^\d/.test(x || '');
  if (p === '#' || p === '.' || p === ':' || p === '/') return false;
  if (n === '.' && dig(toks[i + 2])) return false;
  if (n === ':' || n === '/' || n === '%') return false;
  if ((p === '-' && dig(toks[i - 2])) || (n === '-' && dig(toks[i + 2]))) return false;
  return true;
}

/** index map base→other from a longest common subsequence (prefix and suffix trimmed first) */
function lcsMap(o, x, limit = 6e6) {
  const map = new Int32Array(o.length).fill(-1);
  let s = 0; while (s < o.length && s < x.length && o[s] === x[s]) { map[s] = s; s++; }
  let eo = o.length, ex = x.length;
  while (eo > s && ex > s && o[eo - 1] === x[ex - 1]) { eo--; ex--; map[eo] = ex; }
  const n = eo - s, m = ex - s;
  if (n && m) {
    if (n * m > limit) return null;
    const W = m + 1, L = new Uint32Array((n + 1) * W);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
      L[i * W + j] = o[s + i] === x[s + j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
    }
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (o[s + i] === x[s + j]) { map[s + i] = s + j; i++; j++; }
      else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) i++; else j++;
    }
  }
  return map;
}
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Merge one hunk token by token. `up` names the side that is main ('a' or 'b').
 * Returns { text, notes } or null when any part of it is a real conflict.
 */
export function mergeTokens(oText, aText, bText, up = 'b') {
  const o = tokenize(oText), a = tokenize(aText), b = tokenize(bText);
  const ma = lcsMap(o, a), mb = lcsMap(o, b);
  if (!ma || !mb) return null;
  const out = []; const notes = [];
  let io = 0, ia = 0, ib = 0;
  for (;;) {
    let k = io; while (k < o.length && !(ma[k] >= ia && mb[k] >= ib)) k++;
    const ea = k < o.length ? ma[k] : a.length, eb = k < o.length ? mb[k] : b.length;
    const co = o.slice(io, k), ca = a.slice(ia, ea), cb = b.slice(ib, eb);
    if (co.length || ca.length || cb.length) {
      if (same(ca, co)) out.push(...cb);
      else if (same(cb, co) || same(ca, cb)) out.push(...ca);
      else {
        const r = resolveChunk(co, ca, cb, { o, a, b, io, ia, ib }, up);
        if (!r) return null;
        out.push(...r.toks); if (r.note) notes.push(r.note);
      }
    }
    if (k >= o.length) break;
    out.push(o[k]); io = k + 1; ia = ea + 1; ib = eb + 1;
  }
  return { text: out.join(''), notes };
}

function resolveChunk(co, ca, cb, ctx, up) {
  const [U, X] = up === 'a' ? [ca, cb] : [cb, ca];
  /* ① both sides inserted at the same place, deleting nothing: keep both, main's first. Whole lines
     are merged as lines, so a line both sides added appears once. */
  if (!co.length) {
    const u = U.join(''), x = X.join('');
    if (u.startsWith(x) || u.endsWith(x)) return { toks: U };
    if (x.startsWith(u) || x.endsWith(u)) return { toks: X };
    if (u.endsWith('\n') && x.endsWith('\n')) {
      const ul = lines(u), seen = new Set(ul);
      const merged = ul.concat(lines(x).filter((l) => !seen.has(l)));
      return { toks: [merged.join('')], note: `kept both insertions (${ul.length} + ${merged.length - ul.length} line(s))` };
    }
    return { toks: [u, x], note: 'kept both insertions' };
  }
  /* ② one integer that both sides moved: base + both moves — only when it reads as a count */
  if (co.length === 1 && ca.length === 1 && cb.length === 1
      && countAt(ctx.o, ctx.io) && countAt(ctx.a, ctx.ia) && countAt(ctx.b, ctx.ib)) {
    const n0 = intOf(co[0]), na = intOf(ca[0]), nb = intOf(cb[0]);
    const v = na + nb - n0;
    if (v < 0) return null;
    const grouped = [co[0], ca[0], cb[0]].some((t) => t.includes(','));
    const s = grouped ? v.toLocaleString('en-US') : String(v);
    return { toks: [s], note: `${co[0]} → ${s} (one side ${ca[0]}, the other ${cb[0]}: both moves added)` };
  }
  return null;
}

/* ══ JSON — a three-way merge of a ledger ═════════════════════════════════════════════════════ */
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const prim = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const sortedByCodeUnit = (arr) => arr.every((v, i) => i === 0 || String(arr[i - 1]) <= String(v));
class Clash extends Error {}

/**
 * Three-way merge of parsed JSON. `up` is 'a' or 'b'; `clash` is 'sum' or 'upstream'.
 * Returns { value, notes, tookUpstream } or throws Clash.
 */
export function mergeJson(o, a, b, { up = 'b', clash = 'upstream' } = {}) {
  const notes = []; let tookUpstream = 0;
  const walk = (o, a, b, at) => {
    if (eq(a, b)) return a;
    if (eq(o, a)) return b;
    if (eq(o, b)) return a;
    const [U, X] = up === 'a' ? [a, b] : [b, a];
    if (isObj(a) && isObj(b) && (o === undefined || isObj(o))) {
      const base = o || {};
      const keys = Object.keys(U);
      Object.keys(X).forEach((k, i, xs) => {         /* the other side's new keys, after their neighbour */
        if (keys.includes(k)) return;
        let j = i - 1; while (j >= 0 && !keys.includes(xs[j])) j--;
        keys.splice(j < 0 ? 0 : keys.indexOf(xs[j]) + 1, 0, k);
      });
      for (const k of Object.keys(base)) if (!keys.includes(k)) keys.push(k);
      const res = {};
      for (const k of keys) {
        const inA = k in a, inB = k in b, inO = k in base;
        if (!inA || !inB) {
          const kept = inA ? a[k] : b[k];
          if (!inA && !inB) continue;                                        /* both removed it */
          if (inO && eq(kept, base[k])) continue;                            /* one removed it, the other left it alone */
          if (inO) throw new Clash(`${at}${k}: removed on one side, changed on the other`);
          res[k] = kept; continue;                                           /* one side added it */
        }
        res[k] = walk(inO ? base[k] : undefined, a[k], b[k], `${at}${k}.`);
      }
      return res;
    }
    if (Array.isArray(a) && Array.isArray(b) && (o === undefined || Array.isArray(o))
        && [a, b, o || []].every((arr) => arr.every(prim) && new Set(arr.map((v) => JSON.stringify(v))).size === arr.length)) {
      /* an array of names is a set: main's members, less what the other side removed, plus what it added */
      const base = (o || []).map((v) => JSON.stringify(v)), us = U.map((v) => JSON.stringify(v)), xs = X.map((v) => JSON.stringify(v));
      const removed = new Set(base.filter((v) => !xs.includes(v))), added = xs.filter((v) => !base.includes(v) && !us.includes(v));
      let res = us.filter((v) => !removed.has(v));
      for (const v of added) {
        const i = xs.indexOf(v); let j = i - 1; while (j >= 0 && !res.includes(xs[j])) j--;
        res.splice(j < 0 ? 0 : res.indexOf(xs[j]) + 1, 0, v);
      }
      res = res.map((v) => JSON.parse(v));
      if (sortedByCodeUnit(U) && (o === undefined || sortedByCodeUnit(o))) res.sort((p, q) => (String(p) < String(q) ? -1 : String(p) > String(q) ? 1 : 0));
      return res;
    }
    if (typeof a === 'number' && typeof b === 'number' && (o === undefined || typeof o === 'number')) {
      if (clash === 'sum') {
        const v = a + b - (o || 0);
        notes.push(`${at.slice(0, -1)}: ${o ?? '(new)'} → ${v} (both moves added: ${a}, ${b})`);
        return v;
      }
      tookUpstream++;
      notes.push(`${at.slice(0, -1)}: both sides moved it (${a}, ${b}) — took main's ${U}`);
      return U;
    }
    throw new Clash(`${at.slice(0, -1) || '(root)'}: both sides changed it differently`);
  };
  const value = walk(o, a, b, '');
  return { value, notes, tookUpstream };
}

/* write JSON the way every ledger here is written: JSON.stringify with the file's own indent */
function formatLike(text, value) {
  const m = /\n([ \t]+)\S/.exec(text);
  const crlf = text.includes('\r\n');
  let s = JSON.stringify(value, null, m ? m[1] : 2) + (/\n$/.test(text) ? '\n' : '');
  if (crlf) s = s.replace(/\n/g, '\r\n');
  return s;
}

/* ══ THE DRIVER ═══════════════════════════════════════════════════════════════════════════════ */
const REGION_BEGIN = /GENERATED.*\bBEGIN\b|\bBEGIN GENERATED\b/;
const REGION_END = /GENERATED.*\bEND\b|\bEND GENERATED\b/;

/* a merged .js/.mjs that does not parse is not a resolution */
function parses(path, text) {
  if (!/\.m?js$/.test(path)) return true;
  const dir = mkdtempSync(join(tmpdir(), 'intmap-merge-check-'));
  try {
    const f = join(dir, 'x' + (extname(path) === '.js' ? '.mjs' : extname(path)));
    writeFileSync(f, text);
    return spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' }).status === 0;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

function record(p, entry) {
  let all = [];
  try { all = JSON.parse(readFileSync(p, 'utf8')); } catch { /* none yet */ }
  all.push({ ...entry, at: new Date().toISOString() });
  writeFileSync(p, JSON.stringify(all, null, 1) + '\n');
}

/**
 * Resolve one file: given the declaration, the three texts and the three files git handed over
 * (git merge-file reads those), returns { text, clean, notes, regen }. Writes nothing.
 */
export function resolveFile({ path, kind, clash, regen }, oText, aText, bText, files, { up = 'b', L = 7, style = 'merge' } = {}) {
  const fallback = (why) => {
    const segs = mergeFile(files.A, files.O, files.B);
    return { text: segs.map((s) => (s.text != null ? s.text : markers(s.conflict, L, style))).join(''), clean: !segs.some((s) => s.conflict), notes: why ? [why] : [], regen: [] };
  };
  if (kind === 'json') {
    let po, pa, pb;
    try { po = JSON.parse(oText); pa = JSON.parse(aText); pb = JSON.parse(bText); }
    catch { return fallback('a side does not parse as JSON — left to git'); }
    try {
      const r = mergeJson(po, pa, pb, { up, clash });
      return { text: formatLike(up === 'a' ? aText : bText, r.value), clean: true, notes: r.notes, regen: r.tookUpstream ? regen : [] };
    } catch (e) {
      if (e instanceof Clash) return fallback(e.message);
      throw e;
    }
  }
  const segs = mergeFile(files.A, files.O, files.B);
  if (!segs.some((s) => s.conflict)) return { text: segs.map((s) => s.text).join(''), clean: true, notes: [], regen: [] };
  const notes = []; let clean = true; let took = 0;
  if (kind === 'regen') {
    const hasRegion = REGION_BEGIN.test(aText) || REGION_BEGIN.test(bText);
    if (!hasRegion) {
      /* the whole file is generated: main's bytes are valid by construction, and the generator puts
         this side's part back once the inputs are merged */
      return { text: up === 'a' ? aText : bText, clean: true, notes: ['took main\'s file whole; the generator rebuilds it'], regen };
    }
    let inRegion = false; const out = [];
    for (const s of segs) {
      if (s.text != null) {
        for (const ln of lines(s.text)) { if (REGION_BEGIN.test(ln)) inRegion = true; else if (REGION_END.test(ln)) inRegion = false; }
        out.push(s.text); continue;
      }
      const all = [...s.conflict.a, ...s.conflict.o, ...s.conflict.b];
      if (inRegion && !all.some((l) => REGION_BEGIN.test(l) || REGION_END.test(l))) { out.push(s.conflict[up].join('')); took++; }
      else { out.push(markers(s.conflict, L, style)); clean = false; }
    }
    if (took) notes.push(`${took} hunk(s) inside the generated region took main's side`);
    return { text: out.join(''), clean, notes, regen: took ? regen : [] };
  }
  if (kind === 'tokens') {
    const out = [];
    for (const s of segs) {
      if (s.text != null) { out.push(s.text); continue; }
      const r = mergeTokens(s.conflict.o.join(''), s.conflict.a.join(''), s.conflict.b.join(''), up);
      if (r) { out.push(r.text); notes.push(...r.notes); }
      else { out.push(markers(s.conflict, L, style)); clean = false; }
    }
    const text = out.join('');
    if (clean && !parses(path, text)) return fallback('the token merge did not parse — left to git');
    return { text, clean, notes, regen: [] };
  }
  return fallback(`no kind «${kind}» — left to git`);
}

function driverMain([O, A, B, L, P]) {
  const cwd = process.cwd();
  const decl = declarationOf(P, cwd) || { path: P, kind: null, clash: 'upstream', regen: [] };
  const { up, pending: pendingFile } = repoState(cwd);
  const style = /^(diff3|zdiff3)$/.test(qGit(['config', '--get', 'merge.conflictStyle'], cwd)) ? 'diff3' : 'merge';
  const rd = (f) => readFileSync(f, 'utf8');
  let r;
  try {
    r = resolveFile(decl, rd(O), rd(A), rd(B), { O, A, B }, { up, L: Number(L) || 7, style });
  } catch (e) {
    /* never leave the file holding one side silently: hand it back to git's own merge */
    process.stderr.write(`merge-driver: ${P}: ${e.message} — falling back to git merge-file\n`);
    const x = spawnSync('git', ['merge-file', `--marker-size=${Number(L) || 7}`, '-L', 'ours', '-L', 'base', '-L', 'theirs', A, O, B]);
    process.exit(x.status === 0 ? 0 : 1);
  }
  writeFileSync(A, r.text);
  const label = `merge-driver: ${P} (${decl.kind || 'undeclared'}${decl.kind === 'json' ? ', clash=' + decl.clash : ''}; main is ${up === 'a' ? 'ours' : 'theirs'})`;
  process.stderr.write(`${label} — ${r.clean ? 'resolved' : 'CONFLICT left for a person'}\n`);
  for (const n of r.notes.slice(0, 12)) process.stderr.write(`    · ${n}\n`);
  if (r.notes.length > 12) process.stderr.write(`    · … and ${r.notes.length - 12} more (node scripts/merge-driver.mjs --pending)\n`);
  if (r.regen.length || r.notes.length) {
    record(pendingFile || join(cwd, '.git', PENDING), { path: P, kind: decl.kind, clean: r.clean, notes: r.notes, regen: r.regen });
    if (r.regen.length) process.stderr.write('    → after the merge: node scripts/merge-driver.mjs --finish\n');
  }
  process.exit(r.clean ? 0 : 1);
}

/* ══ FINISH — what a merge recorded, run once the merged tree exists ══════════════════════════ */
export function pendingPath(cwd = process.cwd()) {
  const r = qGit(['rev-parse', '--git-path', PENDING], cwd);
  return r ? resolve(cwd, r) : null;
}
export function pending(cwd = process.cwd()) {
  const p = pendingPath(cwd);
  if (!p || !existsSync(p)) return [];
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return []; }
}

export function finish(cwd = process.cwd(), { log = (s) => process.stdout.write(s + '\n') } = {}) {
  const top = qGit(['rev-parse', '--show-toplevel'], cwd) || cwd;
  const items = pending(top);
  if (!items.length) { log('merge-driver: nothing is waiting.'); return { ok: true, ran: [] }; }
  const gp = (n) => { const r = qGit(['rev-parse', '--git-path', n], top); return r && existsSync(resolve(top, r)); };
  if (gp('rebase-merge') || gp('rebase-apply')) { log('merge-driver: a rebase is still in progress — finish it (git rebase --continue), then run --finish.'); return { ok: false, ran: [] }; }
  const unmerged = qGit(['diff', '--name-only', '--diff-filter=U'], top);
  if (unmerged) { log('merge-driver: these are still conflicted — resolve them first:\n  ' + unmerged.split('\n').join('\n  ')); return { ok: false, ran: [] }; }
  const runs = new Map(), manual = new Map();
  for (const it of items) {
    for (const n of it.notes || []) log(`  ${it.path}: ${n}`);
    for (const c of it.regen || []) (c.manual ? manual : runs).set(c.text, c);
  }
  const ran = []; let ok = true;
  for (const c of runs.values()) {
    log(`merge-driver: running ${c.text}`);
    const r = c.argv[0].endsWith('.mjs')
      ? spawnSync(process.execPath, c.argv, { cwd: top, stdio: 'inherit' })
      : { status: 1, error: new Error('only node scripts are run automatically') };
    ran.push({ cmd: c.text, status: r.status });
    if (r.status !== 0) { ok = false; log(`  ✗ ${c.text} failed${r.error ? ': ' + r.error.message : ''}`); }
  }
  for (const c of manual.values()) log(`merge-driver: NOT run here (needs a build, a browser or the network) — run it yourself:\n    ${c.text}`);
  const changed = qGit(['status', '--short'], top);
  if (changed) log('merge-driver: the working tree now differs — review and commit:\n  ' + changed.split('\n').join('\n  '));
  if (ok) { try { unlinkSync(pendingPath(top)); } catch { /* already gone */ } }
  return { ok, ran, manual: [...manual.keys()] };
}

/* ══ CLI ══════════════════════════════════════════════════════════════════════════════════════ */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--install') {
    const r = install(argv[1] ? resolve(argv[1]) : process.cwd());
    if (!r.ok) { console.error(`merge-driver: could not install — ${r.why}`); process.exit(1); }
    console.log(r.changed.length ? `merge-driver: registered merge.${DRIVER} in this clone's config (every worktree shares it)` : `merge-driver: merge.${DRIVER} is already registered`);
  } else if (argv[0] === '--finish') {
    process.exit(finish(process.cwd()).ok ? 0 : 1);
  } else if (argv[0] === '--pending') {
    const items = pending(process.cwd());
    if (!items.length) console.log('merge-driver: nothing is waiting.');
    for (const it of items) {
      console.log(`${it.path} (${it.kind})${it.clean ? '' : ' — conflict left for a person'}`);
      for (const n of it.notes || []) console.log('  · ' + n);
      for (const c of it.regen || []) console.log(`  → ${c.manual ? 'run yourself' : '--finish runs'}: ${c.text}`);
    }
  } else if (argv[0] === '--list') {
    for (const d of declarations(process.cwd())) {
      console.log(`${d.path.padEnd(52)} ${String(d.kind).padEnd(7)}${d.kind === 'json' ? ' clash=' + d.clash : ''}${d.regen.length ? '  ' + d.regen.map((c) => (c.manual ? '!' : '') + c.text).join(' ; ') : ''}`);
    }
  } else if (argv.length >= 5 && !argv[0].startsWith('--')) {
    driverMain(argv);
  } else {
    console.error('usage: node scripts/merge-driver.mjs --install | --finish | --pending | --list   (git calls it with %O %A %B %L %P)');
    process.exit(2);
  }
}

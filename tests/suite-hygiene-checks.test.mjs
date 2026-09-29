/* ============================================================================
 *  IntMap · what a test file may and may not write down for itself
 * ----------------------------------------------------------------------------
 *  Three rules about the SUITE rather than the product, consolidated here from
 *  tests/r415-checks.test.mjs (a test may not choose a port), tests/r400-checks.test.mjs (the
 *  deferred-module MEMBER table in tests/r209.spec.js names what the loader ships) and
 *  tests/r478-checks.test.mjs (a spec may not spell a layer-panel heading). All three are the same
 *  shape: a fact the repository already states elsewhere, copied into a test, goes stale in
 *  silence — and the deep tier that would notice runs at night. Their original headers follow. */
/* ============================================================================
 *  #R415 — A TEST MAY NOT CHOOSE A PORT
 * ----------------------------------------------------------------------------
 *  tests/r208-checks.test.mjs ⑩ spawned scripts/serve.mjs on `const PORT = 4188` and its
 *  path-traversal half on `4189` — two numbers picked on the day it was written, and therefore the
 *  SAME two numbers in every checkout on the machine. AGENTS.md §6 asks every parallel session for
 *  its own worktree, and MEASURED 2026-08-24 there were forty-two of them. So the second session to
 *  reach ⑩ found 4188 LISTENING, held by a process from a round it has nothing to do with; the
 *  spawn died of EADDRINUSE, «static server on» never arrived, and fifteen seconds later the test
 *  failed with «serve.mjs did not come up» — in a tree whose own code is fine.
 *
 *  ⚠ THAT FAILURE ACCUSES THE CHANGE IN FRONT OF IT. It is red for a reason no reading of the diff
 *  can explain, it is green again when the file is run alone, and the honest conclusion — "another
 *  session was holding the port" — is not one anybody reaches on the first try.
 *  tests/helpers/session-seed.js already derives a private dev-server port per checkout (#R282 追記)
 *  precisely so parallel sessions stop colliding; ⑩ predated it and bound a literal instead.
 *
 *  So this file asks the question of the WHOLE directory rather than of the one file that was
 *  reported. It walks tests/ — every file, found on disk, never a list written down here (#R399:
 *  the hand-written "documents to scan" list WAS the defect) — parses each one, and fails on any
 *  port a test chose for itself: handed to a spawned process as `--port`, set as `PORT` in a child's
 *  environment, passed to `.listen()`, or dialled in a loopback URL. There is no exemption list. A
 *  round that believes it needs a fixed port has to come and argue with this file.
 *
 *  ⚠ THE ANSWER IS PORT 0, NOT A SECOND DERIVATION. session-seed's number is the one THIS run's
 *  Playwright dev server is already holding — `npm test` runs the source half and the browser half
 *  at the same time (scripts/test-parallel.mjs) — so deriving here would collide with itself. Port 0
 *  asks the kernel for a port that is free at the instant of the bind, and serve.mjs's ready line
 *  names the port it actually bound. ② below is that mechanism, measured rather than spelled.
 * ==========================================================================*/
/* ============================================================================
 *  R400 — the deep tier was red for six nights, and the list that broke it needs no browser
 * ----------------------------------------------------------------------------
 *  `tests/r209.spec.js` asks whether every DEFERRED module actually arrives, registers and
 *  publishes the member its own doors call. That question needs a browser. But the assertion at the
 *  top of it — that the spec's hand-written MEMBER table names the same modules the loader ships —
 *  is a comparison between two files on disk, and it is the half that keeps breaking:
 *
 *    · #R322 added five `analysis*` modules to js/lazy-modules.js and no lines to the table. The
 *      #R341 note in that spec records the consequence: the deep tier went red at that merge and
 *      stayed red until somebody looked.
 *    · It then happened AGAIN, to eight modules from five rounds — R349 (`warLayer`), R353
 *      (`volcanoIntel`, `volcanoLayers`), R354 (the three `company*`), R386 (`newsEvents`) and
 *      R388 (`railways`). Measured on 2026-08-24: the loader shipped 32, the table named 24.
 *
 *  ⚠ THE REPEATED CAUSE IS THE TIER, NOT THE AUTHORS. A round that leaves a line out is told by a
 *  job that runs at 03:00 JST and whose failure nobody is watching by default (#R304), so the
 *  feedback arrives days later attached to somebody else's round. Five separate rounds made the
 *  same omission because none of them could have seen it.
 *
 *  So the browser-free half runs HERE, in the node tier, on every push. The spec keeps the runtime
 *  half — a module that loads but publishes nothing still fails there, and only a browser can say
 *  so. What changed is WHEN you find out you forgot a line: at your own push, not at somebody
 *  else's nightly.
 * ==========================================================================*/
/* ============================================================================
 *  R478 — 棚の名前を spec に二度書かせない
 * ----------------------------------------------------------------------------
 *  #R469 は読者の「ベータからはCAPE不安定度レイヤーを気象に昇格。」に従って `ec-cape` を
 *  `js/data-layers.js` の `GROUPS` の中で気候・気象の棚へ移した。同じ事実を述べていた node 検査は
 *  2本とも同じコミットで直っている（`tests/r439-checks` ⑨・`tests/r469-checks` ⑥）——**どちらも
 *  毎 push 走るから**である。
 *
 *  直らなかったのは1行だけだった: `tests/r439.spec.js` が
 *
 *      expect(under['dl-ec-cape'], …).toBe('lyrGrpOthers');
 *
 *  と**答えを直接綴っていた**写しである。その spec は deep tier にしか無いので、#R469 の push は
 *  緑のまま通り、赤くなったのは**次に nightly が回った夜**だった。#R475 が記録した形と同じ——
 *  **開いていないラウンドで動く判定は、そのラウンドでは測られていない。**
 *
 *  ⚠⚠⚠ 門は「落ちた1行」より広くなければならない。最初に書いた版は禁止する集合を `GROUPS` の
 *  キーから導出していて、**それでは落ちた当の行を捕まえられなかった**——`lyrGrpOthers` は棚では
 *  ないので、集合に入らない。実測（origin/main 08676e1 の `tests/r439.spec.js` を走査）: 145 行目
 *  （`'lyrGrpClimate'`）だけが挙がり、**赤くなった 149 行目は素通りした。**
 *
 *  だから禁じるのは棚の名前ではなく `lyrGrp` という綴りそのものである。spec がそれを綴るという
 *  ことは、`js/data-layers.js` が既に述べている事実の写しを持つということで、写しは分類が動いた
 *  瞬間に嘘になり、しかも夜まで黙っている。
 *
 *  ⚠ **綴らずに済む口は用意してある。** `tests/helpers/layer-groups.mjs` が
 *  `where(id)`（その行を宣言が載せている棚）と `BETA_KEY`（どの棚にも無い行が掃き出される
 *  「その他 (beta)」の見出し）を**同じファイルから読んで**返す。禁じているのは知ることではなく、
 *  二度書くことだ。
 *
 *  ⚠ **コメントは剥がす。** この欠陥を説明する注記は、必ずその綴りを含む——#R345 が9回目を数えて
 *  `scripts/code-only.mjs` を1本に切り出した理由がそれで、剥がさない検査は「よく説明された
 *  ファイルほど大きな声で嘘をつく」。剥がしたうえで、②が**出荷された当の2行**に対して発火する
 *  ことを実際に見せる（#R465: 検査は発火することを証明できる形に）。
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs, { readFileSync, readdirSync, statSync } from 'node:fs';
import path, { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';
import { codeOnly } from '../scripts/code-only.mjs';
import { lazyModules } from './app-source.mjs';
import { GROUPS, BETA_KEY, where } from './helpers/layer-groups.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_URL = new URL('../', import.meta.url);           /* lazyModules() takes the root as a URL */
const TESTS = join(ROOT, 'tests');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════════════════════ #R415 · a test may not choose a port ══════════════════════════ */

/** Every JavaScript file under tests/, found by walking the directory. */
function everyTestFile(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { out.push(...everyTestFile(p)); continue; }
    if (/\.(mjs|cjs|js)$/.test(name)) out.push(p);
  }
  return out;
}

/* A port a machine can actually be asked for. 0 is the whole point of this round — it means "you
   choose" — so it is never an offence, and neither is a number no bind could use. */
const isChosenPort = (n) => Number.isInteger(n) && n > 0 && n < 65536;

/** A numeric literal, or a string that is one — `4188`, `'4188'`. */
function literalNumber(node) {
  if (!node || node.type !== 'Literal') return null;
  if (typeof node.value === 'number') return node.value;
  if (typeof node.value === 'string' && /^\d+$/.test(node.value)) return Number(node.value);
  return null;
}

/* ⚠ AND A NAME BOUND TO ONE IS STILL ONE. The reported defect was literally `const PORT = 4188` …
   `String(PORT)`, so a check that only understood `'--port', 4188` would have called the very file
   it was written for clean. Simple `const X = <number>` bindings are resolved, at any depth. */
function constantNumbers(ast) {
  const byName = new Map();
  walk.full(ast, (node) => {
    if (node.type !== 'VariableDeclarator' || node.id.type !== 'Identifier') return;
    const n = literalNumber(node.init);
    if (n !== null) byName.set(node.id.name, n);
  });
  return byName;
}

/** The number an expression stands for: a literal, `String(4188)`, `Number('4188')`, or a name. */
function portValue(node, consts) {
  if (!node) return null;
  const lit = literalNumber(node);
  if (lit !== null) return lit;
  if (node.type === 'Identifier') return consts.has(node.name) ? consts.get(node.name) : null;
  if (node.type === 'CallExpression' && node.callee.type === 'Identifier'
      && (node.callee.name === 'String' || node.callee.name === 'Number') && node.arguments.length === 1) {
    return portValue(node.arguments[0], consts);
  }
  return null;
}

/* The text a string or template argument really carries, with `${NAME}` filled in for the names we
   resolved — so `` `http://127.0.0.1:${SUB}/x` `` with `const SUB = 4189` is seen for what it is. */
function urlText(node, consts) {
  if (!node) return null;
  if (node.type === 'Literal') return typeof node.value === 'string' ? node.value : null;
  if (node.type !== 'TemplateLiteral') return null;
  let out = '';
  node.quasis.forEach((q, i) => {
    out += q.value.cooked ?? q.value.raw;
    if (i < node.expressions.length) {
      const v = portValue(node.expressions[i], consts);
      out += v === null ? '\u0000' : String(v);          // an unresolved hole can never look like a port
    }
  });
  return out;
}

const LOOPBACK = /(?:127\.0\.0\.1|localhost|\[::1\]|0\.0\.0\.0):(\d+)/;
/* the calls that actually dial somewhere; a fixture string that merely CONTAINS a URL is data */
const DIALS = new Set(['fetch', 'goto', 'get', 'post', 'request', 'connect', 'navigate', 'newPage']);

/* The one script in this repository that listens (`grep -l createServer scripts/`). A `PORT` in a
   child's environment only matters when the child is one of these; see rule ② below. */
const SERVER_SCRIPT = /serve\.mjs/;

/** Every port this file chose for itself, as `path:line — what`. */
function chosenPorts(src, file) {
  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const consts = constantNumbers(ast);
  const found = [];
  const say = (node, what) =>
    found.push(`${relative(ROOT, file).replace(/\\/g, '/')}:${node.loc.start.line} — ${what}`);

  walk.full(ast, (node) => {
    /* ① `--port 4188` in an argument list, and the `--port=4188` single-token spelling */
    if (node.type === 'ArrayExpression') {
      node.elements.forEach((el, i) => {
        if (!el || el.type !== 'Literal' || typeof el.value !== 'string') return;
        const eq = /^--port=(\d+)$/.exec(el.value);
        if (eq && isChosenPort(Number(eq[1]))) { say(el, `--port=${eq[1]} was written into the argument list`); return; }
        if (el.value !== '--port') return;
        const v = portValue(node.elements[i + 1], consts);
        if (isChosenPort(v)) say(el, `--port ${v} was written into the argument list`);
      });
    }
    /* ② `PORT` set to a number in the environment of a child that LISTENS — serve.mjs reads
       `process.env.PORT` before `--port`, so this is the same offence by another spelling.
       ⚠ IT HAS TO BE SCOPED TO A CHILD THAT LISTENS, and tests/r387-checks.test.mjs ⑥ is why: it
       hands `PORT: '4999'` to a child that imports scripts/frame-profile.mjs and prints the base URL
       that module computed. Nothing binds, nothing is dialled — 4999 is a SENTINEL chosen to differ
       from the default, and the assertion is about which number came back out. Flagging it would
       have made this file arrive with an exemption already attached, and an exemption list is the
       thing that rots. The hole that scoping leaves — some other child that listens on an
       environment port — is closed from the other end by ④: a bind nobody talks to is not a
       collision, and talking to it means dialling a literal. */
    if (node.type === 'CallExpression' && SERVER_SCRIPT.test(src.slice(node.start, node.end))) {
      for (const arg of node.arguments) {
        if (!arg || arg.type !== 'ObjectExpression') continue;
        for (const e of arg.properties) {
          if (e.type !== 'Property' || e.computed) continue;
          if ((e.key.name || e.key.value) !== 'env' || e.value.type !== 'ObjectExpression') continue;
          for (const p of e.value.properties) {
            if (p.type !== 'Property' || p.computed) continue;
            if ((p.key.name || p.key.value) !== 'PORT') continue;
            const v = portValue(p.value, consts);
            if (isChosenPort(v)) say(p, `PORT=${v} was written into the environment of a server this file spawns`);
          }
        }
      }
    }
    /* ③ binding a server here, in the test itself */
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
        && !node.callee.computed && node.callee.property.name === 'listen') {
      const v = portValue(node.arguments[0], consts);
      if (isChosenPort(v)) say(node, `.listen(${v}) binds a port this file picked`);
    }
    /* ④ dialling a loopback address on a port this file picked */
    if (node.type === 'CallExpression') {
      const name = node.callee.type === 'Identifier' ? node.callee.name
        : (node.callee.type === 'MemberExpression' && !node.callee.computed ? node.callee.property.name : null);
      if (!DIALS.has(name)) return;
      const text = urlText(node.arguments[0], consts);
      const m = text && LOOPBACK.exec(text);
      if (m && isChosenPort(Number(m[1]))) say(node, `${name}() dials ${m[0]}, a port this file picked`);
    }
  });
  return found;
}

/* ══ ① NOTHING UNDER tests/ CHOOSES A PORT ═══════════════════════════════════════════════════════ */
test('R415 ①: no test binds or dials a port it picked itself', () => {
  const files = everyTestFile(TESTS);
  /* the walk has to have found the suite, or a green here means «I looked at nothing» */
  assert.ok(files.length > 200, `only ${files.length} files under tests/ — the walk is not seeing the suite`);
  /* found by what it carries, not by its name — the suite is being regrouped by topic, and #R208's
     checks (⑩ is the one this round was reported against) keep their title wherever they live */
  assert.ok(files.some((f) => /\btest\(\s*['`]#?R208 /.test(readFileSync(f, 'utf8'))),
    'the file this round was reported against is in the walk');
  assert.ok(files.some((f) => f.includes('helpers')), 'and so is tests/helpers/, where the derivation lives');

  const offences = [];
  for (const f of files) offences.push(...chosenPorts(readFileSync(f, 'utf8'), f));
  assert.deepEqual(offences, [],
    'a port written into a test is the same port in all of this machine\u2019s checkouts — spawn with '
    + '`--port 0` and read the bound port off serve.mjs\u2019s ready line instead:\n  ' + offences.join('\n  '));
});

/* ══ ② …AND PORT 0 ONLY WORKS BECAUSE THE SERVER SAYS WHICH PORT IT GOT ══════════════════════════ */
test('R415 ②: serve.mjs --port 0 binds a free port and names it', async () => {
  /* ⚠ MEASURED, NOT SPELLED. A source-shape assertion here would stay green while the mechanism was
     dead: if that line ever printed the port that was REQUESTED again it would answer «:0/», every
     caller using port 0 would hang for its full timeout, and the failure would read as «serve.mjs
     did not come up» — the very sentence #R415 set out to delete. So this starts the real server,
     takes the number off stdout, and asks that number for a file. */
  const proc = spawn(process.execPath, [join(ROOT, 'scripts', 'serve.mjs'), '--port', '0'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const port = await new Promise((ok, no) => {
      const t = setTimeout(() => no(new Error('serve.mjs did not come up')), 15000);
      let out = '';
      proc.stdout.on('data', (d) => {
        out += String(d);
        const m = /static server on http:\/\/[^\s:/]+:(\d+)\//.exec(out);
        if (m) { clearTimeout(t); ok(Number(m[1])); }
      });
      proc.on('error', no);
    });
    assert.ok(port > 0 && port < 65536,
      `the ready line named ${port} — it must name the port that was BOUND, not the 0 that was asked for`);
    const r = await fetch(`http://127.0.0.1:${port}/index.html`);
    assert.equal(r.status, 200, 'and the port it named is the one answering requests');
  } finally { proc.kill(); }
});
/* ══════════════════════════ #R400 · the MEMBER table names what the loader ships ══════════════════════════ */

/** The MEMBER table as tests/r209.spec.js writes it: `name: ['Global', 'member']`. */
function memberTable(src) {
  const m = src.match(/const MEMBER\s*=\s*\{([\s\S]*?)\n\};/);
  assert.ok(m, 'tests/r209.spec.js no longer holds a `const MEMBER = { … };` table — this check is reading the wrong thing');
  const rows = new Map();
  for (const r of m[1].matchAll(/^\s{2}([A-Za-z_$][\w$]*)\s*:\s*\[([^\]]*)\]/gm)) {
    const parts = [...r[2].matchAll(/'([^']*)'/g)].map((x) => x[1]);
    rows.set(r[1], parts);
  }
  return rows;
}

test('R400 ①: every module the loader ships is named in the spec\'s MEMBER table, and nothing else is', () => {
  const shipped = lazyModules(ROOT_URL).map((m) => m.name);
  const table = memberTable(read('tests/r209.spec.js'));

  /* ⚠ BOTH DIRECTIONS. A missing row is the failure that happened twice; a leftover row is a member
     nothing can prove any more, and it would sit there asserting nothing. */
  const missing = shipped.filter((n) => !table.has(n));
  const stale = [...table.keys()].filter((n) => !shipped.includes(n));
  assert.deepEqual(missing, [],
    'js/lazy-modules.js ships these and tests/r209.spec.js does not name them — add a line naming the member THAT MODULE\'S OWN doors call');
  assert.deepEqual(stale, [],
    'tests/r209.spec.js names these and the loader no longer ships them — remove the rows');
  assert.ok(shipped.length >= 30, `only ${shipped.length} lazy modules parsed — the parser is reading the wrong thing`);
});

test('R400 ②: every named member is a real global and a real member of it', () => {
  const table = memberTable(read('tests/r209.spec.js'));
  const shipped = new Map(lazyModules(ROOT_URL).map((m) => [m.name, m]));
  const wrongGlobal = [];
  for (const [name, parts] of table) {
    const mod = shipped.get(name);
    if (!mod) continue;                                   /* ① already reports this */
    assert.ok(parts.length >= 1, `${name}: the MEMBER row is empty`);
    /* the global the row names must be the global the LOADER publishes — two lists of one fact
       again, and the reason #R341's note had to say «writing `open` because the four siblings use
       it made this row assert nothing about the module it names» */
    if (String(mod.global) !== parts[0]) wrongGlobal.push(`${name}: table says ${parts[0]}, loader publishes ${mod.global}`);
  }
  assert.deepEqual(wrongGlobal, [], 'the MEMBER table and js/lazy-modules.js disagree about what these publish');
});

test('R400 ③: this check can go red — a table with a row removed is reported', () => {
  /* ⚠ A GATE NOBODY HAS SEEN FAIL PROVES NOTHING (#R318 ②). The parse and the comparison are
     exercised here against a table that is wrong on purpose, so the green above means something. */
  const src = read('tests/r209.spec.js');
  const table = memberTable(src);
  const shipped = lazyModules(ROOT_URL).map((m) => m.name);
  /* ⚠ deliberately a LOOSE floor, and lower than ①'s. This test proves the COMPARISON reports
     correctly; whether the table is complete is ①'s question, and duplicating it here would make
     two checks go red for one defect and neither of them say which. */
  assert.ok(table.size >= 20, `the real table has only ${table.size} rows — the parser is reading the wrong thing`);

  /* ⚠ THE BASELINE IS BUILT FROM `shipped`, NOT READ FROM THE FILE. An earlier draft mutated the
     REAL table, so while that table was still missing eight rows this test went red for ①'s reason
     and reported nine victims instead of one — two checks red for one defect, and neither of them
     saying which. What ③ is for is the COMPARISON; ① owns the question of completeness. */
  const victim = shipped[0];
  const complete = new Map(shipped.map((n) => [n, ['IntMapWhatever', 'open']]));
  const broken = new Map(complete);
  broken.delete(victim);
  assert.deepEqual(shipped.filter((n) => !broken.has(n)), [victim],
    'removing one row must be reported as exactly that one missing module');

  const withExtra = new Map(complete);
  withExtra.set('moduleThatDoesNotExist', ['IntMapNope', 'open']);
  assert.deepEqual([...withExtra.keys()].filter((n) => !shipped.includes(n)), ['moduleThatDoesNotExist'],
    'a leftover row must be reported as stale');
});
/* ══════════════════════════ #R478 · a spec does not spell a panel heading ══════════════════════════ */

/** `tests/<any depth>/*.spec.js` — a spec in a subdirectory is still a spec */
function specFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...specFiles(p));
    else if (e.name.endsWith('.spec.js')) out.push(p);
  }
  return out;
}

/** every `lyrGrp…` a source spells OUTSIDE its comments, with the line it was on */
function shelfSpellings(src) {
  const hits = [];
  codeOnly(src).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/lyrGrp\w*/g)) hits.push({ line: i + 1, key: m[0], text: line.trim() });
  });
  return hits;
}

/* ── ① no spec keeps a second copy of the answer ─────────────────────────────────────────────── */
test('R478 ① no .spec.js spells a layer-panel heading', () => {
  const offenders = [];
  for (const f of specFiles(path.join(ROOT, 'tests'))) {
    for (const h of shelfSpellings(fs.readFileSync(f, 'utf8'))) {
      offenders.push(path.relative(ROOT, f).replace(/\\/g, '/') + ':' + h.line + '  → ' + h.text);
    }
  }
  assert.deepEqual(offenders, [],
    'a spec that spells a panel heading states a fact js/data-layers.js already states, and the copy ' +
    'goes stale in silence — the deep tier only runs at night. Ask tests/helpers/layer-groups.mjs: ' +
    'where(id) for the shelf a row is filed on, BETA_KEY for the sweep\'s heading.\n' + offenders.join('\n'));
});

/* ── ② the scanner fires — on BOTH lines as origin/main 08676e1 shipped them ─────────────────── */
test('R478 ② the scanner catches the stale line, and the one beside it', () => {
  const shipped = [
    "  for (const id of ['dl-ec-slp', 'dl-ec-gust', 'dl-ec-precip', 'dl-ec-dew']) {",
    "    expect(under[id], id + ' is on the shelf').toBe('lyrGrp" + "Climate');",
    '  }',
    "  expect(under['dl-ec-isobars'], 'and the retired row is nowhere at all').toBeUndefined();",
    '  /* the rows the instruction did NOT name stayed where they were (#R273) */',
    "  expect(under['dl-ec-cape'], 'ec-cape was not promoted by anybody').toBe('lyrGrp" + "Others');",
  ].join('\n');
  const hits = shelfSpellings(shipped);
  assert.deepEqual(hits.map(h => h.line), [2, 6],
    'the assertion that stated the shelf AND the one that stated the sweep — the first version of ' +
    'this gate derived its universe from GROUPS and missed line 6, which is the line that went red');

  /* …and the prose that EXPLAINS the defect does not trip it (#R345) */
  const prose = '/* it used to say lyrGrp' + 'Climate here, and lyrGrp' + 'Others before that */\nconst x = 1;';
  assert.deepEqual(shelfSpellings(prose), [], 'a comment naming a heading is prose, not a copy');
});

/* ── ③ the module answers both halves, from the same file ────────────────────────────────────── */
test('R478 ③ the sweep’s heading is not a shelf, and both come from js/data-layers.js', () => {
  assert.ok(GROUPS.length > 10, 'the taxonomy was read as a value, not as a spelling');
  assert.ok(BETA_KEY, 'the safety sweep’s heading was read off reorganizeLayerPanel');
  assert.ok(!GROUPS.some(([k]) => k === BETA_KEY),
    'a row lands under it precisely BECAUSE no shelf claimed it — that is why `where(id) || BETA_KEY` ' +
    'is not a copy of the taxonomy but one fact about the sweep');
  /* the two rows this whole round is about, answered by value rather than by spelling */
  assert.equal(where('ec-cape'), GROUPS.find(([, ids]) => ids.includes('ec-cape'))[0],
    'where() agrees with the declaration it read');
  assert.equal(where('ec-wind'), undefined, 'the row nobody has named is on no shelf, then or now');
});

/* ── ④ the spec asks the declaration instead ─────────────────────────────────────────────────── */
test('R478 ④ tests/r439.spec.js reads the shelf off the declaration', () => {
  /* spelling kept — tests/r439.spec.js is a Playwright spec that runs only in the browser tier; the claim is what it imports and calls */
  const src = codeOnly(fs.readFileSync(path.join(ROOT, 'tests', 'r439.spec.js'), 'utf8'));
  assert.ok(/from\s+'\.\/helpers\/layer-groups\.mjs'/.test(src),
    'it imports the module that evaluates the literal');
  assert.ok(/\bwhere\(/.test(src), 'and it actually calls where() — an unused import proves nothing');
  assert.ok(/\bBETA_KEY\b/.test(src), 'and names the sweep’s heading through the module');
});

/* ============================================================================
 *  #R415 — A TEST MAY NOT CHOOSE A PORT
 * ----------------------------------------------------------------------------
 *  tests/r208-checks.test.mjs ⑩ spawned scripts/serve.mjs on `const PORT = 4188` and its
 *  path-traversal half on `4189` — two numbers picked on the day it was written, and therefore the
 *  SAME two numbers in every checkout on the machine. CLAUDE.md §6 asks every parallel session for
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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TESTS = join(ROOT, 'tests');

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

/* The one script in this repository that listens (`grep -l createServer scripts/` — the other hit,
   scripts/handoff.mjs, is the local review UI and is never spawned from a test). A `PORT` in a
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
  assert.ok(files.some((f) => f.endsWith('r208-checks.test.mjs')), 'the file this round was reported against is in the walk');
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

/* ============================================================================
 *  R778 — ATLAS COULD NOT ANSWER ANYTHING IN PRODUCTION, AND EVERY GATE WAS GREEN
 * ----------------------------------------------------------------------------
 *  Found during #R775's production verification, on the deployed build:
 *
 *    IntMapConsole.run('テスト')
 *    → ReferenceError: Cannot access 'p' before initialization
 *      at Object.la [as run] (assets/atlas-console-*.js)
 *
 *  `run()` is the ONLY entry a question can take — the composer, the starter chips and the gloss
 *  all reach it — so this was not a degraded feature. **Atlas answered nothing at all.**
 *
 *  One statement in the wrong place: #R773's attachment ledger
 *
 *      try{ ATTACH_LOG.remember(turn, imgs, files); }catch(_){}
 *      … ATTACH_LOG.carry(turn, files, ATL_FILE.LIMITS) …
 *
 *  sat TEN LINES ABOVE `const turn = (_curTurn = ++_turnSeq);`. The first call is inside a
 *  `try{}catch{}` and was swallowed; the second is not, and threw on every single turn.
 *
 *  ⚠ WHY NOTHING CAUGHT IT. `node --check` parses; it does not evaluate. The 4,824 node checks read
 *  this file as TEXT. The browser half never drives the real kernel's `run()`. #R545 wrote the same
 *  sentence about a different file — 「ソースを読む検査は順序を見ない」 — and #R505 about a third.
 *
 *  ⚠ WHAT THIS CHECK IS AND IS NOT. It asks the PARSER the one question that was wrong: inside
 *  `run()`'s own body, is any `const`/`let` READ on a line above the one that creates it? It is NOT
 *  a whole-repository no-use-before-define sweep — the first version of this file tried that and
 *  reported `js/ai-core.js:340` for a binding that is fine, because deciding it correctly needs real
 *  scope resolution and this file does not have one. **A check I cannot show to be right is worse
 *  than no check** (#R741's rule, in a different costume), so the population here is the one
 *  function whose failure took production down, and ③ proves the check can actually go red.
 *  ⇒ The general form is written up as a proposal in DEV-NOTES #R778, not shipped half-built.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const NL = String.fromCharCode(10);

/* every `const`/`let` declared directly in `body`, read directly in `body`, above its own
   declaration. ⚠ A read inside a NESTED function is legal and is not counted — that is how every
   callback here works, and flagging it would be noise that teaches people to ignore the check. */
function readsBeforeDeclare(body) {
  const declAt = new Map();
  for (const st of body) {
    if (st.type !== 'VariableDeclaration' || (st.kind !== 'const' && st.kind !== 'let')) continue;
    for (const d of st.declarations) if (d.id.type === 'Identifier' && !declAt.has(d.id.name)) declAt.set(d.id.name, st.start);
  }
  const bad = [];
  for (const st of body) {
    (function walk(n, inFn) {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach((x) => walk(x, inFn)); return; }
      if (!n.type) return;
      const isFn = /Function(Declaration|Expression)$/.test(n.type) || n.type === 'ArrowFunctionExpression';
      if (n.type === 'Identifier' && !inFn && declAt.has(n.name) && n.start < declAt.get(n.name)) {
        bad.push({ name: n.name, line: n.loc.start.line });
      }
      for (const k of Object.keys(n)) {
        if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue;
        if (n.type === 'Property' && k === 'key' && !n.computed) continue;
        if (n.type === 'MemberExpression' && k === 'property' && !n.computed) continue;
        walk(n[k], inFn || isFn);
      }
    })(st, false);
  }
  return bad;
}

/* the body of the kernel's `run()`, found by its shape rather than by a line number */
function runBody(src) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  let hit = null;
  (function find(n) {
    if (!n || typeof n !== 'object' || hit) return;
    if (Array.isArray(n)) { n.forEach(find); return; }
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'run'
      && n.params.length === 3 && n.params[0].name === 'q') { hit = n; return; }
    for (const k of Object.keys(n)) { if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue; find(n[k]); }
  })(ast);
  return hit;
}

test('R778 ① the kernel’s run() creates every binding before it reads it', () => {
  const fn = runBody(read('js/atlas-console.js'));
  assert.ok(fn, 'run(q, imgs, files) is gone from js/atlas-console.js — the check lost its subject');
  const bad = readsBeforeDeclare(fn.body.body);
  assert.deepEqual(bad, [],
    'run() reads a binding that does not exist yet — this is the shape that made every turn throw '
    + 'in production while all 4,824 text checks stayed green:' + NL + '  '
    + bad.map((h) => `line ${h.line} reads \`${h.name}\` above its own declaration`).join(NL + '  '));
});

test('R778 ② the attachment ledger is filed AFTER the turn it files under', () => {
  const lines = read('js/atlas-console.js').split(NL);
  const decl = lines.findIndex((l) => l.includes('const turn=(_curTurn=++_turnSeq);'));
  const use = lines.findIndex((l) => l.includes('ATTACH_LOG.remember(turn,imgs,files)'));
  assert.ok(decl >= 0, '#R298’s turn id is gone from run()');
  assert.ok(use >= 0, '#R773’s attachment ledger is gone from run()');
  assert.ok(use > decl,
    `js/atlas-console.js:${use + 1} files the attachments under \`turn\`, which js/atlas-console.js:${decl + 1} `
    + 'has not created yet. Both ATTACH_LOG.remember and ATTACH_LOG.carry take it; only the first is '
    + 'inside a try/catch, so the second threw and took the whole turn with it.');
});

test('R778 ③ the check can go red — the exact production ordering fails it', () => {
  /* ⚠ #R765's rule: a reference that cannot fail is not a reference. The mutation is the code as it
     was DEPLOYED — the ledger line moved back above the turn id — and ① must reject it. */
  const src = read('js/atlas-console.js');
  const lines = src.split(NL);
  const use = lines.findIndex((l) => l.includes('ATTACH_LOG.remember(turn,imgs,files)'));
  const decl = lines.findIndex((l) => l.includes('const turn=(_curTurn=++_turnSeq);'));
  assert.ok(use > decl && decl >= 0, 'the mutation has nothing to move');
  const moved = lines.slice();
  const [line] = moved.splice(use, 1);
  moved.splice(decl - 1, 0, line);            /* back where #R773 left it */
  const fn = runBody(moved.join(NL));
  assert.ok(fn, 'the mutated source no longer parses into run()');
  const bad = readsBeforeDeclare(fn.body.body);
  assert.ok(bad.some((h) => h.name === 'turn'),
    'the check did NOT reject the ordering that took production down — it is measuring nothing');
});

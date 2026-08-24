/* ============================================================================
 *  IntMap · "the app's source text"  (#R162)
 * ----------------------------------------------------------------------------
 *  The R1xx regression suites assert on the APP's source with literal-substring
 *  checks. They all used to read index.html, because index.html WAS the whole app.
 *
 *  Since #R162 it is not: the stylesheet lives in css/intmap.css and the
 *  self-contained reference-data tables + modules live in js/*.js. A test that
 *  still read only index.html would flip to red (or, worse, silently green for a
 *  `gone()` assertion) merely because a line moved between files — which is
 *  exactly the false signal a source-level guard must not produce.
 *
 *  So "the source" is every file the browser actually loads, concatenated. That
 *  keeps every existing assertion meaningful across the ongoing file split, and
 *  keeps future splits from breaking the suites again.
 * ==========================================================================*/
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parse as acornParse } from 'acorn';

/**
 * (#R175) THE PAGE — what `index.html` alone used to be.
 *
 * Every split suite from #R162 to #R174 asks its questions of "the page": does it load each module,
 * does it instantiate each factory, does IM_HOST expose that value as a live getter. Until this round
 * the page was one file. The Vite migration split it into three, none of which lost anything:
 *
 *   index.html      the markup, the head, the one module tag
 *   src/main.js     the loader — what the fifty-eight <script src> tags used to be
 *   js/app-body.js  the program — the DOMContentLoaded closure that WAS the bottom of index.html
 *
 * So those suites read this instead of `index.html`. Not a loosening: pointed at the new index.html
 * they would all pass vacuously (it no longer contains the code they assert about), and a whole
 * generation of split invariants would go quiet in exactly the way they were written to prevent.
 */
/*
 * (#R178) …and FOUR files now. js/geo-engine.js is the renderer adapter plus the IntMapGeoEngine
 * facade, moved verbatim out of js/app-body.js this round: it had been created inside
 * `map.on('load', …)`, so it did not exist when the modules — now written entirely against it — run
 * their factories at import time. Nothing about it is a module in the js/ sense; it is a piece of the
 * page's own program that happens to live in its own file, exactly as app-body.js is. Leaving it out
 * would quietly retire every engine-contract invariant from #R152 onward.
 */
/*
 * (#R209) …and FIVE. js/lazy-modules.js is the rest of the loader: the eight files it fetches on
 * demand are no longer in src/main.js's list, and their factories are no longer called from
 * js/app-body.js — they are called from there, at the moment the file lands.
 *
 * ⚠ THIS IS NOT A LOOSENING, AND THE DIFFERENCE MATTERS. Every #R162–#R176 suite asks the same two
 * questions of each split-out module: "is it loaded at all" and "is its factory instantiated exactly
 * once". Both are still answerable and both are still answered — the loader that answers them just
 * moved. What WOULD be a loosening is dropping the assertions for the eight, and that is the failure
 * mode this project keeps paying for (#R162, #R205): a feature that silently stops existing while its
 * guard passes vacuously. So the shell grows by one file rather than the suites shrinking by eight,
 * and `lazyFiles()` below re-derives the list from the loader's own literals so it cannot drift.
 */
export function appShell(root) {
  const parts = [];
  /* ⚠ (#R242) js/map-typography.js is NOT in this list, and that is deliberate: this text is also what
     tests/r168 #8 budgets as «the shell», so adding a module here would make the shell look 185 lines
     bigger for having moved code OUT of it. #R161's news-overlay invariants read that file directly. */
  for (const rel of ['index.html', 'src/main.js', 'src/vendor.js', 'js/app-body.js', 'js/geo-engine.js', 'js/lazy-modules.js']) {
    const u = new URL(rel, root);
    if (existsSync(u)) parts.push(readFileSync(u, 'utf8'));
  }
  return parts.join('\n');
}

/**
 * (#R209) The js/ files that are fetched on demand — READ OUT OF THE LOADER, never written down
 * twice. `js/lazy-modules.js` is the one place the specifiers exist (static-checks only sees literal
 * ones, so they cannot be anywhere else), which makes it the only honest source for "is this file
 * lazy?". A hand-kept list here would be a second copy that goes stale the first time a round moves
 * a module in or out — the shape #R198 removed from the label sizes for the same reason.
 * @returns {string[]} e.g. ['js/flight-sim.js', …]
 */
export function lazyFiles(root) {
  return lazyModules(root).map((m) => m.file).filter(Boolean);
}

/* ══ (#R304) …AND THE SAME LOADER ANSWERS THREE MORE QUESTIONS, SO STOP COPYING THE ANSWERS ══════
   `lazyFiles()` above was written because a hand-kept list of the lazy FILES goes stale. The names
   and the globals go stale in exactly the same way and were copied anyway: tests/r209.spec.js said
   「and it knows all eight」 with the eight globals written out beside it, and by the time anybody
   ran it the loader knew TEN (#R224 moved the Atlas kernel behind it, #R291 the directions panel).
   The spec had been red on the nightly for a fortnight for saying `8`.

   So this reads the loader's own two tables instead — the `PUBLISHES` map (name → the global that
   module must have published) and the literal specifiers in its `fetchModule` switch (name → file).
   Both are load-bearing for reasons written down in js/lazy-modules.js itself, so neither can be
   rewritten into something this cannot read without that file's own gates failing first.
   @returns {{name: string, file: string|null, global: string, factory: boolean}[]} in the loader's own order */
export function lazyModules(root) {
  const u = new URL('js/lazy-modules.js', root);
  if (!existsSync(u)) return [];
  const ast = parse(readFileSync(u, 'utf8'));

  /* Two literal switches, read in one pass over the cases:
       · `fetchModule` — `case 'name': return import('./x.js');`   → which FILE the module is
       · `mount`       — `case 'name': …window.IntMapModules.name(IM_HOST)…` → whether it has a
         FACTORY at all. `nightSky` is the one that does not: it publishes itself at import time,
         which is why src/main.js's LAZY_FACTORIES is the loader's names minus that one. Reading it
         from the mount switch means the exception stays a fact about the loader rather than a
         second place to remember it. */
  const files = new Map(), factory = new Set();
  walk(ast, (n) => {
    if (n.type !== 'SwitchCase' || !n.test || n.test.type !== 'Literal') return;
    walk(n, (m) => {
      if (m.type === 'ImportExpression' && m.source.type === 'Literal' && typeof m.source.value === 'string') {
        files.set(n.test.value, m.source.value.replace(/^\.\//, 'js/'));
      }
      if (m.type === 'CallExpression' && m.callee.type === 'MemberExpression' && !m.callee.computed
        && m.callee.property.type === 'Identifier' && m.callee.property.name === n.test.value
        && isWindowProp(m.callee.object, 'IntMapModules')) factory.add(n.test.value);
    });
  });

  /* name → the global it publishes, from the PUBLISHES object literal */
  const out = [];
  walk(ast, (n) => {
    if (n.type !== 'VariableDeclarator' || n.id.type !== 'Identifier' || n.id.name !== 'PUBLISHES') return;
    if (!n.init || n.init.type !== 'ObjectExpression') return;
    for (const p of n.init.properties) {
      if (p.type !== 'Property' || p.computed || p.value.type !== 'Literal') continue;
      const name = p.key.type === 'Identifier' ? p.key.name : p.key.value;
      out.push({ name, file: files.get(name) || null, global: String(p.value.value), factory: factory.has(name) });
    }
  });
  return out;
}

/* ══ (#R304) WHICH GLOBAL EACH MOVED BLOCK PUBLISHES — DERIVED, NOT LISTED ══════════════════════
   tests/r166.spec.js asks the one question static analysis cannot answer: did the factory RUN, and
   did the object it owns actually reach `window`? It asked it of a list of 31 names typed out by
   hand — and #R296 deleted three features on the user's instruction (「電波・通信圏と見通し線解析
   を統合して」/「4つのうち…全削除」/「存在意義が不明だから全削除」), so from that round on the spec
   demanded three globals the program is not supposed to have. Nightly, for a fortnight.

   The source of truth is the factory itself: `window.IntMapModules.<name>=function(HOST){ … }`, and
   inside it the assignments to `window.<Global>` that run WHEN THE FACTORY RUNS. That last clause is
   what makes this a relation rather than a grep — an assignment inside a click handler is a promise
   about later, not a fact about boot. So the walk descends only through code that is certain to
   execute with the factory body: the body's own statements, `try`/`finally` blocks, bare blocks, and
   immediately-invoked function expressions (which is how nearly every one of these modules is
   written: `window.X=(function(){ … })();`). It does NOT descend into `if` branches, loops, handlers
   or any function that is merely DEFINED there, because none of those is a fact about boot.
   @returns {Record<string, Record<string, string[]>>} file → factory → globals it publishes */
export function publishedGlobals(root, files) {
  const out = {};
  for (const rel of (files || jsFiles(root))) {
    const u = new URL(rel, root);
    if (!existsSync(u)) continue;
    const ast = parse(readFileSync(u, 'utf8'));
    for (const st of ast.body) {
      const fac = moduleFactory(st);
      if (!fac) continue;
      const pub = [...new Set(runsWithTheFactory(fac.fn.body, []))];
      if (pub.length) ((out[rel] ||= {})[fac.name] = pub);
    }
  }
  return out;
}

/** `window.IntMapModules.<name>=function(HOST){…}` as a top-level statement, or null */
function moduleFactory(st) {
  if (st.type !== 'ExpressionStatement' || st.expression.type !== 'AssignmentExpression') return null;
  const L = st.expression.left, R = st.expression.right;
  if (L.type !== 'MemberExpression' || L.computed || L.property.type !== 'Identifier') return null;
  if (!isWindowProp(L.object, 'IntMapModules')) return null;
  if (R.type !== 'FunctionExpression' && R.type !== 'ArrowFunctionExpression') return null;
  return { name: L.property.name, fn: R };
}

/** is this node `window.<prop>`? */
function isWindowProp(n, prop) {
  return !!n && n.type === 'MemberExpression' && !n.computed
    && n.object.type === 'Identifier' && n.object.name === 'window'
    && n.property.type === 'Identifier' && (!prop || n.property.name === prop);
}

/** the body of an immediately-invoked function expression, or null */
function iifeBody(n) {
  if (!n || n.type !== 'CallExpression') return null;
  const c = n.callee;
  return (c.type === 'FunctionExpression' || c.type === 'ArrowFunctionExpression') ? c.body : null;
}

/** `window.<X>=…` assignments in code that runs when the enclosing function is called (see above) */
function runsWithTheFactory(node, out) {
  for (const s of (node.type === 'BlockStatement' ? node.body : [node])) {
    if (s.type === 'TryStatement') { runsWithTheFactory(s.block, out); if (s.finalizer) runsWithTheFactory(s.finalizer, out); continue; }
    if (s.type === 'BlockStatement') { runsWithTheFactory(s, out); continue; }
    if (s.type !== 'ExpressionStatement') continue;
    const e = s.expression;
    if (e.type === 'AssignmentExpression' && isWindowProp(e.left)) {
      out.push(e.left.property.name);
      const b = iifeBody(e.right); if (b) runsWithTheFactory(b, out);
      continue;
    }
    const b = iifeBody(e); if (b) runsWithTheFactory(b, out);
  }
  return out;
}

/* ══ (#R304) A CONSTANT A TEST WOULD OTHERWISE COPY ═════════════════════════════════════════════
   tests/r191.spec.js asserted the aircraft glyph is `rgb(30,144,255)`, and js/data-layers.js says
   `#00D9FF` — a round changed the colour and the spec went on demanding dodger blue, red on the
   nightly ever since. A colour, a threshold or a gain that a test has to KNOW is a fact about the
   module: read it from there.
   @returns {string|number|null} the initialiser of `const <name> = <literal>` in `file` */
export function constFrom(root, file, name) {
  const u = new URL(file, root);
  if (!existsSync(u)) return null;
  let found = null;
  walk(parse(readFileSync(u, 'utf8')), (n) => {
    if (found !== null) return;
    if (n.type !== 'VariableDeclarator' || n.id.type !== 'Identifier' || n.id.name !== name) return;
    if (n.init && n.init.type === 'Literal') found = n.init.value;
  });
  return found;
}

/** every `js/*.js` module file, as `js/<name>.js`, sorted — one level, no js/locales/ */
export function jsFiles(root) {
  const dir = new URL('js/', root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.js')).sort().map((f) => 'js/' + f);
}

/* ══ (#R304) WHAT A `window.X=(function(){ … return {a,b,c}; })()` MODULE ACTUALLY EXPORTS ══════
   The same disease as the two above, one shape along: tests/r167.spec.js said 「all 27 tables are
   exported」 and js/tables.js exports 25, because #R225 deleted `geoLayersDB` and `GEO_LABEL_JP`
   with the nine geopolitics layers the user asked to be rid of (「大昔に捨てたはずの地政学レイヤーが
   勝手にオンになる。ふざけるな。」). A count is a copy of a fact; this reads the fact.
   @returns {string[]} the keys of the object literal the module's IIFE returns, sorted */
export function exportedKeys(root, file, globalName) {
  const u = new URL(file, root);
  if (!existsSync(u)) return [];
  const ast = parse(readFileSync(u, 'utf8'));
  for (const st of ast.body) {
    if (st.type !== 'ExpressionStatement' || st.expression.type !== 'AssignmentExpression') continue;
    if (!isWindowProp(st.expression.left, globalName)) continue;
    const body = iifeBody(st.expression.right);
    if (!body || body.type !== 'BlockStatement') continue;
    /* the IIFE's OWN return, not one belonging to a function defined inside it */
    for (const s of body.body) {
      if (s.type !== 'ReturnStatement' || !s.argument || s.argument.type !== 'ObjectExpression') continue;
      return s.argument.properties
        .filter((p) => p.type === 'Property' && !p.computed)
        .map((p) => (p.key.type === 'Identifier' ? p.key.name : String(p.key.value)))
        .sort();
    }
  }
  return [];
}

/** every AST node, once — acorn-walk's `full` without the visitor table */
function walk(node, fn) {
  if (!node || typeof node.type !== 'string') return;
  fn(node);
  for (const k of Object.keys(node)) {
    if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) walk(c, fn); } else if (v && typeof v === 'object') walk(v, fn);
  }
}

const parse = (src) => acornParse(src, { ecmaVersion: 'latest', sourceType: 'module' });

/** index.html + css/intmap.css + every js/*.js + src/*.js, concatenated. */
export function appSource(root) {
  const parts = [readFileSync(new URL('index.html', root), 'utf8')];

  const css = new URL('css/intmap.css', root);
  if (existsSync(css)) parts.push(readFileSync(css, 'utf8'));

  const jsDir = new URL('js/', root);
  if (existsSync(jsDir)) {
    for (const f of readdirSync(jsDir).filter((f) => f.endsWith('.js')).sort()) {
      parts.push(readFileSync(new URL(f, jsDir), 'utf8'));
    }
  }
  /* ⚠ (#R221) …AND js/locales/, WHICH IS WHERE THE UI STRINGS NOW ARE. This walk was one level deep,
     so when the five-language table moved out of js/i18n.js into js/locales/ui.<code>.js (one file
     per language — see js/lang-registry.js) every assertion of the form "this string exists in all
     five languages" stopped being able to see any of them. The reading pages' own documents
     (pages.<lang>.js) live here too and are part of the app's source for the same reason. */
  const locDir = new URL('js/locales/', root);
  if (existsSync(locDir)) {
    for (const f of readdirSync(locDir).filter((f) => f.endsWith('.js')).sort()) {
      parts.push(readFileSync(new URL(f, locDir), 'utf8'));
    }
  }
  /* (#R175) …and src/, the Vite entry. Code left index.html again this round — the Supabase client
     creation and the required-module guard are in src/vendor.js and src/main.js now — so a source
     assertion that only looked at index.html + js/ would silently stop covering them. */
  const srcDir = new URL('src/', root);
  if (existsSync(srcDir)) {
    for (const f of readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort()) {
      parts.push(readFileSync(new URL(f, srcDir), 'utf8'));
    }
  }
  return parts.join('\n');
}

/**
 * (#R311) THE BODY OF ONE FUNCTION, BY BRACE MATCHING.
 *
 * ⚠ This exists because of a defect this repo has now paid for twenty-five times: a check that
 * quotes a WINDOW of source ("the 600 characters after `foo(`") is really asserting about byte
 * offsets, and byte offsets move for reasons that have nothing to do with the property being
 * checked. #R283 and #R306 both watched such a window go red purely because the file was checked out
 * with CRLF instead of LF — 604 characters of source, 615 bytes on Windows — so CI was green and the
 * author's machine was red for a change that was correct.
 *
 * Asking "does the BODY of this function still do X" has no window and no offsets. Three suites
 * (#R228, #R305, #R307) each grew their own copy of this; new ones import it from here.
 */
export function fnBody(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('no such function: ' + name);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(open, i + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}

/* ══ ⚠ (#R408) js/ FILES CAN IMPORT NOW, AND FOUR SANDBOXES EVALUATE THEM AS CLASSIC SCRIPTS ═══
   tests/r186 and tests/r187 hand js/space-sky.js to `vm.runInContext`, and tests/r208 and tests/r214
   hand js/night-sky.js to `new Function`, so the astronomy in them can be exercised in about a
   millisecond with no browser at all. That worked because every js/ module had ZERO top-level
   declarations and zero imports — the #R175 property — and it stopped working the moment those two
   files joined js/runtime.js's one timer wheel, with `SyntaxError: Cannot use import statement
   outside a module` before a single assertion ran.
   Dropping the import lines and declaring the names they bound is the same substitution those
   sandboxes ALREADY make for `document`, `requestAnimationFrame` and `setInterval` — none of which
   the astronomy calls either. The alternative was to keep two files on raw `setInterval` so a test
   harness could go on parsing them, which is the tail wagging the dog.
   ⚠ TOP-LEVEL `import` ONLY. A dynamic `import(...)` inside a function body is left exactly where it
   is, because that is a call and the sandbox can stub it like any other. */
export function asClassicScript(src) {
  const names = [];
  const body = src
    .replace(/^[ \t]*import\s+([^;]*?)\s*from\s*['"][^'"]+['"];?[ \t]*$/gm, (_line, clause) => {
      const braces = /\{([^}]*)\}/.exec(clause);
      if (braces) for (const n of braces[1].split(',')) {
        const nm = n.trim().split(/\s+as\s+/).pop().trim();
        if (nm) names.push(nm);
      }
      const bare = /^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause.replace(/\{[^}]*\}/, ''));
      if (bare && bare[1]) names.push(bare[1]);
      return '';
    })
    .replace(/^[ \t]*import\s+['"][^'"]+['"];?[ \t]*$/gm, '');
  const shim = names.length ? 'var ' + names.map((n) => n + ' = function () { }').join(', ') + ';\n' : '';
  return shim + body;
}

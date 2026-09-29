/* ============================================================================
 *  IntMap · every script the served site can pull from another origin, and what pins it
 * ----------------------------------------------------------------------------
 *  THE DEFECT THIS EXISTS FOR. #R175 moved seven <script src="https://unpkg.com/…"> tags into npm
 *  dependencies (src/vendor.js) and the documents said the app no longer took code from a CDN. Two
 *  loaders that insert a <script> at RUNTIME were not tags and were not looked at: the ECMWF tile SDK
 *  (js/wx-ecmwf.js) and the PMTiles plugin (js/layer-packs.js; later removed — nothing called it), both from unpkg, both without
 *  Subresource Integrity. A script from another origin runs with this origin's authority — it can read
 *  localStorage, where the Supabase session and the reader's own AI keys live — so a compromised
 *  unpkg, or a compromised package on it, was a compromised IntMap. The judgement «not from a CDN
 *  without a pin» had been applied to one path and not to the others.
 *
 *  THE RULE IS ON THE FACT, NOT ON THE TWO FILES:
 *    every script the served site can insert from another origin carries `integrity` (and
 *    `crossorigin`, without which the browser cannot check it), or is declared UNPINNABLE below with a
 *    sentence saying why no fixed hash can exist.
 *
 *  ── WHY THE NET IS COMPLETE ──────────────────────────────────────────────────────────────────
 *  The browser runs a cross-origin script only from a host the page's CSP `script-src` names. So the
 *  hosts are the universe, and every string in the served code that names one of them is a SITE that
 *  has to be accounted for — whatever form it is written in (`createElement('script')`, a parameter
 *  bound to "script" by an IIFE the way the Clarity snippet does it, `import('https://…')`, a helper
 *  nobody has written yet). A string on a script-src host that no pinned <script> consumes and no
 *  declaration covers is an error by itself; it does not have to be recognised as a loader first.
 *  The other direction is checked too: a script-src host that nothing in the code names, and that is
 *  not declared CSP_ONLY with a reason, is a permission nobody uses and is refused.
 *
 *  ── WHAT IS «THE SERVED SITE» ────────────────────────────────────────────────────────────────
 *  Discovered, not listed: the pages at the root, everything under js/ and src/ (the bundle's sources
 *  — scanned whole, reachable or not, which errs outward), and every entry of vite.config.js's
 *  STATIC_ASSETS (what the build copies verbatim), read from that file's own AST. Anything else in the
 *  repository never reaches dist/. ⚠ In particular harness/waves.html loads MapLibre 5 and the tile SDK
 *  from unpkg by plain <script> tags: it is a local measurement page (nothing copies harness/ into
 *  dist/, and the deploy publishes dist/), so it is outside this net on purpose — if it is ever added to
 *  STATIC_ASSETS it enters the universe automatically and its tags must be pinned.
 *
 *  ⚠ A HASH IS CHECKED BY THE BROWSER, NOT HERE. This gate proves each external script carries a
 *  well-formed `sha256|384|512-` pin; whether the pin matches the bytes the CDN serves is the browser's
 *  refusal at load time. How each pin was measured is in the comment beside it.
 * ==========================================================================*/
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { codeOnly } from './code-only.mjs';

/* ── the declarations. Each one must still be TRUE — a declaration that matches nothing is an error
      (the site it excused has gone, so the excuse is now a hole waiting for the next site). ──── */

/** Scripts from another origin that cannot carry a fixed hash, because the provider serves different
 *  bytes by design. `file` + `host` must match a site that exists. */
export const UNPINNABLE = [
  {
    file: 'js/street-view.js', host: 'maps.googleapis.com',
    why: 'A JSONP request, not a library: the response body is generated per call (the nearest-panorama '
      + 'search for the clicked point, wrapped in a callback name made up for that call), so there is no '
      + 'fixed content a hash could name.',
  },
  {
    file: 'index.html', host: 'www.googletagmanager.com',
    why: 'The gtag.js loader for one measurement id. Google rebuilds it from the property\'s own configuration '
      + 'and ships new versions without a version in the URL, so a pin would break analytics on Google\'s next '
      + 'release; it is inserted only when INTMAP_ANALYTICS is true (off today).',
  },
  {
    file: 'index.html', host: 'www.clarity.ms',
    why: 'The Clarity tag for one project id, served by Microsoft at an unversioned URL that changes whenever '
      + 'they release; a pin would break the tool on their next release. Written as createElement(r) with '
      + 'r bound to "script" by the snippet\'s IIFE, and inserted only when INTMAP_ANALYTICS is true (off today).',
  },
];

/** script-src hosts that no string in the served code names, kept on purpose. */
export const CSP_ONLY = [
  {
    host: 'www.google-analytics.com',
    why: 'gtag.js (from www.googletagmanager.com) may load further scripts from this host at runtime; that has '
      + 'not been measured with analytics on, so the permission is kept rather than removed on a guess.',
  },
  {
    host: 'ssl.google-analytics.com',
    why: 'Same as www.google-analytics.com: a host gtag.js may load from at runtime, unmeasured, kept rather '
      + 'than removed on a guess.',
  },
];

const SRI = /^sha(256|384|512)-[A-Za-z0-9+/]+={0,2}$/;
const MIN_WHY = 40; // a reason is a sentence; a word is not a reason

/* ── the universe ─────────────────────────────────────────────────────────────────────────── */
function listFiles(abs, root, out) {
  let st; try { st = statSync(abs); } catch { return out; }
  if (st.isDirectory()) { for (const n of readdirSync(abs)) listFiles(join(abs, n), root, out); }
  else out.push(relative(root, abs).replace(/\\/g, '/'));
  return out;
}

/** STATIC_ASSETS / STATIC_EXCLUDE, read from vite.config.js's AST (the build's own list). */
export function viteStaticAssets(viteText) {
  const ast = acorn.parse(viteText, { ecmaVersion: 'latest', sourceType: 'module' });
  const out = { assets: [], exclude: [] };
  for (const n of ast.body) {
    if (n.type !== 'ExportNamedDeclaration' || !n.declaration || n.declaration.type !== 'VariableDeclaration') continue;
    for (const d of n.declaration.declarations) {
      const key = d.id && d.id.name === 'STATIC_ASSETS' ? 'assets' : d.id && d.id.name === 'STATIC_EXCLUDE' ? 'exclude' : null;
      if (!key || !d.init || d.init.type !== 'ArrayExpression') continue;
      for (const e of d.init.elements) if (e && e.type === 'Literal' && typeof e.value === 'string') out[key].push(e.value);
    }
  }
  return out;
}

/** The served files a browser can execute, as [{rel, text}]. */
export function collectServed(root) {
  const rels = new Set();
  for (const n of readdirSync(root)) if (n.endsWith('.html')) rels.add(n);
  for (const d of ['js', 'src']) if (existsSync(join(root, d))) listFiles(join(root, d), root, []).forEach((r) => rels.add(r));
  const vite = viteStaticAssets(readFileSync(join(root, 'vite.config.js'), 'utf8'));
  for (const a of vite.assets) if (existsSync(join(root, a))) listFiles(join(root, a), root, []).forEach((r) => rels.add(r));
  const excluded = (r) => vite.exclude.some((x) => r === x || r.startsWith(x.replace(/\/$/, '') + '/'));
  const files = [];
  for (const rel of [...rels].sort()) {
    if (excluded(rel) || !['.js', '.mjs', '.cjs', '.html'].includes(extname(rel))) continue;
    files.push({ rel, text: readFileSync(join(root, rel), 'utf8') });
  }
  return files;
}

/* ── CSP ──────────────────────────────────────────────────────────────────────────────────── */
/** script-src host patterns of every served page that declares a CSP. */
export function cspScriptHosts(files) {
  const hosts = new Map(); // pattern -> [page]
  for (const f of files) {
    if (!f.rel.endsWith('.html')) continue;
    const m = f.text.match(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*content=(?:"([^"]*)"|'([^']*)')/i);
    if (!m) continue;
    const dir = (m[1] ?? m[2]).split(';').map((s) => s.trim()).find((s) => /^script-src\s/i.test(s));
    if (!dir) continue;
    for (const tok of dir.split(/\s+/).slice(1)) {
      if (tok.startsWith("'") || /^[a-z][a-z0-9+.-]*:$/i.test(tok)) continue; // keywords and bare schemes
      const host = tok.replace(/^https?:\/\//i, '').replace(/[/:].*$/, '').toLowerCase();
      if (!hosts.has(host)) hosts.set(host, []);
      hosts.get(host).push(f.rel);
    }
  }
  return hosts;
}
const hostMatches = (pattern, host) => pattern.startsWith('*.')
  ? host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1
  : host === pattern;

/* ── parsing: a .js file, or each inline <script> of a page ─────────────────────────────────── */
/* Parsing is most of the cost (~130 files hold a site); the tree is read-only here, so an unchanged
   text is parsed once per process — the regression test re-runs the gate on a dozen mutated trees. */
const AST_CACHE = new Map();
function parseJs(text) {
  if (AST_CACHE.has(text)) return AST_CACHE.get(text);
  const o = { ecmaVersion: 'latest', allowHashBang: true, locations: true, allowReturnOutsideFunction: true };
  let ast;
  try { ast = acorn.parse(text, { ...o, sourceType: 'module' }); }
  catch { ast = acorn.parse(text, { ...o, sourceType: 'script' }); }
  AST_CACHE.set(text, ast);
  return ast;
}
function htmlParts(text) {
  const scripts = [], tags = [];
  const noComments = codeOnly(text, { lang: 'html', offsets: true });
  for (const m of noComments.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi)) {
    const attrs = m[1];
    const line = noComments.slice(0, m.index).split('\n').length;
    const src = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (src) { tags.push({ src: src[1], attrs, line }); continue; }
    const type = (attrs.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    if (type && !/^(text\/javascript|module|application\/javascript)$/i.test(type)) continue;
    const bodyStart = m.index + m[0].indexOf('>') + 1;
    // pad with newlines so acorn's line numbers are the page's line numbers
    scripts.push({ code: '\n'.repeat(noComments.slice(0, bodyStart).split('\n').length - 1) + m[2] });
  }
  return { scripts, tags };
}

/* ── one parsed program: sites, the strings that name a script-src host, and resolution ─────── */
function analyseProgram(ast, rel, cspHosts) {
  const decls = new Map();   // name -> [init expr]
  const memberAssigns = [];  // {obj, prop, value, node}
  const setAttrs = [];       // {obj, attr, value, node}
  const creates = [];        // {call, ancestors}
  const hostStrings = [];    // {node, hosts[]}
  const addDecl = (name, init) => { if (!decls.has(name)) decls.set(name, []); decls.get(name).push(init); };

  const hostsIn = (s) => {
    const found = [];
    for (const m of String(s).matchAll(/\/\/([A-Za-z0-9.-]+)/g)) {
      const h = m[1].toLowerCase();
      for (const p of cspHosts.keys()) if (hostMatches(p, h)) found.push(h);
    }
    return found;
  };

  walk.fullAncestor(ast, (node, _st, ancestors) => {
    switch (node.type) {
      case 'VariableDeclarator':
        if (node.id.type === 'Identifier' && node.init) addDecl(node.id.name, node.init);
        break;
      case 'AssignmentExpression':
        if (node.operator !== '=') break;
        if (node.left.type === 'Identifier') addDecl(node.left.name, node.right);
        else if (node.left.type === 'MemberExpression' && !node.left.computed && node.left.object.type === 'Identifier') {
          memberAssigns.push({ obj: node.left.object.name, prop: node.left.property.name, value: node.right, node });
        }
        break;
      case 'CallExpression': {
        const c = node.callee;
        if (c.type === 'MemberExpression' && !c.computed && c.property.name === 'createElement' && node.arguments.length) {
          creates.push({ call: node, ancestors: ancestors.slice() });
        }
        if (c.type === 'MemberExpression' && !c.computed && c.property.name === 'setAttribute' && c.object.type === 'Identifier'
          && node.arguments[0] && node.arguments[0].type === 'Literal') {
          setAttrs.push({ obj: c.object.name, attr: String(node.arguments[0].value).toLowerCase(), value: node.arguments[1], node });
        }
        break;
      }
      case 'Literal':
        if (typeof node.value === 'string') { const h = hostsIn(node.value); if (h.length) hostStrings.push({ node, hosts: h }); }
        break;
      case 'TemplateElement': {
        const h = hostsIn(node.value.cooked ?? node.value.raw); if (h.length) hostStrings.push({ node, hosts: h });
        break;
      }
      default:
    }
  });

  /* resolve an expression to the strings it can be — each {value|null, node, integrity?} ── */
  function resolve(expr, ancestors, depth = 0) {
    if (!expr || depth > 8) return [{ value: null, node: expr }];
    switch (expr.type) {
      case 'Literal': return [{ value: typeof expr.value === 'string' ? expr.value : null, node: expr }];
      case 'TemplateLiteral': return [{ value: expr.quasis[0].value.cooked, node: expr.quasis[0], partial: true }];
      case 'BinaryExpression':
        if (expr.operator === '+') return resolve(expr.left, ancestors, depth + 1).map((c) => ({ ...c, partial: true }));
        break;
      case 'NewExpression': // new URL('data/x.js', base) → the first argument decides the origin
        if (expr.callee.type === 'Identifier' && expr.callee.name === 'URL' && expr.arguments[0]) return resolve(expr.arguments[0], ancestors, depth + 1);
        break;
      case 'Identifier': {
        // a parameter of an immediately-invoked function → the argument in that position
        for (let i = ancestors.length - 1; i >= 0; i--) {
          const fn = ancestors[i];
          if (!/Function/.test(fn.type)) continue;
          const at = fn.params.findIndex((p) => p.type === 'Identifier' && p.name === expr.name);
          if (at < 0) continue;
          const call = ancestors[i - 1];
          if (call && call.type === 'CallExpression' && call.callee === fn && call.arguments[at]) return resolve(call.arguments[at], ancestors.slice(0, i - 1), depth + 1);
          return [{ value: null, node: expr }];
        }
        const inits = decls.get(expr.name);
        if (inits && inits.length) return inits.flatMap((e) => resolve(e, [], depth + 1));
        break;
      }
      case 'ArrayExpression': return expr.elements.flatMap((e) => resolve(e, ancestors, depth + 1));
      case 'MemberExpression': {
        if (expr.computed) { // ARR[i] → every element
          const base = resolveNodes(expr.object, ancestors, depth + 1);
          if (base.length && base.every((b) => b && b.type === 'ArrayExpression')) return base.flatMap((b) => b.elements.flatMap((e) => resolve(e, ancestors, depth + 1)));
          break;
        }
        const prop = expr.property.name;
        // new URL(x, base).href → x decides the origin
        if (prop === 'href' && expr.object.type === 'NewExpression') return resolve(expr.object, ancestors, depth + 1);
        const objs = resolveNodes(expr.object, ancestors, depth + 1);
        const out = [];
        for (const o of objs) {
          const list = o && o.type === 'ArrayExpression' ? o.elements : [o];
          for (const ob of list) {
            if (!ob || ob.type !== 'ObjectExpression') return [{ value: null, node: expr }];
            const p = ob.properties.find((q) => q.key && (q.key.name === prop || q.key.value === prop));
            if (!p) return [{ value: null, node: expr }];
            const sri = ob.properties.find((q) => q.key && (q.key.name === 'integrity' || q.key.value === 'integrity'));
            for (const c of resolve(p.value, ancestors, depth + 1)) {
              out.push({ ...c, integrity: sri && sri.value.type === 'Literal' ? sri.value.value : undefined });
            }
          }
        }
        if (out.length) return out;
        break;
      }
      default:
    }
    return [{ value: null, node: expr }];
  }
  /* the object/array NODES an expression names (for ARR[i] and OBJ.prop) */
  function resolveNodes(expr, ancestors, depth) {
    if (!expr || depth > 8) return [];
    if (expr.type === 'ArrayExpression' || expr.type === 'ObjectExpression') return [expr];
    if (expr.type === 'Identifier') return (decls.get(expr.name) || []).flatMap((e) => resolveNodes(e, [], depth + 1));
    if (expr.type === 'MemberExpression' && expr.computed) {
      return resolveNodes(expr.object, ancestors, depth + 1).flatMap((a) => (a.type === 'ArrayExpression' ? a.elements.filter(Boolean) : []));
    }
    return [];
  }

  /* the script elements, each with what is assigned to it before the next element of that name ── */
  const sites = [];
  for (const { call, ancestors } of creates) {
    const tag = resolve(call.arguments[0], ancestors);
    const parent = ancestors[ancestors.length - 2];
    const isScript = tag.some((t) => typeof t.value === 'string' && t.value.toLowerCase() === 'script');
    const opaque = tag.every((t) => t.value == null);
    if (!isScript && !opaque) continue;
    let name = null;
    if (parent && parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') name = parent.id.name;
    if (parent && parent.type === 'AssignmentExpression' && parent.left.type === 'Identifier') name = parent.left.name;
    const fn = [...ancestors].reverse().find((a) => /Function|Program/.test(a.type) && a !== call);
    sites.push({ call, ancestors, name, fn, isScript, line: call.loc.start.line });
  }
  const out = [];
  for (const s of sites) {
    const sameNameLater = sites.filter((o) => o !== s && o.name === s.name && o.fn === s.fn && o.call.start > s.call.start)
      .map((o) => o.call.start);
    const end = Math.min(s.fn.end, ...sameNameLater);
    const inRange = (n) => n.start > s.call.start && n.start < end;
    const assigned = (prop) => memberAssigns.filter((a) => a.obj === s.name && a.prop === prop && inRange(a.node))
      .map((a) => a.value)
      .concat(setAttrs.filter((a) => a.obj === s.name && a.attr === prop.toLowerCase() && inRange(a.node)).map((a) => a.value));
    const srcExpr = s.name ? assigned('src')[0] : undefined;
    const ancestorsAt = (node) => { // the ancestors of the assignment are the site's function chain
      const idx = s.ancestors.indexOf(s.fn); return idx >= 0 ? s.ancestors.slice(0, idx + 1) : [];
    };
    out.push({
      rel, line: s.line, isScript: s.isScript, name: s.name,
      src: srcExpr ? resolve(srcExpr, ancestorsAt(srcExpr)) : null,
      integrity: s.name ? assigned('integrity').flatMap((e) => resolve(e, ancestorsAt(e))) : [],
      crossOrigin: s.name ? assigned('crossOrigin').length + assigned('crossorigin').length > 0 : false,
    });
  }
  return { sites: out, hostStrings };
}

const EXTERNAL = /^(https?:)?\/\//i;
const hostOf = (url) => { const m = String(url).match(/^(?:https?:)?\/\/([A-Za-z0-9.-]+)/i); return m ? m[1].toLowerCase() : null; };

/**
 * @param {{rel:string,text:string}[]} files  the served files (collectServed)
 * @param {{unpinnable?:object[], cspOnly?:object[]}} [decl]
 * @returns {{problems:string[], sites:object[], cspHosts:Map}}
 */
export function runtimeScriptProblems(files, decl = {}) {
  const unpinnable = decl.unpinnable || UNPINNABLE;
  const cspOnly = decl.cspOnly || CSP_ONLY;
  const problems = [];
  const cspHosts = cspScriptHosts(files);
  const allSites = [];
  /* one pass over each file's text (the served tree is ~160 MB, most of it data/*.js) */
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mayHoldSite = new RegExp(['createElement', ...[...cspHosts.keys()].map((p) => esc(p.replace(/^\*\./, '.')))].join('|'), 'i');
  const used = new Set();          // concrete hosts a string in the served code names
  const unpinnableHit = new Set();  // index into unpinnable
  const excuse = (rel, host) => {
    const i = unpinnable.findIndex((u) => u.file === rel && u.host === host);
    if (i >= 0) unpinnableHit.add(i);
    return i >= 0;
  };

  for (const f of files) {
    let programs = [];
    if (f.rel.endsWith('.html')) {
      const parts = htmlParts(f.text);
      for (const t of parts.tags) {
        const h = hostOf(t.src);
        if (!h) continue;
        used.add(h);
        const pinned = /\bintegrity\s*=\s*["']([^"']+)["']/i.exec(t.attrs);
        const ok = pinned && SRI.test(pinned[1]) && /\bcrossorigin\b/i.test(t.attrs);
        if (!ok && !excuse(f.rel, h)) problems.push(`${f.rel}:${t.line}: <script src="${t.src}"> loads from another origin without integrity+crossorigin`);
      }
      for (const s of parts.scripts) { try { programs.push(parseJs(s.code)); } catch (e) { problems.push(`${f.rel}: an inline <script> does not parse (${e.message}) — it cannot be checked`); } }
    } else {
      // Only a file that names a script-src host, or creates an element, can hold a site. Both are
      // spelled in the text itself, so this filter can only skip a file that has nothing to find.
      if (!mayHoldSite.test(f.text)) continue;
      try { programs.push(parseJs(f.text)); } catch (e) { problems.push(`${f.rel}: does not parse (${e.message}) — it cannot be checked`); continue; }
    }

    for (const ast of programs) {
      const { sites, hostStrings } = analyseProgram(ast, f.rel, cspHosts);
      const consumed = new Set();
      for (const s of sites) {
        allSites.push(s);
        if (!s.isScript) {
          if (s.src && s.src.some((c) => c.value && EXTERNAL.test(c.value))) {
            problems.push(`${f.rel}:${s.line}: createElement(<unresolved tag>) is given an external src — say which element it is`);
          }
          continue;
        }
        if (!s.src) continue; // no src: an inline script body, same origin by construction
        for (const c of s.src) {
          if (c.value == null) continue; // not resolvable — the host sweep below still sees any external string
          if (!EXTERNAL.test(c.value)) continue;
          const h = hostOf(c.value);
          consumed.add(c.node);
          if (excuse(f.rel, h)) continue;
          const siteSri = s.integrity.filter((x) => x.value != null);
          const sri = c.integrity !== undefined ? c.integrity
            : (s.src.length === 1 && siteSri.length === 1 && s.integrity.length === 1 ? siteSri[0].value : undefined);
          const assignedSri = s.integrity.length > 0 && s.integrity.every((x) => x.value == null || SRI.test(x.value));
          if (!sri || !SRI.test(sri) || !assignedSri || !s.crossOrigin) {
            problems.push(`${f.rel}:${s.line}: a <script> from ${h} is inserted without a pinned integrity`
              + (s.crossOrigin ? '' : ' and crossOrigin') + ' — pin it (sha384 of the exact file) or declare it UNPINNABLE with a reason');
          }
        }
      }
      for (const hs of hostStrings) {
        hs.hosts.forEach((h) => used.add(h));
        if (consumed.has(hs.node)) continue;
        const h = hs.hosts[0];
        if (excuse(f.rel, h)) continue;
        const line = hs.node.loc ? hs.node.loc.start.line : '?';
        problems.push(`${f.rel}:${line}: names ${h}, a script-src host, but no pinned <script> consumes it — a script `
          + 'loaded from here would run unpinned. Pin it or declare it UNPINNABLE with a reason');
      }
    }
  }

  /* the declarations are checked in both directions */
  unpinnable.forEach((u, i) => {
    if (!u.why || String(u.why).trim().length < MIN_WHY) problems.push(`UNPINNABLE ${u.file} ${u.host}: needs a reason (a sentence, not a word)`);
    if (!files.some((f) => f.rel === u.file)) problems.push(`UNPINNABLE ${u.file} ${u.host}: that file is not served — the declaration excuses nothing`);
    else if (!unpinnableHit.has(i)) problems.push(`UNPINNABLE ${u.file} ${u.host}: declared, but no site in that file loads from that host any more — remove the declaration`);
  });
  for (const [pattern, pages] of cspHosts) {
    const named = [...used].some((h) => hostMatches(pattern, h));
    const declared = cspOnly.find((c) => c.host === pattern);
    if (!named && !declared) problems.push(`${pages.join(', ')}: CSP script-src allows ${pattern}, which nothing in the served code loads from — remove it, or declare it CSP_ONLY with a reason`);
    if (named && declared) problems.push(`CSP_ONLY ${pattern}: declared unused, but the served code names it — remove the declaration`);
  }
  for (const c of cspOnly) {
    if (!cspHosts.has(c.host)) problems.push(`CSP_ONLY ${c.host}: no served page's script-src has it — remove the declaration`);
    if (!c.why || String(c.why).trim().length < MIN_WHY) problems.push(`CSP_ONLY ${c.host}: needs a reason (a sentence, not a word)`);
  }
  return { problems, sites: allSites, cspHosts };
}

/* CLI: node scripts/runtime-scripts.mjs [--report] */
if (process.argv[1] && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const files = collectServed(root);
  const r = runtimeScriptProblems(files);
  if (process.argv.includes('--report')) {
    for (const s of r.sites) {
      const src = s.src ? s.src.map((c) => c.value == null ? '<unresolved>' : c.value).join(' | ') : '(no src)';
      console.log(`${s.rel}:${s.line} ${s.isScript ? 'script' : '<opaque>'} ${src}${s.integrity.length ? ' [integrity]' : ''}${s.crossOrigin ? ' [crossOrigin]' : ''}`);
    }
    console.log('script-src hosts:', [...r.cspHosts.keys()].join(' '));
  }
  for (const p of r.problems) console.log('✗ ' + p);
  console.log(r.problems.length ? `${r.problems.length} problem(s) in ${files.length} served files` : `✓ ${files.length} served files — every cross-origin script is pinned or declared`);
  process.exit(r.problems.length ? 1 : 0);
}

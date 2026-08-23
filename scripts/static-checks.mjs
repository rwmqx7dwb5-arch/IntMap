// Fast, dependency-light static checks for the IntMap repo.
// Runs in CI and locally BEFORE the browser tests, catching the cheap-to-detect,
// expensive-to-ship breakages: syntax errors, invalid JSON/YAML, merge-conflict
// markers, missing referenced assets, workflow-permission mistakes, and committed
// secrets. It deliberately does NOT reformat or style-lint existing code.
//
//   node scripts/static-checks.mjs            # full run (exit 1 on any error)
//   node scripts/static-checks.mjs --list     # just print the files it would scan
//
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { cpus } from 'node:os';
import { join, extname, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');

// Directories never worth scanning.
/* (#R175) `dist` is the Vite build output — generated, minified, gitignored. Linting it would flag the
   bundler's own output and time out on the source maps; the SOURCES are what these checks are about. */
const SKIP_DIRS = new Set(['.git', 'node_modules', 'playwright-report', 'test-results', '.cache', '.playwright', 'coverage', 'dist']);
// Binary / large-asset extensions we do not read as text.
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.pdf', '.zip', '.gz', '.tif', '.tiff', '.mp4', '.mov']);
const TEXT_EXT = new Set(['.html', '.htm', '.js', '.mjs', '.cjs', '.ts', '.json', '.yml', '.yaml', '.md', '.css', '.py', '.txt', '.xml', '.svg', '.sql', '.toml']);

// Values that are PUBLIC on purpose (documented in index.html / README) — never flag these.
const PUBLIC_ALLOW = [
  'sb_publishable_yI9Rf2s4nzrIuqFyUq4OOA_h83PrRd0', // Supabase publishable/anon key — RLS protects every table
];
/* Files an HTML page references that are produced by the BUILD rather than committed. The entry used
   to be `supabase.js` — a file that has never existed, whose absence is what sent admin.html to a
   third-party CDN via document.write. That fallback is gone; vite.config.js's supabaseAdminSdk()
   copies the pinned @supabase/supabase-js UMD build to dist/vendor/supabase-js.js, and the dev server
   serves the same path out of node_modules, so the file is real everywhere the page actually runs and
   is simply not in the source tree. */
const OPTIONAL_LOCAL = new Set(['vendor/supabase-js.js']);

const errors = [];
const warnings = [];
const err = (check, msg) => errors.push({ check, msg });
const warn = (check, msg) => warnings.push({ check, msg });

/* ⚠ (#R206) AND NEVER INTO ANOTHER GIT WORKTREE. Standing rule 8 has concurrent sessions each work
   in their own worktree, and Claude Code puts them under `.claude/worktrees/<name>/` — a COMPLETE
   second checkout of this repository, on somebody else's branch. This walk was descending into it:
   MEASURED, 310 of the 708 files it visited and 60 of the 130 MB it read were that copy, so every
   check below ran twice and half of the second run was judging a branch this run has nothing to do
   with. A directory that has its own `.git` is a different checkout by definition, which is the
   general rule rather than a hard-coded path (a `git worktree add` anywhere else is caught too).
   ⚠ ROOT itself has a `.git`, so the test is only applied to SUBdirectories. */
const isOtherWorktree = (abs) => abs !== ROOT && existsSync(join(abs, '.git'));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(dir, name);
    let s;
    try { s = statSync(abs); } catch { continue; }
    if (s.isDirectory()) { if (!isOtherWorktree(abs)) walk(abs, out); }
    else out.push({ abs, rel: rel(abs), ext: extname(name).toLowerCase(), size: s.size });
  }
  return out;
}

const ALL = walk(ROOT);
const textFiles = ALL.filter((f) => TEXT_EXT.has(f.ext) && !BINARY_EXT.has(f.ext));
const read = (f) => { try { return readFileSync(f.abs, 'utf8'); } catch { return ''; } };

if (process.argv.includes('--list')) {
  console.log(textFiles.map((f) => f.rel).join('\n'));
  process.exit(0);
}

// ── 1. Merge-conflict markers ────────────────────────────────────────────────
for (const f of textFiles) {
  if (f.rel === 'scripts/static-checks.mjs') continue;
  const t = read(f);
  if (/^<{7}[ \t]/m.test(t) || /^>{7}[ \t]/m.test(t)) {
    err('merge-markers', `${f.rel} contains a Git conflict marker (<<<<<<< / >>>>>>>)`);
  }
}

// ── 2. Committed secrets ─────────────────────────────────────────────────────
const SECRET_PATTERNS = [
  { name: 'private key block', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'Supabase secret key', re: /\bsb_secret_[A-Za-z0-9_-]{12,}/ },
  { name: 'Stripe live secret', re: /\bsk_live_[A-Za-z0-9]{16,}/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'OpenAI key', re: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/ },
  { name: 'Anthropic key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },   // (#R138) ai-proxy provider key
];
function jwtIsServiceRole(tok) {
  try {
    const payload = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(payload, 'base64').toString('utf8');
    return /"role"\s*:\s*"service_role"/.test(json);
  } catch { return false; }
}
for (const f of textFiles) {
  if (f.rel === 'scripts/static-checks.mjs') continue; // this file holds the patterns themselves
  let t = read(f);
  for (const a of PUBLIC_ALLOW) t = t.split(a).join('');
  for (const p of SECRET_PATTERNS) {
    const m = t.match(p.re);
    if (m) err('secret-scan', `${f.rel}: looks like a committed ${p.name} (${m[0].slice(0, 12)}…)`);
  }
  // JWTs: only a service_role token is a hard failure; other JWTs (fixtures/comments) warn.
  const jwt = t.match(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/);
  if (jwt) {
    if (jwtIsServiceRole(jwt[0])) err('secret-scan', `${f.rel}: committed Supabase SERVICE_ROLE JWT`);
    else warn('secret-scan', `${f.rel}: contains a JWT-shaped string (verify it is not a secret)`);
  }
}

// ── 2b. SQL migrations/seed must be synthetic (no real PII, no dev email) ─────
// The DB migrations + seed ship in this PUBLIC repo, so they must never contain a
// real email, a real auth UUID, or production data. Enforce synthetic-only.
/* ⚠ THE DETECTOR MUST NOT BE THE LEAK. This guard's whole subject is «the maintainer's real address
   must never appear in a committed file», and it was implemented by writing that address into a
   committed file — in a PUBLIC repository, where it has been readable for as long as the check has
   existed. A hash answers the same question ("is this address the one?") without publishing the
   answer: every address the scan finds is hashed and compared, so the check gets STRONGER (it now
   catches a case-variant or a lookalike by value rather than by one regex) and the address is gone. */
const DEV_EMAIL_SHA256 = '1ee3ea177de1f01d0e475beebf5213000bcb781499ca17f6c6941645219bdd68';
const isDevEmail = (s) => createHash('sha256').update(String(s).trim().toLowerCase()).digest('hex') === DEV_EMAIL_SHA256;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
for (const f of ALL.filter((x) => x.rel.startsWith('supabase/') && x.ext === '.sql')) {
  const t = read(f);
  for (const m of t.matchAll(EMAIL_RE)) {
    const email = m[0];
    if (isDevEmail(email)) {
      err('sql-pii', `${f.rel}: contains the real developer email — SQL must use synthetic *.test addresses only`);
      continue;
    }
    // Allowed: reserved test TLD (.test) and documentation domains (example.*).
    if (!/\.test$/i.test(email) && !/@example\.(?:com|org|net|test)$/i.test(email)) {
      err('sql-pii', `${f.rel}: non-synthetic email "${email}" — use a *.test address in migrations/seed`);
    }
  }
}

// ── 2c. Destructive-migration detector (§11: never run un-flagged) ───────────
// Surface data-destructive DDL in migrations so it is never applied unnoticed.
// WARNING, not error: destructive changes ARE sometimes intended — they just must
// be seen + reviewed (see docs/MIGRATIONS.md). Safe idempotency guards like
// `drop policy if exists` / `drop trigger if exists` deliberately don't match.
const DESTRUCTIVE = [
  { name: 'DROP TABLE', re: /\bdrop\s+table\b/i },
  { name: 'DROP COLUMN', re: /\bdrop\s+column\b/i },
  { name: 'ALTER … TYPE', re: /\balter\s+column\b[\s\S]{0,60}?\btype\b/i },
  { name: 'DISABLE ROW LEVEL SECURITY', re: /\bdisable\s+row\s+level\s+security\b/i },
  // Match TRUNCATE only as a STATEMENT (start of a statement), so that REVOKEing
  // the TRUNCATE *privilege* — which is hardening, the opposite of destructive —
  // is not flagged. A real `truncate [table] x` always begins a statement.
  { name: 'TRUNCATE', re: /(?:^|;)\s*truncate\b/im },
  { name: 'DELETE FROM', re: /\bdelete\s+from\b/i },
];
const stripSqlComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
for (const f of ALL.filter((x) => x.rel.startsWith('supabase/migrations/') && x.ext === '.sql')) {
  const t = stripSqlComments(read(f));   // scan executable DDL only, not comments
  for (const d of DESTRUCTIVE) {
    if (d.re.test(t)) warn('migration-destructive', `${f.rel}: contains ${d.name} — destructive; back up + review before applying (docs/MIGRATIONS.md)`);
  }
}

// ── 3. JSON validity ─────────────────────────────────────────────────────────
for (const f of ALL.filter((f) => f.ext === '.json')) {
  try { JSON.parse(read(f)); }
  catch (e) { err('json', `${f.rel}: invalid JSON — ${e.message}`); }
}

/* ══ 4. JS / TS syntax (node --check; Node ≥22 strips TS types) ══════════════════════════════════
   ⚠ (#R206) ONE PROCESS PER FILE, IN A ROW, WAS 90 % OF THIS SCRIPT. 「毎回毎回、テストに時間が
   かかりすぎ。…すべてが長すぎる。」 A CPU profile of the shipped script: 25.4 s total, of which
   22.9 s (90.1 %) is `spawnSync` — 501 sequential `node --check` launches, one per file, at ~45 ms
   of process start-up each. The CHECK is nothing; the launching is everything. (Half of the 501 were
   the other worktree the walk above no longer enters.)

   Same binary, same flag, same verdict per file — just not one at a time. `node --check` is a pure
   function of the file, so the only thing serialising them bought was the wall clock. Concurrency is
   the CPU count (bounded), which is what saturates a launcher-bound workload without thrashing it. */
const codeFiles = ALL.filter((f) => ['.js', '.mjs', '.cjs', '.ts'].includes(f.ext));
{
  const LANES = Math.max(4, Math.min(16, (cpus() || []).length || 8));
  const check = (f) => new Promise((res) => {
    execFile(process.execPath, ['--check', f.abs], { encoding: 'utf8' }, (e, stdout, stderr) => {
      if (e) {
        const detail = (stderr || stdout || '').split('\n').filter(Boolean).slice(0, 3).join(' | ');
        err('syntax', `${f.rel}: ${detail || 'node --check failed'}`);
      }
      res();
    });
  });
  let next = 0;
  const lane = async () => { while (next < codeFiles.length) await check(codeFiles[next++]); };
  await Promise.all(Array.from({ length: LANES }, lane));
  /* ⚠ the errors are pushed from callbacks, so the ORDER of `errors` is now completion order rather
     than directory order. Nothing reads it as an order — the report below prints the list — and a
     stable order is restored by sorting there if it is ever needed. */
}

// ── 5. YAML validity (workflows + any .yml/.yaml) ────────────────────────────
const yamlFiles = ALL.filter((f) => f.ext === '.yml' || f.ext === '.yaml');
let yaml = null;
try { yaml = (await import('js-yaml')).default; } catch { /* installed via npm ci; degrade gracefully */ }
for (const f of yamlFiles) {
  const t = read(f);
  if (/\t/.test(t)) err('yaml', `${f.rel}: contains a TAB character (YAML forbids tabs for indentation)`);
  if (!yaml) { warn('yaml', `${f.rel}: js-yaml not installed — parsed structurally only (run npm ci)`); continue; }
  let doc;
  try { doc = yaml.load(t); }
  catch (e) { err('yaml', `${f.rel}: invalid YAML — ${e.message}`); continue; }
  // Workflow-specific structural + security checks.
  if (f.rel.startsWith('.github/workflows/')) {
    if (!doc || (!('on' in doc) && !(true in doc))) err('yaml', `${f.rel}: workflow missing an "on:" trigger`);
    if (!doc || !doc.jobs || typeof doc.jobs !== 'object') err('yaml', `${f.rel}: workflow has no jobs`);
    if (doc && !('permissions' in doc)) {
      const jobPerms = doc.jobs && Object.values(doc.jobs).every((j) => j && 'permissions' in j);
      if (!jobPerms) warn('workflow-perms', `${f.rel}: no explicit "permissions:" — GITHUB_TOKEN defaults are broad; pin least privilege`);
    }
    if (/pull_request_target/.test(t) && /actions\/checkout/.test(t)) {
      warn('workflow-security', `${f.rel}: uses pull_request_target with checkout — never build/run untrusted PR code with repo secrets`);
    }
    /* (#R138) Supply-chain: an action pinned to a moveable tag can be repointed to malicious code —
       `v4` is a branch-like ref its owner rewrites on every release, so "pinned to v4" means "runs
       whatever that owner publishes next", inside this repo's CI, with this repo's GITHUB_TOKEN.
       ⚠ TWO THINGS CHANGED, AND THE FIRST ONE IS WHY THIS FOUND NOTHING FOR MANY ROUNDS.
         · The exemption. `actions/*` and `github/*` were skipped as "GitHub-owned (tags acceptable)",
           which is where ALL of this repo's remote actions live — so the check ran on an empty set
           and passed by having nothing to look at. GitHub-owned or not, the tag still moves, and
           GitHub's own hardening guidance is to pin every action by SHA. Every one of them is now
           pinned (with the version in a trailing comment, which is what Dependabot bumps), so the
           exemption has nothing left to protect and is gone.
         · WARNING → ERROR. A warning that nobody has to clear is a note, not a gate.
       A LOCAL action (`uses: ./…`) is read off the checked-out workspace and is not fetched, so it
       has nothing to pin. */
    for (const m of t.matchAll(/(?:^|\s)uses:\s*(\S+)/g)) {
      const ref = (m[1] || '').replace(/["']/g, '');
      if (ref.startsWith('./') || ref.startsWith('docker://')) continue;
      const at = ref.lastIndexOf('@');
      if (at < 0 || !/^[0-9a-f]{40}$/.test(ref.slice(at + 1))) {
        err('action-pinning', `${f.rel}: action ${ref} is not pinned to a full commit SHA (supply-chain: whoever controls that repository can move a tag)`);
      }
    }
    // NOTE: expression-injection into run: blocks (${{ inputs.* }} → shell) is checked by CodeQL's
    // dedicated Actions query (.github/workflows/security.yml) — a regex can't tell a run: body from a
    // later step's env: block on this YAML, so it is not re-implemented here (avoids false positives).
  }
}

// ── 6. Referenced local assets exist (index.html / admin.html) ───────────────
for (const htmlName of ['index.html', 'admin.html']) {
  const f = ALL.find((x) => x.rel === htmlName);
  if (!f) continue;
  const t = read(f);
  const refs = new Set();
  for (const m of t.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) refs.add(m[1]);
  // CSS url(...) asset refs ONLY. The negative lookbehind excludes JS method calls like
  // `IntMapSafe.url(link)` / `foo.url(x)` — a CSS url() is always preceded by ':', ',', space
  // or '(', never by an identifier char or '.', so no real CSS asset ref is missed. (#R138)
  for (const m of t.matchAll(/(?<![\w.$])url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) refs.add(m[1]);
  for (let r0 of refs) {
    r0 = r0.trim();
    if (!r0 || /^(https?:|data:|blob:|mailto:|tel:|#|\/\/|javascript:)/i.test(r0)) continue;
    const clean = r0.split('?')[0].split('#')[0].replace(/^\.?\//, '');
    // Only verify refs that are plain relative paths. Anything with a JS operator/quote/
    // template char is a value built at runtime (e.g. src="'+esc(img)+'") — not a static file.
    if (!clean || !/^[\w\-./]+$/.test(clean)) continue;
    if (OPTIONAL_LOCAL.has(clean)) continue;
    if (!existsSync(join(ROOT, clean))) err('assets', `${htmlName}: references missing local file "${clean}"`);
  }
}

// ── 7. (#R161) NewsGeo engine mirror is in sync ──────────────────────────────
// js/newsgeo.js is the single source of truth; supabase/functions/_shared/newsgeo.js is a
// generated byte-identical copy (an Edge Function cannot import outside supabase/functions/).
// Editing one and not the other would silently make the server and the browser place the same
// headline on two different pins — exactly the class of drift this repo cannot debug later.
try {
  const { inSync } = await import('./sync-newsgeo.mjs');
  if (!inSync()) err('newsgeo-mirror', 'supabase/functions/_shared/newsgeo.js is out of sync with js/newsgeo.js — run: node scripts/sync-newsgeo.mjs');
} catch (e) {
  err('newsgeo-mirror', 'could not verify the newsgeo mirror: ' + (e && e.message));
}

// ── 7b. (#R285) Atlas persona mirror is in sync ──────────────────────────────
// js/atlas-persona.js is the single source of truth for WHO ATLAS IS; the two Edge Functions that
// also speak as Atlas read the generated copy at supabase/functions/_shared/atlas-persona.js.
// Editing one and not the other is how a product ends up with two Atlases whose characters differ
// by which half of the stack answered — the exact thing #R285 existed to remove.
try {
  const { inSync } = await import('./sync-atlas-persona.mjs');
  if (!inSync()) err('persona-mirror', 'supabase/functions/_shared/atlas-persona.js is out of sync with js/atlas-persona.js — run: node scripts/sync-atlas-persona.mjs');
} catch (e) {
  err('persona-mirror', 'could not verify the atlas-persona mirror: ' + (e && e.message));
}

// ── 8. (#R162) index.html file-split integrity ───────────────────────────────
// index.html is being split into css/ + js/ (standing rule 13). Two ways that goes wrong
// silently: (a) a module file exists but nothing loads it — the app then boots with the
// global missing and only fails when that feature is first touched; (b) code is copied out
// but the original is left behind, so two divergent copies ship and the in-page one wins.
// Guard both mechanically.
// (#R175) Both halves moved when the build landed: the js/ files are now imported by the Vite entry
// src/main.js instead of carrying a <script src> tag each, and the code that instantiates their
// factories is js/app-body.js (index.html's old inline body). The QUESTIONS are unchanged — is every
// module reachable, is every factory actually called, is there a stale duplicate — only the file each
// one is asked of has changed. Asking the old files would make all three checks vacuously pass, which
// is the worst possible outcome for guards whose whole job is to catch a silent loss.
{
  const idx = ALL.find((x) => x.rel === 'index.html');
  const entry = ALL.find((x) => x.rel === 'src/main.js');
  const bodyF = ALL.find((x) => x.rel === 'js/app-body.js');
  if (!entry) err('split', 'src/main.js is missing — nothing imports the js/ modules');
  if (!bodyF) err('split', 'js/app-body.js is missing — the application body is gone');
  if (idx && entry && bodyF) {
    /* (#R178) …and js/geo-engine.js, which is where the renderer adapter moved. It instantiates
       IntMapModules.solid3d (the closed-body custom layer), so it is a factory CALL SITE now. */
    const engineF = ALL.find((x) => x.rel === 'js/geo-engine.js');
    /* (#R200) …and every js/ file js/app-body.js STATICALLY IMPORTS. Those are not "modules" in the
       registry sense — they are pieces of the application body that now live in their own files, moved
       there verbatim — so a factory call that travelled with one of them is still a call from the page.
       Without this the check reported js/tile-warm.js as "defined but never called" the moment the
       block that mounts it moved into js/label-occlusion.js: the mount had not disappeared, only the
       file it sits in had changed. #R199 taught the reachability half of this check the same lesson. */
    const bodySib = [...read(bodyF).matchAll(/^\s*import\s[^;]*?from\s*'\.\/([A-Za-z0-9_.-]+\.js)'\s*;/gm)]
      .map((m) => ALL.find((x) => x.rel === 'js/' + m[1])).filter(Boolean);
    const t = read(bodyF) + '\n' + read(idx) + '\n' + (engineF ? read(engineF) : '')
      + '\n' + bodySib.map(read).join('\n');   // where factories are called from
    const e = read(entry);
    const imported = new Set([...e.matchAll(/import\s+'\.\.\/(js\/[^']+)'/g)].map((m) => m[1]));
    /* (#R180) …and the ones reached by DYNAMIC import from a module that IS in the entry.
       The question this check asks — "is every module actually reachable, or is it dead code
       whose feature silently never exists?" — is unchanged; what changed is that a module can
       now be reachable on purpose WITHOUT being in the static graph. The second rendering
       engine is loaded by `import('./cesium-engine.js')` inside js/engine-select.js precisely
       so that a MapLibre session never downloads it, and listing it in src/main.js would undo
       that. So a dynamic import from an already-reachable js/ file counts as reachable, and a
       file nothing imports at all still fails. */
    const dyn = new Set();
    /* (#R199) …and the STATIC sibling import — `import { makeAtlasReply } from './atlas-reply.js';`
       inside another js/ file. This is the third and strongest form of reachability, and until this
       round the check could not see it: the six subsystems the Atlas kernel shed are named ES exports,
       not window.IntMapModules registrations, precisely because 「読み込み順序にも依存しています」 was
       the complaint. A named binding is resolved by the bundler — a typo is a BUILD error rather than an
       undefined at runtime — and the import graph, not src/main.js's list, decides the order. */
    const sib = new Set();
    /* (#R218) …and the fourth: a <script src> from one of the STANDALONE PAGES. index.html is not the
       only entry point this repo ships — sources.html and science.html are their own documents (see
       vite.config.js's STATIC_ASSETS), and since #R218 they are shells that pull js/page-i18n.js and
       js/sources-list.js directly. Those files are reachable, on purpose, and the question this check
       asks («is this module dead code whose feature silently never exists?») is answered by the page
       that loads them. Reading the pages rather than exempting the two filenames keeps the check
       honest: delete the <script> tag and the module goes back to failing. */
    for (const page of ['sources.html', 'science.html', 'admin.html', 'privacy.html', 'terms.html']) {
      const p = join(ROOT, page);
      if (!existsSync(p)) continue;
      for (const m of readFileSync(p, 'utf8').matchAll(/<script[^>]*\ssrc=["']\.\/(js\/[A-Za-z0-9_.-]+\.js)["']/g)) sib.add(m[1]);
    }
    for (const f of ALL.filter((x) => /^js\/[^/]+\.js$/.test(x.rel))) {
      const t = read(f);
      for (const m of t.matchAll(/import\(\s*'\.\/([A-Za-z0-9_.-]+\.js)'\s*\)/g)) dyn.add('js/' + m[1]);
      for (const m of t.matchAll(/^\s*import\s[^;]*?from\s*'\.\/([A-Za-z0-9_.-]+\.js)'\s*;/gm)) sib.add('js/' + m[1]);
      for (const m of t.matchAll(/^\s*import\s*'\.\/([A-Za-z0-9_.-]+\.js)'\s*;/gm)) sib.add('js/' + m[1]);
    }
    for (const rel of dyn) {
      if (!ALL.some((x) => x.rel === rel)) err('split', `a js/ module dynamically imports ${rel}, which does not exist`);
    }
    for (const rel of sib) {
      if (!ALL.some((x) => x.rel === rel)) err('split', `a js/ module imports ${rel}, which does not exist`);
    }
    for (const f of ALL.filter((x) => /^js\/[^/]+\.js$/.test(x.rel))) {
      if (!imported.has(f.rel) && !dyn.has(f.rel) && !sib.has(f.rel)) err('split', `${f.rel} exists but nothing imports it (add import '../${f.rel}'; to src/main.js, or import() it from a module that is imported)`);
    }
    // …and nothing may be imported that no longer exists (a dangling import breaks the whole bundle).
    for (const rel of imported) {
      if (!ALL.some((x) => x.rel === rel)) err('split', `src/main.js imports ${rel}, which does not exist`);
    }
    // Every factory a module file defines must actually be instantiated.
    for (const f of ALL.filter((x) => /^js\/[^/]+\.js$/.test(x.rel))) {
      for (const m of read(f).matchAll(/window\.IntMapModules\.(\w+)\s*=\s*function/g)) {
        if (!t.includes(`window.IntMapModules.${m[1]}(`)) {
          err('split', `${f.rel} defines factory IntMapModules.${m[1]} but nothing ever calls it`);
        }
      }
    }
    // Nothing that moved out may still be defined in the app body (no stale duplicate).
    for (const [needle, movedTo] of [
      ['const i18n={', 'js/i18n.js'],
      ['const _BUILTIN_GZ=[', 'js/gazetteer.js'],
      ['const _EXTRA_GZ=[', 'js/gazetteer.js'],
      ['const DEFAULT_DASH_CARDS=[', 'js/reference-data.js'],
      ['const DATA_SOURCES=[', 'js/reference-data.js'],
      ['window.IntMapMonitors=(function(){', 'js/monitors.js'],
      ['window.IntMapMaddison=(function(){', 'js/history.js'],
      ['window.IntMapHistStates=(function(){', 'js/history.js'],
      ['window.IntMapHistId=(function(){', 'js/history.js'],
      ['window.IntMapLayerPreviews=(function(){', 'js/layer-previews.js'],
      ['window.IntMapCompanies=(function(){', 'js/companies.js'],
      ['window.IntMapStatsCompare=(function(){', 'js/stats-compare.js'],
      ['window.IntMapCompare=(function(){', 'js/compare.js'],
      ['window.IntMapRouting=(function(){', 'js/routing.js'],
      ['window.IntMapStreetView=(function(){', 'js/street-view.js'],
      ['window.IntMapFlightSim=(function(){', 'js/flight-sim.js'],
      ['window.IntMapTimeBorders=(function(){', 'js/time-borders.js'],
      // (#R164) the third split. The bare-IIFE modules have no `window.X=(function(){` head, so a
      // distinctive interior string stands in as the stale-copy needle.
      ['lyrEU:"EU members"', 'js/data-layers.js'],
      ['window.IntMapWorkspace=(function(){', 'js/workspace.js'],
      ['Widget board v3', 'js/widgets.js'],
      ['refreshStatsLatest', 'js/wb-layers.js'],
      ['DeepStateMap', 'js/beta-overlays.js'],
      ['otcmDone', 'js/cameras.js'],
      // (#R165) the Atlas kernel. The call line is `window.IntMapConsole=window.IntMapModules.
      // atlasConsole(map,IM_HOST);` so the old IIFE head below can only mean a stale copy.
      ['window.IntMapConsole=(function(){', 'js/atlas-console.js'],
      // (#R166) the fifth split — 41 blocks. Where the block opened with `window.X=(function(){`
      // that head IS the needle; the bare IIFEs get an interior string that a script verified
      // occurs EXACTLY ONCE across index.html + every js/ file, so a second hit can only be a
      // stale in-page copy.
      ['window.IntMapLayers=(function(){', 'js/map-ui.js'],
      ['window.IntMapLayerSidebar=(function(){', 'js/map-ui.js'],
      ['window.IntMapTicker=(function(){', 'js/map-ui.js'],
      ['window.IntMapShare=(function(){', 'js/map-ui.js'],
      ["'Save current layers as preset'", 'js/map-ui.js'],
      ["'No boundary available for this place'", 'js/map-ui.js'],
      ["'Failed to add layer'", 'js/map-ui.js'],
      ["addEventListener('hashchange'", 'js/map-ui.js'],
      ["'pg-overlay'", 'js/playground.js'],
      ['window.ProjView=(function(){', 'js/map-tools.js'],
      ['window.DrawTool=(function(){', 'js/map-tools.js'],
      ['window.IntMapIsolate=(function(){', 'js/map-tools.js'],
      ['window.IntMapRoute=(function(){', 'js/map-tools.js'],
      ['window.IntMapLOS=(function(){', 'js/map-tools.js'],
      ['window.IntMapOutline=(function(){', 'js/map-tools.js'],
      ['window.IntMapMoveShape=(function(){', 'js/map-tools.js'],
      ['window.IntMapIsochrone=(function(){', 'js/map-tools.js'],
      ['window.IntMapArc3D=(function(){', 'js/map-tools.js'],
      ['window.IntMapObjects=(function(){', 'js/map-tools.js'],
      ['window.Wind=(function(){', 'js/weather.js'],
      ['window.IntMapWeatherEC=(function(){', 'js/weather.js'],
      ['window.IntMapWeather=(function(){', 'js/weather.js'],
      ["'Three Gorges'", 'js/layer-packs.js'],
      ["'PlateName'", 'js/layer-packs.js'],
      ["'Standard 1435 mm'", 'js/layer-packs.js'],
      ["'IND NPL MUS'", 'js/layer-packs.js'],
      ["'Time zones'", 'js/layer-packs.js'],
      ["'gxndvi'", 'js/layer-packs.js'],
      // (#R315) js/analysis-panels.js was split into an eager shell and five on-demand bodies. The three
      // IIFE heads still belong to the shell — it is what publishes those globals at boot — but the two
      // interior needles travelled with the code they name, so they are asked of their new files.
      ['window.IntMapTimeSeries=(function(){', 'js/analysis-panels.js'],
      ['window.IntMapAIResearch=(function(){', 'js/analysis-panels.js'],
      ['window.IntMapEdu=(function(){', 'js/analysis-panels.js'],
      ["'Densidad de pob.'", 'js/analysis-correlate.js'],
      ["'Columbus reaches the Americas'", 'js/analysis-world-events.js'],
      ['window.IntMapRadiation=(function(){', 'js/sims.js'],
      ['window.IntMapPopArea=(function(){', 'js/sims.js'],
      ['window.IntMapSlope=(function(){', 'js/sims.js'],
      ['window.IntMapRF=(function(){', 'js/sims.js'],
      ['window.IntMapSun=(function(){', 'js/sims.js'],
      ['window.IntMapTransitReach=(function(){', 'js/sims.js'],
      ['window.IntMapDisaster=(function(){', 'js/sims.js'],
      ['window.IntMapEarthReplay=(function(){', 'js/sims.js'],
    ]) {
      if (read(bodyF).includes(needle)) err('split', `js/app-body.js still defines "${needle}" — it moved to ${movedTo}; delete the duplicate`);
    }
    // The stylesheet moved out; a re-inlined <style> block would resurrect the 230 KB.
    if (/<style>[\s\S]{4000,}?<\/style>/.test(read(idx))) {
      err('split', 'index.html contains a large inline <style> block again — the stylesheet belongs in css/intmap.css');
    }
    // (#R175) …and the program itself may not move back INTO the page. index.html is markup, styles and
    // one module tag now; an inline <script> big enough to be code again is the regression to catch,
    // because a bundler cannot see inside one (that is why the 496 KB body was moved out at all).
    for (const m of read(idx).matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      if (m[1].length > 20000) err('split', `index.html has a ${Math.round(m[1].length / 1024)} KB inline <script> — application code belongs in js/ where the build can minify it`);
    }
  }
}

// ── 9. (#R162) no split-out file may inherit an index.html closure variable ──
// The app code lives inside one DOMContentLoaded closure, so its top-level names are NOT
// globals. A file moved into js/ loses them — and because soft dependencies are written as
// `typeof X !== 'undefined'` and wrapped in try/catch, the loss is SILENT: the feature just
// stops working. Parser-backed, so it cannot be fooled the way a regex scan can.
// (#R163) It also fails on the weaker case the closure-name test cannot see: a free identifier
// that is neither a browser global, nor a closure top-level name, nor anything the app ever
// assigns to window — i.e. a name that resolves to nothing at runtime.
try {
  const { checkSplitScope } = await import('./check-split-scope.mjs');
  for (const p of checkSplitScope()) err('split-scope', `${p.file}: ${p.msg}`);
} catch (e) {
  err('split-scope', 'could not run the split-scope check: ' + (e && e.message));
}

// ── 10. (#R301) every node test file on disk is in the list `npm test` actually runs ──
// A per-round checks file that nobody added to `test:checks` is not a weaker test — it is not a
// test. tests/r260-checks.test.mjs ⑥ asks that question about ITSELF, so it only protects the
// rounds whose author was already thinking about the hazard; tests/r210 and tests/r211 were both
// left out anyway, and r211 sat RED with five failing assertions for ninety rounds.
// ⚠ IT LIVES HERE AND NOT IN `test:checks` ON PURPOSE: a guard for a list cannot be an entry in
// the list it guards. The comparison itself is in scripts/check-test-list.mjs so that
// tests/r301-checks.test.mjs can EXERCISE it on a repository that is wrong on purpose, rather
// than grep this file for the call and count that as proof.
try {
  const { checkTestListHere } = await import('./check-test-list.mjs');
  for (const p of checkTestListHere(ROOT)) err('node-tests', p.msg);
} catch (e) {
  err('node-tests', 'could not run the test-list check: ' + (e && e.message));
}

// ── Report ───────────────────────────────────────────────────────────────────
const byCheck = (arr) => arr.reduce((m, x) => ((m[x.check] = (m[x.check] || 0) + 1), m), {});
console.log(`\nIntMap static checks — scanned ${ALL.length} files (${codeFiles.length} JS/TS, ${yamlFiles.length} YAML)\n`);
if (warnings.length) {
  console.log(`⚠ ${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  · [${w.check}] ${w.msg}`);
  console.log('');
}
if (errors.length) {
  console.log(`✗ ${errors.length} error(s):`);
  for (const e of errors) console.log(`  · [${e.check}] ${e.msg}`);
  console.log('\nStatic checks FAILED:', JSON.stringify(byCheck(errors)));
  process.exit(1);
}
console.log('✓ static checks PASSED (no errors)');
process.exit(0);

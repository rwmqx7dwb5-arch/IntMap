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
import { spawnSync } from 'node:child_process';
import { join, extname, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');

// Directories never worth scanning.
const SKIP_DIRS = new Set(['.git', 'node_modules', 'playwright-report', 'test-results', '.cache', '.playwright', 'coverage']);
// Binary / large-asset extensions we do not read as text.
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.pdf', '.zip', '.gz', '.tif', '.tiff', '.mp4', '.mov']);
const TEXT_EXT = new Set(['.html', '.htm', '.js', '.mjs', '.cjs', '.ts', '.json', '.yml', '.yaml', '.md', '.css', '.py', '.txt', '.xml', '.svg', '.sql', '.toml']);

// Values that are PUBLIC on purpose (documented in index.html / README) — never flag these.
const PUBLIC_ALLOW = [
  'sb_publishable_yI9Rf2s4nzrIuqFyUq4OOA_h83PrRd0', // Supabase publishable/anon key — RLS protects every table
];
// Files referenced but intentionally optional (local-first with a CDN fallback).
const OPTIONAL_LOCAL = new Set(['supabase.js']);

const errors = [];
const warnings = [];
const err = (check, msg) => errors.push({ check, msg });
const warn = (check, msg) => warnings.push({ check, msg });

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(dir, name);
    let s;
    try { s = statSync(abs); } catch { continue; }
    if (s.isDirectory()) walk(abs, out);
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
const DEV_EMAIL = /2ppzc4kk6r@privaterelay\.appleid\.com/i;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
for (const f of ALL.filter((x) => x.rel.startsWith('supabase/') && x.ext === '.sql')) {
  const t = read(f);
  if (DEV_EMAIL.test(t)) {
    err('sql-pii', `${f.rel}: contains the real developer email — SQL must use synthetic *.test addresses only`);
  }
  for (const m of t.matchAll(EMAIL_RE)) {
    const email = m[0];
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

// ── 4. JS / TS syntax (node --check; Node ≥22 strips TS types) ────────────────
const codeFiles = ALL.filter((f) => ['.js', '.mjs', '.cjs', '.ts'].includes(f.ext));
for (const f of codeFiles) {
  const r = spawnSync(process.execPath, ['--check', f.abs], { encoding: 'utf8' });
  if (r.status !== 0) {
    const detail = (r.stderr || r.stdout || '').split('\n').filter(Boolean).slice(0, 3).join(' | ');
    err('syntax', `${f.rel}: ${detail || 'node --check failed'}`);
  }
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
    // (#R138) Supply-chain: a THIRD-PARTY action pinned to a moveable tag can be repointed to
    // malicious code. First-party actions/* and github/* are GitHub-owned (tags acceptable);
    // everything else should be pinned to a full 40-hex commit SHA (Dependabot bumps them).
    for (const m of t.matchAll(/(?:^|\s)uses:\s*([A-Za-z0-9._-]+)\/([A-Za-z0-9._\/-]+)@(\S+)/g)) {
      const owner = m[1], ref = (m[3] || '').replace(/["']/g, '');
      if (owner === 'actions' || owner === 'github') continue;         // GitHub-owned first-party
      if (!/^[0-9a-f]{40}$/.test(ref)) {
        warn('action-pinning', `${f.rel}: third-party action ${m[1]}/${m[2]}@${ref} is not SHA-pinned (supply-chain: pin to a full commit SHA)`);
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

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
import { jsReachability, standalonePages } from './js-reachability.mjs';
import { codeOnly } from './code-only.mjs';
import { SITE_TOKEN } from './site-url.mjs';
import { HUB as HISTORY_HUB } from './history-pages.mjs';
import { OTD_HUB } from './on-this-day-pages.mjs';
import { COUNTRY_HUB } from './country-pages.mjs';
import { pagePath as UPDATES_PAGE, feedPath as UPDATES_FEED } from './whats-new.mjs';
import { WEEKLY_HUB } from './weekly-earth-pages.mjs';   /* (weekly-earth) the weekly digest's hub, written by the build */
import { outOfOrder } from './migration-order.mjs';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');

// Directories never worth scanning.
/* (#R175) `dist` is the Vite build output — generated, minified, gitignored. Linting it would flag the
   bundler's own output and time out on the source maps; the SOURCES are what these checks are about. */
const SKIP_DIRS = new Set(['.git', 'node_modules', 'playwright-report', 'test-results', '.cache', '.playwright', 'coverage', 'dist',
  'dist-dev']);   /* (#R512) the unminified build scripts/phase-profile.mjs profiles against — ignored by git, and a build, not a source */
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

// ── 1b. 正規表現の中の制御文字  (#R394) ──────────────────────────
//  ⚠⚠⚠ **#R351 が書いた索引記事の門は、一度も発火していなかった。** 実測 (2026-08-24):
//
//      /^(?:.{0,80}?--\\s*)?the following (is|are)<0x08>/i
//
//  末尾は `\\b`（語境界）のつもりで、実体は **バックスペース文字 1 個**だった。書いた道具が
//  バックスラッシュを 1 段落として潰した結果で、**JavaScript としては完全に妥当**なので
//  `node --check` も lint も何も言わない。ただ「見出しの直後にバックスペース」という、
//  どの記事にも起こらない条件を要求するだけになる。⇒ 門は緑のまま、Yonhap の索引記事は
//  1 本も落ちていなかった。#R394 は同じ罠を同じファイルで踏み、そこで気づいた。
//
//  ⚠ 「制御文字を禁止する」ではない。`js/world-packs.js` や `scripts/rail/build.mjs` は
//    U+0001 を**区切り文字として意図的に**使っており、それは正しい。危ないのは
//    **正規表現の中**だけである——そこに制御文字が要る理由はまず無く、あるとすれば
//    それは潰れたエスケープである。実測: ソース 858 本のうち制御文字を含む 12 行のうち、
//    10 行は意図的な区切りで、壊れていたのはこの規則が見る 2 行だけだった。
{
  /* ⚠ 正規表現リテラルで書かない——**この規則自身が禁じているもの**を自分の中に持たない
     ように、制御文字は文字コードで判定する。 */
  const isCtrl = (c) => (c < 32 && c !== 9) || c === 127;
  for (const f of textFiles) {
    if (!(f.rel.endsWith('.js') || f.rel.endsWith('.mjs') || f.rel.endsWith('.ts'))) continue;
    if (f.rel === 'scripts/static-checks.mjs') continue;
    const t = read(f);
    let any = false;
    for (let k = 0; k < t.length; k++) if (isCtrl(t.charCodeAt(k))) { any = true; break; }
    if (!any) continue;
    t.split('\n').forEach((line, i) => {
      for (let k = 0; k < line.length; k++) {
        if (!isCtrl(line.charCodeAt(k))) continue;
        /* 前後に `/` があれば、その制御文字は正規表現リテラルの中にいる。
           区切り文字として意図的に使っている行（world-packs / rail / zh-hans）は
           文字列リテラルの中なので、この条件に当たらない。 */
        const before = line.lastIndexOf('/', k);
        const after = line.indexOf('/', k + 1);
        if (before < 0 || after < 0) continue;
        const code = '0x' + line.charCodeAt(k).toString(16).padStart(2, '0');
        err('regex-control-char',
          `${f.rel}:${i + 1}: a regular expression contains a raw control character (${code}) — `
          + 'almost certainly a backslash escape a tool flattened. It is valid JavaScript and can never match.');
        break;
      }
    });
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
const stripSqlComments = (s) => codeOnly(s, { lang: 'sql' });
for (const f of ALL.filter((x) => x.rel.startsWith('supabase/migrations/') && x.ext === '.sql')) {
  const t = stripSqlComments(read(f));   // scan executable DDL only, not comments
  for (const d of DESTRUCTIVE) {
    if (d.re.test(t)) warn('migration-destructive', `${f.rel}: contains ${d.name} — destructive; back up + review before applying (docs/MIGRATIONS.md)`);
  }
}

// (migration-order-guard) A migration a change ADDS must sort after every migration already on the base.
// Measured 2026-10-01: #869 added 20261002090000_usage_counts.sql after #867 had already applied
// 20261002100000 to production; supabase db push --dry-run then refused the whole history (it will not apply a
// migration older than one the remote has recorded), so the post-merge deploy failed and 22 Edge Functions were
// left undeployed. Two PRs written in parallel each picked a timestamp that was "next" on the main they forked
// from; nothing compared them until production did. The rule reads the base's own migration list (not a
// hand-kept latest timestamp) and compares only names, so it is true for any later file as well.
{
  const MIG = 'supabase/migrations/';
  const stamp = (n) => (/^(\d{14})_/.exec(n.split('/').pop()) || [])[1] || null;
  const base = process.env.IM_DIFF_BASE || (process.env.GITHUB_EVENT_NAME === 'pull_request' ? 'HEAD^1' : 'origin/main');
  let onBase = null;
  try {
    onBase = (await new Promise((res, rej) => execFile('git', ['ls-tree', '--name-only', base, MIG], { cwd: ROOT }, (e, out) => (e ? rej(e) : res(out)))))
      .split('\n').map((x) => x.trim().split('/').pop()).filter(Boolean);
  } catch { /* the base is not in this checkout */ }
  if (!onBase) warn('migration-order', 'could not read ' + base + ':' + MIG + ' — the order of added migrations was not measured here (the post-merge deploy still refuses an out-of-order history)');
  else {
    const inTree = ALL.filter((y) => y.rel.startsWith(MIG) && y.ext === '.sql').map((y) => y.rel.slice(MIG.length));
    for (const o of outOfOrder(onBase, inTree)) err('migration-order', MIG + o.name + ': added with timestamp ' + o.stamp + ', not after ' + o.latest + ' (the newest migration on ' + base + ') — production refuses a migration older than one it has applied; rename it to a later timestamp');
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
/* ⚠ NAMED, NOT `.default`. js-yaml 5 has no default export, and reading `.default` returned undefined
   without throwing — which this line took for "not installed", so every workflow would have been
   checked structurally only, with a warning, on a green run. Only a failed import degrades. */
try { const { load } = await import('js-yaml'); yaml = { load }; } catch { /* installed via npm ci; degrade gracefully */ }
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

// ── 6. Referenced local assets exist — EVERY page at the root, discovered ───────
// ⚠ (2026-09-27) This read a hand-written pair, index.html and admin.html, so sources.html /
// science.html / privacy.html / terms.html — the pages a reader opens from the footer — had no
// machine check that what they link to exists. The pages are the tracked *.html at the root.
for (const htmlName of ALL.filter((x) => !x.rel.includes('/') && x.rel.endsWith('.html')).map((x) => x.rel)) {
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
    /* (landing-showcase) an ABSOLUTE address the build writes in (scripts/site-url.mjs fillSiteToken) — the
       canonical / hreflang of a generated page — is not a local file */
    if (r0.startsWith(SITE_TOKEN)) continue;
    if (!r0 || /^(https?:|data:|blob:|mailto:|tel:|#|\/\/|javascript:)/i.test(r0)) continue;
    const clean = r0.split('?')[0].split('#')[0].replace(/^\.?\//, '');
    // Only verify refs that are plain relative paths. Anything with a JS operator/quote/
    // template char is a value built at runtime (e.g. src="'+esc(img)+'") — not a static file.
    if (!clean || !/^[\w\-./]+$/.test(clean)) continue;
    if (OPTIONAL_LOCAL.has(clean)) continue;
    /* (teachers-and-entrances) the history pages are WRITTEN BY THE BUILD into dist/ (scripts/history-pages.mjs; none of
       them is tracked), so a link into their hub cannot name a tracked file. Where they live is that
       generator's HUB, read here, not retyped. */
    if (clean === HISTORY_HUB || clean.startsWith(HISTORY_HUB)) continue;
    /* (press-room) the updates page and its Atom feed are written by the build too (scripts/whats-new.mjs), under the names that file gives them */
    if (clean === UPDATES_PAGE({ dir: '' }) || clean === UPDATES_FEED({ dir: '' })) continue;
    if (clean === OTD_HUB || clean.startsWith(OTD_HUB)) continue;   /* (marketing-next) the «on this day» pages: the same, from scripts/on-this-day-pages.mjs */
    if (clean === COUNTRY_HUB || clean.startsWith(COUNTRY_HUB)) continue;   /* (country-pages) the country pages: the same, from scripts/country-pages.mjs */
    if (clean === WEEKLY_HUB || clean.startsWith(WEEKLY_HUB)) continue;   /* (weekly-earth) «this week on Earth»: the same, from scripts/weekly-earth-pages.mjs */
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

// ── 7a. (#R341) aviation codec + model mirrors are in sync ───────────────────
// js/aviation-codec.js and js/aviation-model.js are the single source of truth for the IMAV/1 wire
// format and for what a normalised aircraft record IS; supabase/functions/_shared/ holds generated
// byte-identical copies (an Edge Function cannot import outside supabase/functions/).
// ⚠ This one is sharper than the newsgeo mirror it copies: a drifted codec makes the encoder and
// the decoder disagree about a byte offset, and every aircraft in the world lands somewhere
// plausible and wrong.
try {
  const { inSync, outOfSync } = await import('./sync-aviation.mjs');
  if (!inSync()) err('aviation-mirror', 'out of sync with js/: ' + outOfSync().join(', ') + ' — run: node scripts/sync-aviation.mjs');
} catch (e) {
  err('aviation-mirror', 'could not verify the aviation mirrors: ' + (e && e.message));
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
    for (const page of standalonePages(ROOT)) {   /* (sales-channels) discovered — scripts/js-reachability.mjs */
      const p = join(ROOT, page);
      if (!existsSync(p)) continue;
      for (const m of readFileSync(p, 'utf8').matchAll(/<script[^>]*\ssrc=["']\.\/(js\/[A-Za-z0-9_.-]+\.js)["']/g)) sib.add(m[1]);
    }
    /* (#R341) …and the FIFTH: a WORKER in src/ importing a js/ module — reached by
       `new Worker(new URL(…, import.meta.url))` rather than by an import statement, so it is not in
       src/main.js's graph, while what IT imports is every bit as alive as what main.js imports.
       ⚠ ALL FIVE FORMS NOW COME FROM scripts/js-reachability.mjs, which tests/layer-boot-graph-checks.test.mjs (#R175)
       reads too. They used to be written out twice and the copies drifted the moment this fifth
       form appeared — the #R318 shape. */
    const REACH = jsReachability(ROOT, ALL.filter((x) => /^js\/[^/]+\.js$/.test(x.rel)).map((x) => x.rel.slice(3)));
    for (const rel of REACH.dyn) {
      if (!ALL.some((x) => x.rel === rel)) err('split', `a js/ module dynamically imports ${rel}, which does not exist`);
    }
    for (const rel of REACH.sib) {
      if (!ALL.some((x) => x.rel === rel)) err('split', `a js/ module imports ${rel}, which does not exist`);
    }
    for (const f of ALL.filter((x) => /^js\/[^/]+\.js$/.test(x.rel))) {
      if (!REACH.isReachable(f.rel)) err('split', `${f.rel} exists but nothing imports it (add import '../${f.rel}'; to src/main.js, import() it from a module that is imported, or import it from a src/ worker)`);
    }
    // …and nothing may be imported that no longer exists (a dangling import breaks the whole bundle).
    for (const rel of imported) {
      if (!ALL.some((x) => x.rel === rel)) err('split', `src/main.js imports ${rel}, which does not exist`);
    }
    // (module-graph) A factory is an `export function` now and its caller imports it by name, so «defined
    // but never instantiated» is a dead export — scripts/export-readers.mjs holds that, for every export,
    // not only for the ones spelled as factories. What is held here is that the registry stays dissolved:
    // a factory handed over by a string key on a shared object is an edge no bundler, no Node import and
    // no dead-export check can see, which is the whole reason it was taken apart.
    for (const f of ALL.filter((x) => /^(js|src)\/.+\.js$/.test(x.rel))) {
      for (const m of codeOnly(read(f)).matchAll(/(?<![\w$.])(?:window|globalThis|self)\.IntMapModules\b/g)) {
        err('split', `${f.rel} reaches for window.IntMapModules (${m[0]}) — export the factory and import it by name (scripts/module-graph.mjs)`);
        break;
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
      // (#R322) js/analysis-panels.js was split into an eager shell and five on-demand bodies. The three
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

// ── 10. (#R529) a file of tests the runner will never look at ──
// `test:checks` used to be one hand-written literal naming all 292 files, and this slot held the
// comparison between that literal and the disk — #R301, after tests/shell-data-layers-checks.test.mjs (#R210) and tests/hazard-terrain-water-checks.test.mjs (#R211) were found
// never to have run at all, then #R385 and #R390 as the literal found two further ways to be wrong.
// #R529 deleted the literal instead: `node --test "tests/**/*.test.mjs"` discovers the files itself,
// so «in the list» and «not in the list» stopped being states a file can be in, and the three
// guards stacked on that literal went with it.
// ⚠ WHAT SURVIVES IS THE OTHER HALF OF #R390. The runner's idea of a test file is its NAME, so a
// `.mjs` under tests/ that imports `node:test` under any other name is invisible: it never runs, so
// it never fails and never passes. That is exactly what tests/security-logic.mjs (31 tests, #R138)
// was for three rounds while every gate in this repository stayed green. #R529 renamed it to
// tests/security-logic.test.mjs so the convention has no exception left — and this asks the DISK,
// not a list, that it stays that way. A helper, a fixture or a corpus imports nothing of the kind
// and is not demanded.
const DECLARES_NODE_TESTS =
  /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*|^\s*import\s+)['"]node:test['"]/m;
for (const f of ALL) {
  if (f.ext !== '.mjs' || !f.rel.startsWith('tests/') || f.rel.endsWith('.test.mjs')) continue;
  if (!DECLARES_NODE_TESTS.test(read(f))) continue;
  err('node-tests', `${f.rel} imports node:test but is not named *.test.mjs — test:checks discovers`
    + ' tests/**/*.test.mjs by NAME, so this file never runs');
}

// ── 11. (#R674) a filename another session is about to create too ──
// A round's own files used to be named for the round and nothing else, and a round number is not
// a name: every parallel session takes «the next free number» from the same scan and takes it
// again whenever origin/main moves. #R671 measured seven renumberings in one round and an add/add
// conflict on tests/r568-checks.test.mjs (since regrouped into tests/radiation-plume-checks.test.mjs) whose markers were committed, leaving a whole file of
// regressions unparseable. (2026-09-25) New files carry no round number at all — they are named
// for their slug — and the existing r<N>… files are history. The rule, the two legacy numbers and
// why they are numbers rather than a list of spellings all live in scripts/round-names.mjs; the
// walk stays here because this is the file that already has one.
try {
  const { roundNameProblems } = await import('./round-names.mjs');
  const testNames = ALL
    .filter((f) => f.rel.startsWith('tests/') && !f.rel.slice('tests/'.length).includes('/'))
    .map((f) => f.rel.slice('tests/'.length));
  for (const p of roundNameProblems(testNames)) err('round-name', p);
} catch (e) {
  err('round-name', 'could not run the round-artefact name check: ' + (e && e.message));
}

// ── 12. (safe-output-one-source) one output encoder: local escapers, live-document text parses and
// href/src values not started by IntMapSafe.url may only go DOWN — the rule and the ledger are in
// scripts/safe-output.mjs / scripts/safe-output-ledger.json.
try {
  const { safeOutputProblems } = await import('./safe-output.mjs');
  for (const p of safeOutputProblems()) err('safe-output', p);
} catch (e) {
  err('safe-output', 'could not run the safe-output ratchet: ' + (e && e.message));
}

// ── 14. a script the served site pulls from another origin, unpinned ──
// #R175 bundled the seven CDN <script> tags, and the two loaders that insert a <script> at RUNTIME
// (the ECMWF tile SDK, and a PMTiles plugin since removed) went on running unpinned unpkg code on this origin — where
// the Supabase session and the reader's AI keys are readable. The rule is on the fact, not the files:
// every cross-origin script carries integrity + crossorigin or is declared UNPINNABLE with a reason,
// and every CSP script-src host is used or declared CSP_ONLY. The net, the universe and the two tables
// live in scripts/runtime-scripts.mjs.
try {
  const { collectServed, runtimeScriptProblems } = await import('./runtime-scripts.mjs');
  for (const p of runtimeScriptProblems(collectServed(ROOT)).problems) err('runtime-scripts', p);
} catch (e) {
  err('runtime-scripts', 'could not run the cross-origin script check: ' + (e && e.message));
}

// ── 14b. (csp-without-inline) inline code is admitted by hash, never wholesale ──
// Every served page states a script policy; no script-src carries 'unsafe-inline'; a page's sha256
// sources are exactly the hashes of its inline <script>s; no inline event attribute (onclick=…) is
// served — not in markup, not in a string that builds markup — and every data-im-* action name is
// declared in js/inline-actions.js, and every declared one is used. The rule and the hashing live in
// scripts/csp.mjs (which the build runs too, over dist/). A rule here and not a check:* of its own for
// the reason given at 15.
try {
  const { collectServed } = await import('./runtime-scripts.mjs');
  const { scriptPolicyProblems, declaredActions } = await import('./csp.mjs');
  for (const p of scriptPolicyProblems(collectServed(ROOT), await declaredActions(ROOT))) err('script-policy', p);
} catch (e) {
  err('script-policy', 'could not run the script-policy check: ' + (e && e.message));
}

// ── 15. (fetch-deadline-layer) a request that cannot end is not added unseen ──
// A `fetch()` with no signal against a host that has stopped answering is permanent, and whatever
// awaits it — a layer row, a shared in-flight entry, an Atlas turn — inherits that. The app's way
// out is js/fetch-deadline.js (readWithin/jsonWithin) under js/proxy-fetch.js clockFor. This counts
// the bare calls per file from the parser and holds them to tests/fetch-deadline-baseline.json in
// both directions; the rule, what counts as bounded and the EXEMPT table (a reason per row) live in
// scripts/fetch-deadlines.mjs. It is a rule here and not a check:* of its own because the gate list
// in .agents/rules/execution-strategy.md has no room for another line, and this is static analysis.
try {
  const { check: fetchDeadlineCheck } = await import('./fetch-deadlines.mjs');
  for (const l of fetchDeadlineCheck().lines) err('fetch-deadline', l);
} catch (e) {
  err('fetch-deadline', 'could not run the unbounded-fetch ledger: ' + (e && e.message));
}

// ── 16. (a11y-shared-dialog) a press no keyboard can reach is not added unseen ──
// A click handler on a <div>/<span>/<td>/<img>/<li> with no tabindex is out of the Tab order and
// nothing turns Enter/Space into a press. The way out is a real <button>, or role + tabindex (markup)
// / window.IntMapDialog.makeActionable(el) (code) — js/dialog.js presses those. This counts the click
// receivers that resolve to such an element per file from the parser and holds them to
// tests/keyboard-reach-baseline.json in both directions; the shapes live in scripts/keyboard-reach.mjs.
// A rule here and not a check:* of its own for the reason given at 15.
try {
  const { check: keyboardReachCheck } = await import('./keyboard-reach.mjs');
  for (const l of keyboardReachCheck().lines) err('keyboard-reach', l);
} catch (e) {
  err('keyboard-reach', 'could not run the keyboard-reach ledger: ' + (e && e.message));
}

// ── 17. (map-a11y-structure) a control a screen reader cannot name is not added unseen ──
// An icon-only <button> («×», «−», «★», an SVG) with no aria-label / aria-labelledby / title, and an
// <input>/<select>/<textarea> with no label, is announced by role alone. This counts them per file from
// the markup and the parser and holds them to tests/control-names-baseline.json in both directions; the
// shapes live in scripts/control-names.mjs. A rule here and not a check:* of its own for the reason given at 15.
try {
  const { check: controlNamesCheck } = await import('./control-names.mjs');
  for (const l of controlNamesCheck().lines) err('control-names', l);
} catch (e) {
  err('control-names', 'could not run the control-names ledger: ' + (e && e.message));
}

// ── 18. (map-a11y-structure) the stacking order is named, and does not move unseen ──
// css/intmap.css names its layers once (:root --z-*) and every z-index there reads one. This resolves
// every declaration and holds the ordered list to tests/z-layers-baseline.json (a changed painting order
// fails until it is written down), and ratchets the z-index values still written as a bare number in
// css/, js/ and the root *.html per file; scripts/z-layers.mjs. A rule here for the reason given at 15.
try {
  const { check: zLayersCheck } = await import('./z-layers.mjs');
  for (const l of zLayersCheck().lines) err('z-layers', l);
} catch (e) {
  err('z-layers', 'could not run the z-layers ledger: ' + (e && e.message));
}

// ── 18b. (ui-layer-owner) the phone/desktop boundary and the safe area are each written once ──
// js/ui-device.js owns the layout boundary (768 / 769) and css/intmap.css :root owns the safe area
// (--safe-*). This refuses a 767/768 split anywhere in css/ or in the CSS js/ builds, and ratchets the
// boundary written as a number in js/ and env(safe-area-inset-*) read outside :root per file against
// tests/ui-owners-baseline.json, where every file above zero says why; scripts/ui-owners.mjs. A rule
// here for the reason given at 15.
try {
  const { check: uiOwnersCheck } = await import('./ui-owners.mjs');
  for (const l of uiOwnersCheck().lines) err('ui-owners', l);
} catch (e) {
  err('ui-owners', 'could not run the ui-owners ledger: ' + (e && e.message));
}

// ── 19. (test-code-only-one) a comment stripper that is not the shared one ──
// scripts/code-only.mjs is the one reader that knows a comment from code (#R345), and tests/ and
// scripts/ had gone on writing their own: 635 sites in 170 files (regex chains, loops, blankers), most
// of them a regex pair that opens a «comment» inside a string. The rule is on what a stripper DOES, from
// the parse tree (a .replace with a comment-matching regex literal, a loop testing for an opener, an
// acorn onComment that blanks offsets, a filter dropping comment lines), whatever it is called; the
// sites that remain are held to scripts/comment-strippers-ledger.json in both directions. A rule
// here and not a check:* of its own for the reason given at 15.
try {
  const { commentStripperProblems } = await import('./comment-strippers.mjs');
  for (const p of commentStripperProblems()) err('comment-stripper', p);
} catch (e) {
  err('comment-stripper', 'could not run the comment-stripper ledger: ' + (e && e.message));
}

// ── 20. (output-taint-gate) what flows INTO an HTML sink, not how many encoders there are ──
// §12 keeps the encoder single; it never asks whether the value that reaches innerHTML / outerHTML /
// insertAdjacentHTML / setHTML can carry markup. This splits every such value into its leaves and judges
// each (a literal, a number, an IntMapSafe.* result, a builder in the same file whose returns are safe, a
// declared translation…); the leaves it cannot judge are held per file to tests/output-taint-baseline.json
// in both directions. The rule, the judge and the TRUSTED table (a reason per row, checked against the
// code it names) live in scripts/output-taint.mjs. A rule here for the reason given at 15.
try {
  const { check: outputTaintCheck } = await import('./output-taint.mjs');
  for (const l of outputTaintCheck().lines) err('output-taint', l);
} catch (e) {
  err('output-taint', 'could not run the output-taint ledger: ' + (e && e.message));
}

// ── 21. (output-taint-gate) a control that writes to the database says so ──
// Atlas's confirmation before pressing an outward / destructive control (js/atlas-controls.js
// controlEffect → js/atlas-executor.js 4b) reads the element's data-effect and nothing else. This finds
// every UI handler that reaches a Supabase write / rpc / functions.invoke / auth change / POSTed Edge
// Function on an element with no data-effect and holds them per file to tests/data-effect-baseline.json
// in both directions; scripts/data-effects.mjs. A rule here for the reason given at 15.
try {
  const { check: dataEffectCheck } = await import('./data-effects.mjs');
  for (const l of dataEffectCheck().lines) err('data-effect', l);
} catch (e) {
  err('data-effect', 'could not run the data-effect ledger: ' + (e && e.message));
}

// ── 22. (mutation-tests-off-tree) a test that writes the checkout ──
// `node --test` runs test files in parallel, and a mutation test that broke a fact in the working
// tree was visible to every other file reading it — the tree lock serialised the writers and nothing
// else (2026-09-30: 10 red in one run, all of them this). Mutation tests break a private copy
// (tests/helpers/scratch-tree.mjs) and run the gate from it. This reads every fs write call under tests/
// from the parse tree and refuses one whose destination derives from the checkout (import.meta,
// __dirname, process.cwd(), a relative literal) or from a scratchTree() copy (its files are hard links
// into the checkout); scripts/tree-writers.mjs. A rule here and not a check:* of its own for the reason given at 15.
try {
  const { treeWriterProblems } = await import('./tree-writers.mjs');
  for (const p of treeWriterProblems()) err('tree-writer', p);
} catch (e) {
  err('tree-writer', 'could not run the tree-writer rule: ' + (e && e.message));
}

// ── 23. (domain-portable) the production address is written in one place ──
// It was spelled by hand in 69 tracked files, so moving the site to a domain of its own would have
// been 69 edits with nothing to say which one was missed. supabase/functions/_shared/site-origin.js
// is the value and everything derives from it; this refuses the host spelled anywhere else in the
// tracked tree except the history (dev-notes/, DEV-NOTES-ARCHIVE.md — what was measured on the address
// of that day) and a `[site:<path>]: <url>` definition that `node scripts/site-url.mjs --write`
// rendered from the value. The rule and its reasons are in scripts/site-url.mjs. A rule here and not a
// check:* of its own for the reason given at 15.
try {
  const { siteSpellings } = await import('./site-url.mjs');
  for (const p of siteSpellings(ROOT)) err('site-address', `${p.file}:${p.line}: ${p.why}`);
} catch (e) {
  err('site-address', 'could not run the site-address rule: ' + (e && e.message));
}

// ── 24. (layer-packages) js/data-layers.js only gets smaller ──
// A row's implementation is a layer package (js/layers/<id>.js `pkg` → js/layer-pkg-<pkg>.js), reached from
// js/data-layers.js through one path. This holds the rows js/data-layers.js still switches by name, its
// lines and its assignments to window.* to tests/data-layers-baseline.json — a new branch fails, a row with a
// package that is still switched by name fails, and the two sizes are ratcheted both ways (only `--update`
// lowers them, and it refuses to raise); scripts/layer-packages.mjs. A rule here for the reason given at 15.
try {
  const { check: layerPackagesCheck } = await import('./layer-packages.mjs');
  for (const l of await layerPackagesCheck()) err('layer-packages', l);
} catch (e) {
  err('layer-packages', 'could not run the layer-packages ledger: ' + (e && e.message));
}

// ── 25. (icon-system) an emoji is not an icon ──
// The interface drew its icons with emoji (the Tools tiles, every Atlas confirmation line, the players, the
// locale strings themselves) — pictures the reader's font draws, a different one per platform and deaf to the
// text colour. js/icons.js is where an icon comes from now. This reads every string literal (cooked, so an
// escape counts), page text and CSS content in the served site and refuses an Extended_Pictographic character
// that is neither typographic (© in a licence notice, ↗ in a sentence) nor declared with a reason (an avatar the
// reader picked); scripts/icon-glyphs.mjs. A rule here and not a check:* of its own for the reason given at 15.
try {
  const { iconGlyphProblems } = await import('./icon-glyphs.mjs');
  for (const p of iconGlyphProblems(ROOT)) err('icon-glyphs', p);
} catch (e) {
  err('icon-glyphs', 'could not run the icon-glyph rule: ' + (e && e.message));
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

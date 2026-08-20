#!/usr/bin/env node
/* ============================================================================
 *  IntMap · DO THE DOCUMENTS STILL AGREE WITH THE REPOSITORY, AND WITH EACH OTHER?
 * ----------------------------------------------------------------------------
 *  Some facts are written down in more than one place: how many Edge Functions there are,
 *  what is actually served, which languages exist, how the production deploy works. Every
 *  one of those is a fact that can rot in ONE document while the others stay right, and
 *  nothing notices — the reader who happens to open the stale one is simply misled.
 *
 *  This checks the facts that are BOTH written down and MEASURABLE. It deliberately does
 *  not try to check prose.
 *
 *  ⚠ THE SCAN COVERS THE CURRENT-STATE DOCUMENTS ONLY. `DEV-NOTES.md` and
 *    `DEV-NOTES-ARCHIVE.md` are the history, and history legitimately quotes text that was
 *    true once and is wrong now. Scanning them would make every recorded mistake a failure.
 *
 *  ⚠ AND IT MUST NOT CATCH ITSELF. Several rules below are "no document says X". The
 *    document that DESCRIBES those rules (Architecture.md §15.5) therefore must not spell X
 *    out literally, and the needles here are assembled from parts so that this file is not
 *    a copy of the thing it forbids. This exact self-hit has happened repeatedly in this
 *    repository; see [[intmap-recurring-lessons]].
 *
 *      node scripts/doc-facts.mjs           # report
 *      node scripts/doc-facts.mjs --check   # exit 1 if a fact has drifted (CI)
 * ==========================================================================*/
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const has = (p) => existsSync(join(ROOT, p));

const problems = [];
const notes = [];
const fail = (rule, detail) => problems.push(rule + ' — ' + detail);
const ok = (rule, detail) => notes.push(rule + ': ' + detail);

/* ── the current-state documents (NOT the history files) ─────────────────────────────────── */
const DOCS = [
  ...readdirSync(ROOT).filter((f) => f.endsWith('.md') && !/^DEV-NOTES/.test(f)),
  ...(has('docs') ? readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => 'docs/' + f) : []),
].filter((f) => f !== 'CLAUDE.local.md');
const BODY = new Map(DOCS.map((f) => [f, rd(f)]));
const eachDoc = (fn) => { for (const [f, s] of BODY) fn(f, s); };

/* the sweep has to actually reach the tree — an empty scan passes everything */
if (DOCS.length < 10) fail('scan', `only ${DOCS.length} documents were read — the sweep is not reaching the tree`);
for (const must of ['Architecture.md', 'README.md', 'CLAUDE.md', 'CONSTITUTION.md', 'SECURITY.md']) {
  if (!BODY.has(must)) fail('scan', `${must} was not scanned`);
}

const ARCH = BODY.get('Architecture.md') || '';

/* ═══ 1. the size of the app, as Architecture.md §1 states it ══════════════════════════════ */
{
  const lines = rd('index.html').split('\n').length - (rd('index.html').endsWith('\n') ? 1 : 0);
  const jsCount = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).length;
  const srcCount = readdirSync(join(ROOT, 'src')).filter((f) => f.endsWith('.js')).length;
  const cssCount = readdirSync(join(ROOT, 'css')).filter((f) => f.endsWith('.css')).length;

  const m = ARCH.match(/index\.html`?（(\d+)\s*行[^）]*）[\s\S]{0,120}?css\/`?（(\d+)\s*本）[\s\S]{0,120}?js\/`?（(\d+)\s*本[^）]*）[\s\S]{0,80}?src\/`?（(\d+)\s*本）/);
  if (!m) {
    fail('app-size', 'Architecture.md §1 no longer states index.html / css / js / src counts in the expected shape');
  } else {
    const [, sLines, sCss, sJs, sSrc] = m.map(Number);
    if (sLines !== lines) fail('app-size', `Architecture says index.html is ${sLines} lines; it is ${lines}`);
    if (sCss !== cssCount) fail('app-size', `Architecture says css/ has ${sCss} files; it has ${cssCount}`);
    if (sJs !== jsCount) fail('app-size', `Architecture says js/ has ${sJs} files; it has ${jsCount}`);
    if (sSrc !== srcCount) fail('app-size', `Architecture says src/ has ${sSrc} files; it has ${srcCount}`);
    if (sLines === lines && sJs === jsCount) ok('app-size', `index.html ${lines} lines · js/ ${jsCount} · src/ ${srcCount} · css/ ${cssCount}`);
  }
}

/* ═══ 2. the Edge Functions: directory ⇄ config.toml ⇄ CLAUDE.md ⇄ Architecture.md ════════ */
{
  const dir = readdirSync(join(ROOT, 'supabase/functions'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '_shared').map((d) => d.name).sort();
  const toml = rd('supabase/config.toml');
  const declared = [...toml.matchAll(/^\[functions\.([a-z0-9-]+)\]/gm)].map((m) => m[1]).sort();

  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  if (!same(dir, declared)) {
    fail('edge-functions', `supabase/config.toml declares [${declared}] but supabase/functions/ holds [${dir}]`);
  }
  if (declared.includes('_shared')) fail('edge-functions', 'config.toml declares [functions._shared] — that directory is a library, not a function');

  for (const f of ['CLAUDE.md', 'Architecture.md']) {
    const body = BODY.get(f) || '';
    const missing = dir.filter((n) => !body.includes('`' + n + '`'));
    if (missing.length) fail('edge-functions', `${f} does not name ${missing.join(', ')}`);
    const claimed = body.match(/Edge Functions?\s*(?:は|—|-)?\s*\*\*?(\d+)\s*(?:本|函数)/);
    if (claimed && Number(claimed[1]) !== dir.length) {
      fail('edge-functions', `${f} says there are ${claimed[1]} Edge Functions; there are ${dir.length}`);
    }
  }
  if (same(dir, declared)) ok('edge-functions', `${dir.length} functions, declared and documented: ${dir.join(', ')}`);
}

/* ═══ 3. migrations ═══════════════════════════════════════════════════════════════════════ */
{
  const n = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).length;
  const m = ARCH.match(/migrations\/\*\.sql[^\n]*?（(\d+)\s*本/);
  if (m && Number(m[1]) !== n) fail('migrations', `Architecture says ${m[1]} migrations; there are ${n}`);
  else ok('migrations', `${n} migration files`);

  /* a named SQL file the restore procedure tells the reader to run must actually exist */
  eachDoc((f, s) => {
    for (const hit of s.matchAll(/`(supabase\/[A-Za-z0-9_./-]+\.sql)`/g)) {
      const p = hit[1];
      if (!p.includes('*') && !has(p)) fail('sql-path', `${f} tells the reader to run ${p}, which does not exist`);
    }
  });
}

/* ═══ 4. what is actually served ══════════════════════════════════════════════════════════ */
{
  if (!/\.gitignore/.test('x') || true) {
    const gi = rd('.gitignore');
    if (!/^dist\/?$/m.test(gi)) fail('serving', '.gitignore no longer excludes dist/ — build output would be committed');
  }
  const deploy = rd('.github/workflows/deploy.yml');
  const publishesDist = /cp -r dist\/\.|path:\s*_site/.test(deploy);
  if (!publishesDist) fail('serving', 'deploy.yml no longer assembles the site from dist/');

  /* nothing may still describe the repository tree itself as the thing that is served */
  const ROOT_SERVE = ['OneDrive 直配信', 'リポジトリ直配信'];
  eachDoc((f, s) => { for (const n of ROOT_SERVE) if (s.includes(n)) fail('serving', `${f} still says the site is served straight from the repository (${n})`); });

  if (!/dist\//.test(ARCH)) fail('serving', 'Architecture.md never mentions dist/, which is what GitHub Pages actually serves');
  else ok('serving', 'dist/ is gitignored, built by deploy.yml, and named in Architecture.md');
}

/* ═══ 5. the production deploy is ACTIVE — no document may still call it dormant ═══════════ */
{
  const deploy = rd('.github/workflows/deploy.yml');
  const gated = /vars\.ENABLE_PAGES_DEPLOY\s*==\s*'true'/.test(deploy);
  if (!gated) fail('deploy', 'deploy.yml no longer reads vars.ENABLE_PAGES_DEPLOY — this rule needs rewriting');

  const release = BODY.get('docs/RELEASE.md') || '';
  const releaseSaysActive = /ENABLE_PAGES_DEPLOY\s*=\s*true/.test(release) && /Active|有効|current/i.test(release);
  if (!releaseSaysActive) fail('deploy', 'docs/RELEASE.md (the source of truth for releasing) no longer states that the gated deploy is enabled');

  /* the word that used to be wrong, assembled so this file is not itself a match */
  const DORMANT = 'DOR' + 'MANT';
  eachDoc((f, s) => {
    if (f === 'docs/RELEASE.md') return;
    const bad = s.split('\n').filter((l) => (l.includes(DORMANT) || l.includes('休眠')) && /deploy\.yml|Pages/.test(l));
    if (bad.length) fail('deploy', `${f} still calls the Pages deploy ${DORMANT} while it is enabled`);
    if (/push で branch 自動公開/.test(s)) fail('deploy', `${f} still describes the old "publish from a branch" default`);
  });
  if (releaseSaysActive) ok('deploy', 'the gated Pages deploy is described as active');
}

/* ═══ 6. the build stamp file, spelled correctly ══════════════════════════════════════════ */
{
  const NEEDLE = '-' + 'build-info.json';         // assembled: this file must not be a match itself
  eachDoc((f, s) => {
    for (const line of s.split('\n')) {
      if (!line.includes(NEEDLE)) continue;
      if (/[A-Za-z0-9_]-build-info\.json/.test(line)) continue;   // e.g. post-build-info.json, a different name
      fail('build-info', `${f} spells the stamp file with a leading hyphen: ${line.trim().slice(0, 90)}`);
    }
  });
  if (!/\/build-info\.json/.test(BODY.get('docs/RELEASE.md') || '')) fail('build-info', 'docs/RELEASE.md no longer says how to check which build is live');
  else ok('build-info', 'the published stamp is named consistently');
}

/* ═══ 7. the USB backup procedure has ONE owner ═══════════════════════════════════════════ */
{
  const FREQ = [/1\s*日\s*1\s*回/, /1日に1回/, /一日一回/, /毎日\s*1\s*回/];
  eachDoc((f, s) => {
    if (f === 'CLAUDE.md') return;               // the owner may say whatever it likes
    if (!/USB/.test(s)) return;
    for (const line of s.split('\n')) {
      if (!/USB/.test(line)) continue;
      if (FREQ.some((re) => re.test(line))) fail('usb', `${f} states a backup frequency; the owner of that fact is CLAUDE.md §11`);
    }
  });
  if (!/USB/.test(BODY.get('CLAUDE.md') || '')) fail('usb', 'CLAUDE.md no longer describes the USB backup at all');
  else ok('usb', 'the backup frequency is stated in CLAUDE.md only');
}

/* ═══ 8. the languages ════════════════════════════════════════════════════════════════════ */
{
  const codes = readdirSync(join(ROOT, 'js/locales'))
    .map((f) => (f.match(/^ui\.([a-z-]+)\.js$/) || [])[1]).filter(Boolean).sort();
  const gen = rd('js/locales/_langs.js');
  const generated = [...(gen.match(/IntMapLangCodes\s*=\s*\[([^\]]*)\]/) || [, ''])[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]).sort();
  const beta = [...(gen.match(/IntMapLangBeta\s*=\s*\[([^\]]*)\]/) || [, ''])[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);

  if (codes.join() !== generated.join()) fail('languages', `js/locales/ holds [${codes}] but _langs.js was generated for [${generated}] — run scripts/i18n-langs.mjs`);

  const archN = (ARCH.match(/対応 UI 言語は(\d+)つ/) || [])[1];
  if (archN && Number(archN) !== codes.length) fail('languages', `Architecture says ${archN} UI languages; js/locales/ holds ${codes.length}`);

  /* the README names them; count the bullets in its Languages section */
  const readme = BODY.get('README.md') || '';
  const sec = (readme.match(/## Languages([\s\S]*?)(?=\n## )/) || [, ''])[1];
  const bullets = (sec.match(/^\* /gm) || []).length;
  if (bullets !== codes.length) fail('languages', `README lists ${bullets} languages; js/locales/ holds ${codes.length}`);

  /* nothing may label a language beta / in progress while the measured beta list is empty */
  if (beta.length === 0) {
    for (const line of sec.split('\n')) {
      if (/^\* /.test(line) && /(beta|in progress|作業中|途中)/i.test(line)) {
        fail('languages', `README marks a language as unfinished (${line.trim()}) but IntMapLangBeta is empty`);
      }
    }
  }
  if (!problems.some((p) => p.startsWith('languages'))) ok('languages', `${codes.length} languages (${codes.join(', ')}), beta: ${beta.length ? beta.join(', ') : 'none'}`);
}

/* ═══ 9. the weather-warning feeds ════════════════════════════════════════════════════════ */
{
  const wp = rd('js/world-packs.js');
  const grab = (name) => {
    const m = wp.match(new RegExp('const ' + name + '\\s*=\\s*\\{[\\s\\S]*?\\};'));
    return m ? [...m[0].matchAll(/([A-Z]{3}):'/g)].map((x) => x[1]) : [];
  };
  const feeds = grab('FEEDS'), ma = grab('MA');
  const national = feeds.filter((c) => !ma.includes(c));
  const countries = new Set([...feeds, ...ma]).size;
  const feedCount = national.length + (ma.length ? 1 : 0);   // the national services + MeteoAlarm itself

  if (!national.length || !ma.length) {
    fail('alerts', 'could not read FEEDS / MA out of js/world-packs.js — this rule needs rewriting');
  } else {
    const archFeeds = (ARCH.match(/自前フィードは\s*\*\*(\d+)本\*\*/) || [])[1];
    if (archFeeds && Number(archFeeds) !== feedCount) fail('alerts', `Architecture says ${archFeeds} feeds; the code has ${feedCount}`);
    const archMA = (ARCH.match(/MeteoAlarm が EUMETNET の残り\s*(\d+)\s*か国/) || [])[1];
    if (archMA && Number(archMA) !== ma.length) fail('alerts', `Architecture says MeteoAlarm carries ${archMA} countries; the code has ${ma.length}`);
    const readme = BODY.get('README.md') || '';
    const rmN = (readme.match(/(\d+)\s+countries over (\w+) feeds/) || [])[1];
    if (rmN && Number(rmN) !== countries) fail('alerts', `README says ${rmN} countries; the code has ${countries}`);
    ok('alerts', `${feedCount} feeds · ${national.length} national services + MeteoAlarm's ${ma.length} · ${countries} countries`);
  }
}

/* ═══ 10. the shape of the app: it is built, and the boot code is not "all of it" ══════════ */
{
  const SHAPE = [
    ['単一HTMLファイルのWebアプリ', 'the app is described as a single HTML file'],
    ['ビルド無しは不変', 'a document still promises there is no build step'],
    ['全アプリJSがインライン', 'a document still says every application script is inline'],
    ['single inline no-build file', 'a document still says the app is a single inline no-build file'],
  ];
  eachDoc((f, s) => { for (const [needle, why] of SHAPE) if (s.includes(needle)) fail('app-shape', `${f}: ${why}`); });
  if (!/Vite/.test(ARCH)) fail('app-shape', 'Architecture.md never mentions Vite, which is how the site is built');
  else ok('app-shape', 'the documents describe a built app');
}

/* ═══ 11. where the publishable key lives ═════════════════════════════════════════════════ */
{
  const inIndex = /SUPABASE_ANON_KEY/.test(rd('index.html'));
  const inVendor = /SUPABASE_ANON_KEY/.test(rd('src/vendor.js'));
  if (inIndex) fail('anon-key', 'index.html now defines SUPABASE_ANON_KEY again — the documents say src/vendor.js');
  if (!inVendor) fail('anon-key', 'src/vendor.js no longer defines SUPABASE_ANON_KEY — this rule needs rewriting');
  eachDoc((f, s) => {
    for (const line of s.split('\n')) {
      if (!/SUPABASE_ANON_KEY|publishable/.test(line)) continue;
      if (/`index\.html`/.test(line) && !/admin\.html/.test(line.replace(/`index\.html`/, ''))) {
        fail('anon-key', `${f} says the publishable key is in index.html: ${line.trim().slice(0, 90)}`);
      }
    }
  });
  if (!inIndex && inVendor) ok('anon-key', 'the publishable key lives in src/vendor.js and admin.html');
}

/* ═══ 12. Architecture.md is the CURRENT spec — no round references in it ═════════════════ */
{
  const hits = [];
  ARCH.split('\n').forEach((l, i) => {
    /* a round citation, not a file name: `tests/r271-checks.test.mjs` is lower-case and is a path */
    const m = l.match(/(?:#R\d{1,3}|(?:^|[^A-Za-z0-9_/])R\d{1,3}(?![\d)A-Za-z]))/);
    if (m) hits.push(`line ${i + 1}: ${l.trim().slice(0, 80)}`);
  });
  if (hits.length) fail('arch-rounds', `Architecture.md carries ${hits.length} round reference(s) — the history belongs in DEV-NOTES.md\n      ` + hits.slice(0, 5).join('\n      '));
  else ok('arch-rounds', 'Architecture.md carries no round references');
}

/* ── report ──────────────────────────────────────────────────────────────────────────────── */
console.log('IntMap · cross-document facts — ' + DOCS.length + ' current-state documents scanned\n');
for (const n of notes) console.log('  ✓ ' + n);
if (problems.length) {
  console.log('\n' + problems.length + ' fact(s) have drifted:\n');
  for (const p of problems) console.log('  ✖ ' + p);
  console.log('\nFix the document (or the code) so they agree. Do not relax the rule to make it pass.');
} else {
  console.log('\n✓ every checked fact agrees with the repository, and the documents agree with each other');
}
if (CHECK && problems.length) process.exit(1);

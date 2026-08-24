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
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
/* (#R407) `--rule=<name>` narrows the report to ONE rule and skips any rule that has to shell out
   for its facts. It exists for the mutation tests: tests/r399-checks and tests/r407-checks run this
   script once per mutation WHILE HOLDING THE TREE LOCK, and at eleven seconds a run a dozen
   mutations hold it for two minutes and starve the other files that need it. MEASURED #R407: the
   full run is 11.0 s, of which `i18n-pair-audit` as a subprocess is 10.0 s and every other rule
   together is under one second — so `--rule` turns an 11 s mutation into a 1 s one. It is a test
   affordance, never a way to run a narrower gate: `npm run check:docs` passes no `--rule`.
   ⚠ A NAME THAT MATCHES NOTHING MUST NOT REPORT GREEN — a typo would silently prove nothing. */
const RULE = (process.argv.find((a) => a.startsWith('--rule=')) || '').slice('--rule='.length);
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
/* (#R280) §3 (the file ledger) and most of §7 (the layer implementation) moved to documents of
   their own, keeping the same section numbers. The rules that measured those sections follow
   them — a rule left pointing at the old address does not fail, it just stops looking, which is
   the same silence this whole file exists to prevent. */
const LAYERS = BODY.get('docs/MAP-LAYERS.md') || '';
const FILES = BODY.get('docs/FILES.md') || '';

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

/* ═══ 2. the Edge Functions: directory ⇄ config.toml ⇄ EVERY current-state document ═══════
 *  ⚠ (#R399) THIS RULE READ TWO DOCUMENTS AND ONE SENTENCE EACH, AND SIX DOCUMENTS DRIFTED
 *    UNDER IT. Three holes, every one of them silent — the report stayed green and said so:
 *
 *      · THE DOCUMENT LIST WAS HAND-MAINTAINED. It named `CLAUDE.md` and `Architecture.md`.
 *        `docs/FILES.md` was never added, so its ledger sat at "全11本" and "9本" while the
 *        tree held twelve, and `SECURITY.md` ("eight") and `docs/SECURITY-ARCHITECTURE.md`
 *        ("ELEVEN") were never looked at at all.
 *      · THE NEEDLE REQUIRED A LITERAL ASTERISK (`\*\*?` = one `*`, then an optional second).
 *        `CLAUDE.md` writes `**Edge Functions は 12 本**` — the asterisks are BEFORE the noun —
 *        so the count matched nothing and `claimed` came back null on every run. CLAUDE.md was
 *        right for four rounds by luck: the per-name roster check below is what held it, and a
 *        count check that never fires is indistinguishable from one that passes.
 *      · IT USED `.match()`, WHICH RETURNS THE FIRST HIT ONLY. `Architecture.md`'s §6.2 heading
 *        answered for the whole file, so its SECOND claim — "Edge Functions を10本デプロイする"
 *        in §10.1 — was invisible, with a deploy list directly beneath it that already ran twelve.
 *
 *    So: sweep EVERY current-state document, EVERY occurrence, digits AND number-words. The
 *    only hand-written name left is the 正本 (`Architecture.md`), and it is named to demand MORE,
 *    not less — it must state the number, so rewording it into a shape the needle cannot read
 *    fails instead of going quiet. Everywhere else the contract is "if you state it, it must be
 *    right", which is what lets a document link to §6.2 instead of counting.
 * ------------------------------------------------------------------------------------------
 *  ⚠ AND IT MUST NOT CATCH ITSELF — the header's warning applies here. The needles are built
 *    from parts and the examples above are quoted with their WRONG numbers, so this comment is
 *    not a copy of the claim it checks. `docs/TESTING.md` describes the rule in prose for the
 *    same reason. tests/r399-checks ① proves each half goes red. */
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

  /* the two documents that promise the complete roster must name every function */
  for (const f of ['CLAUDE.md', 'Architecture.md']) {
    const body = BODY.get(f) || '';
    const missing = dir.filter((n) => !body.includes('`' + n + '`'));
    if (missing.length) fail('edge-functions', `${f} does not name ${missing.join(', ')}`);
  }
  if (same(dir, declared)) ok('edge-functions', `${dir.length} functions, declared and documented: ${dir.join(', ')}`);

  /* ── 2a. every STATED size of the inventory, in every document, is the real one ─────────── */
  const WORD = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
    eighteen: 18, nineteen: 19, twenty: 20,
  };
  /* An inventory claim BINDS the number to the noun with a particle or punctuation:
       「… は 12 本」  「— **12本**」  「を10本デプロイする」  「（9本。§6.2）」  "eight Edge Functions"
     ⚠ BARE JUXTAPOSITION IS NOT ONE, and the difference is the whole reason this is not a
       looser pattern: `docs/NEWS-EVENTS.md` §12.1 opens "**Edge Function 1 本**（…）", which
       says ONE FUNCTION DOES THIS, not that one exists. A needle that read that as an
       inventory claim would report the roster as wrong on a sentence that is correct.
     ⚠ `の` and `が` are deliberately NOT separators — 「Edge Function の 1 本」 is partitive
       ("one OF the functions"), the same trap in the other direction. A future document that
       phrases the count that way goes unchecked here; the roster check above still holds the
       names, and that residual is written down in `docs/TESTING.md` rather than papered over. */
  const SEP = '(?:は|を|—|–|-|:|：|（|\\()';
  const JA = new RegExp('Edge Functions?[ \\t]*\\**[ \\t]*' + SEP + '[ \\t]*\\**[ \\t]*(?:全|約)?[ \\t]*(\\d+)[ \\t]*(?:本|函数)', 'g');
  /* ⚠ the lookbehind is load-bearing: without it the §6.2 HEADING —「### 6.2 Edge Functions …」—
     reads as a claim that there are two, and the 正本 reports itself as wrong. A section number,
     a `§` and a `#R` round number are addresses, not counts. (Measured: this fired before the
     documents below were touched at all.) */
  const EN = /(?<![\d.§#])\**\b([A-Za-z]+|\d+)\b\**[ \t]+Edge Functions?\b/g;

  const stated = (body) => {
    const out = [];
    for (const m of body.matchAll(JA)) out.push({ text: m[0].trim(), n: Number(m[1]) });
    for (const m of body.matchAll(EN)) {
      const raw = m[1].toLowerCase();
      const n = /^\d+$/.test(raw) ? Number(raw) : WORD[raw];
      if (n != null) out.push({ text: m[0].trim(), n });
    }
    return out;
  };

  let checked = 0, wrong = 0;
  eachDoc((f, body) => {
    for (const c of stated(body)) {
      checked++;
      if (c.n !== dir.length) {
        wrong++;
        fail('edge-count', `${f} says «${c.text}» — there are ${dir.length} Edge Functions`);
      }
    }
  });

  /* the 正本 must actually carry the number: a heading reworded out of the shape above would
     otherwise take the fact with it and nothing would notice (§6.2, per docs/README.md) */
  if (!stated(ARCH).length) {
    fail('edge-count', 'Architecture.md no longer states how many Edge Functions there are — §6.2 is the 正本 for that number');
  } else if (!wrong) {
    ok('edge-count', `${checked} stated counts across the documents, all ${dir.length}`);
  }

  /* ── 2b. a document that ENUMERATES `_shared/` names all of it ──────────────────────────── */
  /* ⚠ `_shared/` is a library, not a function, so it is not in `dir` and rule 2a never sees it.
     Three documents listed it by hand and three had gone stale in different places:
     `docs/FILES.md` was missing aviation-codec/aviation-model/volcano-parse, `CLAUDE.md` was
     missing atlas-persona, `docs/SECURITY-ARCHITECTURE.md` was missing volcano-parse.
     Only a list that PRESENTS ITSELF AS COMPLETE is held to it: a parenthesised run of three or
     more `.js` names next to the directory. A list that hedges (`など` / `ほか` / `その他` /
     `etc.`) is honestly partial and is left alone — `Architecture.md` §6.2's prose names three
     of them followed by `など`, and that sentence is not wrong. */
  {
    const shared = readdirSync(join(ROOT, 'supabase/functions/_shared'))
      .filter((f) => f.endsWith('.js')).sort();
    const HEDGE = /など|ほか|その他|etc\.|e\.g\./;
    eachDoc((f, body) => {
      for (const at of body.matchAll(/_shared\//g)) {
        const win = body.slice(at.index, at.index + 260);
        const group = win.match(/（([^）]*)）/) || win.match(/\(([^)]*)\)/);
        if (!group) continue;
        const names = [...new Set([...group[1].matchAll(/([a-z0-9-]+\.js)/g)].map((m) => m[1]))].sort();
        if (names.length < 3) continue;                 /* a passing mention, not an inventory */
        if (HEDGE.test(group[0])) continue;             /* says so itself that it is partial */
        const missing = shared.filter((n) => !names.includes(n));
        const extra = names.filter((n) => !shared.includes(n));
        if (missing.length) fail('edge-shared', `${f} lists the contents of _shared/ but omits ${missing.join(', ')}`);
        if (extra.length) fail('edge-shared', `${f} lists ${extra.join(', ')} in _shared/, which is not there`);
      }
    });
    ok('edge-shared', `_shared/ holds ${shared.length}: ${shared.join(', ')}`);
  }
}

/* ═══ 3. migrations ═══════════════════════════════════════════════════════════════════════ */
{
  const n = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).length;
  for (const [name, body] of [['Architecture.md', ARCH], ['docs/FILES.md', FILES]]) {
    const m = body.match(/migrations\/\*\.sql[^\n]*?（(\d+)\s*本/);
    if (m && Number(m[1]) !== n) fail('migrations', `${name} says ${m[1]} migrations; there are ${n}`);
  }
  ok('migrations', `${n} migration files`);

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

  /* ⚠ A LIST OF EXACT SUBSTRINGS ONLY CATCHES THE WORDING SOMEBODY ALREADY THOUGHT OF. The two
     needles above missed the sentence that was actually sitting in CONSTITUTION.md §1 —
     「本番は OneDrive 上の …… を直接配信」 — the same false claim, spelled a way no needle matched,
     and it survived every run of this gate. OneDrive is the MASTER WORKING DIRECTORY (CLAUDE.md
     §6); it has never served production, which is Pages publishing the dist/ build. */
  const SERVED_FROM_ONEDRIVE = /OneDrive[^\n]{0,60}?(直接配信|から配信|を配信|直配信)/;
  eachDoc((f, s) => {
    const m = s.match(SERVED_FROM_ONEDRIVE);
    if (m) fail('serving', `${f} says production is served from OneDrive («${m[0]}») — Pages serves dist/, and OneDrive is the master working directory`);
  });

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
    const archFeeds = (LAYERS.match(/自前フィードは\s*\*\*(\d+)本\*\*/) || [])[1];
    if (archFeeds && Number(archFeeds) !== feedCount) fail('alerts', `docs/MAP-LAYERS.md says ${archFeeds} feeds; the code has ${feedCount}`);
    const archMA = (LAYERS.match(/MeteoAlarm が EUMETNET の残り\s*(\d+)\s*か国/) || [])[1];
    if (archMA && Number(archMA) !== ma.length) fail('alerts', `docs/MAP-LAYERS.md says MeteoAlarm carries ${archMA} countries; the code has ${ma.length}`);
    const readme = BODY.get('README.md') || '';
    const rmN = (readme.match(/(\d+)\s+countries over (\w+) feeds/) || [])[1];
    if (rmN && Number(rmN) !== countries) fail('alerts', `README says ${rmN} countries; the code has ${countries}`);
    /* ⚠ THE REGISTER IS NOT IN `FEEDS`, BECAUSE ITS COUNTRIES ARE ADDED AT RUN TIME from the WMO's own
       CAP-status table — so the number is a MEASUREMENT and does not belong here. What this rule can
       check, and must, is that the code and the spec agree about whether it exists at all: a source
       that quietly covers ninety more countries than the spec describes is the drift this file is
       for. Same shape in both directions — a spec that names it after the code drops it also fails. */
    const codeSwic = /FEEDS\[c\]='swic'/.test(wp);
    const archSwic = /WMO Severe Weather Information Centre/.test(LAYERS);
    if (codeSwic !== archSwic) {
      fail('alerts', codeSwic
        ? 'the code wires the WMO CAP register but docs/MAP-LAYERS.md does not describe it'
        : 'docs/MAP-LAYERS.md describes the WMO CAP register but the code does not wire it');
    }
    ok('alerts', `${feedCount} feeds · ${national.length} national services + MeteoAlarm's ${ma.length} · ${countries} countries`
      + (codeSwic ? ' + the WMO CAP register' : ''));
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

/* ═══ 13. Cesium is a SECOND ENGINE, not an abandoned one ═════════════════════════════════
   CONSTITUTION.md said 「Cesium は廃止済み。再構築しない。」 for many rounds while five
   js/cesium-*.js files, a package.json dependency and a Settings row shipped in every build.
   That sentence outranks every other document by its own declaration, so it was the most
   expensive wrong sentence in the repository. */
{
  const dep = /"cesium"\s*:/.test(rd('package.json'));
  const files = readdirSync(join(ROOT, 'js')).filter((f) => /^cesium-/.test(f)).length;
  if (!(dep && files >= 3)) {
    ok('cesium', 'no Cesium engine in the tree — this rule is now inert and should be removed');
  } else {
    const GONE = ['廃止済み', '廃止した', 'abandoned', 'is abandoned'];
    eachDoc((f, s) => {
      for (const line of s.split('\n')) {
        if (!/Cesium/.test(line)) continue;
        if (GONE.some((g) => line.includes(g))) fail('cesium', f + ' calls Cesium abandoned while ' + files + ' js/cesium-*.js files ship and package.json depends on it: ' + line.trim().slice(0, 90));
      }
    });
    if (!/第2エンジン|second engine/.test(ARCH)) fail('cesium', 'Architecture.md no longer describes Cesium as the selectable second engine');
    if (!problems.some((x) => x.startsWith('cesium'))) ok('cesium', 'Cesium ships (' + files + ' files) and is described as a second engine');
  }
}

/* ═══ 14. Area Monitors: withdrawn in the code ⇒ withdrawn in the documents ═══════════════
   The tab, the workspace window and the Atlas route were all removed; three documents went on
   describing a Monitors tab a reader could click. The code states the fact twice — the button
   is not in the markup and the dispatch answers with a withdrawal code — so the documents can
   be held to it. */
{
  const noTab = !/id="btn-monitors"/.test(rd('index.html'));
  const withdrawn = /FEATURE_WITHDRAWN/.test(rd('js/atlas-console.js'));
  if (noTab && withdrawn) {
    for (const f of ['Architecture.md', 'docs/AREA-MONITORS.md', 'PRODUCT.md']) {
      const body = BODY.get(f) || '';
      if (/Monitor/i.test(body) && !/撤去|WITHDRAWN|withdrawn/.test(body)) {
        fail('monitors', f + ' describes Area Monitors without saying the feature has no entry point');
      }
    }
    eachDoc((f, s) => {
      for (const line of s.split('\n')) {
        if (/Monitors\s*タブ/.test(line) && !/撤去|無い|ない|WITHDRAWN/.test(line)) {
          fail('monitors', f + ' still describes a Monitors tab as present: ' + line.trim().slice(0, 90));
        }
      }
    });
    if (!problems.some((x) => x.startsWith('monitors'))) ok('monitors', 'the feature is withdrawn in the code and the documents say so');
  } else {
    ok('monitors', 'the Monitors entry point is back — this rule needs rewriting');
  }
}

/* ═══ 15. the news pipeline, and the PRIVACY POLICY that describes it ═════════════════════
   USE_SERVER_NEWS has been false for a long time: headlines are fetched by the browser through
   our own relay and placed by a non-AI engine in the browser. The privacy policy went on telling
   readers that news is "fetched and geolocated server-side and stored". A policy is a statement
   of fact about the code, so it is checkable, and this is the rule that checks it. */
{
  const body = rd('js/app-body.js');
  const m = body.match(/const\s+USE_SERVER_NEWS\s*=\s*(true|false)/);
  if (!m) fail('news-path', 'USE_SERVER_NEWS is gone from js/app-body.js — this rule needs rewriting');
  else {
    const serverPath = m[1] === 'true';
    const legal = has('js/legal-text.js') ? rd('js/legal-text.js') : '';
    const CLAIMS_SERVER = [
      'news is fetched and geolocated server-side',
      'reads the pre-analyzed result',
      'ニュースはサーバー側で取得・地点解析のうえ保存',
      'ブラウザは解析済み結果を読み込みます',
    ];
    const hit = CLAIMS_SERVER.filter((c) => legal.includes(c));
    if (!serverPath && hit.length) {
      fail('news-path', 'the privacy policy says news is analysed and stored server-side ("' + hit[0].slice(0, 40) + '…") while USE_SERVER_NEWS is false');
    }
    if (serverPath && !hit.length) {
      fail('news-path', 'USE_SERVER_NEWS is true again but the privacy policy no longer describes the server path');
    }
    if (!serverPath) {
      /* ⚠ (#R404) この走査が探しているのは **`current_news` の経路**（#R40 で止めた記事単位の
         server feed）を「今も生きている」と書いている文である。**サーバー側の AI 事前解析
         そのものは、もう死んでいない**——`news-ingest` の `locate` 段がそれで、そちらは本当に
         生きている。⇒ 免除語に出来事側の目印を足す。足さないと、正しい文章がこの門に
         引っかかり、直し方は「事実を薄める」しか無くなる。 */
      eachDoc((f, s) => {
        for (const line of s.split('\n')) {
          if (!/地点解析/.test(line)) continue;
          if (/サーバー側でAI事前解析|サーバー側で事前にAI解析/.test(line) &&
              !/停止|止めて|残してある|かつて|news_events|news-ingest|出来事/.test(line)) {
            fail('news-path', f + ' presents the current_news pre-analysis as the live path: ' + line.trim().slice(0, 90));
          }
        }
      });
    }
    /* ══ (#R386) …AND THE SECOND SWITCH, WHICH IS THE ONE THAT IS ON ═══════════════════════════
       `USE_SERVER_NEWS` is the #R40 path (current_news, article-level) and it is still false.
       `NEWS_EVENT_MODE` is the #R334/#R351/#R386 path (news_events, event-level) and it is TRUE —
       the browser really does read a server-collected, server-stored news database now. A rule that
       only knew about the first switch would go on saying "the policy describes that path" while
       the policy said nothing about the path the reader is actually on. */
    const em = body.match(/const\s+NEWS_EVENT_MODE\s*=\s*(true|false)/);
    if (!em) fail('news-path', 'NEWS_EVENT_MODE is gone from js/app-body.js — this rule needs rewriting');
    else {
      const eventPath = em[1] === 'true';
      const legal2 = has('js/legal-text.js') ? rd('js/legal-text.js') : '';
      const CLAIMS_EVENTS = [
        'The News tab now reads this event database by default',
        'Newsタブは既定でこの出来事データベースを読んでいます',
      ];
      const CLAIMS_HIDDEN = [
        'This event database is not shown anywhere in the app yet.',
        'なおこの出来事データベースは、現在アプリの画面には表示していません。',
      ];
      const shown = CLAIMS_EVENTS.filter((c) => legal2.includes(c));
      const hidden = CLAIMS_HIDDEN.filter((c) => legal2.includes(c));
      if (eventPath && !shown.length) {
        fail('news-path', 'NEWS_EVENT_MODE is true — the News tab reads news_events — but the privacy policy never says so');
      }
      if (eventPath && hidden.length) {
        fail('news-path', 'the privacy policy still says the event database is not on screen ("' + hidden[0].slice(0, 40) + '…") while NEWS_EVENT_MODE is true');
      }
      if (!eventPath && shown.length) {
        fail('news-path', 'the privacy policy says the News tab reads the event database while NEWS_EVENT_MODE is false');
      }
    }

    /* ══ (#R404) …AND THE THIRD FACT: WHAT DECIDES WHERE THE PIN GOES ════════════════════════
       #R29 made the AI the primary locator and #R40 stopped the READING of that path. Measured
       on 2026-08-24: `current_news` had 1,548 rows and NOT ONE `analyzed_by='ai'` — so the AI
       locator had never once succeeded — while the path the reader is actually on (`news_events`
       via `news-ingest`) had never called the AI at all. #R404 puts the AI back as the primary
       locator on the LIVE path. Until then this section said, in so many words, that the stored
       path placed its articles with a non-AI engine and that the ONLY AI call was the Japanese
       headline translation. A privacy policy is a statement of fact about the code, so bind the
       two: the sentence has to follow the `locate` stage, in both directions. */
    const ingestPath = 'supabase/functions/news-ingest/index.ts';
    const ingest = has(ingestPath) ? rd(ingestPath) : '';
    const aiLocates = /const ORDER = \[[^\]]*["']locate["']/.test(ingest);
    const legal3 = has('js/legal-text.js') ? rd('js/legal-text.js') : '';
    const CLAIMS_AI_GEO = ['the AI provider first', 'AIプロバイダが第一手段'];
    /* かつての本文そのもの。**残っていたら嘘**である。 */
    const CLAIMS_NON_AI_GEO = [
      'Placing those stored articles uses the same non-AI deterministic engine',
      '地点の判定は同じ非AIの決定論エンジンで行います',
    ];
    const saysAi = CLAIMS_AI_GEO.filter((c) => legal3.includes(c));
    const saysNonAi = CLAIMS_NON_AI_GEO.filter((c) => legal3.includes(c));
    if (aiLocates && saysAi.length < CLAIMS_AI_GEO.length) {
      fail('news-path', 'news-ingest has a `locate` stage — the AI decides where stored news is pinned — but the privacy policy does not say so in ' +
        (saysAi.length ? 'every language it ships in' : 'any language'));
    }
    if (aiLocates && saysNonAi.length) {
      fail('news-path', 'the privacy policy still says the stored path is placed by a non-AI engine ("' + saysNonAi[0].slice(0, 40) + '…") while news-ingest runs the `locate` stage');
    }
    if (!aiLocates && saysAi.length) {
      fail('news-path', 'the privacy policy says the AI places stored news, but news-ingest has no `locate` stage in ORDER');
    }
    if (!problems.some((x) => x.startsWith('news-path'))) ok('news-path', 'USE_SERVER_NEWS=' + m[1] + ' · NEWS_EVENT_MODE=' + (em ? em[1] : '?') + ' and every document — the privacy policy included — describes those paths');
  }
}

/* ═══ 16. the CSP, as index.html actually writes it ═══════════════════════════════════════
   Architecture said 「'unsafe-eval' と CDN ホスト（どちらも現在は入っていない）」. Both were in
   index.html; what the admin-console round removed them from was admin.html. A residual risk
   that a document reports as absent stops being tracked. */
{
  const grab = (file) => {
    const t = rd(file);
    const mm = t.match(/Content-Security-Policy"\s+content="([^"]+)"/);
    return mm ? mm[1] : null;
  };
  const app = grab('index.html'), adm = grab('admin.html');
  if (!app || !adm) fail('csp', 'the CSP meta could not be read out of index.html / admin.html — this rule needs rewriting');
  else {
    const dirs = app.split(';').map((x) => x.trim()).filter(Boolean).length;
    const claimed = (ARCH.match(/\*\*(\d+)\s*の\s*directive\*\*/) || [])[1];
    if (claimed && Number(claimed) !== dirs) fail('csp', 'Architecture says the policy has ' + claimed + ' directives; index.html writes ' + dirs);

    const scriptSrc = (app.match(/script-src([^;]*)/) || [, ''])[1];
    const evalOn = /'unsafe-eval'/.test(scriptSrc);
    const cdns = (scriptSrc.match(/https:\/\/[^\s;]+/g) || []);
    if (/'unsafe-eval'/.test(adm)) fail('csp', "admin.html's CSP grants 'unsafe-eval' again");

    if (evalOn || cdns.length) {
      const ABSENT = [/どちらも現在は入っていない/, /neither is present/i, /no CDN hosts?/i];
      eachDoc((f, s) => {
        for (const line of s.split('\n')) {
          if (!/unsafe-eval/.test(line)) continue;
          if (ABSENT.some((re) => re.test(line))) fail('csp', f + " says the app's CSP has no 'unsafe-eval' / CDN hosts; index.html has " + (evalOn ? "'unsafe-eval' and " : '') + cdns.length + ' CDN host(s)');
        }
      });
      const archCount = (ARCH.match(/(\d+)\s*つの\s*CDN\s*ホスト/) || [])[1];
      if (archCount && Number(archCount) !== cdns.length) fail('csp', 'Architecture says ' + archCount + ' CDN hosts in script-src; index.html has ' + cdns.length);
      if (!/SECURITY-ARCHITECTURE\.md/.test(ARCH)) fail('csp', 'Architecture.md no longer points at the residual-risk register that tracks this');
    }
    if (!problems.some((x) => x.startsWith('csp'))) ok('csp', dirs + ' directives · script-src: ' + (evalOn ? "'unsafe-eval' + " : '') + cdns.length + ' CDN host(s), described as such');
  }
}

/* ═══ 17. the tables: migrations ⇄ the pgTAP harness ⇄ the documents ══════════════════════
   The harness asserted RLS on 19 tables, the migrations created 20, and the DB page said 15.
   A table missing from the assertion list cannot fail the assertion. */
{
  const sqlAll = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql'))
    .map((f) => rd('supabase/migrations/' + f)).join('\n');
  const created = new Set([...sqlAll.matchAll(/create table (?:if not exists )?public\.([a-z0-9_]+)/gi)].map((x) => x[1].toLowerCase()));
  /* ⚠ EVERY enumeration IS ITS OWN CLAIM. The file lists the tables TWICE — once for "the table
     exists", once for "RLS is on for it" — and reading the file as one bag of names hides a table
     that is missing from exactly one of them, which is the shape the defect actually had. */
  const struct = rd('supabase/tests/00_structure_test.sql');
  const arrays = [...struct.matchAll(/unnest\(array\[([\s\S]*?)\]\)/g)]
    .map((m) => new Set([...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]).filter((n) => created.has(n))))
    .filter((set) => set.size > 0);
  if (!arrays.length) fail('db-tables', 'supabase/tests/00_structure_test.sql no longer enumerates any table — this rule needs rewriting');
  arrays.forEach((set, i) => {
    const gone = [...created].filter((t) => !set.has(t));
    if (gone.length) fail('db-tables', 'supabase/tests/00_structure_test.sql list #' + (i + 1) + ' never names ' + gone.join(', ') + ' — ' + created.size + ' tables exist, it asserts ' + set.size);
  });

  const RE = [['docs/DATABASE.md', /RLS is enabled on all \*\*(\d+)\*\*/], ['Architecture.md', /現在\s*\*\*(\d+)\s*表\*\*/]];
  for (const [f, re] of RE) {
    const mm = (BODY.get(f) || '').match(re);
    if (mm && Number(mm[1]) !== created.size) fail('db-tables', f + ' says ' + mm[1] + ' tables; the migrations create ' + created.size);
  }
  if (!problems.some((x) => x.startsWith('db-tables'))) ok('db-tables', created.size + ' tables, all of them asserted by the pgTAP structure test');
}

/* ═══ 18. the size of the node-test tier, as package.json defines it ══════════════════════ */
{
  const n = JSON.parse(rd('package.json')).scripts['test:checks'].split(/\s+/).filter((x) => x.endsWith('.mjs')).length;
  eachDoc((f, s) => {
    const mm = s.match(/\*\*(\d+) Node test files\*\*/);
    if (mm && Number(mm[1]) !== n) fail('node-tests', f + ' says ' + mm[1] + ' Node test files; test:checks runs ' + n);
  });
  if (!/Node test files/.test(BODY.get('docs/TESTING.md') || '')) fail('node-tests', 'docs/TESTING.md no longer states how large the node tier is');
  if (!problems.some((x) => x.startsWith('node-tests'))) ok('node-tests', n + ' node test files, stated correctly');
}

/* ═══ 19. the legal text has exactly ONE copy ═════════════════════════════════════════════
   The modal and the two public pages must all read js/legal-text.js. The moment one of them
   carries its own paragraph, the app and the linkable policy can say different things — and the
   one a reader can cite is the one that is wrong. */
{
  if (!has('js/legal-text.js')) fail('legal', 'js/legal-text.js is gone — the single source of the policy text');
  else {
    const text = rd('js/legal-text.js');
    if (!/プライバシーポリシー/.test(text) || !/Privacy Policy/.test(text)) fail('legal', 'js/legal-text.js no longer holds both language versions');
    if (/<p><b>/.test(rd('js/legal.js'))) fail('legal', 'js/legal.js carries policy prose again — it must read js/legal-text.js');
    for (const page of ['privacy.html', 'terms.html']) {
      if (!has(page)) { fail('legal', page + ' is gone — the policy needs a URL of its own'); continue; }
      /* ⚠ MENTIONING IT IS NOT LOADING IT. Both pages explain the arrangement in a comment that
         names these exact paths, so a bare substring test stays green after the <script> tag is
         deleted. What separates the two is the ATTRIBUTE — quotes included — which appears in the
         tag and never in the prose. No pattern is built and no markup is parsed: three attempts at
         doing this with a regex produced three CodeQL findings in a row, each correct. */
      const pageSrc = rd(page);
      for (const dep of ['js/legal-text.js', 'js/legal-page.js']) {
        if (!pageSrc.includes('src="./' + dep + '"')) {
          fail('legal', page + ' does not LOAD ' + dep + ' as src="./' + dep + '" (a mention in a comment is not a script tag)');
        }
      }
      if (/<p><b>/.test(rd(page))) fail('legal', page + ' carries its own copy of the prose');
    }
    const vite = rd('vite.config.js');
    for (const asset of ['privacy.html', 'terms.html', 'js/legal-text.js', 'js/legal-page.js']) {
      if (!vite.includes("'" + asset + "'")) fail('legal', 'vite.config.js STATIC_ASSETS does not copy ' + asset + ' — it would be absent from dist/');
    }
    if (!problems.some((x) => x.startsWith('legal'))) ok('legal', 'one copy of the policy, read by the modal and by both public pages, all shipped');
  }
}

/* ═══ 20. every current-state document is in the index ════════════════════════════════════
   docs/README.md exists so a reader can tell which document owns which fact. An index that
   silently misses a document is worse than none: it reads as complete. */
{
  const idx = BODY.get('docs/README.md');
  if (!idx) fail('doc-index', 'docs/README.md is gone — there is no index of the documents');
  else {
    const missing = DOCS.filter((f) => f !== 'docs/README.md' && !idx.includes(f.replace(/^docs\//, '')));
    if (missing.length) fail('doc-index', 'docs/README.md does not list ' + missing.join(', '));
    else ok('doc-index', 'all ' + (DOCS.length - 1) + ' current-state documents are listed in docs/README.md');
  }
}

/* ═══ 21. the i18n OPEN GAP: Architecture.md §10.1 ⇄ what the pair audit measures ══════════
   §10.1 states the size of the one named hole outside the translation gate's field of view — the
   count, and which files hold it. Nothing ever checked those numbers, so the section went on saying
   275 (js/reference-data.js 143 · js/analysis-panels.js 132) after the second file had been emptied
   and the count had halved: the document overstated the debt by 132 and named a file that carries
   none of it. A reader who opened §10.1 to find out what was left was told to convert tuples in a
   file where there are none.
   ⚠ THE NUMBER IS NOT COPIED INTO THIS FILE. It is read from the instrument that owns it, on every
   run — two copies of one quantity means one of them is stale, and this rule exists because that
   already happened to this exact quantity.
   ⚠ COST: the child parses every file in js/ and takes about ten seconds, which is most of this
   gate's running time. That is the price of measuring rather than restating; check:docs is a lane
   of its own in scripts/test-parallel.mjs and is not the longest one.
   ⚠ …AND IT IS WHY `--rule=` EXISTS (see the top of this file). A mutation test that runs this
   script once per mutation pays the ten seconds every time, while holding the tree lock. */
if (RULE && RULE !== 'i18n-open-gap') {
  /* skipped: this rule shells out for its facts and the caller asked for a different one */
} else {
  const sec = (ARCH.match(/### 10\.1[\s\S]*?(?=\n### )/) || [''])[0];
  let pairs = null;
  if (!sec) {
    fail('i18n-open-gap', 'Architecture.md no longer has a §10.1 — this rule needs rewriting');
  } else {
    try {
      pairs = JSON.parse(execFileSync(process.execPath, [join(ROOT, 'scripts/i18n-pair-audit.mjs'), '--json'],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] }));
    } catch (e) {
      fail('i18n-open-gap', 'scripts/i18n-pair-audit.mjs --json could not be read ('
        + (e.status != null ? 'exit ' + e.status : e.message) + ') — §10.1 cannot be checked');
    }
  }
  if (pairs) {
    const measured = new Map((pairs.files || []).map((f) => [f.file, f.n]));
    /* Every sentence in the section that states a total AND breaks it down by file — the section
       says it twice, in prose and in the OPEN GAP list, and one of the two rotting alone is exactly
       the failure this file is for. Matched on the shape (a count, then a parenthesis naming .js
       files with their counts) rather than on either wording, so re-phrasing the sentence does not
       silently stop it being checked. */
    const claims = [...sec.matchAll(/(\d[\d,]*)\s*件[^（(\n]{0,12}[（(]([^）)]{0,300})[）)]/g)]
      .map((m) => ({
        total: Number(m[1].replace(/,/g, '')),
        files: [...m[2].matchAll(/`([\w./-]+\.js)`\s*(\d[\d,]*)/g)].map((x) => [x[1], Number(x[2].replace(/,/g, ''))]),
        text: m[0].replace(/\s+/g, ' ').slice(0, 46),
      }))
      .filter((c) => c.files.length);
    if (!claims.length) {
      fail('i18n-open-gap', 'Architecture.md §10.1 no longer states the OPEN GAP as «N件（`file` N …）» — the rule that checks that number can no longer find it');
    }
    for (const c of claims) {
      if (c.total !== pairs.total) fail('i18n-open-gap', `Architecture.md §10.1 says the OPEN GAP is ${c.total}; scripts/i18n-pair-audit.mjs measures ${pairs.total} («${c.text}…»)`);
      for (const [f, n] of c.files) {
        if (!measured.has(f)) fail('i18n-open-gap', `Architecture.md §10.1 says ${f} holds ${n} adjacent-data tuple(s); the audit finds none there («${c.text}…»)`);
        else if (measured.get(f) !== n) fail('i18n-open-gap', `Architecture.md §10.1 says ${f} holds ${n}; the audit measures ${measured.get(f)} («${c.text}…»)`);
      }
      /* …and the other direction: a file the gap is in and the section does not name */
      for (const [f, n] of measured) {
        if (!c.files.some(([g]) => g === f)) fail('i18n-open-gap', `${f} holds ${n} adjacent-data tuple(s) and Architecture.md §10.1 does not name it («${c.text}…»)`);
      }
    }
    /* the exemption is stated in the same section, measured by the same instrument, and had drifted
       with it — an exemption whose size nobody checks is the one place this family of instruments
       can be defeated quietly */
    const ex = sec.match(/\*\*免除\*\*[^\n]{0,160}?(\d[\d,]*)\s*件/);
    if (!ex) fail('i18n-open-gap', 'Architecture.md §10.1 no longer states how many containers are exempt');
    else if (Number(ex[1].replace(/,/g, '')) !== pairs.exempt) fail('i18n-open-gap', `Architecture.md §10.1 says ${ex[1]} exempt container(s); the audit measures ${pairs.exempt}`);
    if (!problems.some((p) => p.startsWith('i18n-open-gap'))) {
      ok('i18n-open-gap', `${pairs.total} adjacent-data tuple(s) in ${measured.size} file(s) + ${pairs.exempt} exempt, stated correctly in Architecture.md §10.1`);
    }
  }
}

/* ═══ 22. WHEN THE DEEP TIER RUNS — derived from ci.yml's own gate ═════════════════════════
   (#R407) MEASURED: scripts/tiers.mjs, scripts/run-tests.mjs, scripts/test-budget.mjs, ci.yml
   itself, .github/actions/browser-tier/action.yml and FIVE files under tests/ — thirteen claims
   across ten files — all said the deep tier runs after each merge. #R207 took it off `push` TWO
   HUNDRED ROUNDS EARLIER; the post-merge CI run for 7d2e21e (2026-08-24, run 32708285103) skipped
   both deep jobs. The two places that were right — package.json's `//test:deep` and
   docs/TESTING.md — were right for no enforced reason.

   ⚠ AND THE GATE ITSELF WAS GUARDED THE WHOLE TIME. tests/r207-checks ⑫ has asserted that `if:`
   since the round that wrote it: schedule and dispatch present, `push` absent. It passed on every
   one of those 200 rounds. What nobody held to it was the PROSE — so the half a machine reads was
   correct and the half a person reads was not, and only the person acts on it.

   It is not a cosmetic rot. A round that believes the merge will catch a deep regression does not
   run `npm run test:deep` before opening its PR and does not treat a deep red as its own problem;
   that belief is what #R400 measured as six consecutive red nights and what let #R372 追記's
   regression be found by production first.

   So the trigger set is READ OUT OF THE WORKFLOW, and the prose is measured against it in both
   directions:
     · ARM A (negative, swept over the tree). No file may name the nightly and, joined straight to
       it, a trigger the job does not have. The file list is DERIVED — `git grep` for the nightly
       across tracked files — because a hand-kept list of documents to scan is itself the defect
       (#R399). Only the two history files are dropped, for the reason at the top of this file.
     · ARM B (positive, the 正本 only). docs/TESTING.md must state, for EVERY event the workflow
       triggers on, whether this tier runs on it. It is named here so that a document which stops
       stating the fact FAILS instead of quietly falling out of the scan — hand-write the 正本, and
       put it on the side that goes red when the sentence is absent (#R399).

   ⚠ THE NEEDLES ARE ASSEMBLED FROM PARTS so this file is not a copy of the sentence it forbids —
   the precaution the header of this file describes, and the reason arm A does not catch itself.
   ⚠ ARM A IS A NEEDLE AND NEEDLES ARE INCOMPLETE. Prose that puts a whole clause between the
   nightly and the claim slips past it; arm B is the half that cannot be phrased around, because it
   reads the gate and demands an answer. tests/r407-checks proves both halves go red.

   Cost, measured: 48 candidate files / 747 kB, of which the scan is 38 ms — the ~1.2 s this rule
   adds is almost entirely the `git grep` process spawn on Windows. */
{
  const CI = '.github/workflows/ci.yml';
  const JOB = 'browser-deep';
  const ci = has(CI) ? rd(CI) : '';
  if (!ci) fail('deep-tier-when', `${CI} is not there — this rule needs rewriting`);
  else {
    /* (1) what the workflow triggers on at all */
    const onM = ci.match(/^on:\r?\n([\s\S]*?)^(?=\S)/m);
    const wfEvents = onM ? [...onM[1].matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]) : [];

    /* (2) …and which of those reach the deep job, read off its own `if:` */
    const jobM = ci.match(new RegExp('^ {2}' + JOB + ':\\r?\\n([\\s\\S]*?)^ {2}[A-Za-z]', 'm'));
    const body = jobM ? jobM[1].split('\n').filter((l) => !/^\s*#/.test(l)).join('\n') : '';
    const ifM = body.match(/^ {4}if:\s*(.+)$/m);
    const cond = ifM ? ifM[1] : '';
    const eq = [...cond.matchAll(/github\.event_name\s*==\s*'([a-z_]+)'/g)].map((m) => m[1]);

    let deepOn = null;
    if (!wfEvents.length) fail('deep-tier-when', `${CI} no longer states its triggers as an \`on:\` block — this rule needs rewriting`);
    else if (!jobM) fail('deep-tier-when', `${CI} no longer has a \`${JOB}\` job — this rule needs rewriting`);
    else if (!ifM) deepOn = wfEvents.slice();                       /* no gate ⇒ every workflow event */
    else if (eq.length && !/!=|&&/.test(cond)) deepOn = wfEvents.filter((e) => eq.includes(e));
    else fail('deep-tier-when', `the \`if:\` on \`${JOB}\` is no longer a plain list of \`github.event_name ==\` tests («${cond.trim().slice(0, 80)}») — this rule needs rewriting`);

    if (deepOn) {
      const runsOnPush = deepOn.includes('push');

      /* ── ARM A ─────────────────────────────────────────────────────────────────────────── */
      /* the nightly, immediately joined to a merge/push claim. Both halves are built from parts. */
      const NIGHT = '(?:nightly|every night)';
      const JOIN = '[\\s.,;:+/&()\\u2014-]{0,6}(?:(?:it\\s+)?(?:also|and|plus|then)[\\s]*){0,2}(?:runs?\\s+)?[\\s.,;:+/&()\\u2014-]{0,6}';
      const PUSHY = '(?:on|after|behind|follows)\\s+(?:every\\s+|each\\s+|the\\s+)?(?:push|' + 'merge' + ')'
        + '|post-?' + 'merge';
      const PAIR = new RegExp(NIGHT + '(' + JOIN + ')(' + PUSHY + ')', 'gi');

      let files = [];
      try {
        /* ⚠ POSIX ERE, not JS: `git grep -E` rejects `(?:…)` with exit 128, and a rule that dies
           on its own needle reads exactly like a rule with nothing to say. Same alternation, plain. */
        files = execFileSync('git', ['grep', '-lIiE', '-e', 'nightly|every night', '--', '.'],
          { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean);
      } catch (e) {
        if (e.status !== 1) fail('deep-tier-when', 'the tree could not be swept for the claim (' + (e.status != null ? 'git grep exit ' + e.status : e.message) + ')');
      }
      files = files.filter((f) => !/^DEV-NOTES/.test(f));
      /* an empty sweep passes everything — the same guard the document scan at the top carries */
      if (files.length < 5) fail('deep-tier-when', `only ${files.length} tracked file(s) mention the nightly — the sweep is not reaching the tree`);

      let hits = 0;
      if (!runsOnPush) {
        for (const f of files) {
          /* ⚠ NOT LINE BY LINE. Prose wraps, and a claim that wraps mid-sentence is invisible to a
             line-based needle — so each file is stripped of its comment furniture and collapsed to
             one line first. MEASURED #R407: the hand-grep that opened the round found nine of the
             ten files and missed `tests/r337.spec.js`, whose claim breaks after «and after». */
          const flat = rd(f).split(/\r?\n/)
            .map((l) => l.replace(/^[\s>|]*(?:\/\*+|\*+\/|\*+|#+|\/\/)\s?/, ' '))
            .join(' ').replace(/\s+/g, ' ');
          for (const m of flat.matchAll(PAIR)) {
            hits++;
            fail('deep-tier-when', `${f} says the deep tier runs «…${m[0].trim().slice(0, 60)}…» — `
              + `${CI}'s \`${JOB}\` gate names only [${deepOn.join(', ')}], so no push and no merge runs it`);
          }
        }
      }

      /* ── ARM B ─────────────────────────────────────────────────────────────────────────── */
      const TDOC = 'docs/TESTING.md';
      const T = BODY.get(TDOC) || '';
      const MARK = '**Where it runs.**';
      /* ⚠ THE ANCHOR MUST BE UNIQUE, AND THIS IS NOT PEDANTRY — the first version of this rule took
         `indexOf`, and when tests/r407-checks blanked the real paragraph the rule quietly latched
         onto a SECOND copy further down the file and reported something else entirely. A 正本 with
         two copies is not a 正本 (CLAUDE.md §9), and `.indexOf` on a duplicated anchor is the same
         defect #R399 found in `.match()`: it answers for the file with its first hit. */
      const copies = T.split(MARK).length - 1;
      const anchor = copies === 1 ? T.indexOf(MARK) : -1;
      if (copies === 0) {
        fail('deep-tier-when', `${TDOC} no longer carries a «${MARK}» statement for the deep tier — it is the 正本 for which events run it, so its absence is a failure and not a skip`);
      } else if (copies > 1) {
        fail('deep-tier-when', `${TDOC} carries ${copies} «${MARK}» paragraphs — the 正本 for the deep tier's triggers has to be one paragraph, or this rule reads whichever comes first`);
      } else {
        const win = T.slice(anchor, anchor + 480);
        for (const e of wfEvents) {
          const at = win.indexOf('`' + e + '`');
          const runs = deepOn.includes(e);
          if (at < 0) {
            fail('deep-tier-when', `${TDOC}'s «Where it runs.» does not say whether the deep tier runs on \`${e}\`, which ${CI} triggers on`);
            continue;
          }
          const negated = /\b(?:not|never|no longer)\b/i.test(win.slice(Math.max(0, at - 40), at));
          if (runs && negated) fail('deep-tier-when', `${TDOC} says the deep tier does NOT run on \`${e}\`; \`${JOB}\`'s \`if:\` says it does`);
          if (!runs && !negated) fail('deep-tier-when', `${TDOC} names \`${e}\` without saying the deep tier does NOT run on it; \`${JOB}\`'s \`if:\` excludes it`);
        }
      }

      if (!problems.some((p) => p.startsWith('deep-tier-when'))) {
        /* ⚠ say WHICH arms actually ran. If the gate ever regains `push`, arm A has nothing to
           forbid — and «0 contradictions» would then be a sentence about a sweep that never
           looked, which is the exact confusion this whole rule exists to prevent. */
        ok('deep-tier-when', `the deep tier runs on [${deepOn.join(', ')}] and on nothing else `
          + `(${wfEvents.filter((e) => !deepOn.includes(e)).join(', ') || 'no other trigger'} excluded); `
          + (runsOnPush
            ? `arm A is inert because the gate now includes push; ${files.length} file(s) mention the nightly`
            : `${files.length} file(s) mentioning the nightly agree, ${hits} contradiction(s)`));
      }
    }
  }
}

/* ── report ──────────────────────────────────────────────────────────────────────────────── */
/* (#R407) `--rule=` narrows what is REPORTED as well as what is run. ⚠ A name that matched no rule
   at all must be an error: a typo would otherwise exit 0 and let a mutation test prove nothing. */
const mine = (s) => s.split(' —')[0].split(':')[0].trim() === RULE;
if (RULE && !problems.some(mine) && !notes.some(mine)) {
  console.log(`IntMap · cross-document facts — --rule=${RULE} matched no rule in this file\n`);
  console.log('  ✖ --rule named a rule that neither passed nor failed; check the spelling');
  process.exit(2);
}
const shownP = RULE ? problems.filter(mine) : problems;
const shownN = RULE ? notes.filter(mine) : notes;
console.log('IntMap · cross-document facts — ' + DOCS.length + ' current-state documents scanned'
  + (RULE ? `  (--rule=${RULE})` : '') + '\n');
for (const n of shownN) console.log('  ✓ ' + n);
if (shownP.length) {
  console.log('\n' + shownP.length + ' fact(s) have drifted:\n');
  for (const p of shownP) console.log('  ✖ ' + p);
  console.log('\nFix the document (or the code) so they agree. Do not relax the rule to make it pass.');
} else {
  console.log('\n✓ every checked fact agrees with the repository, and the documents agree with each other');
}
if (CHECK && shownP.length) process.exit(1);

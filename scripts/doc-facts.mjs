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
      eachDoc((f, s) => {
        for (const line of s.split('\n')) {
          if (!/地点解析/.test(line)) continue;
          if (/サーバー側でAI事前解析|サーバー側で事前にAI解析/.test(line) && !/停止|止めて|残してある|かつて/.test(line)) {
            fail('news-path', f + ' presents the server-side pre-analysis as the live path: ' + line.trim().slice(0, 90));
          }
        }
      });
    }
    if (!problems.some((x) => x.startsWith('news-path'))) ok('news-path', 'USE_SERVER_NEWS=' + m[1] + ' and every document — the privacy policy included — describes that path');
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

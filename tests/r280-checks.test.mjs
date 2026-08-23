/* ============================================================================
 *  #R280 — 「文書が多すぎる」の診断を検証して実装した回の回帰テスト
 * ----------------------------------------------------------------------------
 *  この回の主張は「文書と実装が食い違っていた」であり、その主張は**測れる**。したがって
 *  ここで検査するのは文章の見た目ではなく、次の3つである:
 *
 *    ① 新しく足した `check:docs` のルールが、実際に**落ちる**こと。
 *       規則を書いただけの検査は、何も見ていなくても緑になる（#R274 ②と同じ形）。
 *       各ルールについて、そのルールが禁じている状態を一時的に作り、`--check` が exit 1 で
 *       落ち、かつ**そのルール名を印字する**ことを確かめる。
 *    ② 移設で**情報が消えていない**こと。節番号を共有したまま別ファイルへ移したので、
 *       他の文書からの `§3.x` / `§7.x` 参照が生きていること、リンク先が実在すること。
 *    ③ 法務文面の**写しが1つ**であること——モーダルと公開2ページが同じ1本を読むこと。
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTreeLock } from './helpers/gate-lock.mjs';
import { readLF } from '../scripts/eol.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const has = (p) => existsSync(join(ROOT, p));

/* ⚠ (#R286) THE ANCHORS IN § ② ARE WRITTEN WITH LF, AND THIS CHECKOUT MAY NOT BE.
   `.gitattributes` pins only the extensions Linux executes (*.sh *.sql *.mjs *.yml *.yaml *.toml);
   *.html and *.md are left to `core.autocrlf`, which is `true` on the development machine. So
   `privacy.html`'s `…legal-text.js"></script>` is followed by CRLF here and by LF in CI, and the
   `legal` case demanded LF — red on Windows, green in CI, for a reason that is not its subject.
   That is #R283's finding in a fourth file; #R274, #R279 and #R282 each re-diagnosed the first
   three by hand, which is the cost of leaving one.
   ⚠ THE TEXT IS NOT NORMALISED, AND THAT IS THE POINT. § ② writes each file back byte for byte to
   restore it, so normalising what it READS would rewrite the working copy's line endings as a side
   effect of running the tests. The ANCHOR is widened instead: a line break in the pattern matches
   this checkout's line break and NOTHING else is relaxed — every other character is escaped, so an
   anchor that has genuinely gone is still a failure (tests/r286-checks ⑥ proves both directions). */
const anchorRe = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n'));

function docFacts() {
  try {
    execFileSync(process.execPath, [join(ROOT, 'scripts/doc-facts.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
    return { code: 0, out: '' };
  } catch (e) {
    return { code: e.status == null ? -1 : e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

/* ── ① the new rules actually bite ───────────────────────────────────────────────────────── */
/* ⚠ (#R286) A READER THAT REQUIRES A PRISTINE TREE IS ALSO A PARTY TO THE LOCK.
   tests/helpers/gate-lock.mjs was written for the two tests that MUTATE tracked files, and both
   take it — but this test asserts the opposite property (nothing is mutated right now) and took
   nothing. `node --test` runs the files in parallel, so while tests/r274 ③ held the lock with
   `docs/_doc-facts-negative-probe.md` on disk, this ran check:docs and reported the probe as a
   defect in the committed tree. MEASURED twice locally in one round; CI happened to schedule
   around it. The lock's own note already says everything that touches the tree must go through
   it — a reader of a shared invariant is exactly that, and nothing about WHAT is asserted below
   changes. */
test('R280 ① check:docs is green on the committed tree', async () => {
  const r = await withTreeLock(() => docFacts());
  assert.equal(r.code, 0, 'npm run check:docs must pass as committed:\n' + r.out);
});

test('R280 ② every rule this round added FAILS when its fact is made wrong', async () => {
  /* ⚠ the tree is shared. tests/r274 ③ does the same thing to prove the same kind of claim, and
     `node --test` runs the two files at the same time — see tests/helpers/gate-lock.mjs. */
  await withTreeLock(() => {
  /* Each case: a file, a byte-for-byte edit that creates the forbidden state, and the rule
     name the report must print. The file is always restored, pass or fail. */
  const CASES = [
    { rule: 'cesium', file: 'CONSTITUTION.md',
      from: '- **既定のレンダラは MapLibre GL。Cesium は設定で選べる第2エンジン**',
      to: '- **Cesium は廃止済み。再構築しない。** Cesium is abandoned.\n- **既定のレンダラは MapLibre GL。Cesium は設定で選べる第2エンジン**' },
    { rule: 'monitors', file: 'PRODUCT.md',
      from: '### 3.5 アカウント・その他',
      to: '### 3.5 アカウント・その他\n\n- **Monitors タブ** — 監視地域の一覧を開く。' },
    { rule: 'news-path', file: 'js/legal-text.js',
      from: 'headlines are fetched <b>by your browser</b>',
      to: 'news is fetched and geolocated server-side and stored' },
    { rule: 'csp', file: 'Architecture.md',
      from: '- ⚠ **`index.html` の `script-src` には現在 `\'unsafe-eval\'` と 8 つの CDN ホストが入っている**',
      to: '- ⚠ `\'unsafe-eval\'` と CDN ホスト（どちらも現在は入っていない）' },
    { rule: 'db-tables', file: 'supabase/tests/00_structure_test.sql',
      /* (#R351) news_ingest_runs joined both lists and the count moved 29 → 30, so the anchor moved
         with it. The mutation is unchanged in kind: take a table OUT of the list the rule reads. */
      from: "'news_cluster_decisions','news_event_i18n','saved_news_events','news_ingest_runs'\n]) as t;                                                    -- 30 assertions\n\n-- 2)",
      to: "'news_cluster_decisions','news_event_i18n'\n]) as t;                                                    -- 30 assertions\n\n-- 2)" },
    { rule: 'node-tests', file: 'docs/TESTING.md',
      from: 'Node test files** with no browser at all',
      to: 'Node test files** with no browser at all' },   /* rewritten below to a wrong number */
    { rule: 'legal', file: 'privacy.html',
      from: '<script src="./js/legal-text.js"></script>\n', to: '' },
    { rule: 'doc-index', file: 'docs/README.md',
      from: '[`MAP-LAYERS.md`](MAP-LAYERS.md)', to: '[`(removed)`](nothing.md)' },
  ];

  for (const c of CASES) {
    /* ⚠ (#R282 追記) MATCH ON CONTENT, RESTORE THE BYTES. Two of these needles contain a literal
       `\n`, and on a core.autocrlf=true checkout the file holds `\r\n` — so `includes` said no and
       this went red for a reason that has nothing to do with the facts it is guarding. #R283 fixed
       the same class in tests/r232 and tests/r261 with scripts/eol.mjs; this file landed in the
       same hour and missed it. The broken copy is written as LF (it lives for one `--check` and is
       thrown away), and `finally` puts the ORIGINAL BYTES back, so the checkout is untouched. */
    const originalBytes = rd(c.file);
    const original = readLF(join(ROOT, c.file));
    let broken;
    if (c.rule === 'node-tests') {
      broken = original.replace(/\*\*(\d+) Node test files\*\*/, '**3 Node test files**');
      assert.notEqual(broken, original, 'the node-test count sentence is gone from docs/TESTING.md');
    } else {
      const re = anchorRe(c.from);          /* (#R286) a line break in the anchor ⇒ this checkout's line break */
      assert.ok(re.test(original), `${c.file} no longer contains the anchor for the ${c.rule} case`);
      /* the replacement is a FUNCTION, so a `$` inside `to` stays text instead of becoming a back-reference */
      broken = original.replace(re, () => c.to);
      assert.notEqual(broken, original, `the ${c.rule} case did not change ${c.file}`);
    }
    try {
      writeFileSync(join(ROOT, c.file), broken);
      const r = docFacts();
      assert.equal(r.code, 1, `check:docs stayed green with a broken ${c.rule} fact in ${c.file}`);
      assert.ok(r.out.includes(c.rule), `check:docs failed but never named the ${c.rule} rule:\n` + r.out);
    } finally {
      writeFileSync(join(ROOT, c.file), originalBytes);
    }
  }
  /* and the tree is back the way it was */
  assert.equal(docFacts().code, 0, 'the restore left the tree failing');
  });
});

/* ── ② the move lost nothing a reader could follow ───────────────────────────────────────── */
test('R280 ③ the sections that moved kept their numbers, and the links resolve', () => {
  const files = rd('docs/FILES.md'), layers = rd('docs/MAP-LAYERS.md'), arch = rd('Architecture.md');
  /* the ledger keeps §3.1…§3.13 so every `§3.x` citation elsewhere still lands */
  for (const n of ['3.1', '3.2', '3.3', '3.11', '3.12', '3.13']) {
    assert.ok(new RegExp('^#{2,3} ' + n.replace('.', '\\.') + '[ .]', 'm').test(files),
      `docs/FILES.md lost §${n} — a §${n} reference in another document now goes nowhere`);
  }
  for (const n of ['7.1', '7.2', '7.5', '7.6', '7.7', '7.8', '7.9', '7.10']) {
    assert.ok(new RegExp('^### ' + n.replace('.', '\\.') + ' ', 'm').test(layers),
      `docs/MAP-LAYERS.md lost §${n}`);
  }
  /* …and Architecture still keeps the two contracts it did NOT move */
  for (const n of ['7.3', '7.4']) {
    assert.ok(new RegExp('^### ' + n.replace('.', '\\.') + ' ', 'm').test(arch), `Architecture.md lost §${n}`);
  }
  /* every relative markdown link in the current-state documents points at a file that exists */
  const DOCS = [...readdirSync(ROOT).filter((f) => f.endsWith('.md') && !/^DEV-NOTES/.test(f) && f !== 'CLAUDE.local.md'),
                ...readdirSync(join(ROOT, 'docs')).map((f) => 'docs/' + f)];
  const missing = [];
  for (const d of DOCS) {
    const dir = d.includes('/') ? d.slice(0, d.lastIndexOf('/')) : '.';
    for (const m of rd(d).matchAll(/\]\((\.\.?\/[^)#\s]+|[A-Za-z0-9_.-]+\.md)(?:#[^)\s]*)?\)/g)) {
      const target = m[1];
      if (/^https?:/.test(target)) continue;
      const abs = join(ROOT, dir, target);
      if (!existsSync(abs)) missing.push(`${d} → ${target}`);
    }
  }
  assert.deepEqual(missing, [], 'dangling links after the reorganisation');
});

test('R280 ④ the four merged documents are gone AND nothing still links to them', () => {
  for (const gone of ['docs/RLS-TESTING.md', 'docs/SECURITY-TESTING.md', 'docs/DATABASE-INCIDENT.md', 'ATLAS-VISION.md']) {
    assert.ok(!has(gone), `${gone} is back — it was merged into the document that owns its subject`);
  }
  /* their content arrived where it was supposed to */
  assert.match(rd('docs/DATABASE.md'), /## RLS & permission testing/, 'the pgTAP harness did not reach DATABASE.md');
  assert.match(rd('docs/TESTING.md'), /## Security testing/, 'the security checks did not reach TESTING.md');
  assert.match(rd('docs/INCIDENT-RESPONSE.md'), /## Database incidents/, 'the DB runbooks did not reach INCIDENT-RESPONSE.md');
  assert.match(rd('PRODUCT.md'), /Central OS/, 'the Atlas vision did not reach PRODUCT.md');
  /* …and the pgTAP harness kept the part that makes it usable, not just its heading */
  assert.match(rd('docs/DATABASE.md'), /01_rls_matrix_test\.sql/, 'DATABASE.md got the heading but not the file list');

  /* no current-state document, workflow or SQL file still names a file that no longer exists */
  const SCAN = [
    ...readdirSync(ROOT).filter((f) => f.endsWith('.md') && !/^DEV-NOTES/.test(f) && f !== 'CLAUDE.local.md'),
    ...readdirSync(join(ROOT, 'docs')).map((f) => 'docs/' + f),
    ...readdirSync(join(ROOT, '.github/workflows')).map((f) => '.github/workflows/' + f),
    'supabase/config.toml', 'supabase/tests/00_structure_test.sql',
  ];
  const stale = [];
  for (const f of SCAN) {
    for (const name of ['RLS-TESTING.md', 'SECURITY-TESTING.md', 'DATABASE-INCIDENT.md', 'ATLAS-VISION.md']) {
      if (rd(f).includes(name)) stale.push(`${f} → ${name}`);
    }
  }
  assert.deepEqual(stale, [], 'a reference to a merged-away document survived');
});

/* ── ③ the legal text has exactly one copy, and it is the true one ───────────────────────── */
test('R280 ⑤ the policy is written once and read three times', () => {
  const text = rd('js/legal-text.js');
  const modal = rd('js/legal.js');

  /* the source has both documents in both languages, and the modal has none of the prose */
  for (const needle of ['利用規約', 'Terms of Service', 'プライバシーポリシー', 'Privacy Policy']) {
    assert.ok(text.includes(needle), `js/legal-text.js is missing "${needle}"`);
  }
  assert.ok(!/<p><b>\d+\./.test(modal), 'js/legal.js carries policy paragraphs again');
  assert.match(modal, /IntMapLegalText/, 'js/legal.js does not read the shared source');

  /* the two public pages load it, carry no prose of their own, and are shipped by the build */
  const vite = rd('vite.config.js');
  for (const page of ['privacy.html', 'terms.html']) {
    const p = rd(page);
    assert.match(p, /js\/legal-text\.js/, `${page} does not load the shared text`);
    assert.match(p, /js\/legal-page\.js/, `${page} does not load the page shell`);
    assert.ok(!/<p><b>/.test(p), `${page} carries its own copy of the prose`);
    assert.ok(vite.includes(`'${page}'`), `${page} is not in vite.config.js STATIC_ASSETS — it would be absent from dist/`);
  }
  for (const asset of ['js/legal-text.js', 'js/legal-page.js']) {
    assert.ok(vite.includes(`'${asset}'`), `${asset} is not copied to dist/ — the pages would load nothing`);
  }

  /* the text renders: the date interpolates and no template hole is left behind */
  const ctx = { window: {} };
  const vm = new (globalThis.process.binding ? Object : Object)();   // (keep the linter quiet)
  void vm;
  const run = new Function('window', text + '\nreturn window.IntMapLegalText;');
  const T = run(ctx.window);
  assert.deepEqual(T.langs, ['ja', 'en']);
  for (const which of ['terms', 'privacy']) {
    for (const lang of ['jp', 'en']) {
      const html = T.html(which, lang);
      assert.ok(html.length > 800, `${which}/${lang} came out empty`);
      assert.ok(!html.includes('${'), `${which}/${lang} has an unresolved template hole`);
      assert.match(html, /Last updated|最終更新/, `${which}/${lang} lost its date line`);
    }
  }

  /* the correction this round made: the browser does the fetching and the placing */
  const en = T.html('privacy', 'en'), ja = T.html('privacy', 'jp');
  assert.ok(!/geolocated server-side/.test(en), 'the English policy still claims server-side geolocation');
  assert.ok(!/サーバー側で取得・地点解析のうえ保存/.test(ja), 'the Japanese policy still claims server-side storage');
  assert.match(en, /by your browser/, 'the English policy does not say who fetches the news');
  assert.match(ja, /お使いのブラウザが/, 'the Japanese policy does not say who fetches the news');
  /* …and that matches the switch that actually decides it */
  assert.match(rd('js/app-body.js'), /const USE_SERVER_NEWS\s*=\s*false/, 'USE_SERVER_NEWS changed — the policy has to change with it');
});

/* ── the public pages are nine-language on the surface the i18n gate measures ─────────────── */
test('R280 ⑥ the legal pages are localised where they can be, and honest where they cannot', () => {
  const shell = rd('js/legal-page.js');
  const codes = readdirSync(join(ROOT, 'js/locales'))
    .map((f) => (f.match(/^ui\.([a-z-]+)\.js$/) || [])[1]).filter(Boolean)
    .map((c) => (c === 'jp' ? 'ja' : c === 'zh' ? 'zh-hant' : c));
  for (const c of codes) {
    assert.ok(new RegExp("(^|[\\s{,])'?" + c.replace('-', '\\-') + "'?\\s*:\\s*\\{", 'm').test(shell),
      `js/legal-page.js has no chrome for ${c} — a reader in that language gets an English page frame`);
  }
  /* the document itself is two languages ON PURPOSE, and the page says so */
  assert.match(shell, /日本語と英語でのみ/, 'the Japanese notice about the two-language document is gone');
  assert.match(shell, /Japanese and English only/, 'the English notice about the two-language document is gone');

  /* the doc audit must SEE these pages — a reader-facing page missing from its list is invisible */
  const audit = rd('scripts/i18n-doc-audit.mjs');
  for (const page of ['privacy.html', 'terms.html']) {
    assert.ok(audit.includes(`'${page}'`), `${page} is not in scripts/i18n-doc-audit.mjs — its tab title would go unmeasured`);
  }
});

/* ── the history move: nothing was deleted, only relocated ───────────────────────────────── */
test('R280 ⑦ the archive boundary moved without losing a round', () => {
  const dn = rd('DEV-NOTES.md'), ar = rd('DEV-NOTES-ARCHIVE.md');
  const nums = (t) => [...t.matchAll(/^## R(\d+)\b/gm)].map((m) => Number(m[1]));
  const inNotes = nums(dn), inArchive = nums(ar);
  assert.ok(inNotes.length >= 10, 'DEV-NOTES.md kept too few rounds to be useful');
  assert.ok(Math.min(...inNotes) >= 260, 'DEV-NOTES.md still holds a round below the new boundary');
  /* round numbers are not contiguous — some were never used (there is no #R259), so the test is
     that the two files do not OVERLAP, not that they abut on an integer. */
  assert.ok(Math.max(...inArchive) < Math.min(...inNotes),
    'the two files overlap: a round is in both DEV-NOTES.md and the archive');
  assert.equal(new Set([...inArchive, ...inNotes]).size, inArchive.length + inNotes.length,
    'a round heading appears in both files');
  /* every round in the archive has its index entry, and vice versa — the index moved with the body */
  const idx = [...ar.matchAll(/^- \*\*#R(\d+)\*\*/gm)].map((m) => Number(m[1]));
  const moved = inArchive.filter((n) => n >= 200 && n < 260);
  const withoutIndex = moved.filter((n) => !idx.includes(n));
  assert.deepEqual(withoutIndex, [], 'a moved round lost its index entry');
  /* the two files still declare their own order, and the archive still says it is history */
  assert.match(dn, /新しい順/, 'DEV-NOTES.md no longer declares its order');
  assert.match(ar, /古い順/, 'the archive no longer declares its order');
  assert.match(ar, /「当時そうだった」/, 'the archive lost the warning that it is not the current spec');
});

/* ── the USB procedure is implemented, not described twice ───────────────────────────────── */
test('R280 ⑧ the backup procedure lives in one place and keeps its invariants', () => {
  assert.ok(has('scripts/backup-usb.ps1'), 'scripts/backup-usb.ps1 is gone — CLAUDE.md §11 points at nothing');
  const ps = rd('scripts/backup-usb.ps1');
  /* the properties that must survive any rewrite of the script */
  assert.match(ps, /DriveType\s*=\s*2/, 'the removable-only guard is gone — a mirror could target the system disk');
  assert.match(ps, /SHA256/i, 'verification no longer hashes — a copy that returned is not a copy that is correct');
  assert.match(ps, /INTMAP-BACKUP/, 'the volume label the drive is identified by is gone');
  /* (#R282 ⟂ #R280) the SOURCE is the master copy, and it has to be the merged state first */
  assert.match(ps, /--git-common-dir/, 'the script no longer derives the master copy — it would mirror whichever worktree ran it');
  assert.ok(/master-sync\.mjs[\s\S]{0,80}--check/.test(ps), 'the script no longer refuses a master that is behind origin/main');
  assert.match(ps, /AMBIGUOUS/, 'the refuse-to-guess path is gone');
  assert.match(ps, /RESULT /, 'the machine-readable result line is gone');
  /* CLAUDE.md keeps WHEN, and stays the only place that states the frequency */
  const cm = rd('CLAUDE.md');
  assert.match(cm, /scripts\/backup-usb\.ps1/, 'CLAUDE.md no longer points at the implementation');
  assert.match(cm, /作業のたびに毎回/, 'CLAUDE.md lost the frequency rule it owns');
  assert.ok(!/robocopy/i.test(cm), 'CLAUDE.md is describing the mechanism again — that is the script’s job');
});

/* ── the standalone pages are COPIED, so their js/ and css/ references are not bundled ───── */
test('R280 ⑨ every asset the verbatim-copied pages load is in the build’s copy list', async () => {
  const { STATIC_ASSETS } = await import('../vite.config.js');
  const copied = new Set(STATIC_ASSETS);
  /* ⚠ THIS IS THE POPULATION tests/r175 ③ EXCLUDES. That rule skips anything under css/ js/ src/
     as "bundled", which is true of index.html and false of these four: they are served verbatim
     (vite.config.js STATIC_ASSETS), so every <link>/<script> in them resolves against dist/ and
     has to be copied by name. css/fonts.css was 404 in production for that reason. */
  const PAGES = ['sources.html', 'science.html', 'privacy.html', 'terms.html'];
  const missing = [];
  for (const page of PAGES) {
    const html = rd(page);
    for (const m of html.matchAll(/(?:src|href)\s*=\s*"(\.\/)?((?:js|css|fonts|data)\/[^"?#]+)"/g)) {
      const rel = m[2];
      if (!has(rel)) { missing.push(page + ' → ' + rel + ' (the file itself does not exist)'); continue; }
      /* the list holds files AND directories ('js/locales' covers every locale), so an asset is
         shipped if the list names it or ANY of its ancestor directories */
      const parts = rel.split('/');
      const shipped = copied.has(rel) || parts.some((_, i) => copied.has(parts.slice(0, i + 1).join('/')));
      if (!shipped) missing.push(page + ' → ' + rel + ' (not in STATIC_ASSETS)');
    }
  }
  assert.deepEqual(missing, [], 'these are loaded by a verbatim-copied page but would be absent from dist/');
});

/* ── the footer links reach the pages, and a merge cannot quietly take that back ──────────── */
test('R280 ⑩ the app footer links carry the real URLs of the two policy pages', () => {
  /* 本番検証で1件: the pages shipped and the anchors still said "#". Both merges this round
     conflicted on index.html and both were settled by taking the other side's file WHOLE —
     right for the build stamp, which must never move backwards, and wrong for everything else
     in the same file. A file-level resolution is not a decision about the file's other lines. */
  const html = rd('index.html');
  for (const [id, page] of [['link-terms', 'terms.html'], ['link-privacy', 'privacy.html']]) {
    const m = html.match(new RegExp('<a href="([^"]*)" id="' + id + '"'));
    assert.ok(m, `the ${id} anchor is gone from index.html`);
    assert.equal(m[1], './' + page,
      `${id} points at "${m[1]}" — the policy has a URL now, so the link that names it must be that URL`);
    assert.ok(has(page), `${page} does not exist, so ${id} would 404`);
  }
  /* the modal still opens on click — the href is additive, not a replacement */
  assert.match(rd('js/legal.js'), /link-terms[\s\S]{0,120}preventDefault\(\); openLegal\('terms'\)/,
    'the in-app modal no longer intercepts the click — the link would leave the app instead of opening the panel');
});

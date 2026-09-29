/* Data & attribution — the Settings entry that leads to sources.html, and the ONE registry both the
 * in-app dialog and that page read (js/reference-data.js + the per-language descriptions in
 * js/locales/pages.<code>.js).
 *
 * Gathered from tests/r213-checks ⑦ (「設定の出典ボタンを押しても、直接新たに作った出典ページに行かなかった。」)
 * and ⑩ (every new source is registered with its attribution and its limits — standing instruction 4).
 * Titles keep the round that wrote them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ⚠ READ, NOT RUN: the Settings group is index.html markup; which control it offers is the claim. */
test('R213 ⑦: Settings → Data & attribution is the sources page, and the in-app list survives', () => {
  const html = read('index.html');
  const grp = /<div class="setting-group"><label data-i18n="lblDataSources">[\s\S]*?<\/div>/.exec(html);
  assert.ok(grp, 'the Data & attribution group exists');
  assert.match(grp[0], /<a id="link-sources" href="\.\/sources\.html"/, 'the primary control in that group is the page');
  /* (#R215) …and the group offers ONE control. 「アプリ内で簡易一覧を見る←ふざけんじゃねえよ」 — a "quick
     list" beside the real page is a worse copy of the same answer with a choice attached. The dialog
     itself is not deleted (js/app-body.js publishes `window.imOpenSources`); what is gone is the second
     entry in Settings. */
  assert.doesNotMatch(grp[0], /id="btn-data-sources"/, 'the group does not offer a lesser copy beside the page');
  assert.match(read('js/app-body.js'), /window\.imOpenSources\s*=/, 'the in-app dialog is kept reachable rather than deleted');
  /* the duplicate group #R212 left two rows below is gone, so there is one answer to "data sources" */
  assert.doesNotMatch(html, /data-i18n="lblSourcesPage"/, 'the second, duplicate settings group is gone');
  assert.equal((html.match(/href="\.\/sources\.html"/g) || []).length, 2,
    'sources.html is linked from the settings group and from inside the dialog, and nowhere else');
});

/* RUN: the registry and the descriptions are evaluated as the page loads them. */
test('R213 ⑩: the four new data sources are registered with their attribution and their limits', () => {
  const w = {}; new Function('window', read('js/reference-data.js'))(w);
  const list = w.IntMapRefData.dataSources;
  /* (#R246) one reader for the descriptions, which live in js/locales/pages.<code>.js */
  const docs = {}; const P = { define: (c, d) => { docs[c] = d; } };
  for (const c of ['en', 'ja']) new Function('window', read(`js/locales/pages.${c}.js`))({ IntMapPageI18N: P });
  const use = (s, c) => (docs[c] && docs[c].sourceUse && docs[c].sourceUse[s.n]) || '';
  const has = (re) => list.find((s) => re.test(s.n));
  const horizons = has(/Horizons/i), sbdb = has(/Small-Body/i), simbad = has(/SIMBAD/i);
  assert.ok(horizons && sbdb && simbad, 'Horizons, SBDB and SIMBAD are all registered');
  for (const s of [horizons, sbdb, simbad]) {
    assert.ok(s.u && /^https:\/\//.test(s.u), s.n + ' links to its source');
    for (const c of ['en', 'ja']) assert.ok(use(s, c).length > 200, s.n + ' explains itself in ' + c);
  }
  /* the two limits that would otherwise be assumed away */
  assert.match(use(horizons, 'en'), /not telemetry/i, 'the trajectory/telemetry distinction is written down');
  assert.match(use(sbdb, 'en'), /not good enough to point a telescope/i, 'so is the accuracy of a two-body propagation');
  assert.match(use(simbad, 'en'), /without depth/i, 'and so is what happens to an object with no published distance');
});

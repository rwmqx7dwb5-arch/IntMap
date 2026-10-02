/* ============================================================================
 *  IntMap · locale-on-demand — start-up reads the fallback locale and nothing else, and a locale that
 *  fails to arrive is said, with its reason, and can be asked for again
 *  (scripts/perf-budget.mjs, js/lang-registry.js, js/lang-switch.js)
 * ----------------------------------------------------------------------------
 *  「起動時に読者の言語以外の locale を読んだら赤」 — measured 2026-10-02 on the built site: the eager
 *  graph holds ui.en (the prototype every table chains onto) and no other locale; an en reader fetches
 *  no locale chunk, a jp reader 21,846 B, an fr reader 446,528 B, and a switch fetches only the target.
 *  That was true before this round and NOTHING held it: one static import in src/main.js, or
 *  `{eager:true}` on the glob in src/locale-boot.js, would have put up to 450 kB per language back on
 *  every session's critical path and the byte ceilings would have called it «grew». check:perf now
 *  names it (`localeErrors`), and ① drives that rule through the same measureFrom() the gate uses.
 *
 *  ②③ — the other half. A locale chunk that failed (a tab opened before a deploy asks for a hashed
 *  name the new deploy no longer has) was swallowed into a console line and its `null` was CACHED, so
 *  the reader was told nothing and a second click could never fetch again. EVALUATED: the registry and
 *  the switch are the shipped modules.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importModule } from './helpers/import-module.mjs';
import { judge, localeErrors, measureFrom } from '../scripts/perf-budget.mjs';

/* a build report in the shape scripts/build-report.mjs writes — eager chunk list plus per-chunk modules */
function report(eagerModules) {
  const chunks = {
    'assets/main-AAAA.js': { name: 'main', raw: 3_000_000, modules: { 'src/main.js': 100, ...eagerModules } },
    'assets/ui.ko-BBBB.js': { name: 'ui.ko', raw: 440_000, modules: { 'js/locales/ui.ko.js': 337_218 } },
  };
  return {
    eager: { chunks: ['assets/main-AAAA.js'], raw: 3_000_000, gzip: 1_000_000, brotli: 800_000, requests: 7, modules: 290,
      css: { raw: 300_000, gzip: 50_000 } },
    async: { raw: 440_000, gzip: 170_000, chunks: ['assets/ui.ko-BBBB.js'] },
    chunks,
  };
}
const measured = (mods) => measureFrom(report(mods), 'no-such-dist-dir');

test('locale-on-demand ① start-up may read the fallback locale and no other — check:perf says which', () => {
  const ok = measured({ 'js/locales/_langs.js': 202, 'js/locales/ui.en.js': 19_238 });
  assert.deepEqual(ok.eagerLocales, { en: 19_238 }, 'the eager locales are read from the eager chunks\' MODULES (an async ui.ko is not one)');
  assert.deepEqual(localeErrors(ok.eagerLocales), [], 'English alone in the start-up graph is the designed shape');

  const fr = measured({ 'js/locales/ui.en.js': 19_238, 'js/locales/ui.fr.js': 463_592 });
  const e1 = localeErrors(fr.eagerLocales);
  assert.equal(e1.length, 1);
  assert.match(e1[0], /ui\.fr/, 'the error names the locale that leaked into start-up');
  /* …and it is a judge() error, i.e. the pull request is red, not a note */
  const base = ok; const b = { eager: { ...base.eager }, async: { raw: base.async.raw, gzip: base.async.gzip, chunks: { ...base.async.chunks } }, dist: { ...base.dist } };
  assert.ok(judge(fr, b).errors.some((e) => /ui\.fr/.test(e)), 'judge() fails the build that reads ui.fr at start-up');
  assert.deepEqual(judge(ok, b).errors, [], '…and passes the one that does not');

  const none = measured({ 'js/locales/_langs.js': 202 });
  assert.match(localeErrors(none.eagerLocales).join('\n'), /fallback locale ui\.en is not in the start-up graph/,
    'the fallback missing from start-up is the other way to break it — every table chains onto it per key');

  /* a report with no module lists (the synthetic ones other checks hand measureFrom) asserts nothing
     here rather than everything; the CLI refuses such a report outright (measure()). */
  const bare = report({}); delete bare.eager.chunks;
  assert.equal(measureFrom(bare, 'no-such-dist-dir').eagerLocales, null);
  assert.deepEqual(localeErrors(null), []);
});

test('locale-on-demand ② a failed locale keeps its reason, tells its listeners once, and is fetched again when asked again', async () => {
  const win = {}; win.window = win;
  const { IntMapLang: L } = await importModule('js/lang-registry.js', { globals: { window: win } });
  let calls = 0, fail = true;
  L.declare(['xx'], { xx: () => { calls++; if (fail) return Promise.reject(new Error('Failed to fetch dynamically imported module')); L.define('xx', { ui: { hello: 'olleh' } }); return Promise.resolve({}); } });
  const told = [];
  L.onFail((c, why) => told.push([c, why]));

  assert.equal(await L.ensure('xx'), null, 'a failure still resolves (English underneath), it never rejects');
  assert.equal(L.failure('xx'), 'Failed to fetch dynamically imported module', 'the reason is kept');
  assert.deepEqual(told, [['xx', 'Failed to fetch dynamically imported module']], 'listeners are told once, with the reason');
  assert.equal(L.isLoaded('xx'), false);

  fail = false;
  await L.ensure('xx');
  assert.equal(calls, 2, 'asking again FETCHES again — the failure was not cached (it used to be, forever)');
  assert.equal(L.isLoaded('xx'), true);
  assert.equal(L.failure('xx'), null, 'a success clears the reason');
  await L.ensure('xx');
  assert.equal(calls, 2, 'a success IS cached — a loaded language is never fetched twice');
  assert.equal(told.length, 1, 'a success tells nobody anything');
});

test('locale-on-demand ③ the reader is told, in the asked language, for the language asked or on screen — not for a background one', async () => {
  const fetches = new Map(), hooks = [], fails = [];
  const LANG = {
    normalise: (c) => String(c),
    isLoaded: () => false,
    ensure: (c) => new Promise((ok) => fetches.set(c, () => { fails.forEach((h) => h(c, 'Failed to fetch')); ok(null); })),
    onDefine: (fn) => hooks.push(fn),
    onFail: (fn) => fails.push(fn),
    list: () => [{ code: 'fr', label: 'Français' }, { code: 'jp', label: '日本語' }, { code: 'ko', label: '한국어' }],
    t: (code, en, jp) => (code === 'jp' ? jp : en),
  };
  const shown = [];
  const win = {}; win.window = win;
  await importModule('js/lang-switch.js', {
    globals: { window: win },
    mocks: { 'js/lang-registry.js': { IntMapLang: LANG }, 'js/notify.js': { notify: { show: (m) => shown.push(m) } } },
  });
  const SW = win.IntMapLangSwitch;
  const settled = () => new Promise((r) => setTimeout(r, 0));

  /* the cold boot: the saved language is asked before app-body binds the switch */
  fails.forEach((h) => h('jp', 'Failed to fetch'));
  assert.equal(shown.length, 1, 'a boot-time failure of the saved language is said');
  assert.match(shown[0], /この言語を読み込めませんでした/, '…in the language that was asked for (jp is authored)');
  assert.match(shown[0], /日本語: Failed to fetch/, '…naming the language and the reason');

  SW.bind(() => 'en', () => {});
  let applied = 0;
  SW.when('fr', () => { applied++; });
  fetches.get('fr')(); await settled();
  assert.equal(shown.length, 2, 'a failed switch is said');
  assert.match(shown[1], /Could not load this language/);
  assert.match(shown[1], /Français: Failed to fetch/);
  assert.equal(applied, 1, '#R233\'s rule is unchanged: the switch still applies, with English underneath');

  fails.forEach((h) => h('ko', 'Failed to fetch'));
  assert.equal(shown.length, 2, 'a language nobody asked for and nobody is reading is not announced');
});

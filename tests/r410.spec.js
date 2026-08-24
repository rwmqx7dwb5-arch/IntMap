/* ============================================================================
 *  R410 — 時間を戻したとき、国境だけでなく「国名」も戻る
 * ----------------------------------------------------------------------------
 *  「歴史地図の国名ラベルが、同じ画面の Countries 一覧と食い違う。」 #R409 の実測。
 *  1939 → 1916 と戻すと、地図は 1916 年に «Nazi Germany»・«Spanish Republic»・
 *  «United Kingdom» のままだった——1939 年の名前と、1916 年には存在しない国名である。
 *
 *  ⚠⚠⚠ **この検査は「描かれた文字」を読む。プロパティを読むのではない。**
 *  `imtb-lbl` / `imtb-lbl2` の地物プロパティ `NAME` は**どちらの場合も «Germany»** で
 *  正しいので、ソースのプロパティを読む検査は**画面が間違っているあいだ緑になる**
 *  （#R409 の報告がそう名指ししている）。ここで読むのは
 *    ① どちらのレイヤーが**実際にその地物を描いたか**（`queryRenderedFeatures` は
 *       レイヤーの filter を適用するので、`_same` の振り分けがそのまま試験される）
 *    ② そのレイヤーが**今まさに宣言している** `text-field` 式を、その地物に当てた結果
 *  で、式は `getLayoutProperty` から取る——ここに `['coalesce',['get','_locName'],…]` を
 *  書き写すと、レイヤー側を変えたときに**検査だけが古い主張を続ける**ことになる。
 *
 *  ⚠⚠ **地図の主張と一覧の主張を、同じ瞬間に両方読む。** 「1916 年の正しい名前」を
 *  地図についてだけ確かめる検査は、一覧が別の名前を出していても緑になる——報告された
 *  欠陥は「どちらかが間違っている」ではなく「**二つが食い違っている**」である。
 *
 *  ⚠ 起動時に一覧の元データ（Natural Earth の属性）が遅れて届く側の半分は
 *  `tests/r410-late.spec.js`（deep tier）にある。あちらは自分の page を起動して
 *  route で遅らせるので、この門の半分は共有 page のまま数秒で済む。
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

/* The polygon NAME the era data carries → what 1916 must put on the screen (English), and the camera
   each claim is read from.
   ⚠ ONE CAMERA FOR ALL OF THEM IS FLAKY, AND IT FLAKED HERE BEFORE THIS WAS SPLIT. Both era layers
   collide like any other symbol layer (`text-padding` 6, no allow-overlap), so
   `queryRenderedFeatures` returns the labels that were PLACED — which is the right question to ask,
   and which is why the answer changes with what else is competing in the viewport. Russia's label
   point is in Asia and was simply not on screen over Europe: a run where it happened to be returned
   and a run where it was not are both honest, so each claim gets a viewport it is really in. */
const CAMERA = { center: [8, 48], zoom: 4.2 };
const IN_1916 = {
  'Germany': 'German Empire',
  'France': 'French Third Republic',
  'Italy': 'Kingdom of Italy',
  'United Kingdom': 'United Kingdom of Great Britain and Ireland',
  'Spain': 'Spain',                        /* no era identity in 1916 — the one that read «Spanish Republic» */
};
/* Russia («Russian Empire» — a FORMER STATE whose polygon still carries a successor's modern name)
   needs a second viewport, and a second viewport costs the gate seconds it does not have. It is asked
   in tests/r410-late.spec.js, which is booting its own page anyway. */

/* ⚠ the Countries tab is HALF THIS CLAIM, so it has to be really open before anything is read.
   `IntMapOS.exec('tab.stats')` fired straight after boot is a silent no-op when js/session-tabs.js has
   not registered the command yet — measured: the tab stayed on News and the list was the one drawn at
   boot, i.e. the modern names, which would have failed this test for the wrong reason. */
const openCountries = (page) => page.waitForFunction(() => {
  try { window.IntMapOS.exec('tab.stats', { source: 'test' }); } catch (_) { }
  return !!(window._countriesActive && window._countriesActive());
}, null, { timeout: 20000, polling: 250 });

/* what is drawn, and what the Countries list says, read in the same evaluate() */
const READ = () => {
  const map = window.__imap;
  const evalTF = (expr, props) => {
    if (typeof expr === 'string') return expr;
    if (!Array.isArray(expr)) return '';
    if (expr[0] === 'coalesce') {
      for (let i = 1; i < expr.length; i++) { const v = evalTF(expr[i], props); if (v != null && v !== '') return v; }
      return '';
    }
    if (expr[0] === 'get') { const v = props[expr[1]]; return (v == null) ? null : String(v); }
    return '';
  };
  const drawn = {};
  for (const id of ['imtb-lbl', 'imtb-lbl2']) {
    let tf = null; try { tf = map.getLayoutProperty(id, 'text-field'); } catch (_) { }
    let fs = []; try { fs = map.queryRenderedFeatures({ layers: [id] }); } catch (_) { }
    for (const f of fs) drawn[String(f.properties.NAME || f.properties.name || '')] = evalTF(tf, f.properties);
  }
  const list = [];
  document.querySelectorAll('.stat-row .stat-name').forEach((n) => list.push(n.textContent.trim()));
  return { drawn, list, listOpen: !!(window._countriesActive && window._countriesActive()) };
};

/* ⚠ THE WAITS BELOW ARE BUILD-INDEPENDENT ON PURPOSE. Waiting for «German Empire» to appear would be
   waiting for the answer, so a build with the defect would fail by TIMEOUT — thirty silent seconds
   and a message about a predicate. These wait for a polygon only that YEAR's snapshot contains
   («Soviet Union» in 1939, «Austria-Hungary» in 1916) plus the identities being in the table at all,
   which is true of a broken build too — and then the assertion says what is wrong, immediately. */
const arrived = (page, polygon) => page.waitForFunction((nm) => {
  const s = window.__imap.getSource('imtb-src'); let d = null;
  try { d = s && s.serialize().data; } catch (_) { }
  const has = !!(d && (d.features || []).some((f) => String((f.properties || {}).NAME || '') === nm));
  let ident = false;
  try { ident = !!Object.keys(window.IntMapHistId._applied() || {}).length; } catch (_) { }
  return has && ident;
}, polygon, { timeout: 60000, polling: 200 });

/* ⚠⚠ WHAT IS ON SCREEN IS NOT WHAT THE SOURCE SAYS, FOR AS LONG AS THE TILES TAKE TO RE-PARSE — and
   this test read the stale ones. MEASURED: it failed inside `npm test`, where the browser half runs
   beside 2,602 Node tests, with «Germany» drawn as «Nazi Germany» at 1916. The source already held
   the 1916 collection (the wait above proved that), but `queryRenderedFeatures` was still answering
   from the 1939 tiles — and «Germany» is in BOTH collections, so a wait that only looks for the NAME
   cannot tell them apart. The same shape as #R382's `isSourceLoaded` returning true about the camera
   it had already left.
   So the wait is the assertion's own precondition, stated: every era label ON SCREEN carries the tag
   the source data now gives that polygon. ⚠ It cannot hide the defect it is here to catch — a build
   that tags wrongly has the screen AGREEING with the source, and the assertion below still fails. */
const rendered = (page, names) => page.waitForFunction((want) => {
  let d = null;
  try { const s = window.__imap.getSource('imtb-src'); d = s && s.serialize().data; } catch (_) { return false; }
  if (!d || !Array.isArray(d.features)) return false;
  const src = new Map();
  for (const f of d.features) src.set(String((f.properties || {}).NAME || ''), String((f.properties || {})._modName || ''));
  const drawn = new Set();
  for (const id of ['imtb-lbl', 'imtb-lbl2']) {
    let fs = []; try { fs = window.__imap.queryRenderedFeatures({ layers: [id] }); } catch (_) { }
    for (const f of fs) {
      const nm = String(f.properties.NAME || f.properties.name || '');
      if (!src.has(nm)) return false;                                              /* a polygon the data no longer has */
      if (src.get(nm) !== String(f.properties._modName || '')) return false;       /* a stale tag still on screen */
      drawn.add(nm);
    }
  }
  return want.every((n) => drawn.has(n));
}, names, { timeout: 40000, polling: 200 });

test('R410 ① 1939 へ進んでから 1916 へ戻すと、描かれた国名も 1916 のものになり、Countries 一覧と一致する', async ({ app }) => {
  const page = app.page;
  await openCountries(page);
  await page.evaluate((c) => window.__imap.jumpTo({ center: c.center, zoom: c.zoom, pitch: 0, bearing: 0 }), CAMERA);

  /* forward first — the state this defect needs is «the previous year's identities are in the table» */
  await page.evaluate(() => window.IntMapTime.set(new Date('1939-09-01T12:00:00Z'), { source: 'test' }));
  await arrived(page, 'Soviet Union');

  /* …and back */
  await page.evaluate(() => window.IntMapTime.set(new Date('1916-07-01T12:00:00Z'), { source: 'test' }));
  await arrived(page, 'Austria-Hungary');
  await rendered(page, Object.keys(IN_1916));
  /* ⚠ and it must STAY — a label that is right for one frame on its way somewhere else is not right,
     and the identities land ~300 ms after the borders do */
  await page.waitForTimeout(800);

  const r = await page.evaluate(READ);
  expect(r.listOpen, 'the Countries list is the other half of this claim and must really be on screen').toBe(true);
  for (const [polygon, era] of Object.entries(IN_1916)) {
    expect(r.drawn[polygon], `«${polygon}» is DRAWN as its 1916 name`).toBe(era);
    expect(r.list, '…and the Countries list calls the same polity that too').toContain(era);
  }
  /* the reported symptom, named: the 1939 identities must be gone from the screen */
  const seen = Object.values(r.drawn);
  expect(seen, 'the 1939 name must not survive the move back to 1916').not.toContain('Nazi Germany');
  expect(seen, 'the Spanish Republic did not exist in 1916').not.toContain('Spanish Republic');

  await page.evaluate(() => window.IntMapTime.setNow({ source: 'test' }));
  await page.waitForTimeout(400);
});

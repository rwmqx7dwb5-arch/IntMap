/* ============================================================================
 *  R410 — 一覧の元データが遅れて届いた回の、そのあとの地図
 * ----------------------------------------------------------------------------
 *  #R409 の報告の**もう半分**: 「初回描画では時代名がそもそも反映されない」。
 *  原因は順序である。国名ラベルの解決に要る present-day の名前は `countryStats` に
 *  あり、その中身は **Natural Earth の属性ファイル（CDN）** が届いてから入る。
 *  js/time-borders.js は時計の 45 ms 後に描き、js/time-countries.js は 340 ms 待って
 *  そこから国別表・Maddison・HDI を **await** する——つまり地図のほうが先に、
 *  **空の表**を見て札を書き、二度と書き直さなかった。
 *
 *  ⚠⚠⚠ **これは「遅い環境でだけ出る」ではなく「遅い環境では永久に残る」である。**
 *  #R410 の実測（欠陥版・属性を **8 秒**遅らせて 1916 へ）: 地図は
 *  «Germany / France / Italy / Spain / United Kingdom»、同じ画面の一覧は
 *  «German Empire / French Third Republic / Kingdom of Italy / Spain /
 *  United Kingdom of Great Britain and Ireland»。**16 秒後もそのまま**だった。
 *  ラベルは一度しか書かれず、同じ年へ戻っても `shownY` の早期 return で書き直されない。
 *  遅延は固定秒数ではなく、1916年の国境が先に描かれた時点で解除する。
 *  属性本文の到着、一覧の時代名、描画とsourceの一致をそれぞれ待つ。
 *
 *  ⚠ 遅延は route で作る（本物の CDN の機嫌に依存しない）。**遅らせるだけで、
 *  差し替えない**——中身は本番と同じでなければ、この検査が測っているものが変わる。
 *
 *  ⚠ deep tier。自分の page を起動して十数秒待つので、門の半分（`tests/r410.spec.js`）
 *  とは分けてある。門のほうは 1939→1916 を共有 page で数秒で測る。
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

/* ⚠ A VIEWPORT PER CLAIM, because both era layers collide like any other symbol layer (`text-padding`
   6, no allow-overlap) and `queryRenderedFeatures` answers with what was PLACED — which is the right
   question, and which is why one viewport-wide read for every country flaked before this was split.
   Russia's label point is in Asia; over Europe it is simply not on screen. */
const CAMERAS = [
  [{ center: [8, 48], zoom: 4.2 }, {
    'Germany': 'German Empire',
    'France': 'French Third Republic',
    'Italy': 'Kingdom of Italy',
    'United Kingdom': 'United Kingdom of Great Britain and Ireland',
    'Spain': 'Spain',
  }],
  /* the FORMER STATE half of the same disagreement: at 1916 the Countries list row is «Russian Empire»
     (RUE) and the era polygon is still called «Russia». js/history.js has kept the pattern that ties
     the two together since #R94h — until #R410 only the CLICK path used it. */
  [{ center: [48, 57], zoom: 3.4 }, { 'Russia': 'Russian Empire' }],
];

/* ⚠ the Countries tab is HALF THIS CLAIM, so it has to be really open before anything is read.
   `IntMapOS.exec('tab.stats')` fired straight after boot is a silent no-op when js/session-tabs.js has
   not registered the command yet — measured: the tab stayed on News and the list was the one drawn at
   boot, i.e. the modern names, which would have failed this test for the wrong reason. */
const openCountries = (page) => page.waitForFunction(() => {
  try { window.IntMapOS.exec('tab.stats', { source: 'test' }); } catch (_) { }
  return !!(window._countriesActive && window._countriesActive());
}, null, { timeout: 20000, polling: 250 });

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

test('R410 ② 国別属性が国境より遅れて届いても、地図の国名は一覧に追いつく', async ({ browser }) => {
  const page = await browser.newPage();
  let delayed = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const stages = [], started = Date.now();
  const mark = stage => stages.push({ stage, ms: Date.now() - started });
  const attributeResponse = page.waitForResponse(response => /ne_\d+m_admin_0_countries\.geojson/.test(response.url()) && response.ok());
  attributeResponse.catch(() => {});
  await page.route(/ne_\d+m_admin_0_countries\.geojson/, async (route) => {
    delayed++;
    await gate;
    await route.continue();
  });
  try {
    /* Full style readiness includes unrelated network sources. This test deliberately
       holds one source back, so wait for the clock and renderer, then their actual result. */
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!(window.__imap && window.IntMapTime), null, { timeout: 20000 });
    mark('clock and renderer ready');
    await page.evaluate((c) => window.__imap.jumpTo({ center: c.center, zoom: c.zoom, pitch: 0, bearing: 0 }), CAMERAS[0][0]);
    await page.evaluate(() => window.IntMapTime.set(new Date('1916-07-01T12:00:00Z'), { source: 'test' }));
    await page.waitForFunction(() => {
      try {
        const s = window.__imap.getSource('imtb-src');
        const d = s && s.serialize().data;
        return !!(d && d.features && d.features.some(f => f.properties && f.properties.NAME === 'Germany'));
      } catch (_) { return false; }
    }, null, { timeout: 20000, polling: 200 });
    mark('era borders before attributes');
    expect(delayed, 'the attribute file really went through the held route').toBeGreaterThan(0);
    release();
    const response = await attributeResponse;
    expect(await response.finished(), 'the original attribute body arrived without a transport error').toBeNull();
    mark('attribute body received');
    await openCountries(page);
    await page.waitForFunction(names => {
      const rows = [...document.querySelectorAll('.stat-row .stat-name')].map(n => n.textContent.trim());
      return names.every(name => rows.includes(name));
    }, CAMERAS.flatMap(([, names]) => Object.values(names)), { timeout: 20000, polling: 200 });
    mark('1916 list identities ready');

    for (const [camera, want] of CAMERAS) {
      await page.evaluate((c) => window.__imap.jumpTo({ center: c.center, zoom: c.zoom, pitch: 0, bearing: 0 }), camera);
      /* ⚠ the same precondition tests/r410.spec.js states: read the screen only once the screen
         agrees with the source, because the tiles re-parse after `setData` and a wait that looks for
         the NAME alone cannot tell a stale tile from a fresh one (measured there, under load). */
      await page.waitForFunction((names) => {
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
            if (!src.has(nm)) return false;
            if (src.get(nm) !== String(f.properties._modName || '')) return false;
            drawn.add(nm);
          }
        }
        return names.every((n) => drawn.has(n));
      }, Object.keys(want), { timeout: 40000, polling: 200 });

      const r = await page.evaluate(READ);
      expect(r.listOpen).toBe(true);
      for (const [polygon, era] of Object.entries(want)) {
        expect(r.drawn[polygon], `«${polygon}» catches up to its 1916 name once the table lands`).toBe(era);
        expect(r.list, 'and the Countries list says the same').toContain(era);
      }
    }
  } finally {
    release();
    console.log('R410 readiness', JSON.stringify(stages));
    await page.close().catch(() => { });
  }
});

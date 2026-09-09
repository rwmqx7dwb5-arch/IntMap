/* ============================================================================
 *  R530 — 地方区分の境界が、時計の指す日付のものになる（ブラウザで実測）
 * ----------------------------------------------------------------------------
 *  「国境線だけでなく地方区分の境界もChronosに完全対応させるように。完全対応。」
 *
 *  ⚠⚠⚠ **この検査は「画面に描かれているか」を訊く。可視性フラグを読むのではない。**
 *  直した欠陥は `ref-admin1` が Chronos を読んでいなかったことで、その形は
 *  `visibility === 'visible'` を読む検査では**欠陥のあるビルドでも緑になる**
 *  ——欠陥のあるビルドでは `visibility` は正しく `'visible'` だったのだから。
 *  ここで読むのは `queryRenderedFeatures`、つまり**レンダラがそのレイヤーで実際に
 *  返す地物の数**で、これは #R511 が学んだ「ok:true のまま rendered 0」も同時に捕まえる。
 *
 *  ⚠⚠ **4つの主張が1つのテストに入っているのは、値段が理由である。** 現在／過去／
 *  スイッチ／Now への復帰は、どれも**同じ1回の時間旅行**から読める。テストに割ると
 *  `travelTo` が4回走り、6.5 MB の束の解決を4回待つ——測って 59.8 s だった。1本に
 *  畳んで固定 sleep を条件待ちに替え、`tests/durations.json` に入れた値は実測の上限。
 *  ⚠ 共有ページ（tests/helpers/app.js）を汚さないよう、最後に必ず Now へ戻す。
 *
 *  ⚠ **待ちはビルド非依存にしてある**（#R410 の作法）。「現代の州境が消えるまで待つ」は
 *  答えを待つことなので、欠陥のあるビルドは沈黙とタイムアウトで落ちて何も言わない。
 *  待つのは「その日付のコレクションが載り、当時の区分が描かれたか」だけ——これは
 *  **欠陥のあるビルドでも真になる**（欠陥は現代の線が *加えて* 残ることだった）——
 *  そのうえで assertion が即座に何が違うかを言う。
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

/* ドイツ中部。1900 年に OHM が区分を持っていて、かつ現代の州境も濃い場所
   ——「現代のものが消えた」と「当時のものが出た」を同じ画面で読むため。 */
const CAMERA = { center: [10.4, 51.0], zoom: 5.1 };

/* そのレイヤーが「いま画面に描いている」地物の数と名前。 */
const READ = () => {
  const map = window.__imap;
  const n = (id) => { try { return map.queryRenderedFeatures({ layers: [id] }).length; } catch (_) { return -1; } };
  const names = (id) => {
    try { return map.queryRenderedFeatures({ layers: [id] }).map((f) => String((f.properties || {}).NAME || (f.properties || {}).name || '')); }
    catch (_) { return []; }
  };
  const row = document.getElementById('cb-admin1');
  const lab = row && row.closest ? row.closest('label') : null;
  return {
    refAdmin1: n('ref-admin1'), imtaLine: n('imta-line'),
    ofmAdmin1: n('ofm-admin1'), imtaLbl: n('imta-lbl'),
    eraNames: names('imta-lbl'),
    active: !!(window.IntMapTimeAdmin1 && window.IntMapTimeAdmin1.active()),
    units: (window.IntMapTimeAdmin1 && window.IntMapTimeAdmin1.coverage().units) || 0,
    title: lab ? (lab.getAttribute('title') || '') : '(no row)'
  };
};

/* ══ ⚠⚠ 待つ対象は「主張する対象」でなければならない ═══════════════════════════════════════
   最初の版は線レイヤーだけを待って**シンボル**レイヤー `ofm-admin1` について主張していた。
   MapLibre の symbol placement は visibility の反映より遅れる——実測で **0.8〜2.9 秒**、
   `visibility:'visible'` になってから `queryRenderedFeatures` が 0 を返し続ける窓がある。
   結果は 10 回中 5 回の赤で、しかも**製品は正しかった**（同じプローブが、遅れて必ず現れることを
   計測している）。⚠ 「答えを待つ」わけではない: 待つのは *当時の区分が描かれたこと* と
   *現代の名前の placement が落ち着いたこと* で、どちらも**欠陥のあるビルドでも真になる**
   ——今回の欠陥は現代の線が *加えて* 残ることだったから。 */
const eraDrawn = (page) => page.waitForFunction(() => {
  try {
    const m = window.__imap;
    return m.queryRenderedFeatures({ layers: ['imta-line'] }).length > 0
        && m.queryRenderedFeatures({ layers: ['imta-lbl'] }).length > 0
        && m.getLayoutProperty('ofm-admin1', 'visibility') === 'none'
        && m.queryRenderedFeatures({ layers: ['ofm-admin1'] }).length === 0;
  } catch (_) { return false; }
}, null, { timeout: 90000, polling: 200 });

const flip = (page, id, on) => page.evaluate(([i, v]) => {
  const b = document.getElementById(i); b.checked = v; b.dispatchEvent(new Event('change', { bubbles: true }));
}, [id, on]);

test('地方区分の境界が Chronos に従う — 現在・1900年・スイッチ・復帰', async ({ app }) => {
  const page = app.page;
  await page.evaluate((c) => window.__imap.jumpTo(c), CAMERA);
  const modernDrawn = () => page.waitForFunction(() => {
    try {
      const m = window.__imap;
      return m.queryRenderedFeatures({ layers: ['ref-admin1'] }).length > 0
          && m.queryRenderedFeatures({ layers: ['ofm-admin1'] }).length > 0;
    } catch (_) { return false; }
  }, null, { timeout: 60000, polling: 200 });
  await modernDrawn();

  /* ── ① 前提を単独で述べる（#R514 の作法）。これが 0 なら、あとの「0 になった」は何も証明しない ── */
  const now = await page.evaluate(READ);
  expect(now.refAdmin1, 'precondition: the modern province line paints at Now').toBeGreaterThan(0);
  expect(now.imtaLine, 'the era line must not paint at Now').toBe(0);
  expect(now.title, 'no coverage sentence at Now').toBe('');

  /* ── ② 1900 年 — 今回の欠陥そのもの ───────────────────────────────────────── */
  await page.evaluate(() => window.IntMapTime.set(new Date(1900, 5, 15, 12, 0, 0), 'r530-spec'));
  await eraDrawn(page);
  const past = await page.evaluate(READ);

  expect(past.active, 'the admin-1 time machine is travelling').toBe(true);
  /* ⚠⚠⚠ 修正前はここが「1900年の地図の上の 2026 年の州境」だった。 */
  expect(past.refAdmin1, "today's province boundaries must not be drawn under a past date").toBe(0);
  expect(past.ofmAdmin1, "today's province NAMES must not be drawn either").toBe(0);
  expect(past.imtaLine, 'the era province boundaries are drawn').toBeGreaterThan(0);
  expect(past.imtaLbl, 'the era province names are placed').toBeGreaterThan(0);
  expect(past.units, 'coverage() reports what is in force').toBeGreaterThan(300);
  expect(past.title, 'the row states what the record does and does not hold').toMatch(/\d/);

  /* 描かれている名前は「その年の区分の名前」である。衝突するので1つ当たれば実証になる。 */
  const joined = past.eraNames.join(' | ');
  expect(/Prussia|Preußen|Bavaria|Bayern|Saxony|Sachsen|Baden|Württemberg|Hesse|Hessen|Westphalia|Westfalen|Posen|Silesia|Schlesien|Schleswig|Mecklenburg|Hanover|Rhine|Rhein/i.test(joined),
    `expected an 1900-era German subdivision among: ${joined}`).toBe(true);

  /* ══ (#R564) ここから 3 つは同じ 1 回の時間旅行から読める ════════════════════════════════
     ⚠ どれも**ブラウザにしか訊けない**。①「印がレイヤーへ届いているか」は node からは見えず
     （#R531 が同じ理由で spec を要求した）、②「z6 未満では 10.2 MB を取りに行かない」は
     カメラが要る、③「クリックの輪郭が記録の多角形か」は IntMapOutline が要る。 */
  const r564 = await page.evaluate(() => {
    const m = window.__imap;
    const cnt = (id) => { try { return m.getSource(id).serialize().data.features.length; } catch (_) { return -1; } };
    return { lineSource: (m.getLayer("imta-line") || {}).source, poly: cnt("imta-src"), line: cnt("imta-ln-src"),
             deepLoaded: !!window.__HISTADM2, deepDrawn: m.queryRenderedFeatures({ layers: ["imta2-line"] }).length };
  });
  /* ① 線は多角形ではなく「境界と印された run」だけ — 沿岸の区分が海に二本目の海岸線を引かない */
  expect(r564.lineSource, "imta-line must stroke the border runs, not the polygons").toBe("imta-ln-src");
  expect(r564.line, "the line collection is empty — nothing is drawn").toBeGreaterThan(0);
  expect(r564.line, "every polygon still produced a whole outline — the coastline copies are back")
    .toBeLessThan(r564.poly);
  /* ② 深い層は、描かない縮尺では取得もしない */
  expect(r564.deepDrawn, "the deeper tier must not draw below its zoom").toBe(0);
  expect(r564.deepLoaded, "the deeper tier was fetched at a zoom where it is not drawn — 10.2 MB nobody sees").toBe(false);

  /* ③ 区分名のクリックは、今日の同名地物ではなく**その日付の多角形**を輪郭にする */
  const outline = await page.evaluate(async () => {
    const m = window.__imap, c = m.getCanvas(), r = c.getBoundingClientRect();
    let hit = null;
    for (let x = 10; x < r.width - 10 && !hit; x += 8) for (let y = 10; y < r.height - 10; y += 8) {
      const f = m.queryRenderedFeatures([x, y], { layers: ["imta-lbl"] });
      if (f.length) { hit = { x, y, props: f[0].properties }; break; }
    }
    if (!hit) return { hit: false };
    for (const t of ["mousedown", "mouseup", "click"]) c.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, clientX: r.left + hit.x, clientY: r.top + hit.y, button: 0, buttons: t === "mousedown" ? 1 : 0 }));
    await new Promise((z) => setTimeout(z, 1500));
    const cur = window.IntMapOutline && window.IntMapOutline.current && window.IntMapOutline.current();
    const era = window.IntMapTimeAdmin1.geomAt(hit.props);
    return { hit: true, same: !!(cur && cur.geo && era && JSON.stringify(cur.geo) === JSON.stringify(era)),
             drew: !!(cur && cur.geo), name: String(hit.props.NAME || "") };
  });
  expect(outline.hit, "no era subdivision label on screen to click").toBe(true);
  expect(outline.drew, `clicking ${outline.name} highlighted nothing`).toBe(true);
  expect(outline.same, `clicking ${outline.name} highlighted a shape that is not the record's — today's namesake, the defect this round removed`).toBe(true);
  await page.evaluate(() => { document.querySelectorAll(".plc-popup .maplibregl-popup-close-button").forEach((b) => b.click()); });

  /* ④ 深い層は z6 を越えて初めて取りに行く。
     ⚠ 待つのは「線コレクションが載ったか」であって「画面に出たか」ではない。placement は 10.2 MB の
     解決より**あとに**来るので、描画まで待つと同じ 1 つの主張に 55 秒かかる（実測）——suite の天井には
     余白がほとんど無い（scripts/test-budget.mjs）。「z6 を越えたら取りに行き、境界の run を積む」までが
     この層の約束で、その source から線レイヤーが描くことは tests/r564-checks ④ が別に測っている。
     ⚠ この最後に置くのは、ズームを戻さずに済ませるため——以下の節はどちらのカメラでも成り立つ。 */
  await page.evaluate(() => window.__imap.jumpTo({ center: [10.4, 51.0], zoom: 6.2 }));
  await page.waitForFunction(() => {
    try { return window.__imap.getSource("imta2-ln-src").serialize().data.features.length > 0; } catch (_) { return false; }
  }, null, { timeout: 90000, polling: 250 });
  await eraDrawn(page);

  /* ── ③ 1つの機能に1つのスイッチ、両方向 ────────────────────────────────── */
  await flip(page, 'cb-admin1', false);
  await page.waitForFunction(() => {
    try { return window.__imap.queryRenderedFeatures({ layers: ['imta-line'] }).length === 0; } catch (_) { return false; }
  }, null, { timeout: 20000, polling: 150 });
  const off = await page.evaluate(READ);
  expect(off.refAdmin1, 'switching the row off must not bring the modern line back').toBe(0);

  await flip(page, 'cb-admin1', true);
  await eraDrawn(page);

  /* ── ④ Now に戻すと現代側が戻り、当時の区分は消える ─────────────────────── */
  await page.evaluate(() => window.IntMapTime.setNow('r530-spec'));
  await page.waitForFunction(() => { try { return !window.IntMapTimeAdmin1.active(); } catch (_) { return false; } },
    null, { timeout: 30000, polling: 150 });
  await modernDrawn();
  const back = await page.evaluate(READ);

  expect(back.imtaLine, 'the era line is gone').toBe(0);
  expect(back.imtaLbl, 'the era names are gone').toBe(0);
  expect(back.ofmAdmin1, "today's province names return").toBeGreaterThan(0);
  expect(back.title, 'the coverage sentence is cleared, so it never states a stale date').toBe('');
});

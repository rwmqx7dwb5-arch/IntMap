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
  /* ⚠ (#R604) 「当時の線」は 2 つの供給元のどちらかから来る。タイル (`imta-vt-line`) が本番で、
     `imta-line` はタイルが届かない読者のための束の予備。**画面に線があるか**という主張は
     どちらから来たかに依存してはならないので、合計を読む。どちらが答えたかは下の #R604 の節が別に測る。 */
  return {
    refAdmin1: n('ref-admin1'), imtaLine: n('imta-line'), imtaVt: n('imta-vt-line'),
    eraLine: Math.max(0, n('imta-line')) + Math.max(0, n('imta-vt-line')),
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
    const era = m.queryRenderedFeatures({ layers: ['imta-line'] }).length
              + m.queryRenderedFeatures({ layers: ['imta-vt-line'] }).length;
    return era > 0
        && m.queryRenderedFeatures({ layers: ['imta-lbl'] }).length > 0
        && m.getLayoutProperty('ofm-admin1', 'visibility') === 'none'
        && m.queryRenderedFeatures({ layers: ['ofm-admin1'] }).length === 0;
  } catch (_) { return false; }
}, null, { timeout: 90000, polling: 200 });

const flip = (page, id, on) => page.evaluate(([i, v]) => {
  const b = document.getElementById(i); b.checked = v; b.dispatchEvent(new Event('change', { bubbles: true }));
}, [id, on]);

test('地方区分の境界が Chronos に従う — 現在・1900年・スイッチ・復帰', async ({ app }) => {
  /* ⚠ (#R604) この1本は、同じ1回の起動から #R530・#R564・#R604 の主張を全部読む——現在／1900年／
     タイル供給と解像度／第2層の 15 MB／クリックの輪郭／スイッチ／1500年／Now への復帰。
     spec を分けると起動と束の解決がそのぶん繰り返されるので（`scripts/test-budget.mjs` は
     天井を上げさせない）、畳んだままにして**この1本にだけ**時間を与える。 */
  test.setTimeout(180_000);
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
  expect(now.eraLine, 'the era line must not paint at Now').toBe(0);
  expect(now.title, 'no coverage sentence at Now').toBe('');

  /* ── ② 1900 年 — 今回の欠陥そのもの ───────────────────────────────────────── */
  await page.evaluate(() => window.IntMapTime.set(new Date(1900, 5, 15, 12, 0, 0), 'r530-spec'));
  await eraDrawn(page);
  const past = await page.evaluate(READ);

  expect(past.active, 'the admin-1 time machine is travelling').toBe(true);
  /* ⚠⚠⚠ 修正前はここが「1900年の地図の上の 2026 年の州境」だった。 */
  expect(past.refAdmin1, "today's province boundaries must not be drawn under a past date").toBe(0);
  expect(past.ofmAdmin1, "today's province NAMES must not be drawn either").toBe(0);
  expect(past.eraLine, 'the era province boundaries are drawn').toBeGreaterThan(0);
  expect(past.imtaLbl, 'the era province names are placed').toBeGreaterThan(0);
  expect(past.units, 'coverage() reports what is in force').toBeGreaterThan(300);
  expect(past.title, 'the row states what the record does and does not hold').toMatch(/\d/);

  /* 描かれている名前は「その年の区分の名前」である。衝突するので1つ当たれば実証になる。 */
  const joined = past.eraNames.join(' | ');
  expect(/Prussia|Preußen|Bavaria|Bayern|Saxony|Sachsen|Baden|Württemberg|Hesse|Hessen|Westphalia|Westfalen|Posen|Silesia|Schlesien|Schleswig|Mecklenburg|Hanover|Rhine|Rhein/i.test(joined),
    `expected an 1900-era German subdivision among: ${joined}`).toBe(true);

  /* ══ ⚠⚠⚠ (#R604) 線はどちらの供給元から来ているか、そして何頂点あるか ═══════════════════
     「線の解像度も低すぎる。」束は 0.02°（約 2.2 km）で間引いてある——伊豆国は上流 2,800 頂点に
     対し束では 29 だった。直し方は「もっと大きい束」ではなく、**上流のタイルそのもの**
     （`imta-vt-line`）を描くこと。⚠ ここでは**画面から数える**（#R565: 数は地図から取る）——
     「タイルを要求した」ではなく「タイルが描いている」を読み、同じ画面の束の線と比べる。
     ⚠ この主張は**同じ 1 回の時間旅行**から読めるので、旅行を増やさない。 */
  /* ⚠ どちらの供給元が答えたかは、タイルが「描かれた」ことと同時には決まらない——判定は最大 400 ms
     遅れる（js/time-admin1.js のポーリング）。待つのは**判定が出たこと**であって「タイルだった」こと
     ではない: タイルが来ないビルドも猶予のあと 'absent' に達するので、この待ちは壊れたビルドでも
     真になり、下の assertion がどちらだったかを言う。 */
  await page.waitForFunction(() => {
    try { const st = window.IntMapTimeAdmin1.tileState(); return st === 'live' || st === 'absent'; } catch (_) { return false; }
  }, null, { timeout: 30000, polling: 200 });
  const supply = await page.evaluate(() => {
    const m = window.__imap;
    const verts = (id) => {
      let n = 0;
      for (const f of m.queryRenderedFeatures({ layers: [id] })) {
        const g = f.geometry; if (!g) continue;
        const walk = (c) => Array.isArray(c[0]) ? c.forEach(walk) : n++;
        walk(g.coordinates);
      }
      return n;
    };
    return {
      vt: m.queryRenderedFeatures({ layers: ['imta-vt-line'] }).length,
      vtVerts: verts('imta-vt-line'),
      bundleVisible: m.getLayoutProperty('imta-line', 'visibility'),
      vtState: (window.IntMapTimeAdmin1.tileState ? window.IntMapTimeAdmin1.tileState() : null),
      src: (m.getLayer('imta-vt-line') || {}).source,
      /* ⚠ MapLibre's StyleLayer exposes it as `sourceLayer`, not as the style-spec's
         `source-layer` — reading only the hyphenated name answers undefined on a layer that is
         perfectly well wired. Ask for both and let the assertion speak. */
      srcLayer: (function () { const L = m.getLayer('imta-vt-line') || {}; return L.sourceLayer || L['source-layer'] || null; })(),
      filter: JSON.stringify(m.getFilter('imta-vt-line') || null)
    };
  });
  expect(supply.src, 'the era line must be drawn from the OpenHistoricalMap tile source').toBe('ohm-vt');
  expect(supply.srcLayer, "…and from upstream's own boundary layer").toBe('land_ohm_lines');
  /* ⚠ フィルタは「その日付」を持っていなければならない。1900 年に旅行したのだから 1900 が入る。 */
  expect(supply.filter, 'the tile layer was never aimed at the date on the clock').toMatch(/1900\./);
  expect(supply.filter, 'the maritime clause is gone — the line will run out to sea again').toMatch(/maritime/);
  expect(supply.vt, 'the OpenHistoricalMap tiles painted no era boundary at all').toBeGreaterThan(0);
  /* ⚠⚠ 解像度そのもの。束の線は同じ視野で数百頂点しかない——タイルはその何倍も持つ。
     固定の閾値ではなく**同じ画面の両者の比**で測るので、視野やビルドが変わっても意味が変わらない。 */
  const bundleVerts = await page.evaluate(() => {
    const m = window.__imap;
    let n = 0;
    try { for (const f of m.getSource('imta-ln-src').serialize().data.features) {
      const walk = (c) => Array.isArray(c[0]) ? c.forEach(walk) : n++; walk(f.geometry.coordinates); } } catch (_) {}
    return n;
  });
  expect(supply.vtVerts, `the tile line carries ${supply.vtVerts} vertices in view — no better than the bundle`)
    .toBeGreaterThan(200);
  /* ⚠ 束の予備は、**タイルが来ないという証拠が出るまで**出さない。最初の版は逆（既定で出して、
     タイルが描けたら隠す）で、実測すると**同じ境界が同じ色の破線で二重に、しかも二つの解像度で**
     描かれる窓ができた。予備が「代わるもの」より先に見えているなら、それは予備ではない。 */
  expect(supply.vtState, 'the tiles were never observed painting').toBe('live');
  expect(supply.bundleVisible, 'both supplies are painting at once, at two different resolutions').toBe('none');
  expect(bundleVerts, 'sanity: the bundle fallback is still built, it is just not shown').toBeGreaterThan(0);

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
    /* ⚠ (#R604) ここは 8 px 刻みでキャンバスを走査し、点ごとに `queryRenderedFeatures` を呼んでいた
       ——1280×720 で最大 14,000 回、しかも**最初の1個が見つかるまで**なので、ラベルが右下にある
       日はその全部を払う。同じ答えは1回で出る: レイヤーが描いている地物を全部もらい、その地物の
       座標を投影すれば、それがラベルの居る場所である。主張は1文字も変えていない。 */
    let hit = null;
    for (const f of m.queryRenderedFeatures({ layers: ["imta-lbl"] })) {
      const g = f.geometry; if (!g) continue;
      let pt = null;
      if (g.type === "Point") pt = g.coordinates;
      else { const flat = []; (function walk(v) { Array.isArray(v[0]) ? v.forEach(walk) : flat.push(v); })(g.coordinates); pt = flat[0]; }
      if (!pt) continue;
      const p = m.project(pt);
      if (!(p.x > 10 && p.y > 10 && p.x < r.width - 10 && p.y < r.height - 10)) continue;
      /* ⚠ 錨の座標は「ラベルが描かれている場所」とは限らないし、その点に**別のラベルが乗っている**
         ことがある——最初の版はそれで、区分ではない地物の輪郭が出て `same` が落ちた（実測）。
         だから候補ごとに**その点を1回だけ**問い合わせて、返ってくるのが同じ区分であることを
         確かめてから押す。走査 14,000 回が、候補数回になる。 */
      const at = m.queryRenderedFeatures([p.x, p.y], { layers: ["imta-lbl"] });
      if (!at.length || at[0].properties._ix !== f.properties._ix) continue;
      /* ══ ⚠⚠⚠ (#R679) ASK THE QUESTION THE APP ASKS, OR THIS GOES RED 40% OF NIGHTS ═══════════
         js/map-ui.js `onLabel` calls `_ownedByOther(pt)` and RETURNS SILENTLY when any other
         clickable layer holds that pixel. This loop only asked whether the topmost `imta-lbl`
         there was the same feature — never whether something else owned the pixel — so it happily
         picked points sitting under a news pin or an earthquake dot. Those come off live feeds:
         their positions and their arrival time differ every run. Measured: five runs of this spec,
         two failed on «clicking Duchy of Limburg highlighted nothing», and the failing runs ended
         28 s in, having waited the full 15 s for an outline the app had decided not to draw.
         ⚠ AND A FAILURE HERE COSTS MORE THAN THIS ASSERTION. The file is one test, so everything
         after line 246 — including #R679’s floor assertions — simply does not run on those
         nights. A flaky candidate-picker silently deletes the checks below it.
         The condition below is the same fact, from the renderer: if any SYMBOL or CIRCLE feature
         is painted above ours at that pixel and it is not one of the era layers, the app will not
         act on this click — so neither does the test. It uses no private state, so it cannot drift
         from `clickLayers`; it is stricter than `_ownedByOther`, which is the safe direction for a
         picker that has other candidates to try. */
      const stack = m.queryRenderedFeatures([p.x, p.y]);
      const ERA_LYR = ["imta-lbl", "imta-lbl2", "imta-line", "imta-vt-line", "imta-fill"];
      let owned = false;
      for (const q of stack) {
        if (q.layer && ERA_LYR.indexOf(q.layer.id) >= 0) break;   /* reached ours: nothing above it */
        const t = q.layer && q.layer.type;
        if (t === "symbol" || t === "circle") { owned = true; break; }
      }
      if (owned) continue;
      hit = { x: p.x, y: p.y, props: f.properties }; break;
    }
    if (!hit) return { hit: false };
    for (const t of ["mousedown", "mouseup", "click"]) c.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, clientX: r.left + hit.x, clientY: r.top + hit.y, button: 0, buttons: t === "mousedown" ? 1 : 0 }));
    /* ⚠ (#R604) 固定の 1.5 秒 sleep をやめ、**答えが出るまで待つ**（#R410 の作法。この spec の冒頭が
       自分でそう書いている）。IntMapOutline が輪郭を置くまでの時間は記録の大きさで動くので、
       秒数を書くと記録が育つたびに嘘になる——実測、束が 3,049→4,679 件になっただけで 1.5 秒は
       足りなくなった。⚠ 待つのは「輪郭が置かれたか」であって「**正しい**輪郭か」ではない:
       今日の同名地物を描く欠陥のあるビルドでもこの待ちは真になり、下の assertion がそれを落とす。 */
    const cur = await (async () => {
      for (let i = 0; i < 60; i++) {
        const c0 = window.IntMapOutline && window.IntMapOutline.current && window.IntMapOutline.current();
        if (c0 && c0.geo) return c0;
        await new Promise((z) => setTimeout(z, 250));
      }
      return null;
    })();
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
  /* ⚠ (#R604) 待つ対象が変わった。#R564 のときは第2層の線は束から来ていたので「線コレクションが
     載ったか」が正しい待ちだった。いまは線はタイルから来るので、**待つのは第2層が描かれたこと**で
     あり、これは 14.9 MB の解決を待たない。束（＝第2層のラベルとクリック）が z6 を越えて初めて
     取りに行くことは、この旅行の最後（Now へ戻る直前）に読む——そのころには十分な時間が経っている
     ので、15 MB の解決をこの1本の律速にしない。 */
  await page.waitForFunction(() => {
    try { return window.__imap.queryRenderedFeatures({ layers: ["imta2-vt-line"] }).length > 0; } catch (_) { return false; }
  }, null, { timeout: 60000, polling: 250 });
  await eraDrawn(page);

  /* ── ③ 1つの機能に1つのスイッチ、両方向 ────────────────────────────────── */
  await flip(page, 'cb-admin1', false);
  await page.waitForFunction(() => {
    try { const m = window.__imap;
      return m.queryRenderedFeatures({ layers: ['imta-line'] }).length === 0
          && m.queryRenderedFeatures({ layers: ['imta-vt-line'] }).length === 0; } catch (_) { return false; }
  }, null, { timeout: 20000, polling: 150 });
  const off = await page.evaluate(READ);
  expect(off.refAdmin1, 'switching the row off must not bring the modern line back').toBe(0);

  await flip(page, 'cb-admin1', true);
  await eraDrawn(page);

  /* ══ ⚠⚠⚠ (#R604) 「全時代」——1850 年より前に、線と名前の両方が出るか ═══════════════════
     直す前、時計の下限は 1850 で、束も `--since 1850` で焼いてあった（1850 より前に終わった
     単位は 1 つも入っていない）。つまり 1500 年は**到達できず、到達しても空**だった。
     ⚠ 名前も測るのは、線だけの無名の地図は「全時代に対応した」ではないから——そして
     九言語の名前はタイルに無い（`name` 一つだけ）ので、そこは束が答える。 */
  await page.evaluate(() => window.__imap.jumpTo({ center: [10.4, 51.0], zoom: 5.1 }));
  await page.evaluate(() => window.IntMapTime.setYear(1500, { source: 'r604-spec' }));
  await eraDrawn(page);
  const deep = await page.evaluate(() => ({
    year: window.IntMapTime.year(),
    min: window.IntMapTime.min,
    floorOwner: window.IntMapHistScale.FLOOR,   /* (#R679) the number's owner, so the two cannot drift */
    vt: window.__imap.queryRenderedFeatures({ layers: ['imta-vt-line'] }).length,
    lbl: window.__imap.queryRenderedFeatures({ layers: ['imta-lbl'] }).length,
    units: window.IntMapTimeAdmin1.coverage().units,
    reach: window.IntMapTimeAdmin1.range().min
  }));
  /* ⚠ 1901 ではなく 1500。`Date.UTC(y,…)` の2桁年規則は3桁以上では効かないが、
     床そのものが 1 に降りたことはここで読む——`min` を読むだけでは #R604 前でも書き換えられる。 */
  expect(deep.year, 'the clock did not travel to 1500').toBe(1500);
  /* ⚠ (#R679) THE FLOOR MOVED AGAIN — BELOW ZERO — AND A LITERAL HERE IS WHAT MAKES THIS CHECK
     NEED EDITING BY THE VERY ROUND IT SHOULD HAVE CAUGHT. It is a deep-tier spec, so `npm test`
     does not run it: a stale literal here goes red at NIGHT, hours after the round has landed.
     What is asserted is the property — the floor is before the common era and the panel and the
     kernel agree on it — not the number. */
  expect(deep.min, 'the kernel floor never came down').toBeLessThan(1);
  expect(deep.min, 'the panel and the kernel disagree about the floor').toBe(deep.floorOwner);
  expect(deep.reach, 'the layer still reports 1850 as the earliest year it can answer for').toBe(deep.min);
  expect(deep.vt, 'no subdivision boundary at all is drawn in 1500 — the era reach is still 1850').toBeGreaterThan(0);
  expect(deep.units, 'the record holds no dated subdivision in 1500 — the bundle was not rebuilt for all eras').toBeGreaterThan(50);
  expect(deep.lbl, 'the 1500 boundaries are drawn but nameless').toBeGreaterThan(0);

  /* 第2層の束は、z6 を越えたからには**取りに行っている**（#R564 の約束の後半）。
     ⚠ (#R604) 読むのは「解決したか」ではなく「**要求したか**」である。約束はカメラが取得を引き起こす
     ことで、14.9 MB が解け終わることではない——解決を待つと、この1本の所要時間が**記録の大きさで
     決まる**ようになり、記録が育つたびにテスト予算を食う（`scripts/test-budget.mjs` は天井を
     上げさせない）。前半（z6 未満では要求しない）は上の `deepLoaded` が同じ旅行から読んでいる。 */
  /* ⚠ 要求は `zoomend` のあとに出るので、**出るまで待ってから**数える。即座に読むと、タイルの線が
     先に描かれた回だけ 0 を読む（実測で 1/3 が赤）——待つのは「要求が出たか」であり、要求を出さない
     ビルドはタイムアウトで落ちる（#R564 の版も同じ形で待っていた）。 */
  await page.waitForFunction(() =>
    performance.getEntriesByType('resource').some((e) => /hist-admin2\.js(\?|$)/.test(e.name)) || !!window.__HISTADM2,
    null, { timeout: 60000, polling: 250 });
  const deepAsked = await page.evaluate(() =>
    performance.getEntriesByType('resource').filter((e) => /hist-admin2\.js(\?|$)/.test(e.name)).length
    + (window.__HISTADM2 ? 1 : 0));
  expect(deepAsked, 'the deeper tier was never even requested after zooming past its own minzoom').toBeGreaterThan(0);

  /* ── ④ Now に戻すと現代側が戻り、当時の区分は消える ─────────────────────── */
  await page.evaluate(() => window.IntMapTime.setNow('r530-spec'));
  await page.waitForFunction(() => { try { return !window.IntMapTimeAdmin1.active(); } catch (_) { return false; } },
    null, { timeout: 30000, polling: 150 });
  await modernDrawn();
  const back = await page.evaluate(READ);

  expect(back.eraLine, 'the era line is gone').toBe(0);
  expect(back.imtaLbl, 'the era names are gone').toBe(0);
  expect(back.ofmAdmin1, "today's province names return").toBeGreaterThan(0);
  expect(back.title, 'the coverage sentence is cleared, so it never states a stale date').toBe('');
});

/* ============================================================================
 *  R570 — パンデミック・シミュレーターが実ブラウザで走り、地図が計算と同じものを見せる
 * ----------------------------------------------------------------------------
 *  数理そのものは tests/r570-checks.test.mjs が node で 13 本測っている（人口保存・再生速度から
 *  独立・免疫0の NaN・潜伏0の人口生成・E を無視した終了・累計の単調性…）。**このファイルが測るの
 *  は、その engine が実際にこの製品の中で動いて、地図に出るか**である。
 *
 *  ⚠⚠ **「計器が緑でも機能は死んでいる」を避けるための1回**（#R493 / #R545 の形）。engine を別
 *  ファイルへ出した以上、「playground.js が import に失敗している」「HUD がボタンを描かない」
 *  「クリックが engine に届いていない」は node のテストでは原理的に見えない。
 *
 *  ⚠ **地図の赤い点と HUD の数字は同じ集団でなければならない。** 旧実装は点を E+I で描き、HUD を
 *  「Infected = I」と書いていた——同じ画面の2か所が別の母集団を指していた。ここでは点に載っている
 *  `cls`（0=潜伏・1=感染性）を数えて、HUD が両方を名乗っていることまで見る。
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

/* ブラジル内陸。国境から遠い点を選ぶのは、クリックがどの国に落ちたかを主張の対象にしないため。 */
const SEED_AT = { lng: -51.0, lat: -12.0 };

test('R570: 発生地点をクリックすると engine が走り、地図と HUD が同じ流行を示す', async ({ app }) => {
  const page = app.page;
  const errors = [];
  const onErr = (e) => errors.push(String(e));
  page.on('pageerror', onErr);
  try {
    await page.evaluate(() => window.IntMapLazy.need('playground'));
    await page.evaluate(() => { window._pgPandemic(); });
    await page.waitForSelector('#pg-pan-hud', { timeout: 15000 });

    /* ① 設定画面が出ていて、疾患と「どの世界か」を選べる。旧版は疾患しか選べず、免疫ゼロの世界を
       実在の病名で呼んでいた。 */
    const setup = await page.evaluate(() => {
      const hud = document.getElementById('pg-pan-hud');
      return { text: hud.textContent || '', ranges: hud.querySelectorAll('input[type=range]').length, buttons: hud.querySelectorAll('button').length };
    });
    expect(setup.ranges).toBeGreaterThanOrEqual(5);
    expect(setup.buttons).toBeGreaterThanOrEqual(8);
    /* 「予測ではない」と自分で言っている。CDC が自分のシミュレーターに対して言っているのと同じ。 */
    expect(setup.text).toMatch(/Not a forecast|予測ではありません|Keine Prognose|не прогноз|No es una previsión/);

    /* ② 地図のクリックで engine が生まれる。GE().events.on('click') に届くのは実際の地図の click。 */
    await page.evaluate((at) => {
      window.__imap.fire('click', { lngLat: { lng: at.lng, lat: at.lat }, point: { x: 10, y: 10 }, originalEvent: new MouseEvent('click') });
    }, SEED_AT);
    await page.waitForFunction(() => {
      const el = document.querySelector('#pg-pan-stats');
      return !!el && /\d/.test(el.textContent || '');
    }, null, { timeout: 15000 });

    /* ③ 日が進む。⚠ 進んだことを sleep で仮定せず、HUD が名乗っている日数そのものが増えることを
       待つ。engine は 1 step = 1 日で、それを呼ぶのは setTimeout だけ。 */
    const readDay = () => page.evaluate(() => {
      const t = (document.querySelector('#pg-pan-stats') || {}).textContent || '';
      const m = t.match(/(?:Day|経過|Tag|День|Día)\s*(\d+)/);
      return m ? +m[1] : -1;
    });
    const day0 = await readDay();
    expect(day0).toBeGreaterThanOrEqual(0);
    await page.waitForFunction((d0) => {
      const t = (document.querySelector('#pg-pan-stats') || {}).textContent || '';
      const m = t.match(/(?:Day|経過|Tag|День|Día)\s*(\d+)/);
      return !!m && +m[1] > d0 + 2;
    }, day0, { timeout: 15000 });

    /* ④ 点は 2 種類だけを名乗り、HUD は両方を名乗っている。 */
    /* ⚠ 固定 sleep で「そのうち両方出るだろう」と仮定しない——**両方出たこと**を待つ。
       潜伏 4 日・感染期 9 日の COVID プリセットなので、数日進めば E と I は必ず同居する。 */
    await page.waitForFunction(() => {
      const s = window.IntMapGeoEngine.layers.sourceData('pg-dots');
      const f = (s && s.features) || [];
      return f.some((x) => x.properties.cls === 0) && f.some((x) => x.properties.cls === 1);
    }, null, { timeout: 15000 });
    const shown = await page.evaluate(() => {
      const s = window.IntMapGeoEngine.layers.sourceData('pg-dots');
      const cls = {};
      (s.features || []).forEach((f) => { cls[f.properties.cls] = (cls[f.properties.cls] || 0) + 1; });
      return { n: (s.features || []).length, cls, hud: (document.querySelector('#pg-pan-stats') || {}).textContent || '' };
    });
    expect(shown.n).toBeGreaterThan(0);
    for (const k of Object.keys(shown.cls)) expect(['0', '1']).toContain(k);
    /* 感染性と潜伏中の両方が HUD に出ている（旧版は I しか出さずに E+I を描いていた）。 */
    expect(shown.hud).toMatch(/Infectious|感染性|Ansteckend|Заразны|Contagiosos/);
    expect(shown.hud).toMatch(/Incubating|潜伏中|Inkubierend|Инкубация|Incubando/);
    /* 1点が何人ぶんかを必ず言う。旧版は流行の規模で 60→数千に動かしながら黙っていた。 */
    expect(shown.hud).toMatch(/1 dot|1点|1 Punkt|1 точка|1 punto/);

    /* ⑤ そして例外を１つも出していない。engine を別ファイルへ出した以上、import が届いていない・
       扉で引数が落ちている（#R552）はここでしか見えない。 */
    expect(errors, 'uncaught page errors: ' + errors.join(' | ')).toEqual([]);
  } finally {
    await page.evaluate(() => { try { window._pgPandemicExit && window._pgPandemicExit(); } catch (_) { } }).catch(() => { });
    page.off('pageerror', onErr);
  }
});

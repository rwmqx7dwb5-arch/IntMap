/* ============================================================================
 *  R465 — 設定を開いたままの言語切替（ブラウザ実測）
 * ----------------------------------------------------------------------------
 *  「言語を fr / ko / zh に変えても『国別メディアのニュース』の16か国が英語のまま」
 *
 *  ⚠⚠⚠ **原因は訳が無いことではない。** `js/locales/ui.fr.js` には `"United States": "États-Unis"`
 *    があり、読み手も `LNS.arr(f.name)` で正しく引く。書かれる**契機**が「設定を開いたとき」しか
 *    無く、**言語の `<select>` はその設定の中にある**——だから選んでから読むまでの間に、その
 *    ダイアログが開き直されることは一度も無い。実測（この spec を書く前、本番 R450 のビルドで）:
 *    セッション内で fr に切り替えると16件すべて英語のまま、同じ言語でリロードすると全部フランス語。
 *
 *  ⚠ だから主張は「フランス語の綴りが出ること」ではなく **「開き直しても何も変わらないこと」**に
 *    する。前者は16行ぶんの綴りを spec に書き写すことになり（＝訳表の写しがもう1本増える）、
 *    後者は**この欠陥の定義そのもの**で、しかも将来この形で足された別のコントロールも捕まえる。
 *    #R455 の教訓——検査は「今そこに在る綴り」ではなく「壊れ方」を見る。
 *
 *  ⚠ 起動は1回だけ（`app` fixture）。2回目の起動（同じ言語でリロードして比べる）は
 *    `scripts/test-budget.mjs` の天井に対して高すぎるので、**開き直し**を基準にした。
 *  ⚠ 固定の待ちを置かない（#R399）。待つのは `document.documentElement.lang` と、
 *    国名の欄が英語でなくなったことそのもの。
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

/* 設定モーダルの中で「JS が書いた文字列」を全部集める。data-i18n 属性の面は updateI18n() が
   一括で貼り直すので壊れようがない——壊れるのはこちら側だけ。 */
const SNAP = `(()=>{ const m=document.getElementById('settings-modal'); const out={};
  const path=(el)=>{ const parts=[]; let n=el; while(n&&n!==m){ let i=0,s=n; while((s=s.previousElementSibling))i++; parts.unshift((n.id?('#'+n.id):n.tagName)+'['+i+']'); n=n.parentElement; } return parts.join('>'); };
  m.querySelectorAll('*').forEach(el=>{ const t=[...el.childNodes].filter(c=>c.nodeType===3).map(c=>c.nodeValue).join('').trim(); if(t) out['TXT '+path(el)]=t; });
  m.querySelectorAll('select').forEach(s=>{ [...s.options].forEach((op,i)=>{ out['OPT '+s.id+'/'+i+'/'+op.value]=op.textContent; }); });
  return out; })()`;

test('R465 設定を開いたまま言語を変えても、開き直しと同じ表示になる', async ({ app }) => {
  const page = app.page;

  /* ── 英語で、JS が描く欄を全部展開した設定を開く ─────────────────────────────── */
  await page.evaluate(() => {
    const sl = document.getElementById('setting-lang');
    if (sl && sl.value !== 'en') { sl.value = 'en'; sl.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 30000 });
  await page.evaluate(() => {
    document.getElementById('btn-open-settings').click();
    for (const [id, v] of [['setting-newscountry', 'multi'], ['setting-newssource', 'multi'], ['setting-newslang', 'multi'], ['setting-ticker', 'on']]) {
      const s = document.getElementById(id); if (s) { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    /* ⚠ Atlas の命名掃引は 3.5 s 後と 20 s ごとに走る。共有ページがどこまで進んでいるかに
       主張を預けないため、ここで明示的に1回走らせる（公開 API）。 */
    try { window.IntMapUIAudit && window.IntMapUIAudit.sweep(); } catch (_) { }
  });
  await page.waitForFunction(() => document.querySelectorAll('#newscountry-multi .ncx').length > 0, null, { timeout: 30000 });

  const before = await page.evaluate(`(()=>({ snap:${SNAP},
    compare:(document.querySelector('#btn-compare span')||{}).textContent||'',
    nlAria:[...document.querySelectorAll('#newslang-multi input[aria-label]')].map(i=>i.getAttribute('aria-label')),
    star:(document.querySelector('#layer-dropdown .lyr-star[aria-label]')||{ getAttribute:()=>'' }).getAttribute('aria-label') }))()`);
  expect(Object.keys(before.snap).length, '設定モーダルに読める文字列がある').toBeGreaterThan(50);

  /* ── 設定の中で言語を変える。これが「開き直す機会が一度も無い」経路そのもの ────── */
  await page.evaluate(() => {
    const sl = document.getElementById('setting-lang'); sl.value = 'fr';
    sl.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => document.documentElement.lang === 'fr', null, { timeout: 30000 });
  await page.waitForFunction(() => {
    const s = document.querySelector('#newscountry-multi .ncx');
    return !!s && s.textContent.trim() !== 'United States';
  }, null, { timeout: 30000 });

  /* ① 開き直しても1文字も変わらない。
     ⚠ 2つのスナップショットは**同じ evaluate の中**で撮る。`btn-open-settings` の処理は同期だが
        `aiFetchUsage()` のような取得を投げるので、間に await を挟むと「言語のせい」でない差が
        混ざりうる。 */
  const drift = await page.evaluate(`(()=>{ const live=${SNAP};
    document.getElementById('btn-open-settings').click();
    const again=${SNAP};
    const out=[]; Object.keys(again).forEach(k=>{ if(live[k]!==undefined && live[k]!==again[k]) out.push(k+'  ||live: '+String(live[k]).slice(0,50)+'  ||reopened: '+String(again[k]).slice(0,50)); });
    return out; })()`);
  expect(drift, '設定を開き直して変わる文字列は、切替の瞬間に古い言語で残っていた文字列である').toEqual([]);

  /* ② 報告そのもの——16か国の欄が英語のままではない */
  const ncx = await page.evaluate(() => [...document.querySelectorAll('#newscountry-multi .ncx')].map((s) => s.textContent.trim()));
  expect(ncx.length).toBe(16);
  expect(ncx[0]).not.toBe('United States');
  expect(ncx[8]).not.toBe('South Korea');

  /* ③ ダイアログの外の常設面も同じ切替で追随する（開き直す機会が無いのは同じ）。
     ⚠ 綴りではなく「変わったこと」を見る——訳語をこの spec に写すと表が2本になる（#R443）。 */
  const outside = await page.evaluate(() => ({
    compare: (document.querySelector('#btn-compare span') || {}).textContent || '',
    nlAria: [...document.querySelectorAll('#newslang-multi input[aria-label]')].map((i) => i.getAttribute('aria-label')),
    star: (document.querySelector('#layer-dropdown .lyr-star[aria-label]') || { getAttribute: () => '' }).getAttribute('aria-label'),
  }));
  if (before.compare) expect(outside.compare, '比較ビューの入口は起動時の言語で固まらない').not.toBe(before.compare);
  if (before.nlAria.length) expect(outside.nlAria, 'aria-label は最初に現れた言語で固まらない').not.toEqual(before.nlAria);
  if (before.star) expect(outside.star, 'お気に入り★の読み上げ名も同じ掃引で貼り直される').not.toBe(before.star);

  /* ④ 直したのは**貼り直す機構**であって、利用者が触りかけていたものではない。
     ⚠ `renderCountries()` はチェックを**確定済みの選択**から書き戻すので、言語切替でそれを
        呼んでいたら「まだ Apply していないチェック」を黙って捨てていた。
     ⚠ 相乗りしているのは**共有ページを英語に戻す切替**である（`app` fixture の reset は言語を
        戻さない）。切替は 2 回で足りる——`scripts/test-budget.mjs` の天井は、要らない起動と
        要らない切替のどちらにも同じ値段を付ける。 */
  const kept = await page.evaluate(() => {
    const wrap = document.getElementById('newscountry-multi');
    const boxes = [...wrap.querySelectorAll('input[type=checkbox]')];
    boxes[2].checked = true; boxes[5].checked = true;
    wrap.dispatchEvent(new Event('change', { bubbles: true }));
    const tzs = document.getElementById('setting-tz-search');
    tzs.dispatchEvent(new Event('focus')); tzs.value = 'tok'; tzs.dispatchEvent(new Event('input', { bubbles: true }));
    const sl = document.getElementById('setting-lang'); sl.value = 'en';
    sl.dispatchEvent(new Event('change', { bubbles: true }));
    return { asked: [boxes[2].value, boxes[5].value], committed: (window.imNewsCountries || []).slice() };
  });
  await page.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 30000 });
  const after = await page.evaluate(() => ({
    ticked: [...document.querySelectorAll('#newscountry-multi input:checked')].map((b) => b.value),
    dd: (document.getElementById('newscountry-dd-label') || {}).textContent || '',
    tz: (document.getElementById('setting-tz-search') || {}).value,
  }));
  expect(after.ticked, 'Apply していないチェックは言語切替で消えない').toEqual(kept.asked);
  expect(after.tz, '打ちかけの時刻帯の絞り込みも消えない').toBe('tok');
  /* ⚠ 確定済みは空である。要約が確定済みから作られていたら「未選択」と出る——チェックの側から
     作られていることを、その差で見る。 */
  expect(kept.committed, 'この spec が Apply を押していない前提が崩れている').toEqual([]);
  expect(after.dd, 'ボタンの要約はチェックの側から、切り替えた言語で書き直される').toContain('Japan');

  await page.evaluate(() => { const m = document.getElementById('settings-modal'); if (m) m.style.display = 'none'; });
});

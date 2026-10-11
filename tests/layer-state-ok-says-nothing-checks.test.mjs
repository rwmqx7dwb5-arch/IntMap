/* ============================================================================
 *  IntMap · a layer that drew says nothing about not drawing
 * ----------------------------------------------------------------------------
 *  本番の検証（2026-10-11・Live satellites）で、記録が state «ok» なのに detail が
 *  «The layer could not be drawn» を述べていた。detail は状態を見ずに words().detail() の
 *  既定の文（reason の無い失敗の文）を全記録に付けていたので、ok と loading も「描けなかった」と言った。
 *  Atlas はこの snapshot を読む——成功を失敗のように述べる観測器（.agents/rules/one-pass-or-a-reason.md §2 の 1）。
 *
 *  ここでは owner を実際に評価する: ok / loading は文を持たず、failed / unobserved / nodata は持つ。
 *  行の印と記録の文と状態ページの「問題」の行は、同じ 1 つの規則（SPEAKS）から決まる。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLayerState, SPEAKS } from '../js/layer-state.js';

test('an ok or loading record carries no failure sentence; the three that speak still do', async () => {
  const S = makeLayerState({ lang: () => 'en' });

  S.set('dl-ok', 'ok');
  assert.equal(S.get('dl-ok').detail, null, 'a layer that drew was described as one that could not be drawn');

  let settle;
  S.request('dl-wait', new Promise((r) => { settle = r; }));
  assert.equal(S.get('dl-wait').state, 'loading');
  assert.equal(S.get('dl-wait').detail, null, 'a layer still loading was described as one that could not be drawn');
  settle(); await new Promise((r) => setTimeout(r, 0));
  assert.equal(S.get('dl-wait').state, 'ok');
  assert.equal(S.get('dl-wait').detail, null);

  S.report('dl-bad', 'failed', { reason: 'http', status: 503, told: true });
  assert.match(S.get('dl-bad').detail, /refused the request \(HTTP 503\)/);
  S.report('dl-none', 'nodata', { reason: 'out-of-time', message: 'No data for 1914' });
  assert.equal(S.get('dl-none').detail, 'No data for 1914');

  /* the snapshot Atlas reads: every record that has a sentence is in a state that speaks, and back */
  for (const r of S.snapshot()) assert.equal(r.detail != null, SPEAKS(r.state), r.id + ' (' + r.state + ')');
});

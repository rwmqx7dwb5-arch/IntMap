/* ============================================================================
 *  IntMap · a World Bank read that met a network failure asks once more, through our own relay
 * ----------------------------------------------------------------------------
 *  実測 2026-10-11: World Bank の CDN が NY.GDP.PCAP.PP.CD?format=json&mrnev=1&per_page=400 を
 *  Access-Control-Allow-Origin の無い 21 時間前の写しで配り、ブラウザにはネットワーク失敗としか見えなかった。
 *  実測 2026-11-16 (worldbank-cors-relay): 当時の対処（パラメータの順を逆にした別の綴りで訊き直す）は、SP.POP.TOTL の
 *  2 つの綴りが両方とも同じ状態の写し（CF-Cache-Status: HIT）だったので、同じ拒否に当たった。写しはアドレスごとに
 *  最初に訊いた者が作るので、別の綴りも同じ状態になりうる。読み手（js/wb-indicators.js）を実際に評価して:
 *    ・ネットワーク失敗（観測された失敗）のあと、同じアドレスを自前の中継で 1 回だけ訊き直し、`via: 'relay'` を残す
 *    ・中継が無い（Supabase が未設定）ときは訊き直さない
 *    ・期限切れ（観測できなかった）と、ホストが返した答えのあとでは訊き直さない
 *    ・中継の許可表（fetch-relay-policy の world-bank-indicator）は、ページが実際に訊く形を全部通し、それ以外を通さない
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRelayRule } from '../supabase/functions/_shared/fetch-relay-policy.js';

/* the page's router decides the relay from window.SUPABASE_URL on every call (js/proxy-fetch.js supaBase) */
globalThis.window = Object.assign(globalThis.window || {}, { SUPABASE_URL: 'https://relay.test' });
const { makeWorldBankReader } = await import('../js/wb-indicators.js');
const RELAY = 'https://relay.test/functions/v1/fetch-relay?u=';
const body = { text: JSON.stringify([{ page: 1 }, [{ countryiso3code: 'JPN', date: '2024', value: 52000 }]]) };
const fail = (reason) => Promise.reject(Object.assign(new Error(reason), { reason }));

function reader(answer, relayed = true) {
  const calls = [];
  window.SUPABASE_URL = relayed ? 'https://relay.test' : '';
  const R = makeWorldBankReader({ clockFor: () => 100, readWithin: (u) => { calls.push(u); return answer(u, calls.length); } });
  return { R, calls };
}

test('a network failure is asked once more through our relay, for the same address, and the answer says so', async () => {
  const { R, calls } = reader((u, n) => (n === 1 ? fail('network') : Promise.resolve(body)));
  const r = await R.read({ code: 'NY.GDP.PCAP.PP.CD', mrnev: 1, perPage: 400 });
  assert.equal(r.status, 'ok');
  assert.equal(r.via, 'relay');
  assert.equal(calls.length, 2, 'exactly one second ask');
  assert.equal(calls[0], 'https://api.worldbank.org/v2/country/all/indicator/NY.GDP.PCAP.PP.CD?format=json&mrnev=1&per_page=400',
    'the first ask is the address every reader has always used');
  assert.equal(calls[1], RELAY + encodeURIComponent(calls[0]), 'the second ask is the same address, through the relay');
});

test('the relay failing too is unavailable, with the second ask recorded', async () => {
  const { R, calls } = reader(() => fail('network'));
  const r = await R.read({ code: 'X', source: 3, date: '2020' });
  assert.equal(r.status, 'unavailable'); assert.equal(r.via, 'relay'); assert.equal(calls.length, 2);
});

test('with no relay to ask, a network failure is not asked again', async () => {
  const { R, calls } = reader(() => fail('network'), false);
  const r = await R.read({ code: 'X' });
  assert.equal(r.status, 'unavailable'); assert.equal(r.via, undefined); assert.equal(calls.length, 1);
});

test('a timeout (could not observe) and an answer the host gave are not asked again', async () => {
  for (const reason of ['timeout', 'http', 'parse']) {
    const { R, calls } = reader(() => fail(reason));
    const r = await R.read({ code: 'Y' });
    assert.equal(r.status, 'unavailable', reason); assert.equal(calls.length, 1, reason + ' was asked again');
    assert.equal(r.via, undefined, reason);
  }
  const { R, calls } = reader(() => Promise.resolve(body));
  const r = await R.read({ code: 'Z' });
  assert.equal(r.status, 'ok'); assert.equal(r.via, undefined); assert.equal(calls.length, 1);
});

test('the relay admits every shape of read the page makes, and nothing past it', async () => {
  /* every option the readers pass (js/wb-layers.js, js/stats-compare.js, js/time-countries.js …), written by the reader itself */
  const asked = [];
  window.SUPABASE_URL = '';
  const R = makeWorldBankReader({ clockFor: () => 100, readWithin: (u) => { asked.push(u); return Promise.resolve(body); } });
  await Promise.all([
    R.read({ code: 'SP.POP.TOTL', date: '1990:2027', perPage: 20000, idle: true, keep: false }),
    R.read({ code: 'NY.GDP.PCAP.PP.CD', mrnev: 1, perPage: 400 }),
    R.read({ code: 'SP.POP.TOTL', country: 'JPN', source: 2, date: '1960:2027', perPage: 80 }),
    R.read({ code: 'EN.ATM.CO2E.PC', source: 75, mrnev: 1 }),
  ]);
  for (const u of asked) assert.equal((fetchRelayRule(u) || {}).id, 'world-bank-indicator', u);
  for (const u of [
    'https://api.worldbank.org/v2/country/all/indicator/X?per_page=1',                 /* a required key absent */
    'https://api.worldbank.org/v2/country/all/indicator/X?format=json&per_page=1&x=1',  /* a key no reader writes */
    'https://api.worldbank.org/v2/country/all/indicator/X?format=xml&per_page=1',       /* a shape no reader writes */
    'https://api.worldbank.org/v2/sources?format=json&per_page=1',                       /* another path on the host */
  ]) assert.equal(fetchRelayRule(u), null, u);
});

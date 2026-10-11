/* ============================================================================
 *  IntMap · a World Bank read that met a network failure asks once more, at the other address
 * ----------------------------------------------------------------------------
 *  実測 2026-10-11: World Bank の CDN が NY.GDP.PCAP.PP.CD?format=json&mrnev=1&per_page=400 を
 *  Access-Control-Allow-Origin の無い 21 時間前の写しで配り、ブラウザにはネットワーク失敗としか見えなかった。
 *  同じ問いをパラメータの順を変えて書くと新しい写しが返る。読み手（js/wb-indicators.js）を実際に評価して:
 *    ・ネットワーク失敗（観測された失敗）のあと、同じ問いを別の綴りで 1 回だけ訊き直し、`via` を残す
 *    ・期限切れ（観測できなかった）と、ホストが返した答えのあとでは訊き直さない
 *    ・2 つの綴りは同じパラメータの集合である（意味は同じ、写しの鍵だけが違う）
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorldBankReader } from '../js/wb-indicators.js';

const params = (u) => new URL(u).searchParams;
const sameQuestion = (a, b) => {
  const A = [...params(a)].map(String).sort(), B = [...params(b)].map(String).sort();
  return new URL(a).pathname === new URL(b).pathname && JSON.stringify(A) === JSON.stringify(B);
};
const body = { text: JSON.stringify([{ page: 1 }, [{ countryiso3code: 'JPN', date: '2024', value: 52000 }]]) };
const fail = (reason) => Promise.reject(Object.assign(new Error(reason), { reason }));

function reader(answer) {
  const calls = [];
  const R = makeWorldBankReader({ clockFor: () => 100, readWithin: (u) => { calls.push(u); return answer(u, calls.length); } });
  return { R, calls };
}

test('a network failure is asked once more at the other address, and the answer says so', async () => {
  const { R, calls } = reader((u, n) => (n === 1 ? fail('network') : Promise.resolve(body)));
  const r = await R.read({ code: 'NY.GDP.PCAP.PP.CD', mrnev: 1, perPage: 400 });
  assert.equal(r.status, 'ok');
  assert.equal(r.via, 'second-address');
  assert.equal(calls.length, 2, 'exactly one second ask');
  assert.notEqual(calls[0], calls[1], 'the second ask must be a different cache address');
  assert.ok(sameQuestion(calls[0], calls[1]), 'the second ask must be the same question: ' + calls.join(' | '));
  assert.equal(calls[0], 'https://api.worldbank.org/v2/country/all/indicator/NY.GDP.PCAP.PP.CD?format=json&mrnev=1&per_page=400',
    'the first ask is the address every reader has always used');
});

test('both addresses failing is unavailable, with the second ask recorded', async () => {
  const { R, calls } = reader(() => fail('network'));
  const r = await R.read({ code: 'X', source: 3, date: '2020' });
  assert.equal(r.status, 'unavailable'); assert.equal(r.via, 'second-address'); assert.equal(calls.length, 2);
  assert.ok(sameQuestion(calls[0], calls[1]));
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

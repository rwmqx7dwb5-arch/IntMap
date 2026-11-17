/* atlas-completion — the console half of the two Atlas reports of 2026-11-17.
 *
 * The functions under test live inside js/atlas-console.js's closure, which needs a browser to build. They are
 * EVALUATED here, not read: the exact source of each is lifted out of the file by its declaration and run (a check
 * that only matched the source text could not see the order the regular expressions are applied in — memory
 * intmap-edge-function-must-be-evaluated).
 *
 * ① 「名古屋駅から公共交通で2時間以内で行ける紅葉スポットを、直近3日の紅葉情報で比較して」 used to yield
 *    {windowMs: 7200000}: the travel time became the evidence window. Measured before the fix with the shipped
 *    function: {"critical":true,"windowMs":7200000}.
 * ② a turn that did not produce what it declared leaves its unmet items in the history as a line of their own,
 *    with the original request — never inside the 180-character excerpt of the reply.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SRC = fs.readFileSync(new URL('../js/atlas-console.js', import.meta.url), 'utf8');
const between = (from, to) => {
  const a = SRC.indexOf(from), b = SRC.indexOf(to, a);
  assert.ok(a >= 0 && b > a, 'source block not found: ' + from);
  return SRC.slice(a, b);
};

const freshness = new Function(between('const _FRESH_TIMEWIN=', '    /* Real local clock') + '; return _analyzeFreshness;')();
const unmetLine = new Function(between('const _unmetLine=', '    function recordTurn(') + '; return _unmetLine;')();

test('① a travel time is a duration, the anchored «直近3日» is the evidence window', () => {
  const r = freshness('名古屋駅から公共交通で2時間以内で行ける紅葉スポットを、直近3日の紅葉情報で比較して');
  assert.equal(r.windowMs, 3 * 24 * 3600e3, JSON.stringify(r));
  assert.deepEqual(r.durations.map((d) => [d.text, d.role]), [['2時間以内', 'duration'], ['3日', 'evidence_window']]);
});

test('① the same rule, not a topic exception: any un-anchored duration is not a window', () => {
  for (const q of ['東京から3時間で行ける温泉', 'a 2 hour hike near Kyoto', '大阪から新幹線で1時間以内の城']) {
    const r = freshness(q);
    assert.equal(r.windowMs, null, q + ' → ' + JSON.stringify(r));
    assert.ok(r.durations.length === 1 && r.durations[0].role === 'duration', q);
  }
});

test('① windows anchored to now still parse — past, forward and «ago»', () => {
  const H = 3600e3;
  assert.equal(freshness('過去48時間のウクライナ情勢').windowMs, 48 * H);
  assert.equal(freshness('What happened in the last 24 hours in Gaza?').windowMs, 24 * H);
  assert.equal(freshness('中央アジアを担当する分析官として、現在から72時間、この地域の監視レベルを引き上げるべきか判断する。').windowMs, 72 * H);
  assert.equal(freshness('3日前からの株価の動き').windowMs, 3 * 24 * H);
  /* two windows named: the narrowest is the one every piece of evidence must satisfy */
  assert.equal(freshness('直近7日、特に直近24時間の動き').windowMs, 24 * H);
});

test('② unmet items are their own history line with the request, not cut by the reply excerpt', () => {
  const q = 'LNGの主要供給国から日本への航路を、積出港・受入港・重要海峡つきで地図に示して';
  const line = unmetLine(q, { completion: 'partial', stopped: 'output_unmet',
    unmet: [{ kind: 'output', mode: 'map', code: 'map_not_drawn' }, { kind: 'step', n: 2, title: '航路を描く', state: 'failed' }] });
  assert.match(line, /^Atlas \[unfinished/);
  assert.ok(line.includes(q), 'the original request travels with it');
  assert.match(line, /output map not produced \(map_not_drawn\)/);
  assert.match(line, /step 2 "航路を描く" failed/);
  assert.equal(unmetLine(q, { completion: 'complete', unmet: [] }), '', 'a finished turn adds nothing');
  assert.match(unmetLine(q, { completion: 'complete', unmet: [], incomplete: true }), /incomplete/);
});

test('② the history records observed failures, not the attempt list', () => {
  /* the call site: recordTurn receives the failures computed from each action's executor verdict */
  const site = between('const _obsFails=', '\n');
  assert.match(site, /opState\(ex\)/);
  const call = between('recordTurn(q,out.text||\'\',_ranActions,', ';');
  assert.ok(!/_ranActions,\[\]\)/.test(call), 'failures are no longer passed as an empty list');
  /* and the classifier it uses is the plan's, evaluated */
  return import('../js/atlas-plan.js').then(({ opState }) => {
    assert.equal(opState({ ok: true, status: 'unobserved' }), 'unobserved');
    assert.equal(opState({ ok: false, status: 'failed' }), 'failed');
    assert.equal(opState({ ok: true, status: 'completed' }), 'completed');
  });
});

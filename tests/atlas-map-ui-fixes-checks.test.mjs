/* The reader's 2026-11-27 list: a wall is a fact not a chore, a drawing is not hidden by an old switch, popups clear the Chronos bar,
   the reader's bubble stays, era names leave when the view enters their territory, and a finding Atlas answered is not shown as unfinished. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHtml, handoffOf } from '../supabase/functions/_shared/web-browse.js';
import { handoffText, HANDOFF_NEXT } from '../js/web-browse.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const L = (en, jp) => en + '|' + jp;

const BODY = '<p>' + 'A page that was read, with a body. '.repeat(12) + '</p>' + Array.from({ length: 8 }, (_, i) => '<a href="/x' + i + '">link ' + i + '</a>').join(' ');

test('a captcha tag or a header sign-in box on a page whose body was read is not a wall', () => {
  const widget = parseHtml('<title>Dataset</title><div class="g-recaptcha" data-sitekey="k"></div>' + BODY, 'https://sciencebase.example/');
  assert.equal(handoffOf(widget, 200, null, 'https://sciencebase.example/'), null);
  const header = parseHtml('<title>Dataset</title><form><input name="u"><input type="password" name="p"></form>' + BODY, 'https://sciencebase.example/');
  assert.equal(handoffOf(header, 200, null, 'https://sciencebase.example/'), null);
});

test('a page with nothing to read behind a captcha or a sign-in IS a wall; a 429 is not one', () => {
  const wall = parseHtml('<title>x</title><div class="g-recaptcha" data-sitekey="k"></div>', 'https://a.example/');
  assert.equal(handoffOf(wall, 200, null, 'https://a.example/').kind, 'captcha');
  const login = parseHtml('<title>ログイン</title><form><input name="id"><input type="password" name="pw"></form>', 'https://a.example/');
  assert.equal(handoffOf(login, 200, null, 'https://a.example/').kind, 'login');
  assert.equal(handoffOf(parseHtml(BODY, 'https://a.example/'), 429, null, 'https://a.example/'), null, '429 is «slower», not a step a person can do');
  assert.equal(handoffOf(parseHtml(BODY, 'https://a.example/'), 403, null, 'https://a.example/').kind, 'blocked');
});

test('the wall is said as a fact; the reader is handed no chore, and the model is told to look elsewhere itself', () => {
  for (const k of ['login', 'captcha', 'post-form', 'challenge', 'blocked']) {
    const t = handoffText({ kind: k }, L);
    assert.doesNotMatch(t, /attach|yourself|download|ご自身|添付|ダウンロード/, k);
  }
  assert.match(HANDOFF_NEXT, /Do NOT ask the reader/);
  const cap = read('js/atlas-cap-web.js');
  assert.ok(!/Tell the reader what to do/.test(cap) && !/Tell the reader to do the step/.test(cap), 'no capability tells the model to hand the reader the step');
});

test('the shared line layer has its own id (it was the country outline\'s id, so a river after a highlight was never painted)', () => {
  const s = read('js/atlas-console.js');
  assert.match(s, /GE\(\)\.layers\.add\(\{id:'nlq-lines',type:'line',source:'nlq-line-src'/);
  assert.match(s, /lines:\['nlq-lines'\]/);
  assert.ok(!/id:'nlq-line',type:'line',source:'nlq-line-src'/.test(s));
  assert.match(s, /_drew\.forEach\(d=>\{ if\(d\.visible\) return;/, 'what a run just drew is shown, whatever an old switch did');
});

test('Objects lists a surface whose layers a switch hid, so it can be brought back', () => {
  const s = read('js/map-tools.js');
  assert.match(s, /su\.state!=='drawn'&&su\.state!=='hidden'/);
  assert.match(s, /hidden:su\.state==='hidden'/);
});

test('popups anchored to the bottom clear the Chronos bar through one measured variable', () => {
  assert.match(read('js/news-timeline.js'), /--ntl-clear/);
  assert.match(read('css/intmap.css'), /sat-on \.tool-panel\{[^}]*bottom:max\(24px,var\(--ntl-clear,0px\)\)/);
  assert.match(read('js/elevation-profile.js'), /bottom:max\(26px,var\(--ntl-clear,0px\)\)/);
});

test('the Objects panel is placed again after a language rebuild and after its anchor button is shown', () => {
  const s = read('js/map-tools.js');
  assert.match(s, /renderList\(\); _placePanel\(\); p2\.style\.display='flex'/);
  assert.match(s, /function open\(\)\{ ensurePanel\(\); renderList\(\); tickFab\(\); _placePanel\(\)/);
});

test('era names follow the same size-of-region rule as today\'s names', () => {
  const t = read('js/time-borders.js');
  assert.match(t, /function _fitEraNames\(\)/);
  assert.ok(t.includes('CE.gone(') && t.includes('CE.applyGone('), 'the era names go through the one shared rule (js/country-extent.js)');
  assert.ok(t.includes('_lblBox.set(feats[feats.length-1],bx)'));
});

test('a finding Atlas answered with a reason is contested, not shown as unfinished; the same finding twice is not bounced again; an unobserved step is not a failure', () => {
  const a = read('js/atlas-agent.js');
  assert.match(a, /trace\.goalContested = /);
  assert.match(a, /trace\.goalRepeated = /);
  assert.match(a, /st\.state === 'unobserved'\) return;/);
  assert.match(read('js/atlas-live.js'), /narrate\(ai, st, ai\.__atlDraft\); st\.narr = null; st\.sayAt = -1; setDraft\(ai, ''\);/);
});

/* (isolate-outline-geometry) the vertex-snapping test that stood here pinned the old mechanism's spelling (snapRing, SNAP_DEG); the
   claim it carried — the hole's land edge is the map's own frontier, re-derived from the surveyed polygon and never from its own
   output — is now measured as geometry on real tiles in tests/isolate-outline-geometry-checks.test.mjs. */

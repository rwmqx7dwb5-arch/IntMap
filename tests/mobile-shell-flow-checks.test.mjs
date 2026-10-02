/* ============================================================================
 *  IntMap · mobile-shell-flow — where the phone's one sheet rests, decided in one place
 * ----------------------------------------------------------------------------
 *  MEASURED on production (0cb41ee, 390 × 844) after the sheet was rebuilt: a place picked from the search left
 *  the sheet at `full` 5 s later — the map was its top 118 px and the place card the pick put on it was cut off
 *  above the screen; the card's × sat under the control group (its edges followed the pin); Chronos opened at
 *  `half` with its year slider at y 819–863 of 844; the news point's card was drawn under the sheet (1190 < 1200).
 *
 *  What this file runs:
 *    ① js/mobile-sheet.js detentFor — the one table every «what is the reader doing» signal asks
 *    ② the answer signal has one name, owned by js/mobile-sheet.js: no module spells it for itself
 *  and what only the stylesheet and the markup can say:
 *    ③ the map card's row sits in the phone's stacking table (legend < card < chrome < sheet), the card's right
 *      edge is the legend tray's (derived from the control group), and the news point's card is a popup
 *    ④ Chronos in the sheet: what is typed once goes after what the finger scrubs — and the rule names
 *      children #ntl-body really has
 *  The walked flow (search → card, an app flight at full, Chronos and the screens at half, 44 px hit areas) is
 *  measured in a browser by tests/ui-a11y-polish.spec.js ③b.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';
import * as MS from '../js/mobile-sheet.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const RANK = Object.fromEntries(MS.DETENTS.map((d, i) => [d, i]));

/* ── ① the table ─────────────────────────────────────────────────────────────────────────────────── */
test('① detentFor: typing raises to full; an answer only ever lowers; the field\'s raise is not the reader\'s', () => {
  for (const cur of MS.DETENTS) {
    assert.equal(MS.detentFor('type', { current: cur }), 'full', 'the candidates need the room');
    /* an answer never lifts a sheet the reader put lower */
    for (const kind of ['card', 'move']) {
      const got = MS.detentFor(kind, { current: cur });
      assert.ok(RANK[got] <= RANK[cur], `${kind} raised the sheet from ${cur} to ${got}`);
    }
  }
  assert.equal(MS.detentFor('card', { current: 'full', before: 'half' }), 'min', 'a card on the map: the sheet comes down to its search row');
  assert.equal(MS.detentFor('card', { current: 'hidden' }), 'hidden');
  assert.equal(MS.detentFor('move', { current: 'full' }), 'half', 'an app flight at full: the map must show where it went');
  assert.equal(MS.detentFor('move', { current: 'half' }), 'half');
  assert.equal(MS.detentFor('move', { current: 'min' }), 'min');
  /* leaving the field with nothing chosen goes back where the reader was — never higher than now */
  assert.equal(MS.detentFor('leave', { current: 'full', before: 'min' }), 'min');
  assert.equal(MS.detentFor('leave', { current: 'half', before: 'full' }), 'half');
  assert.equal(MS.detentFor('leave', { current: 'full', before: null }), 'full', 'no raise by the field — nothing to undo');
  /* a tab: half — unless the reader had it higher themselves; a raise the FIELD made is not theirs */
  assert.equal(MS.detentFor('tab', { current: 'min' }), 'half');
  assert.equal(MS.detentFor('tab', { current: 'full', before: null }), 'full');
  assert.equal(MS.detentFor('tab', { current: 'full', before: 'min' }), 'half', '«Ask Atlas» from the field opens Atlas at half');
  assert.equal(MS.detentFor('nonsense', { current: 'half' }), 'half', 'an unknown activity changes nothing');
});

/* ── ② one name for the signal ───────────────────────────────────────────────────────────────────── */
test('② «an answer is on the map» has one name, owned by js/mobile-sheet.js — every user imports it', () => {
  assert.equal(typeof MS.MAP_ANSWER_EVENT, 'string');
  const name = MS.MAP_ANSWER_EVENT;
  const spelled = [], users = [];
  for (const f of readdirSync(join(ROOT, 'js'), { recursive: true })) {
    if (!/\.js$/.test(f)) continue;
    const p = 'js/' + String(f).replace(/\\/g, '/');
    const src = codeOnly(read(p));
    if (p !== 'js/mobile-sheet.js' && src.includes(name)) spelled.push(p);
    if (/\bMAP_ANSWER_EVENT\b/.test(src)) users.push(p);
  }
  assert.deepEqual(spelled, [], 'a module spells the answer signal for itself instead of importing it');
  for (const p of ['js/mobile-ui.js', 'js/search-geocode.js']) {
    assert.ok(users.includes(p), `${p} no longer speaks the answer signal`);
    assert.match(read(p), /import \{[^}]*\bMAP_ANSWER_EVENT\b[^}]*\} from '\.\/mobile-sheet\.js'/, `${p} reads the name from js/mobile-sheet.js`);
  }
});

/* ── ③ the stylesheet: the card's row and its edges, the news card's row ─────────────────────────── */
test('③ the map card has its row (legend < card < chrome < sheet), keeps clear of the group, and the news card is a popup', () => {
  const css = codeOnly(read('css/intmap.css'), { lang: 'css' });
  const root = /:root\{ --z-inset:0;[^}]*\}/.exec(css); assert.ok(root, 'the stacking table is where it was');
  const z = (n) => +new RegExp('--z-' + n + ':(\\d+)').exec(root[0])[1];
  assert.ok(z('m-legend') < z('m-card') && z('m-card') < z('m-chrome') && z('m-chrome') < z('m-sheet'), 'the phone rows are out of order');
  assert.ok(z('popup') > z('m-sheet'), 'a popup opened from the map is under the sheet');
  /* the phone's own rule for the card (the one after the desktop rule, inside the phone block) */
  const phone = [...css.matchAll(/\.search-result-card\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(phone.length >= 2, 'the phone has no rule of its own for the place card');
  const card = phone[phone.length - 1];
  assert.match(card, /z-index:var\(--z-m-card\)/, 'the card reads its row');
  assert.match(card, /right:var\(--m-legend-right\)/, 'the card\'s right edge is not the one derived from the control group');
  assert.match(css, /\.m-news-pop-back\{ z-index:var\(--z-popup\); \}/, 'the news point\'s card is not in the popup row');
});

/* ── ④ Chronos in the sheet ──────────────────────────────────────────────────────────────────────── */
test('④ Chronos in the sheet: what is typed once goes after what the finger scrubs, and the rule names real children', () => {
  const css = codeOnly(read('css/intmap.css'), { lang: 'css' });
  const rule = /#m-screens \.news-timeline \.ntl-body > :is\(([^)]*)\)\{ order:1; \}/.exec(css);
  assert.ok(rule, 'the sheet\'s Chronos keeps its markup order again — the year slider falls below a half sheet');
  const html = read('index.html');
  const body = /<div class="ntl-body" id="ntl-body">([\s\S]*?)<!-- \(#R290\)/.exec(html);
  assert.ok(body, '#ntl-body is where it was in index.html');
  for (const sel of rule[1].split(',').map((s) => s.trim())) {
    const cls = sel.replace(/^\./, '');
    assert.match(body[1], new RegExp('class="' + cls + '[" ]'), `${sel} is not a child of #ntl-body — the rule moves nothing`);
  }
  /* and the slider itself is not among what is moved */
  assert.doesNotMatch(rule[1], /ntl-slider|ntl-valrow/);
});

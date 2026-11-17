/* (news-type-polish) the news list's type scale and corners, the map's news band, country labels
   (one line, bold), thinner place-name halos, and the compare bar chart's one order button.
   What is EVALUATED is evaluated (js/label-scale.js, scripts/build-glyphs.mjs's atlases); the rest
   asks the one place that owns each fact. The country-label line and the bold glyph routing are
   asserted where the label tests already run the real code: tests/shell-map-labels-checks.test.mjs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

test('the place-name halo is one factor on each layer\'s own weight, and it is thinner', () => {
  const w = {}; w.window = w;
  vm.runInContext(rd('js/label-scale.js'), vm.createContext(w), { filename: 'js/label-scale.js' });
  const S = w.IntMapLabelScale;
  assert.equal(typeof S.halo, 'function');
  assert.ok(S.HALO_K > 0 && S.HALO_K < 1, 'the factor thins the outline');
  assert.ok(S.halo(1.7) < 1.7 && S.halo(1.6) < S.halo(1.7), 'thinner, and the order between layers is kept');
  /* no place-name layer keeps a literal halo width: every one asks the factor (POIs are not place names) */
  for (const f of ['js/place-labels.js', 'js/time-borders.js', 'js/time-admin1.js']) {
    const lits = [...rd(f).matchAll(/'text-halo-width'\s*:\s*([0-9.]+)/g)].map((m) => m[0]);
    const allowed = f === 'js/place-labels.js' ? 1 : 0;   /* ofm-poi */
    assert.equal(lits.length, allowed, f + ' writes a literal halo width: ' + lits.join(', '));
  }
});

test('the bold glyph atlases exist for every self-hosted range', () => {
  const have = new Set(readdirSync(join(ROOT, 'fonts', 'Inter Bold')));
  const reg = readdirSync(join(ROOT, 'fonts', 'Inter Regular')).filter((n) => n.endsWith('.pbf'));
  for (const n of reg) assert.ok(have.has(n), 'fonts/Inter Bold/' + n + ' is missing');
});

test('the news band: the layer, the sprite and the declutter read ONE geometry', () => {
  const mt = rd('js/map-typography.js'), ui = rd('js/news-ui.js'), app = rd('js/app-body.js');
  assert.match(mt, /const BAND = \{ lead: \d+, padX: \d+, padY: \d+ \}/);
  assert.match(mt, /x: it\.x \+ BAND\.lead/, 'the declutter reserves the box where the pill is drawn');
  assert.match(mt, /\+ 2 \* BAND\.padX/, 'the reserved width is the pill\'s padding, not a second number');
  assert.match(ui, /const MTy=window\.IntMapMapTypography;/);
  assert.match(ui, /'text-offset':MTy\.bandOffset\(\)/, 'the layer places the text from BAND');
  assert.match(ui, /'icon-text-fit-padding':\(B=>\[B\.padY,B\.padX,B\.padY,B\.padX\]\)\(MTy\.BAND\)/);
  /* the sprite's content box is the whole pill — no inset that would add to the fit padding */
  assert.match(app, /content:\[m\*dpr,m\*dpr,\(m\+w\)\*dpr,\(m\+h\)\*dpr\]/);
  /* one material in every theme: no light pill */
  assert.doesNotMatch(app, /rgba\(244,244,247,0\.94\)/, 'the white pill is gone');
  /* the pill starts clear of the 9 px pin (7 radius + 2 rim) */
  const lead = +/lead: (\d+)/.exec(mt)[1];
  assert.ok(lead > 9, 'the pill begins right of the pin\'s rim');
});

test('a one-outlet event names its outlet once on the card', () => {
  const ev = rd('js/news-events.js');
  assert.match(ev, /const named = outlets\.size === 1 && outlets\.has\(g0\.source\)/);
  assert.match(ev, /\(named \? '' : '<span class="ev-gist-src">'/);
  /* the list's freshness line carries no «by IntMap news collection» */
  const fn = ev.slice(ev.indexOf('function renderHealth()'), ev.indexOf('function renderHealth()') + 1500);
  assert.match(fn, /verb: 'updated', lang: HOST\.lang, fmt \}\)/, 'the list\'s freshness chip is given no «by»');
});

test('the compare bar chart: one button cycles the order, Atlas can name it', () => {
  const sc = rd('js/stats-compare.js');
  assert.match(sc, /const BAR_SORTS=\['added','desc','asc'\]/);
  assert.match(sc, /barSort=BAR_SORTS\[\(BAR_SORTS\.indexOf\(barSort\)\+1\)%BAR_SORTS\.length\]/, 'one button, cycling');
  assert.match(sc, /mode\+'\|'\+barSort\+'\|'/, 'a block re-renders when the order changes');
  assert.match(sc, /order:barSort/, 'the panel state reports the order');
  const cap = rd('js/atlas-cap-data.js');
  assert.match(cap, /order: one\('added', 'desc', 'asc'\)/, 'compareStats accepts the order');
  assert.match(cap, /viewM,a\.order\|\|null\)/, 'and hands it to the panel');
});

test('the corner and type scale are tokens, and the card uses them', () => {
  const css = rd('css/intmap.css');
  assert.match(css, /:root\{ --r-card:12px; --r-control:8px; --r-inner:6px; --fs-head:16px; --fs-body:14px; --fs-meta:12px;/);
  /* the rule whose text begins with `head` (a selector, or a selector and its first declaration when the selector has several rules) */
  const rule = (head) => { const i = css.indexOf('\n    ' + (head.includes('{') ? head : head + '{')); assert.ok(i >= 0, head); return css.slice(i, css.indexOf('}', i)); };
  assert.match(rule('.news-item'), /border-radius:var\(--r-card\)/);
  assert.match(rule('.news-item .news-title'), /font-size:var\(--fs-head\)/);
  assert.match(rule('.news-item .news-title'), /font-weight:700/);
  assert.match(rule('.news-item .ev-gist'), /font-size:var\(--fs-body\)/);
  assert.match(rule('.news-item .news-pub'), /font-size:var\(--fs-meta\)/);
  assert.match(rule('.news-item .news-date'), /font-size:var\(--fs-meta\)/);
  assert.match(rule('.search-bar'), /border-radius:var\(--r-control\)/);
  assert.match(rule('.btn-settings{ background'), /border-radius:var\(--r-control\)/);
  /* the AI disclosure is a note, not a bold paragraph */
  assert.match(rule('.ev-syn .ev-ai'), /font-weight:400/);
});

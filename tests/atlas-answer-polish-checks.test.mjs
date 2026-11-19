/* Atlas answer surface polish: dense timelines, keyboard reach of in-answer notes and place names,
   honest copy feedback, one table look, a sources row that opens and closes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const { atlasChart } = await import('../js/atlas-chart.js');
const CH = atlasChart({ lang: 'en' }, { L: (en) => en, esc });

test('a crowded timeline keeps every dot, never overprints a label, and says how many labels it left to the dots', () => {
  const events = Array.from({ length: 12 }, (_, i) => ({ t: `1950-01-${String(i + 1).padStart(2, '0')}`, label: 'A long event name ' + i }));
  events.push({ t: '1960-01-01', label: 'Far' });
  const r = CH.render({ kind: 'timeline', source: 'S', events });
  assert.equal(r.ok, true);
  assert.equal((r.html.match(/data-mark="1"/g) || []).length, events.length, 'every event is still a dot');
  const labels = (r.html.match(/class="atl-ch-ev"/g) || []).length;
  assert.ok(labels < events.length, 'overlapping labels are not all drawn');
  assert.ok(r.html.includes(`${events.length - labels} label(s) are shown on the dots only`), 'the caption names what was left out');
  assert.equal((r.html.match(/tabindex="0"/g) || []).length, events.length, 'each dot can be focused to read its label');
});

test('a sparse timeline draws every label and adds no note', () => {
  const r = CH.render({ kind: 'timeline', source: 'S', events: [{ t: '1900-01-01', label: 'a' }, { t: '1950-01-01', label: 'b' }, { t: '2000-01-01', label: 'c' }] });
  assert.equal((r.html.match(/class="atl-ch-ev"/g) || []).length, 3);
  assert.doesNotMatch(r.html, /on the dots only/);
});

test('annotations and place names are reachable and operable from the keyboard', () => {
  const an = read('js/atlas-annotate.js'), mc = read('js/atlas-map-compose.js');
  assert.ok(an.includes('tabindex="0">'), 'an annotation span can take focus');
  assert.match(an, /'focusin'/); assert.match(an, /'focusout'/);
  assert.doesNotMatch(an, /setAttribute\('aria-hidden', 'true'\)/, 'the card is not hidden from assistive technology');
  assert.ok(mc.includes('role="button" tabindex="0"'));
  assert.match(mc, /ev\.key === 'Enter' \|\| ev\.key === ' '/);
});

test('copy feedback follows what the clipboard did', () => {
  const rp = read('js/atlas-reply.js'), mt = read('js/atlas-msg-tools.js');
  assert.match(rp, /done\(true\)/); assert.match(rp, /done\(_atlFallbackCopy\(txt\)\)/);
  assert.match(rp, /return ok;/, 'the legacy fallback reports whether it worked');
  assert.doesNotMatch(mt, /writeText\(src\.innerText\|\|''\); const sp/, 'the check mark no longer precedes the write settling');
  assert.match(mt, /say\(true\)/);
});

test('the sources row opens and closes, and the cards show the title in two lines', () => {
  const rp = read('js/atlas-reply.js'), st = read('js/atlas-styles.js');
  assert.match(rp, /rest\.hidden=!open/);
  assert.doesNotMatch(rp, /rest\.hidden=false; b\.remove\(\)/);
  assert.match(st, /\.atl-lc-t\{font-size:12\.5px[^}]*-webkit-line-clamp:2/);
});

test('the data-table answer uses the one table look and still scrolls instead of squeezing', () => {
  const q = read('js/atlas-query.js');
  assert.match(q, /<table class="atl-md-table" style="width:auto;min-width:100%;">/);
  assert.match(q, /atl-tablewrap/);
});

test('a structured bullet_list keeps nesting', async () => {
  const src = read('js/atlas-answer-render.js');
  assert.ok(src.includes('marked && /^'+String.fromCharCode(92)+'s+'+String.fromCharCode(92)+'S/.test(l)'));
});

test('an unfinished step is a labelled status, not a faint footnote, and a render error is a short sentence with details folded', () => {
  const c = read('js/atlas-console.js');
  assert.match(c, /class="atl-unfinished" role="status"/);
  assert.match(c, /The answer could not be displayed\./);
});

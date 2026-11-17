/*
 * news-quality-followup — the four findings of the production check of 2026-11-18 (build dcd32a0).
 *  ① a search counted 2 events under «All topics» and listed 1: the server matched the summary, the list's own
 *     filter (`_search`) did not carry it. Both now read one list of columns (SEARCH_COLS).
 *  ② bands were drawn over country names: the declutter asked at `moveend`, before the new view's names were placed.
 *  ③ the representative-place rule reached only events that gained an article after it shipped.
 *  ④ Story keyed the AI-glasses exam scandal on «korea + south» (a place) instead of its own centre.
 * dev-notes/2026-11-18-news-quality-followup.md has the measurements.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

await import('../supabase/functions/_shared/newsgeo.js');
const { suggest } = await import('../js/news-story-core.js');
const { summariseEvent, PLACE_RULE } = await import('../supabase/functions/_shared/news-ingest.js');

/* ── ① ─────────────────────────────────────────────────────────────────────────────────────── */
test('news-quality-followup ① the server query and the list filter search the same event columns', () => {
  const src = rd('js/news-events.js');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  let cols = null;
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === 'VariableDeclarator' && n.id && n.id.name === 'SEARCH_COLS' && n.init && n.init.type === 'ArrayExpression') cols = n.init.elements.map((e) => e.value);
    for (const k of Object.keys(n)) if (k !== 'type') walk(n[k]);
  })(ast);
  assert.ok(cols && cols.includes('summary') && cols.includes('representative_title'), 'SEARCH_COLS names both columns the reported event was matched by');
  /* every column searched is a column fetched (otherwise the list filter reads undefined for it) */
  const fetched = (src.match(/const EVENT_COLS =([\s\S]*?);/) || [])[1] || '';
  for (const c of cols) assert.ok(new RegExp('\\b' + c + '\\b').test(fetched), c + ' is fetched in EVENT_COLS');
  /* the two readers both read the list, and neither spells a column of its own */
  const orCall = src.match(/q\.or\(([^;]*)\);/);
  assert.ok(orCall && /SEARCH_COLS/.test(orCall[1]) && !/ilike\.\*'\s*\+\s*term\s*\+\s*'\*,/.test(orCall[1]), 'the query is built from SEARCH_COLS');
  const searchLine = src.match(/_search:\s*([^\n]*)/);
  assert.ok(searchLine && /SEARCH_COLS\.map\(\(c\) => row\[c\]/.test(searchLine[1]), 'the list filter text is built from SEARCH_COLS');
});

/* ── ② ─────────────────────────────────────────────────────────────────────────────────────── */
test('news-quality-followup ② every settle also declutters once at the next idle — never on a standing idle binding', () => {
  const src = rd('js/news-ui.js');
  assert.ok(/events\.once\('idle',\s*HOST\.scheduleNewsDeclutter\)/.test(src), 'the declutter is asked again once the view is placed');
  assert.ok(/events\.on\('moveend',\s*declutterSettled\)/.test(src) && /events\.on\('zoomend',\s*declutterSettled\)/.test(src), 'both settles use it');
  assert.ok(!/events\.on\('idle'/.test(src), 'a standing idle binding would loop (the declutter repaints)');
});

/* ── ③ ─────────────────────────────────────────────────────────────────────────────────────── */
test('news-quality-followup ③ an event records the place rule it was placed by, and ingest re-places the older ones', () => {
  const at = (h) => new Date(Date.UTC(2026, 10, 14, h)).toISOString();
  const m = (id, name, lng, lat, title) => ({ id, title, published_at: at(id), source_family: 's' + id, subject_name_en: name, subject_type: 'city', subject_lng: lng, subject_lat: lat, subject_confidence: 0.8 });
  const s = summariseEvent([m(1, 'Shenzhen', 114.06, 22.54, 'China confirms first Xi-Trump-Putin summit in Shenzhen'), m(2, 'Shenzhen', 114.06, 22.54, 'What to expect from the Shenzhen summit')], null);
  assert.equal(s.location_evidence.rule, PLACE_RULE);
  const none = summariseEvent([{ id: 9, title: 'x', published_at: at(1), source_family: 'a' }], null);
  assert.equal(none.location_evidence.rule, PLACE_RULE, 'an unplaced event records the rule too, or it is re-placed every run');
  const ts = rd('supabase/functions/news-ingest/index.ts');
  assert.ok(/place_rule:location_evidence->>rule/.test(ts), 'the stored rule is read with the event meta');
  assert.ok(/m\.place_rule === PLACE_RULE/.test(ts), 'events on the current rule are left alone');
  assert.ok(/m\.manual_lock \|\| m\.location_override/.test(ts), 'a place a person set is not re-placed');
  const ruleBlock = ts.slice(ts.indexOf('if (ruleOnly.has(eid))'), ts.indexOf('const row = {', ts.indexOf('if (ruleOnly.has(eid))')));
  assert.ok(ruleBlock && !/materially_updated_at/.test(ruleBlock), 're-placing is not a material update (nothing was reported)');
});

/* ── ④ ─────────────────────────────────────────────────────────────────────────────────────── */
/* public.news_story_terms for «South Korea cheating scandal: Are AI smart glasses a threat to exams?», production
   2026-11-18 (60-day window, N = 17058 headlines) — the counts as the server returned them */
const KOREA = {
  n: 17058,
  terms: [['exams', 4, 0, 4], ['glasses', 11, 0, 11], ['smart', 16, 1, 12], ['cheating', 18, 0, 16], ['scandal', 63, 0, 53], ['threat', 69, 0, 61], ['south', 213, 70, 83], ['korea', 341, 314, 314], ['are', 572, 6, 466]]
    .map(([t, df, cap, occ]) => ({ t, df, cap, occ })),
  pairs: [['korea', 'south', 49], ['glasses', 'smart', 6], ['are', 'threat', 4], ['are', 'korea', 3], ['cheating', 'glasses', 3], ['cheating', 'scandal', 3], ['cheating', 'smart', 3], ['korea', 'threat', 3], ['are', 'south', 2], ['cheating', 'korea', 2], ['korea', 'scandal', 2], ['smart', 'south', 2]],
};
const CENTRE = new Set(['south', 'korea', 'cheat', 'glasse', 'exam']);   /* centreOf() of its six headlines */
const G = globalThis.IntMapNewsGeo;
const placeName = (terms) => {
  const ws = terms.map((x) => x.toLowerCase());
  for (const o of ws.length === 2 ? [ws, [ws[1], ws[0]]] : [ws]) {
    const r = G.locate(o.map((w) => w[0].toUpperCase() + w.slice(1)).join(' '));
    const en = r && r.name && (r.name.en || r.name);
    if (typeof en === 'string' && en.toLowerCase() === o.join(' ')) return true;
  }
  return false;
};

test('news-quality-followup ④ the story of an event is keyed on its own centre, not on the place it happens', () => {
  const s = suggest(KOREA, { centre: CENTRE, placeName });
  assert.deepEqual(s.pick && s.pick.terms, ['cheating', 'glasses']);
  const kr = s.choices.find((c) => c.terms.join('+') === 'korea+south');
  assert.ok(kr && kr.place === true, '«korea + south» is still offered, marked as a place');
});

test('news-quality-followup ④ a choice that only spells a place is never the pick, even when nothing else is left', () => {
  const only = { n: KOREA.n, terms: KOREA.terms.filter((x) => x.t === 'korea' || x.t === 'south'), pairs: [['korea', 'south', 49]] };
  const got = suggest(only, { centre: CENTRE, placeName });
  assert.ok(!got.pick || got.pick.terms.join('+') !== 'korea+south', 'the place pair is not the key');
  assert.ok(got.choices.every((c) => !c.place || c !== got.pick));
  /* with the pair as the only choice, there is no key at all */
  const bare = { n: KOREA.n, terms: [{ t: 'korea', df: 25, cap: 25, occ: 25 }, { t: 'south', df: 25, cap: 25, occ: 25 }], pairs: [['korea', 'south', 20]] };
  const b = suggest(bare, { centre: CENTRE, placeName });
  assert.ok(!b.pick || b.pick.terms.length === 1, 'only a rare single name (a thread by ALONE_MAX) may stand in for it');
  /* without a geocoder the order is the old one — the rule weakens nothing it cannot ask */
  assert.deepEqual(suggest(only, { centre: CENTRE }).pick.terms, ['korea', 'south']);
});

test('news-quality-followup ④ names that locate somewhere but do not spell it (people) stay keys', () => {
  assert.equal(placeName(['xi', 'putin']), false, '«Xi Putin» locates to Russia, and is not its name');
  assert.equal(placeName(['white', 'house']), true);
  const people = { n: 17058, terms: [{ t: 'jensen', df: 61, cap: 61, occ: 61 }, { t: 'huang', df: 70, cap: 70, occ: 70 }], pairs: [['huang', 'jensen', 61]] };
  assert.deepEqual(suggest(people, { centre: new Set(['huang', 'jensen']), placeName }).pick.terms, ['huang', 'jensen']);
});

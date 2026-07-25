/* ============================================================================
 *  R161 — deterministic NewsGeo engine + MapLibre-reduction Phase 3
 * ----------------------------------------------------------------------------
 *  Two kinds of check:
 *    · BEHAVIOURAL — run the real engine over headlines and assert the answer.
 *      These are the ones that matter: they fail when the reasoning breaks, not
 *      when a string moves.
 *    · SOURCE — a few exact-string assertions that the wiring is still in place
 *      (engine loaded, engine-first in analyzeContext, mirror imported by the
 *      Edge Function, news overlay driven through IntMapGeoEngine).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appSource } from './app-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* (#R162) index.html is no longer the whole app. Read every file the browser
   loads, so these guards keep their meaning as code moves between files — and
   so #16's "no news handler is left on the raw map" cannot go silently green
   just because the handler moved into a js/ module. */
const html = appSource(new URL('../', import.meta.url));
const fn = readFileSync(join(ROOT, 'supabase/functions/refresh-news/index.ts'), 'utf8');

await import('../js/newsgeo.js');
const NG = globalThis.IntMapNewsGeo;

const R = 6371;
const km = (a, b) => {
  const r = Math.PI / 180, dLa = (b[1] - a[1]) * r, dLo = (b[0] - a[0]) * r;
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
};
/* assert the located subject is within `tol` km of `at` */
function at(title, atLL, tol, opts) {
  const r = NG.locate(title, opts || {});
  assert.ok(r, `expected a location for: ${title}`);
  const d = km([r.lng, r.lat], atLL);
  assert.ok(d <= tol, `${title}\n  got ${r.name.en} (${r.lng},${r.lat}) — ${d.toFixed(0)} km away, tolerance ${tol}`);
  return r;
}
const none = (title, opts) => {
  const r = NG.locate(title, opts || {});
  assert.equal(r, null, `expected NO location for: ${title} (got ${r && r.name.en})`);
};

/* ── 1. the engine is real and loaded ─────────────────────────────────────── */
test('#1 engine exposes a populated gazetteer', () => {
  const s = NG.stats();
  assert.ok(s.entities > 1200, 'entity count too low: ' + s.entities);
  assert.ok(s.latin > 2500, 'latin index too small: ' + s.latin);
  assert.ok(s.cjk > 900, 'CJK index too small: ' + s.cjk);
  assert.ok(s.stems > 500, 'russian stem index too small: ' + s.stems);
});

/* ── 2. DATELINE — the speaker's city is not the story ────────────────────── */
test('#2 dateline: the place someone SPOKE from is not the subject', () => {
  at('Blinken in Washington warns over Gaza ceasefire talks', [34.47, 31.5], 150);
  at('White House says strikes on Yemen will continue', [47.5, 15.5], 900);
  at('Berlin announces new aid package for Kyiv', [30.52, 50.45], 150);
  at('EU ministers meeting in Brussels condemn attacks on Kharkiv', [36.23, 49.99], 200);
  at('Beijing warns Washington over Taiwan arms sale', [121.0, 23.7], 400);
  /* …but a lone place must still be kept: nothing else to fall back to */
  at('Moscow said it would respond', [37.62, 55.75], 150);
});

/* ── 3. AMBIGUITY — same name, different real places ──────────────────────── */
test('#3 ambiguity is resolved from country / region cues', () => {
  at('Tripoli clashes leave 12 dead in Libya', [13.19, 32.89], 150);
  at('Army shells Tripoli in northern Lebanon', [35.85, 34.44], 150);
  at('Cambridge scientists in England publish fusion result', [0.12, 52.21], 150);
  at('Massachusetts: Cambridge council approves housing plan', [-71.11, 42.37], 150);
  at('Ohio: Toledo schools closed by winter storm', [-83.55, 41.65], 200);
  at('Toledo cathedral restoration begins in central Spain', [-4.02, 39.86], 200);
});

/* ── 4. HIERARCHY — a named city outranks its own country ─────────────────── */
test('#4 hierarchy: the city wins, its parent country is absorbed', () => {
  const r = at('Explosion rocks Kharkiv as Russia steps up strikes on Ukraine', [36.23, 49.99], 150);
  assert.ok(r.why.includes('hierarchy'), 'expected the hierarchy signal, got ' + JSON.stringify(r.why));
  at('Ukraine says Odesa port hit by drones', [30.73, 46.48], 150);
  at('Brazil floods devastate Porto Alegre', [-51.23, -30.03], 200);
});

/* ── 5. TRAPS — a place name inside something that is not a place ─────────── */
test('#5 traps: person / publication / treaty names never geolocate', () => {
  none('Paris Hilton testifies before Congress on youth care');
  none('Michael Jordan sells stake in NBA franchise');
  none('Washington Post publisher steps down');
  none('Countries reaffirm Paris Agreement climate targets');
  none('Museum marks anniversary of the Berlin Wall');
  none('Bank of America posts record quarterly profit');
});

/* ── 6. CASE GUARD — ordinary words are not places ────────────────────────── */
test('#6 lower-case words and non-capitalised acronyms are not places', () => {
  none('The deal will help us grow our exports next year');
  none('Who will win the championship this weekend');
  const r = NG.locate('Cumbre en Bruselas sobre la guerra en Ucrania');
  assert.ok(r && km([r.lng, r.lat], [31.5, 49.0]) < 900, 'Spanish "la" must not become Los Angeles; got ' + (r && r.name.en));
  at('US and China resume trade contacts', [-98.0, 39.5], 900);
});

/* ── 7. WEAK WORDS — Turkey/Chad/Mali need corroboration ──────────────────── */
test('#7 common-word country names need corroboration', () => {
  at('Turkey and Greece agree new migration deal', [35.0, 39.0], 900);
  none('Turkey prices rise before Thanksgiving dinner');
  at('Jihadists attack army post in northern Mali', [-4.0, 17.6], 900);
});

/* ── 8. multilingual ──────────────────────────────────────────────────────── */
test('#8 ja / de / ru / es headlines locate correctly', () => {
  at('ロシア軍がハルキウを砲撃　ウクライナ東部', [36.23, 49.99], 150);
  at('ガザで停戦協議、イスラエル首相が表明', [34.47, 31.5], 150);
  at('能登半島で震度5強の地震', [136.9, 37.3], 150);
  at('Angriff auf Charkiw: mehrere Verletzte', [36.23, 49.99], 150);
  at('Взрыв прогремел в Белгороде', [36.59, 50.6], 150);
  at('Inundaciones en Valencia dejan decenas de muertos', [-0.38, 39.47], 200);
});

/* ── 9. publisher never geolocates its own story ──────────────────────────── */
test('#9 the outlet name is stripped before the subject scan', () => {
  none('Ceasefire talks continue', { desc: 'Officials met to discuss the truce.', publisher: 'The Moscow Times' });
  at('Fighting intensifies around Goma', [29.22, -1.68], 150, { publisher: 'Reuters' });
});

/* ── 10. genuinely placeless stories stay unpinned ────────────────────────── */
test('#10 placeless stories return null instead of a guess', () => {
  none('Global markets rally on rate cut hopes');
  none('What is quantum computing? A short explainer');
  none('Five tips to cut your energy bill');
});

/* ── 11. deterministic + fast ─────────────────────────────────────────────── */
test('#11 the locator is deterministic and fast enough for a whole feed', () => {
  const t = 'Israeli strikes hit Gaza as ceasefire talks stall';
  const a = JSON.stringify(NG.locate(t)), b = JSON.stringify(NG.locate(t));
  assert.equal(a, b, 'same input must give the same answer');
  const t0 = Date.now();
  for (let i = 0; i < 150; i++) NG.locate(t, { desc: 'A description mentioning Kyiv, Warsaw and Berlin.' });
  const ms = Date.now() - t0;
  assert.ok(ms < 1500, '150 articles took ' + ms + 'ms');
});

/* ── 12. measured accuracy vs the locator that shipped before ─────────────── */
test('#12 accuracy on the labelled corpus AND the held-out set', async () => {
  const { evaluate } = await import('../scripts/newsgeo-eval.mjs');
  const { CORPUS } = await import('./newsgeo-corpus.mjs');
  const { HOLDOUT } = await import('./newsgeo-holdout.mjs');
  const dev = evaluate(CORPUS), hold = evaluate(HOLDOUT);
  assert.ok(dev.nw / dev.total >= 0.95, `corpus accuracy ${(100 * dev.nw / dev.total).toFixed(1)}% < 95%`);
  assert.ok(hold.nw / hold.total >= 0.90, `held-out accuracy ${(100 * hold.nw / hold.total).toFixed(1)}% < 90%`);
  /* the whole point of the round: far fewer errors than the previous locator */
  const errOld = dev.total - dev.lg, errNew = dev.total - dev.nw;
  assert.ok(errNew * 5 <= errOld, `expected ≥5× fewer errors, got ${errOld} → ${errNew}`);
});

/* ── 12b. the engine must behave with PRODUCTION's geo_pins loaded ───────── */
/* PRODUCTION BUG, found by exercising the live site rather than just booting it:
   `Army shells Tripoli in northern Lebanon` resolved to the LIBYAN Tripoli, and
   `Toledo cathedral … in central Spain` to Toledo, Ohio — only in production.
   The browser registers the admin-curated `geo_pins` table into the engine, and
   those rows duplicate places the built-in gazetteer already has ("Lebanon" and
   "Spain" each existed twice, at effectively the same point). resolveMentions
   read `ids.length !== 1` as an AMBIGUOUS mention and skipped it when seeding the
   geographic context, so the country cue vanished and the ambiguous city fell back
   to the higher-ranked capital.

   Every other test here runs with an EMPTY registry, i.e. on a gazetteer nobody
   ships. tests/fixtures/geo-pins-prod.json is the real table (294 rows, public
   reference data read with the publishable key), so these cases exercise the
   engine under production's actual preconditions. */
test('#12b behaves correctly with the real production geo_pins registered', async () => {
  const { default: rows } = await import('./fixtures/geo-pins-prod.json', { with: { type: 'json' } });
  assert.ok(rows.length > 250, 'fixture looks truncated: ' + rows.length);
  const before = NG.stats().entities;
  NG.register(rows);
  assert.ok(NG.stats().entities > before, 'fixture did not register');

  /* the two headlines that actually broke in production */
  at('Army shells Tripoli in northern Lebanon', [35.85, 34.44], 150);
  at('Toledo cathedral restoration begins in central Spain', [-4.02, 39.86], 200);
  /* …without breaking the readings that were already right */
  at('Tripoli clashes leave 12 dead in Libya', [13.19, 32.89], 150);
  at('Ohio: Toledo schools closed by winter storm', [-83.55, 41.65], 200);
  at('Cambridge scientists in England publish fusion result', [0.12, 52.21], 150);
  at('Massachusetts: Cambridge council approves housing plan', [-71.11, 42.37], 150);
  at('Explosion rocks Kharkiv as Russia steps up strikes on Ukraine', [36.23, 49.99], 150);
  at('Blinken in Washington warns over Gaza ceasefire talks', [34.47, 31.5], 150);
  at('ロシア軍がハルキウを砲撃　ウクライナ東部', [36.23, 49.99], 150);
  none('Turkey prices rise before Thanksgiving dinner');
  none('Paris Hilton testifies before Congress on youth care');
  none('Global markets rally on rate cut hopes');

  /* a genuinely NEW curated place still adds coverage */
  NG.register([{ terms: ['Zaporizhzhia Nuclear Plant'], lng: 34.59, lat: 47.51, type: 'city', name_en: 'ZNPP', name_jp: 'ZNPP' }]);
  at('Inspectors reach Zaporizhzhia Nuclear Plant', [34.59, 47.51], 150);
});

/* ── 13. the shared mirror is byte-identical ──────────────────────────────── */
test('#13 supabase/functions/_shared/newsgeo.js mirrors js/newsgeo.js', async () => {
  const { inSync } = await import('../scripts/sync-newsgeo.mjs');
  assert.ok(inSync(), 'mirror drifted — run: node scripts/sync-newsgeo.mjs');
});

/* ── 14. client wiring ────────────────────────────────────────────────────── */
test('#14 index.html loads the engine and uses it FIRST in analyzeContext', () => {
  assert.ok(html.includes('<script src="js/newsgeo.js"></script>'), 'engine script tag missing');
  assert.ok(html.includes('const NG=window.IntMapNewsGeo;'), 'analyzeContext does not read the engine');
  assert.ok(html.includes("subjectType=_NG_KIND[r.kind]||'city'"), 'engine result not mapped to a place type');
  /* the legacy scorer must still be reachable as the fallback */
  /* line-ending tolerant: index.html is stored with CRLF */
  assert.ok(/if\(!subjectLoc\)\{\s+let best=null, bestScore=0;/.test(html), 'legacy gazetteer fallback removed');
  /* de/ru/es used to render an undefined subject name.
     (#R169) analyzeContext moved into js/news-context.js, where the closure read `currentLang`
     became the host read `HOST.lang` — accept either spelling so the guard tracks the code. */
  assert.ok(html.includes('best.name[currentLang]||best.name.en||best.name.jp||null')
    || html.includes('best.name[HOST.lang]||best.name.en||best.name.jp||null'), 'legacy name fallback missing');
  /* admin-curated geo_pins still contribute */
  assert.ok(html.includes('window.IntMapNewsGeo.register(extra)'), 'geo_pins are not registered with the engine');
});

/* ── 15. server wiring ────────────────────────────────────────────────────── */
test('#15 refresh-news uses the shared engine as its non-AI locator', () => {
  assert.ok(fn.includes('import "../_shared/newsgeo.js";'), 'Edge Function does not import the shared engine');
  assert.ok(fn.includes('NEWSGEO.locate(title, { desc, publisher, lang: ed.lang })'), 'Edge Function does not call the engine');
  assert.ok(fn.includes('NEWSGEO.register('), 'Edge Function does not register geo_pins');
  /* the legacy dictionary must remain as the last-resort fallback */
  assert.ok(fn.includes('let best: GeoEntry | null = null, bestScore = 0;'), 'legacy dictionary fallback removed');
});

/* ── 16. MapLibre reduction, Phase 3 ──────────────────────────────────────── */
test('#16 the engine contract grew and the news overlay runs through it', () => {
  /* new adapter capabilities */
  for (const m of ['styleReady()', 'getContainer()', 'getSize()', 'setCursor(c)', 'getPaint(id,p)', 'onLayer(e,layer,c)'])
    assert.ok(html.includes(m), 'adapter method missing: ' + m);
  /* exposed on the facade */
  for (const m of ['ready:()=>_adapter.styleReady()', 'container:()=>_adapter.getContainer()', 'size:()=>_adapter.getSize()',
    'setCursor:c=>_adapter.setCursor(c)', 'onLayer:(e,l,c)=>_adapter.onLayer(e,l,c)', 'getPaint:(id,p)=>_adapter.getPaint(id,p)'])
    assert.ok(html.includes(m), 'facade binding missing: ' + m);
  /* news overlay: creation, data, declutter, theming and pointer events via GE */
  assert.ok(html.includes("GE.layers.addSource('news-points'"), 'news source not created through the engine');
  assert.ok(html.includes("GE.layers.add({id:'news-dots'"), 'news-dots layer not created through the engine');
  assert.ok(html.includes("GE.layers.add({id:'news-labels'"), 'news-labels layer not created through the engine');
  assert.ok(html.includes("GE.layers.setSourceData('news-points'"), 'news data not pushed through the engine');
  assert.ok(html.includes("GE.coords.project(g.coordinates)"), 'declutter still projects on the raw map');
  assert.ok(html.includes("GE.layers.setFeatureState({source:'news-points',id:it.fid}"), 'declutter still writes feature-state on the raw map');
  assert.ok(html.includes("_GEp.layers.setPaint('news-labels','text-color'"), 'news band theming not through the engine');
  assert.equal((html.match(/GE\.events\.onLayer\(/g) || []).length, 6, 'expected all six news pointer handlers on the engine');
  /* and none of the news handlers may be bound on the raw map any more */
  assert.ok(!/map\.on\('(?:mousemove|mouseleave|click)','news-(?:dots|labels)'/.test(html), 'a news handler is still bound to the raw map');
});

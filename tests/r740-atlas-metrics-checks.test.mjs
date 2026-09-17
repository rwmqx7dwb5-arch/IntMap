/* ══ R740 — what Atlas was told it could do, measured against what it can ═══════════════════════
 *
 *  Measured on production (logged in, 2026-09-15), driving the Atlas console as a reader would:
 *
 *    「世界を平均寿命で色分けして」            18 steps · 41.9 s · 「⚠ 不明な指標: lifeExp」 · nothing drawn
 *    "…colour the map by life expectancy"     21 steps · 57.6 s · "⚠ Unknown metric: Life expectancy"
 *                                             ×7 spellings, then the step budget, then a promise
 *                                             ("I'm … colouring countries by life expectancy")
 *
 *  Three separate things had to be true at once for that:
 *    ① `drawChoro` read `METRICS` only, and life expectancy lives in `XMET` — so even the RIGHT
 *       key was refused. The map could not shade by a metric the Countries tab was printing in a
 *       column headed 「Life expectancy」 three centimetres away.
 *    ② the refusal named no alternatives, so the only move left to the planner was another
 *       spelling. Seven of them fit inside one turn's budget.
 *    ③ the planner's catalogue carried a HAND-TYPED key list that had drifted from the records
 *       (`lifeExp`, `internet` missing), while the block above it said "+ lifeExp, internet".
 *
 *  These checks are about the FACT, not the fix: a metric name that IntMap itself publishes must
 *  resolve, every refusal must carry the whole valid set, and the catalogue's list must be counted
 *  rather than written down. They EVALUATE the shipped text (#R505) instead of reading it.
 * ============================================================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { makeAtlasCatalogText } from '../js/atlas-catalog-text.js';

const SRC = codeOnly(readFileSync(new URL('../js/atlas-console.js', import.meta.url), 'utf8'));
/* The metric set and its resolver left the kernel for js/atlas-metrics.js — #R199's rule, which
   the ceiling in tests/r318 ⑨b enforces: the subject moves OUT, the ceiling never moves up. Each
   check below reads whichever file now HOLDS the thing it asserts about — the set and the resolver
   here, the map shading and the catalogue hand-off still in js/atlas-console.js. */
const MET = codeOnly(readFileSync(new URL('../js/atlas-metrics.js', import.meta.url), 'utf8'));

/* lift a `const NAME = …;` initialiser by matching its brackets — the same reason liftFunction
   exists: ending a read at a spelling ("};\n") is the bug, not the reading. */
function liftConst(src, name) {
  const head = 'const ' + name + '=';
  const at = src.indexOf(head);
  if (at < 0) throw new Error('no declaration of ' + name);
  let i = at + head.length, depth = 0, q = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if ('{(['.indexOf(c) >= 0) depth++;
    else if ('})]'.indexOf(c) >= 0) depth--;
    else if (c === ';' && !depth) return src.slice(at, i + 1);
  }
  throw new Error('unbalanced initialiser for ' + name);
}

/* the shipped declarations, run. `LA` is the positional tuple (js/lang-registry.js `pickArgs`) and
   `lx` renders one — both are one line there, and giving them here is what lets the real METRICS /
   XMET / VMET / XVMET / metSpec text execute outside a browser. */
function metricWorld() {
  const parts = ['METRICS', 'XMET', 'VMET', 'XVMET'].map((n) => liftConst(MET, n))
    .concat(['metAll', 'metKeys', '_mnorm'].map((n) => liftConst(MET, n)))
    .concat([liftFunction(MET, '_metByName'), liftFunction(MET, 'metSpec')]);
  const body = parts.join('\n') + '\n;return {METRICS,XMET,metSpec,metKeys,metAll};';
  return new Function('LA', 'lx', body)((...a) => a, (arr) => (Array.isArray(arr) ? arr[0] : String(arr)));
}

test('R740 ① every metric IntMap publishes resolves by its key and by its own labels', () => {
  const W = metricWorld();
  const all = W.metAll();
  const keys = Object.keys(all);
  assert.ok(keys.length >= 12, `expected the whole metric set, got ${keys.length}: ${keys.join(',')}`);
  assert.ok(keys.includes('lifeExp') && keys.includes('internet'),
    'lifeExp / internet are implemented in XMET — the set must contain them');
  for (const k of keys) {
    const byKey = W.metSpec(k);
    assert.ok(byKey && byKey.key === k, `metSpec('${k}') must resolve to itself`);
    /* every positional label the record declares is a name the reader may have seen on screen */
    const labels = all[k].label;
    assert.ok(Array.isArray(labels) && labels.length >= 5, `${k} must declare its label in en/jp/de/ru/es`);
    labels.forEach((lbl, i) => {
      const got = W.metSpec(lbl);
      assert.ok(got && got.key === k,
        `${k}: the label IntMap itself prints — ${JSON.stringify(lbl)} (slot ${i}) — must resolve back to ${k}, got ${got && got.key}`);
    });
  }
});

test('R740 ② the map shading asks the one resolver, not half the metric set', () => {
  const body = liftFunction(SRC, 'drawChoro');
  assert.ok(/metSpec\(/.test(body), 'drawChoro must resolve its metric through metSpec');
  assert.ok(!/METRICS\s*\[/.test(body),
    'drawChoro must not index METRICS directly — that is what refused lifeExp while XMET implemented it');
  /* the same for the two analyses that shared the defect */
  for (const fn of ['ratio', 'relate', 'rows']) {
    const b = liftFunction(SRC, fn);
    assert.ok(!/METRICS\s*\[/.test(b) && !/XMET\s*\[/.test(b),
      `${fn}() must reach its metrics through metSpec, not by indexing one of the two tables`);
  }
});

test('R740 ③ a refusal a planner cannot act on is a loop — every one names the valid set', () => {
  /* counted over everything the app ships, not over one file: "written in exactly one place" is a
     claim about the repository, and the place it is written in has already moved once (#R740). */
  const dir = new URL('../js/', import.meta.url);
  const hits = readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.js'))
    /* js/locales/*.js carry the same sentence as a translation KEY — that is the one refusal
       reaching its readers, not a second one that could forget to enumerate. */
    .filter((f) => !String(f).replace(/\\/g, '/').startsWith('locales/'))
    .reduce((a, f) => a + (readFileSync(new URL(String(f).replace(/\\/g, '/'), dir), 'utf8')
      .split("'Unknown metric'").length - 1), 0);   /* Windows' recursive readdir returns `locales\ui.fr.js` */
  assert.equal(hits, 1,
    'the English refusal must be written in exactly one place (unknownMetric, js/atlas-metrics.js); '
    + `found ${hits} — a second copy is a refusal that can forget to enumerate`);
  const body = liftFunction(MET, 'unknownMetric');
  /* ⚠ (#R775) `metNamed()` IS `metKeys()` PLUS EACH RECORD'S OWN LABEL. The refusal has two readers
     and one string — the planner needs the KEY (it is what it must send back) and the reader needs to
     know what any of them means; measured on production, twelve bare identifiers went into the reply
     bubble. The enumeration is still DERIVED from the records, which is what this line is for;
     tests/r775 ③ measures that both halves actually arrive. */
  assert.ok(/met(Keys|Named)\(\)/.test(body),
    'unknownMetric must list the keys it counted, so the planner reads the answer instead of guessing again');
  /* and nothing may still be typing that list out by hand */
  assert.ok(!/pop,\s*density,\s*area,\s*gdp/.test(SRC) && !/pop,\s*density,\s*area,\s*gdp/.test(MET),
    'a hand-written metric-key list is how the catalogue drifted from the records — count it instead');
});

test('R740 ④ the planner catalogue is handed a counted metric list, not a written one', () => {
  const SENTINEL = 'SENTINEL_METRIC_LIST_R740';
  const DOCS = makeAtlasCatalogText({}, { moduleCatalog: () => '', langLine: () => 'English', metricList: () => SENTINEL });
  const t = DOCS.text(['map.choropleth']);
  assert.ok(t.includes(SENTINEL),
    'the choropleth block must interpolate the metric list the console counted');
  assert.ok(!/pop,\s*density,\s*area,\s*gdp/.test(t),
    'the choropleth block must not carry a hand-typed key list beside the counted one');
  /* the neighbouring block used to say "(+ lifeExp, internet)" — one prompt, two answers */
  const all = DOCS.text(null);
  assert.ok(!/\(\+\s*lifeExp,\s*internet\)/.test(all),
    'no block may name extra metric keys the counted list already contains — that contradiction is what the planner read');
});

test('R740 ⑤ the console hands the catalogue its metricList', () => {
  assert.ok(/makeAtlasCatalogText\(HOST,\{[^}]*metricList:/.test(SRC),
    'js/atlas-console.js must pass metricList to makeAtlasCatalogText, or the catalogue falls back to an empty list');
});

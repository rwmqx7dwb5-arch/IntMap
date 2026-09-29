/* The industry web — js/industry-web.js: company revenue / market cap / employees from Wikidata, and the
 * ownership edges between them.
 *
 * (was tests/r213-checks ⑧) THE INDUSTRY WEB INVENTS NOTHING — ESPECIALLY NOT A CURRENCY. The defect was
 * measured on the built site: the panel ranked «Hyundai Mobis $36.02T» above «Toyota $28.40T» because
 * Wikidata holds those revenues in WON and YEN and the panel printed both behind a dollar sign. A unit
 * error is a fabricated number.
 *
 * RUN: the conversion (usdOf) and the ownership line (greatCircle) are lifted out of the module and
 * called. The SPARQL queries are TEXT sent to Wikidata, so their wording is the artefact and is read;
 * the panel binding is DOM. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function liftIndustry(names, expose) {
  const src = read('js/industry-web.js');
  const stmts = [];
  walk.full(acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }), (n) => {
    const hit = (n.type === 'FunctionDeclaration' && names.includes(n.id && n.id.name))
      || (n.type === 'VariableDeclaration' && n.declarations.some((x) => names.includes(x.id && x.id.name)));
    if (hit && !stmts.includes(n)) stmts.push(n);
  });
  return new Function(`${stmts.sort((a, b) => a.start - b.start).map((n) => src.slice(n.start, n.end)).join('\n')}\nreturn (${expose});`)();
}

test('R213 ⑧: revenue carries its own currency, and the ranking says what it converted with', () => {
  /* RUN: conversion is one function, and it refuses rather than assumes */
  const M = liftIndustry(['fx', 'usdOf'], '{ usdOf, set fx(v){ fx=v; } }');
  assert.equal(M.usdOf(5e12, 'KRW'), null, 'no published rate yet → not converted and not ranked');
  M.fx = { rates: { KRW: 1350, JPY: 150 } };
  assert.equal(M.usdOf(5e12, null), null, 'no currency stated → no conversion, rather than an assumed dollar');
  assert.equal(M.usdOf(5e12, 'XAU'), null, 'a currency with no published rate is not converted');
  assert.ok(Math.abs(M.usdOf(135e12, 'KRW') - 1e11) < 1, 'won are divided by the won rate — not printed behind a dollar sign');
  assert.ok(M.usdOf(45e12, 'JPY') > M.usdOf(135e12, 'KRW'), 'and a comparison is made on the converted figure');
  /* the great circle, for the same reason #R212 §6 gave for the 3-D solids */
  const { greatCircle } = liftIndustry(['greatCircle'], '{ greatCircle }');
  const arc = greatCircle({ lng: -100, lat: 60 }, { lng: 100, lat: 60 }, 32);
  assert.ok(Math.max(...arc.map((p) => p[1])) > 75, 'an ownership line follows the great circle over the pole, not a screen-space segment along 60°N');
  const eq = greatCircle({ lng: 0, lat: 0 }, { lng: 90, lat: 0 }, 2);
  assert.ok(Math.abs(eq[1][0] - 45) < 1e-9 && Math.abs(eq[1][1]) < 1e-9, 'and on the equator it is the equator');

  /* ⚠ READ (these halves): the queries are the text Wikidata receives; the panel is DOM */
  const iw = read('js/industry-web.js');
  /* the value node is the only place the unit lives — wdt:/ps: give a bare amount */
  assert.match(iw, /\?c p:\$\{prop\} \?st \. \?st psv:\$\{prop\} \?vn \./, 'a money statement comes through its value node, which is what carries the unit');
  assert.match(iw, /\['rev', 'P2139'\], \['cap', 'P2226'\], \['emp', 'P1128'\]/, 'and revenue / market cap / employees each get their own query');
  assert.match(iw, /wikibase:quantityUnit \?u/, 'the unit is read');
  assert.match(iw, /\?u wdt:P498 \?iso/, 'and resolved to an ISO 4217 code');
  /* ⚠ one property per request — the UNION of the three timed the endpoint out at 65 s (measured) */
  assert.match(iw, /65\.6 s → server timeout/, 'the measurement that forced one-property queries is recorded');
  assert.match(iw, /moneyErr\.push\(kind\)/, 'a refused money query is recorded rather than shown as «no figure»');
  assert.match(iw, /frankfurter/, 'the rates come from the ECB reference series');
  /* the paint ranks on the converted figure and the panel prints the published one */
  assert.match(iw, /rev: n\.revUsd \|\| 0/, 'the circle area is the comparable figure');
  assert.match(iw, /curShort\(n\.rev, n\.revIso\)/, 'the list prints the published figure in its own currency');
  /* every edge is a Wikidata statement — no inferred relationships anywhere */
  assert.match(iw, /wdt:P749\|wdt:P127/, 'edges are parent-organisation / owned-by statements');
  assert.match(iw, /if \(!p\) \{ outside\+\+; continue; \}/, 'an edge whose other end is not on the map is counted, not drawn at an invented place');
  /* one window: legend + picker + selection, bound to its layer row, rendering into the standard legend */
  assert.match(iw, /makePanel\('iw-panel'[\s\S]{0,400}'wp-dl-industry'/, 'the panel is bound to its layer row');
  assert.match(iw, /legendId:\s*'wpindustry'/, 'and it renders into the standard legend, not beside it');
  assert.doesNotMatch(iw, /new maplibregl\.Popup|GE\(\)\.ui\.popup/, 'there is no second, separate popup');
  /* it borrows the layer-family toolkit instead of carrying a second copy */
  assert.match(iw, /window\.IntMapWorld && window\.IntMapWorld\._ui/, 'the panel/row toolkit is handed over by js/world-packs.js');
  /* ══ ⚠⚠⚠ (#R650) THIS ASKED FOR A SPELLING AND WAS CHANGED TO ASK FOR THE FACT: every name a consumer
     destructures from `_ui` is actually published by js/world-packs.js — and the consumers are
     DISCOVERED from js/, so the next file to borrow the toolkit is covered without anybody remembering. */
  const wp = read('js/world-packs.js');
  const pub = /const _ui=\{([^}]*)\};/.exec(wp);
  assert.ok(pub, 'js/world-packs.js still publishes the layer-family toolkit as `_ui`');
  const published = new Set(pub[1].split(',').map((x) => x.trim().split(':')[0].trim()).filter(Boolean));
  const consumers = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js'))
    .map((f) => ['js/' + f, read('js/' + f)]).filter(([, src]) => /IntMapWorld\._ui/.test(src));
  assert.ok(consumers.length >= 3, `only ${consumers.length} file(s) borrow the toolkit — did the sharing stop?`);
  for (const [name, src] of consumers) {
    const d = /const\s*\{([^}]*)\}\s*=\s*W;/.exec(src);
    assert.ok(d, `${name} borrows _ui but does not destructure it`);
    for (const m of d[1].split(',').map((x) => x.trim()).filter(Boolean)) {
      assert.ok(published.has(m), `${name} takes \`${m}\` from the toolkit and js/world-packs.js does not publish it`);
    }
  }
  /* the module is imported after world-packs, which is what makes the line above true at boot */
  const main = read('src/main.js');
  assert.ok(main.indexOf('js/world-packs.js') < main.indexOf('js/industry-web.js'), 'world-packs is imported first');
  assert.match(read('js/app-body.js'), /window\.IntMapModules\.industryWeb\(IM_HOST\);/, 'and the factory is instantiated');
});

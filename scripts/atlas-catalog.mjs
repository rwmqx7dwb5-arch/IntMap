#!/usr/bin/env node
/* ============================================================================
 *  IntMap · AN ACTION THE CATALOGUE DOES NOT DESCRIBE DOES NOT EXIST  (#R278)
 * ----------------------------------------------------------------------------
 *  The user asked Atlas for 「現在地から徒歩一時間で行ける範囲を表示して」 and got a 5 km RADIUS
 *  CIRCLE. Told 「いや半径でごまかすな」, Atlas deleted the circle, emitted a `control` action with an
 *  empty target, and answered: 「実道路ネットワークによる徒歩到達圏（等時間圏）を描画する機能を実行
 *  できないため、半径円で代用せず、今回は表示できません。」
 *
 *  That last sentence was false. js/map-tools.js has drawn real road-network isochrones from
 *  Valhalla/OpenStreetMap since #R86; the tools list has a 🎯 button for it; js/atlas-console.js has
 *  a `case 'isochrone':` that works. The planner simply had never been told the action exists — the
 *  SYS catalogue in js/atlas-console.js lists `radius` (a circle) and does not list `isochrone`. And
 *  the same function states the rule, from #R115 and repeated at #R231:
 *
 *      «an action the catalogue does not describe DOES NOT EXIST for the planner»
 *
 *  The rule was written down. Nothing checked it. Counted mechanically at #R278, SIX capabilities
 *  had a working dispatch case and no catalogue entry — isochrone, optimizeRoute, objects,
 *  slope/aspect, rfCoverage/viewshed and earthReplay. Every one of them was reachable by hand from
 *  the UI and unreachable by asking for it, which is the exact opposite of 「Atlas is the control
 *  plane」. This file is the check that was missing.
 *
 *  WHAT IT DOES. It reads js/atlas-console.js only — no browser, no bundle, ~40 ms:
 *    1. the dispatch: every line of the form `        case 'x': case 'y': …` inside `switch(a.type)`
 *       is ONE capability, whatever number of spellings it answers to;
 *    2. the catalogue: the body of `function SYS()`, which is the prompt the planner is given;
 *    3. a capability is CATALOGUED when at least one of its spellings appears in that body inside
 *       double quotes — i.e. as `"isochrone"`, the way `{"type":"isochrone"…}` is written. Matching a
 *       bare word would have passed on prose ("…reach…", "…Earth Replay…") that tells the model
 *       nothing it can emit, and prose is precisely what was there while the feature was invisible.
 *
 *  WITHDRAWN, NOT MISSING. `monitor` is deliberately absent from the catalogue: #R231 withdrew the
 *  feature 「一旦撤去」 and its dispatch case exists only to answer FEATURE_WITHDRAWN. That is the one
 *  allowed exception, it is named here with its reason, and it is verified to still BE withdrawn —
 *  if the case stops returning FEATURE_WITHDRAWN the exception stops applying and the gate fails.
 *
 *    node scripts/atlas-catalog.mjs            # report every capability and its catalogue status
 *    node scripts/atlas-catalog.mjs --check    # gate (used by npm test and CI)
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'js/atlas-console.js';

/* The only capability allowed to have no catalogue entry, with the reason and the proof required. */
const WITHDRAWN = {
  monitor: {
    why: '#R231 withdrew area monitors 「一旦撤去」 — the case exists only to answer FEATURE_WITHDRAWN',
    proof: /FEATURE_WITHDRAWN/,
  },
};

export function readAtlas() {
  return fs.readFileSync(path.join(ROOT, FILE), 'utf8').split(/\r?\n/);
}

/* The catalogue = the body of `function SYS()`. Brace counting is not safe here (the body is 64 KB
   of prompt text full of `{"type":…}` braces inside string literals), so the end is the first line
   that is exactly the function's closing brace at its own indentation. */
export function catalogueText(lines) {
  const start = lines.findIndex((l) => /^\s*function SYS\((sel)?\)\s*\{/.test(l));
  if (start < 0) throw new Error(`${FILE}: function SYS() not found — the catalogue moved; update scripts/atlas-catalog.mjs`);
  const end = lines.findIndex((l, i) => i > start && /^    \}$/.test(l));
  if (end < 0) throw new Error(`${FILE}: the end of function SYS() was not found`);
  const body = lines.slice(start, end + 1).join('\n');
  /* ⚠ (#R315) THE CATALOGUE LEFT THIS FUNCTION AND THIS GATE HAD TO FOLLOW IT.
     SYS() now composes its action section from the Capability Registry: the 38 topical blocks that
     stood inline are in js/atlas-catalog-text.js, byte for byte, each tagged with the capabilities
     it documents. The question this file asks — "is every dispatch case described to the planner?"
     — is unchanged; WHERE the description lives is not. The blocks are read as TEXT so this stays
     synchronous and so tests/r278 ① can keep feeding it a synthetic file: a fixture with no
     `_DOCS.text(` call gets nothing appended and behaves exactly as it did before.
     ⚠ The richer question — is it EXECUTABLE, OBSERVED and VERIFIED — is
     scripts/atlas-capability-audit.mjs. This one is deliberately still the narrow one. */
  if (!/_DOCS\.text\(/.test(body)) return body;
  let blocks = '';
  try { blocks = fs.readFileSync(path.join(ROOT, 'js/atlas-catalog-text.js'), 'utf8'); }
  catch { throw new Error('js/atlas-catalog-text.js is missing — SYS() composes its catalogue from it'); }
  return body + '\n' + blocks;
}

/* Every capability the dispatch can execute: one entry per `case` line inside switch(a.type). */
export function dispatchCapabilities(lines) {
  const out = [];
  lines.forEach((line, i) => {
    if (!/^ {8}case '/.test(line)) return;
    const names = [...line.matchAll(/case '([A-Za-z_][\w]*)'\s*:/g)].map((m) => m[1]);
    /* `src` is the case line plus the first lines of its body: a one-line case (`case 'monitor':`)
       carries its evidence on the NEXT line, and the withdrawal proof has to be able to see it. */
    if (names.length) out.push({ line: i + 1, names, src: lines.slice(i, i + 4).join('\n') });
  });
  return out;
}

/* auditLines() takes the source as data so tests can prove this gate FAILS on a capability that is
   not catalogued — a green gate that has never been seen to go red is not evidence of anything. */
export function auditLines(lines, { minCaps = 50 } = {}) {
  const sys = catalogueText(lines);
  const caps = dispatchCapabilities(lines);
  if (caps.length < minCaps) throw new Error(`${FILE}: only ${caps.length} dispatch cases found — the switch moved or changed shape; this gate would pass on an empty set`);
  const rows = caps.map((c) => {
    const hit = c.names.find((n) => sys.includes(`"${n}"`)) || null;
    const wd = c.names.map((n) => WITHDRAWN[n]).find(Boolean) || null;
    const withdrawn = !!(wd && wd.proof.test(c.src));
    return { ...c, hit, withdrawn, withdrawnWhy: wd ? wd.why : '' };
  });
  return { rows, missing: rows.filter((r) => !r.hit && !r.withdrawn) };
}

export function audit() { return auditLines(readAtlas()); }

/* CLI only when run directly — tests/r278-checks.test.mjs imports the functions above. */
const IS_MAIN = (() => { try { return path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url); } catch { return false; } })();
if (IS_MAIN) main();

function main() {
const CHECK = process.argv.includes('--check');
const { rows, missing } = audit();

if (!CHECK) {
  for (const r of rows) {
    const mark = r.hit ? `✓ "${r.hit}"` : r.withdrawn ? '· withdrawn' : '✗ NOT CATALOGUED';
    console.log(`  ${String(r.line).padStart(4)}  ${mark.padEnd(22)}  ${r.names.join(' / ')}`);
  }
  console.log(`\n${rows.length} capabilities · ${rows.filter((r) => r.hit).length} catalogued · ${rows.filter((r) => r.withdrawn).length} withdrawn · ${missing.length} invisible to the planner`);
  process.exit(0);
}

if (missing.length) {
  console.error(`\n✗ ${missing.length} capabilit${missing.length === 1 ? 'y is' : 'ies are'} implemented in ${FILE} but INVISIBLE to the Atlas planner:\n`);
  for (const r of missing) console.error(`    ${FILE}:${r.line}   ${r.names.join(' / ')}`);
  console.error(`\n  An action the SYS catalogue does not describe does not exist for the planner (#R115/#R231/#R278):`);
  console.error(`  asked for it, the model substitutes something it HAS been shown (this is how 「徒歩1時間で行ける範囲」`);
  console.error(`  became a radius circle) or answers that IntMap cannot do it. Add a {"type":"<name>",…} entry to`);
  console.error(`  function SYS() in ${FILE} describing what it really does — or, if the feature is being withdrawn,`);
  console.error(`  say so in WITHDRAWN in scripts/atlas-catalog.mjs with the reason.\n`);
  process.exit(1);
}
console.log(`✓ atlas catalogue: all ${rows.length - rows.filter((r) => r.withdrawn).length} live Atlas capabilities are described to the planner` + (rows.some((r) => r.withdrawn) ? ` (${rows.filter((r) => r.withdrawn).map((r) => r.names[0]).join(', ')} withdrawn on purpose)` : ''));
}

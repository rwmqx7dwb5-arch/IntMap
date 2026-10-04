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
 *  WHAT IT DOES. It reads the Atlas kernel's source — no browser, no bundle:
 *    1. the dispatch: every capability entry in js/atlas-cap-<namespace>.js (its dispatch spelling and
 *       its run) is ONE capability. (atlas-capability-modules) These were the `case 'x':` lines of
 *       `switch(a.type)` in js/atlas-console.js; the switch is now one lookup of the same entries;
 *    2. the catalogue: the body of `function SYS()`, which is the prompt the planner is given;
 *    3. a capability is CATALOGUED when at least one of its spellings appears in that body inside
 *       double quotes — i.e. as `"isochrone"`, the way `{"type":"isochrone"…}` is written. Matching a
 *       bare word would have passed on prose ("…reach…", "…Earth Replay…") that tells the model
 *       nothing it can emit, and prose is precisely what was there while the feature was invisible.
 *
 *  WITHDRAWN, NOT MISSING. A capability may be deliberately absent from the catalogue when its feature
 *  is withdrawn and its dispatch case exists only to answer a proof code (the area monitors' `monitor`
 *  was the one such case until the feature was removed outright; none is withdrawn today). That is the
 *  one allowed exception, and it is verified to still BE withdrawn — if the case stops returning its proof
 *  code the exception stops applying and the gate fails. (atlas-capability-single-source) The exception
 *  is the capability's own `policy.withdrawn` ({ why, proofCode }, in its js/atlas-cap-<namespace>.js entry), read through
 *  the registry — it was written here a second time, under a different key, and the two could disagree.
 *
 *    node scripts/atlas-catalog.mjs            # report every capability and its catalogue status
 *    node scripts/atlas-catalog.mjs --check    # gate (used by npm test and CI)
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { dispatchGroups } from './atlas-capability-audit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'js/atlas-console.js';

/* The capabilities allowed to have no catalogue entry, with the reason and the proof required — each one's
   `policy.withdrawn`, as the registry holds it, keyed by its dispatch spelling (what this gate's rows carry). */
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const REGISTRY = (await import(pathToFileURL(path.join(ROOT, 'js/atlas-capabilities.js')).href)).makeAtlasCapabilities({}, { publish: false });
export const WITHDRAWN = Object.fromEntries(REGISTRY.toJSON().capabilities.filter((c) => c.withdrawn).map((c) => {
  const proofCode = REGISTRY.resolve(c.id).withdrawn.proofCode;
  return [c.legacy, { why: c.withdrawn, proof: new RegExp(proofCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }];
}));
/* (atlas-capability-single-source) the catalogue as the planner is given it — ASSEMBLED from the entries' `doc`
   fragments by js/atlas-catalog-text.js — rather than the source text of one file. Read once, here, so
   catalogueText() stays synchronous for the fixtures of tests/atlas-dispatch-checks.test.mjs. */
let CATALOGUE = '';
try { CATALOGUE = (await import(pathToFileURL(path.join(ROOT, 'js/atlas-catalog-text.js')).href)).makeAtlasCatalogText({}, {}).text(null); } catch { CATALOGUE = ''; }

export function readAtlas() {
  return fs.readFileSync(path.join(ROOT, FILE), 'utf8').split(/\r?\n/);
}

/* The catalogue = the body of `function SYS()`. Brace counting is not safe here (the body is 64 KB
   of prompt text full of `{"type":…}` braces inside string literals), so the end is the first line
   that is exactly the function's closing brace at its own indentation. */
export function catalogueText(lines) {
  const start = lines.findIndex((l) => /^\s*function SYS\(\w*\)\s*\{/.test(l));
  if (start < 0) throw new Error(`${FILE}: function SYS() not found — the catalogue moved; update scripts/atlas-catalog.mjs`);
  const end = lines.findIndex((l, i) => i > start && /^    \}$/.test(l));
  if (end < 0) throw new Error(`${FILE}: the end of function SYS() was not found`);
  const body = lines.slice(start, end + 1).join('\n');
  /* ⚠ (#R318) THE CATALOGUE LEFT THIS FUNCTION AND THIS GATE HAD TO FOLLOW IT.
     SYS() now composes its action section from the Capability Registry: the 38 topical blocks that
     stood inline are in js/atlas-catalog-text.js, byte for byte, each tagged with the capabilities
     it documents. The question this file asks — "is every dispatch case described to the planner?"
     — is unchanged; WHERE the description lives is not. The blocks are read as TEXT so this stays
     synchronous and so tests/atlas-dispatch-checks.test.mjs #R278 ① can keep feeding it a synthetic file: a fixture with no
     `_DOCS.text(` call gets nothing appended and behaves exactly as it did before.
     ⚠ The richer question — is it EXECUTABLE, OBSERVED and VERIFIED — is
     scripts/atlas-capability-audit.mjs. This one is deliberately still the narrow one. */
  /* ⚠ (#R406) THE CATALOGUE IS NO LONGER PUSHED — IT IS SERVED, AND THIS GATE FOLLOWED IT AGAIN.
     SYS() used to paste all 64,250 characters into every turn. It now carries the tool surface, and
     js/atlas-toolsurface.js reaches any capability's block through CAPS.catalogText() when Atlas
     calls find_capability. The question this file asks is UNCHANGED — is every dispatch case
     described somewhere Atlas can reach it — so the corpus is SYS() plus the tool surface plus the
     blocks that surface serves. ⚠ Both additions are conditional on the real markers being present,
     so tests/atlas-dispatch-checks.test.mjs #R278 ① keeps feeding it a synthetic file and keeps getting the old behaviour. */
  /* (atlas-legacy-protocol-removal) THE MARKER IS THE INDEX NOW. It was `_toolBlock(`, the tools written out into the
     prompt — which only the retired one-string transport did; the tools travel as the provider's functions
     (js/atlas-toolsurface.js) and SYS() carries `_capIndex(`, the index find_capability serves. */
  let corpus = body;
  if (/_capIndex\(/.test(body)) {
    try { corpus += '\n' + fs.readFileSync(path.join(ROOT, 'js/atlas-toolsurface.js'), 'utf8'); } catch { /* absent in a fixture */ }
  }
  if (!/_DOCS\.text\(/.test(body) && !/_capIndex\(/.test(body)) return corpus;
  if (!CATALOGUE) throw new Error('js/atlas-catalog-text.js could not be assembled — SYS() composes its catalogue from it');
  return corpus + '\n' + CATALOGUE;
}

/* Every capability the dispatch can execute: one per capability entry in js/atlas-cap-<namespace>.js —
   { line, names: [its dispatch spelling], src: what the dispatch runs for it }. (atlas-capability-modules)
   These were the `case` lines of switch(a.type) in js/atlas-console.js; the switch is now one lookup of
   the same entries, so this reads what that lookup reads (scripts/atlas-capability-audit.mjs dispatchGroups).
   `src` is the whole run, so a withdrawal proof can see what the capability answers. */
export function dispatchCapabilities() {
  return dispatchGroups().map((g) => ({ line: g.line, names: g.names.slice(), src: g.src }));
}

/* auditLines() takes the source as data so tests can prove this gate FAILS on a capability that is
   not catalogued — a green gate that has never been seen to go red is not evidence of anything. */
export function auditLines(lines, { minCaps = 50, caps = dispatchCapabilities() } = {}) {
  const sys = catalogueText(lines);
  /* `caps` is DATA too (default: the entries), so a fixture can hand the gate a capability that is not catalogued */
  if (caps.length < minCaps) throw new Error(`js/atlas-cap-*.js: only ${caps.length} dispatch cases found — the entries moved or changed shape; this gate would pass on an empty set`);
  const rows = caps.map((c) => {
    const hit = c.names.find((n) => sys.includes(`"${n}"`)) || null;
    const wd = c.names.map((n) => WITHDRAWN[n]).find(Boolean) || null;
    const withdrawn = !!(wd && wd.proof.test(c.src));
    return { ...c, hit, withdrawn, withdrawnWhy: wd ? wd.why : '' };
  });
  return { rows, missing: rows.filter((r) => !r.hit && !r.withdrawn) };
}

export function audit() { return auditLines(readAtlas()); }

/* CLI only when run directly — tests/atlas-dispatch-checks.test.mjs (#R278) imports the functions above. */
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
  console.error(`  became a radius circle) or answers that IntMap cannot do it. Give its entry in js/atlas-cap-<namespace>.js`);
  console.error(`  a \`doc\` fragment ({ in: <chunk>, text: '{"type":"<name>",…} …' }) describing what it really does — or, if it is being withdrawn,`);
  console.error(`  say so in its entry's policy.withdrawn ({ why, proofCode }) with the reason.\n`);
  process.exit(1);
}
console.log(`✓ atlas catalogue: all ${rows.length - rows.filter((r) => r.withdrawn).length} live Atlas capabilities are described to the planner` + (rows.some((r) => r.withdrawn) ? ` (${rows.filter((r) => r.withdrawn).map((r) => r.names[0]).join(', ')} withdrawn on purpose)` : ''));
}

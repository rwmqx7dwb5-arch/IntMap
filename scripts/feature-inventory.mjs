/* ============================================================================
 *  IntMap · THE FEATURE INVENTORY — one row per capability, derived, never hand-kept   (feature-inventory)
 * ----------------------------------------------------------------------------
 *  「機能が増えすぎて全容把握が私にも不可能になってる」 (2026-11-16). The registry already lists what IntMap can
 *  do — 224 capabilities in js/atlas-cap-*.js — but it answered only «can Atlas do it?». A reader who never opens
 *  Atlas (signed out, Atlas needs an account) reaches a capability only if a control on the page does the same act.
 *  This prints, per capability, what is KNOWN about the ways to it, and says «unknown» where nothing was measured:
 *
 *      screen     the entry's `ui` (js/atlas-caps.js): a control / signed-in only / none (measured on a date) / UNKNOWN
 *      tests      how many files under tests/ name the capability's id — a test that NAMES it, not one that passed
 *      production UNKNOWN for every row: no per-capability production record exists (the receipt of
 *                 `node scripts/worktree.mjs verified` is per commit). The column stays until one does.
 *
 *  It adds no registry and no ledger: every column is read from what already exists. A declared control is checked
 *  to be BUILT by `npm run check:capabilities` (㉔ ui-entry-built); that a reader can SEE it is not measured here.
 *
 *      node scripts/feature-inventory.mjs           the table and the totals
 *      node scripts/feature-inventory.mjs --md      the same as a Markdown table
 *      node scripts/feature-inventory.mjs --json    the rows
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEntries } from './atlas-caps.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function testFiles(dir = path.join(ROOT, 'tests')) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return testFiles(p);
    return /\.(m?js|ts)$/.test(e.name) ? [p] : [];
  });
}

/** the rows — DATA in (entries, the test sources), so a fixture can hand it either */
export function inventory(entries, tests) {
  return entries.filter((e) => !(e.policy && e.policy.withdrawn)).map((e) => {
    const u = e.ui;
    const screen = !u ? 'unknown' : u.none ? 'none' : u.login ? 'login' : 'yes';
    const needle = [`'${e.id}'`, `"${e.id}"`, '`' + e.id + '`'];
    const named = tests.filter((t) => needle.some((n) => t.src.includes(n))).length;
    return { id: e.id, category: e.row[3], screen, at: u && u.at ? u.at : u && u.key ? ['key ' + u.key] : [], measured: u && u.none ? u.none : '', tests: named, production: 'unknown' };
  });
}

export function totals(rows) {
  const t = { all: rows.length, yes: 0, login: 0, none: 0, unknown: 0, untested: 0 };
  rows.forEach((r) => { t[r.screen]++; if (!r.tests) t.untested++; });
  return t;
}

const SCREEN = { yes: '画面にあり', login: 'ログイン時のみ', none: 'Atlas のみ', unknown: '不明（未測定）' };

const IS_MAIN = (() => { try { return path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url); } catch { return false; } })();
if (IS_MAIN) {
  const tests = testFiles().map((f) => ({ file: f, src: fs.readFileSync(f, 'utf8') }));
  const rows = inventory(await loadEntries(ROOT), tests);
  const t = totals(rows);
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ totals: t, rows }, null, 2)); process.exit(0); }
  const md = process.argv.includes('--md');
  const cells = (r) => [r.id, r.category, SCREEN[r.screen] + (r.measured ? ` ${r.measured}` : ''), r.at.join(' '), r.tests ? String(r.tests) : 'なし', '不明'];
  const head = ['能力', '分類', '画面の入口', '入口の要素', '名指す検査', '本番検証'];
  if (md) {
    console.log('| ' + head.join(' | ') + ' |\n|' + head.map(() => '---').join('|') + '|');
    rows.forEach((r) => console.log('| ' + cells(r).map((c) => c.replace(/[\\|]/g, '\\$&')).join(' | ') + ' |'));
  } else {
    rows.forEach((r) => console.log(cells(r).join('\t')));
  }
  const pct = (n) => (100 * n / t.all).toFixed(0) + '%';
  console.log(`\n${t.all} capabilities: 画面にあり ${t.yes} (${pct(t.yes)}) · ログイン時のみ ${t.login} (${pct(t.login)}) · Atlas のみ ${t.none} (${pct(t.none)}) · 不明 ${t.unknown} (${pct(t.unknown)})`);
  console.log(`名指す検査なし ${t.untested} · 本番検証: 能力ごとの記録は無い（全行 不明）`);
}

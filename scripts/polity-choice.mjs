/* ============================================================================
 *  IntMap · scripts/polity-choice.mjs — WHICH POLITIES GET A PAGE, and where they live   (polity-pages)
 * ----------------------------------------------------------------------------
 *  The addresses scripts/polity-pages.mjs writes, split out so scripts/history-pages.mjs (the sitemap index, the hub's
 *  link) and scripts/year-pages.mjs (each name's link) can ask them with a STATIC import. ⚠ It imports nothing from the
 *  page generators: with polity-pages importing history-pages and year-pages and those two importing it back, vite's
 *  bundled config loader exited 0 having written nothing (measured 2026-10-13 — the shape scripts/year-choice.mjs records).
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe } from '../js/polity-arc.js';
import { slugOf } from './year-choice.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const POLITY_HUB = 'history/polities/';
export const POLITY_SITEMAP = 'sitemap-polities.xml';
const ARCS = 'data/polity-arcs.json';

/* ══ ADDRESSES ═════════════════════════════════════════════════════════════════════════════════════
   A page's address is its English name, folded to ASCII: what a reader would type and what a search engine reads in a
   result («history/polities/mongol-empire/»). NFKD takes the accents off (Göktürk → gokturk); the letters NFKD does not
   decompose are folded by the transliteration their languages' own romanisations use (Đại Việt → dai-viet). A name whose
   fold is empty (a name in a script with no Latin fold, «ອານາຈັກຈຳປາສັກ») or is shared with another polity's fold
   («Denmark–Norway» and «Denmark-Norway», «Han» and «Hán») carries its Wikidata item, else the year the map first draws
   it — read from the polity's own record, so an address never depends on the order the index lists them in. */
const FOLD = { 'đ': 'd', 'ð': 'd', 'ø': 'o', 'ł': 'l', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'þ': 'th', 'ħ': 'h', 'ı': 'i', 'ŀ': 'l', 'ŧ': 't' };
export function slugBase(name) {
  return String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[đðøłßæœþħıŀŧ]/g, (c) => FOLD[c]).replace(/['’‘`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
/** every dated polity → its address segment, unique over the whole index (throws when the rule cannot make one) */
export function assignSlugs(idx, arcs) {
  const base = new Map(arcs.map((a) => [a, slugBase(a.n)]));
  const count = new Map();
  for (const s of base.values()) count.set(s, (count.get(s) || 0) + 1);
  const out = new Map(), seen = new Map();
  for (const a of arcs) {
    let s = base.get(a);
    if (!s || count.get(s) > 1) {
      const D = describe(idx, a);
      const tag = a.q && a.q.length ? a.q[0].toLowerCase() : 'from-' + slugOf(D.first.y);
      s = s ? s + '-' + tag : 'polity-' + tag;   /* a name with no Latin fold is still a polity's address */
    }
    if (seen.has(s)) throw new Error('polity-pages: two polities fold to the address «' + s + '» (' + seen.get(s) + ', ' + a.n + ')');
    seen.set(s, a.n); out.set(a, s);
  }
  return out;
}

export const readIndex = () => JSON.parse(readFileSync(join(ROOT, ARCS), 'utf8'));

/** Vite plugin: write the polity pages into dist/ after the year pages they link, before the site URL is filled in — by running
 *  scripts/polity-pages.mjs in a child process, for the reason scripts/history-pages.mjs gives (the map's code installs a
 *  browser's globals on the process it runs in). It lives here, not in polity-pages.mjs, so vite.config.js imports no more of
 *  the generators' graph than before: importing polity-pages there (which imports year-pages and on-this-day-pages first)
 *  changed the order the generators' existing import cycle evaluates in, and vite's bundled config loader exited 0 having
 *  written nothing (measured 2026-10-13). */
export function polityPagesPlugin() {
  let outDir = null;
  return {
    name: 'intmap-polity-pages',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    closeBundle: { sequential: true, async handler() {
      const { execFile } = await import('node:child_process');
      await new Promise((ok, fail) => execFile(process.execPath, [join(ROOT, 'scripts', 'polity-pages.mjs'), '--out', outDir],
        { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
          if (stdout) process.stdout.write(stdout);
          if (err) { fail(new Error('polity-pages failed: ' + (stderr || err.message))); return; }
          ok();
        }));
    } },
  };
}

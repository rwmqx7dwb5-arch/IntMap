/* ============================================================================
 *  IntMap · the phone/desktop boundary and the safe area, each written once   (ui-layer-owner)
 * ----------------------------------------------------------------------------
 *  MEASURED 2026-09-30 (code only): js/ wrote the layout boundary out 63 times in 37 files beside
 *  `MOBILE_MQ` in js/app-body.js; css/intmap.css drew it at 768/769 in 24 blocks and at 767/768 in
 *  six, so a viewport exactly 768 px wide was «phone» to the script and «desktop» to six rules;
 *  and `env(safe-area-inset-*)` was written 141 times outside comments (24 in the stylesheet, 117 in fourteen js/
 *  files), with and without a fallback. The owners are js/ui-device.js (`COMPACT`, `media()`,
 *  `compact()`) and the `--safe-*` custom properties of css/intmap.css :root. This holds them:
 *
 *    · ONE BOUNDARY (hard) — no `max-width:767px` and no `min-width:768px` anywhere in css/*.css or
 *      in the CSS strings js/ builds; the phone layout is `max-width:768px`, the other side 769.
 *    · BREAKPOINTS (ratchet) — per js/ file, the layout boundary written as a number: a
 *      `(max|min-width:76[789]px)` query or an `innerWidth` compared with 767–769, code only.
 *      js/ui-device.js is the owner and is not counted.
 *    · SAFE AREA (ratchet) — per file over css/, js/ and the root *.html, `env(safe-area-inset-*)`
 *      written anywhere but the four `--safe-*` declarations of css/intmap.css.
 *  Both ratchets go both ways (a rise is a new copy; a fall must be written down with --update), and
 *  a file left above zero must carry a sentence in the ledger's `why` saying why it cannot read the
 *  owner — the same contract scripts/z-layers.mjs holds for bare z-index numbers.
 *
 *      node scripts/ui-owners.mjs            report
 *      node scripts/ui-owners.mjs --check    compare with the ledger (exit 1 on any difference)
 *      node scripts/ui-owners.mjs --update   rewrite the counts (the `why` sentences are kept)
 *  scripts/static-checks.mjs runs the comparison as its `ui-owners` rule.
 * ==========================================================================*/
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from './code-only.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
export const LEDGER = join(ROOT, 'tests', 'ui-owners-baseline.json');
export const OWNER = 'js/ui-device.js';

/* the two spellings of «the other side of the boundary» that disagree with 768 at exactly 768 px */
const SPLIT = /\(\s*(?:max-width\s*:\s*767px|min-width\s*:\s*768px)\s*\)/g;
/* the boundary written as a number in js/ — a query, or the viewport width compared with it */
const BREAK = [
  /\(\s*(?:max|min)-width\s*:\s*76[789]px\s*\)/g,
  /innerWidth\s*[<>]=?\s*76[789](?!\d)/g,
  /(?<!\d)76[789]\s*[<>]=?\s*(?:window\.)?innerWidth/g,
];
const SAFE = /env\(\s*safe-area-inset-/g;
/* the one place the safe area is allowed to be read from the platform */
const SAFE_DEF = /--safe-(?:top|right|bottom|left)\s*:\s*env\(\s*safe-area-inset-/g;

const count = (res, text) => { let n = 0; for (const re of [].concat(res)) { re.lastIndex = 0; while (re.exec(text)) n++; } return n; };
export function countSplit(text) { return count(SPLIT, text); }
export function countBreakpoints(text) { return count(BREAK, text); }
export function countSafeArea(text) { return count(SAFE, text) - count(SAFE_DEF, text); }

function walkJs(dir, out) {
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walkJs(p, out); else if (f.endsWith('.js')) out.push(p);
  }
  return out;
}
/** [{ path, text }] — code only: a comment that quotes a query is not a query */
function sources(root) {
  const R = root || ROOT, out = [];
  const rel = (p) => p.slice(R.length + 1).replace(/\\/g, '/');
  for (const f of readdirSync(join(R, 'css')).filter((x) => x.endsWith('.css')).sort()) {
    const p = join(R, 'css', f); out.push({ path: rel(p), kind: 'css', text: codeOnly(readFileSync(p, 'utf8'), { lang: 'css' }) });
  }
  for (const p of walkJs(join(R, 'js'), [])) {
    let text;
    try { text = codeOnly(readFileSync(p, 'utf8'), { parser: 'acorn' }); } catch (_) { throw new Error('ui-owners: cannot parse ' + rel(p)); }
    out.push({ path: rel(p), kind: 'js', text });
  }
  for (const f of readdirSync(R).filter((x) => x.endsWith('.html')).sort()) {
    const p = join(R, f);
    out.push({ path: rel(p), kind: 'html', text: codeOnly(codeOnly(readFileSync(p, 'utf8'), { lang: 'html' }), { lang: 'css' }) });
  }
  return out;
}

/** { split: {path:n}, breakpoints: {path:n}, safeArea: {path:n} } — files with none are absent */
export function measure(root) {
  const split = {}, breakpoints = {}, safeArea = {};
  for (const s of sources(root)) {
    const a = countSplit(s.text); if (a) split[s.path] = a;
    if (s.kind === 'js' && s.path !== OWNER) { const b = countBreakpoints(s.text); if (b) breakpoints[s.path] = b; }
    const c = countSafeArea(s.text); if (c) safeArea[s.path] = c;
  }
  return { split, breakpoints, safeArea };
}

const total = (m) => Object.values(m).reduce((a, b) => a + b, 0);

export function check(root, ledgerPath) {
  const P = ledgerPath || LEDGER, lines = [];
  if (!existsSync(P)) return { ok: false, lines: [`no ledger at ${P} — run: node scripts/ui-owners.mjs --update`] };
  const was = JSON.parse(readFileSync(P, 'utf8'));
  const now = measure(root);
  for (const [f, n] of Object.entries(now.split))
    lines.push(`${f}: ${n} phone/desktop boundary query written at 767/768 — the boundary is max-width:768px / min-width:769px (js/ui-device.js COMPACT / WIDE); at exactly 768 px this rule and the script disagree`);
  const why = was.why || {};
  const ratchet = (key, noun, fix) => {
    const wl = was[key] || {}, nl = now[key];
    for (const f of Array.from(new Set([...Object.keys(wl), ...Object.keys(nl)])).sort()) {
      const a = wl[f] || 0, b = nl[f] || 0;
      if (b > a) lines.push(`${f}: ${b} ${noun}, ledger allows ${a} — ${fix}`);
      else if (b < a) lines.push(`${f}: ${b} ${noun}, ledger still says ${a} — lower the ledger: node scripts/ui-owners.mjs --update`);
      if (b > 0 && !(typeof why[f] === 'string' && why[f].trim().length > 20))
        lines.push(`${f}: still has ${noun} and the ledger does not say why it cannot read the owner — write one sentence under "why" in tests/ui-owners-baseline.json`);
    }
  };
  ratchet('breakpoints', 'layout boundary(ies) written as a number', "ask window.IntMapDevice.compact(), or build injected CSS with IntMapDevice.media() / '@media'+IntMapDevice.COMPACT");
  ratchet('safeArea', 'env(safe-area-inset-*) read(s) outside :root', 'read var(--safe-top|right|bottom|left) from css/intmap.css :root');
  for (const f of Object.keys(why)) {
    if (!(now.breakpoints[f] || now.safeArea[f])) lines.push(`${f}: the ledger explains a copy this file no longer has — delete its "why" (node scripts/ui-owners.mjs --update does)`);
  }
  return { ok: lines.length === 0, lines, now };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv[2] || '';
  if (arg === '--update') {
    const now = measure();
    const was = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : {};
    const why = {};
    for (const [f, s] of Object.entries(was.why || {})) if (now.breakpoints[f] || now.safeArea[f]) why[f] = s;
    writeFileSync(LEDGER, JSON.stringify({
      '//': 'written by scripts/ui-owners.mjs --update — per file, the phone/desktop boundary written as a number in js/ and env(safe-area-inset-*) read outside css/intmap.css :root (both ratcheted both ways); every file above zero says why under "why" (kept by --update, written by hand); held by check:static',
      breakpoints: now.breakpoints, safeArea: now.safeArea, why,
    }, null, 1) + '\n');
    console.log(`ui-owners: ledger written — ${total(now.breakpoints)} breakpoint copies, ${total(now.safeArea)} safe-area reads outside :root`);
  } else if (arg === '--check') {
    const r = check();
    r.lines.forEach((l) => console.log('  · ' + l));
    console.log(r.ok ? `ui-owners: ${total(r.now.breakpoints)} breakpoint copies and ${total(r.now.safeArea)} safe-area reads outside the owners, as the ledger says` : 'ui-owners: FAILED');
    process.exit(r.ok ? 0 : 1);
  } else {
    console.log(JSON.stringify(measure(), null, 1));
  }
}

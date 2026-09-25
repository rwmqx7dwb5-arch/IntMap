/* ============================================================================
 *  IntMap · scripts/layer-manifest-extract.mjs — the Layers list, read off the running app
 * ----------------------------------------------------------------------------
 *  The migration tool that produced js/layer-manifest.js. Before it, the list of layers existed only
 *  as DOM: ten rows in index.html and ~150 more appended to `#layer-dropdown` by twenty modules'
 *  `buildUI()` at 900 ms or later, then filed onto shelves by `reorganizeLayerPanel` from the GROUPS
 *  literal in js/data-layers.js. No file said what the list WAS, so the list could not be copied out
 *  of the source by reading it — it had to be read where it existed, in the booted document.
 *
 *  This boots the built app (dist/) in Chromium, lets every row builder run, and records for every
 *  checkbox in `#layer-dropdown`: its id, its `data-layer`, its row, the shelf heading above it, the
 *  「その他N件」 mark, the i18n key of its name, whether it is ticked on a fresh boot, whether the
 *  share link carries it, and — by switching it on and watching `IntMapLazy.need` — which on-demand
 *  module its body lives in. Nothing is typed in by hand.
 *
 *      npm run build                                   (from the tree BEFORE the migration)
 *      node scripts/layer-manifest-extract.mjs --rev <c> --out a.json            read the live document
 *      node scripts/layer-manifest-extract.mjs --rev <c> --lazy --out b.json     …and measure the lazy links
 *      node scripts/layer-manifest-extract.mjs --rev <c> --write --from a.json --lazy-from b.json
 *                                                      write the SHELVES block of js/layer-manifest.js
 *  `<c>` is the commit before layer-manifest (b85cb6ee): after it, the GROUPS literal and the markup rows this
 *  reads no longer exist — they are the manifest.
 *
 *  ⚠ IT IS A MIGRATION RECORD, NOT A GATE. After the manifest exists it is the source of truth and
 *  the document is generated from it; the spec tests/layer-manifest.spec.js is what holds the
 *  two equal. Run this again only to re-derive the manifest from a document you trust.
 * ==========================================================================*/
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : null);
/* ⚠ THE SOURCES IT READS ARE THE ONES BEFORE THE MIGRATION. After layer-manifest the GROUPS literal and the ten
   markup rows are gone (they ARE the manifest), so re-deriving means reading them at the commit before
   it: `--rev <commit>` (the parent of the layer-manifest commit), with a dist/ built from that same commit. */
const REV = arg('--rev');
const srcAt = (p) => (REV ? execFileSync('git', ['show', REV + ':' + p], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }) : readFileSync(join(ROOT, p), 'utf8'));
/* a `const NAME=[…]` literal of that source, evaluated (GROUPS and OTHERS_IDS are plain data) */
function literalOf(src, needle) {
  const start = src.indexOf(needle);
  if (start < 0) throw new Error('no ' + needle + ' in js/data-layers.js' + (REV ? '@' + REV : '') + ' — pass --rev <the commit before layer-manifest>');
  const from = src.indexOf('[', start); let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (!depth) return (0, eval)('(' + src.slice(from, i + 1) + ')'); }
  }
  throw new Error('unbalanced ' + needle);
}

/* ══ --write: turn a reading (and, optionally, a --lazy reading) into the SHELVES of js/layer-manifest.js ══
   The shelf order, the order inside each shelf and the 「その他N件」 marks are what the document showed;
   the comments that explained each shelf are carried over VERBATIM from the GROUPS literal they sat in
   (js/data-layers.js before layer-manifest) and from index.html, so the history of every move travels with it.
      node scripts/layer-manifest-extract.mjs --write --from <reading.json> [--lazy-from <lazy.json>] */
if (argv.includes('--write')) {
  const facts = JSON.parse(readFileSync(arg('--from'), 'utf8'));
  const lazyById = new Map();
  if (arg('--lazy-from')) for (const r of JSON.parse(readFileSync(arg('--lazy-from'), 'utf8')).rows) lazyById.set(r.id, r.lazy || []);
  const DL = srcAt('js/data-layers.js').split(/\r?\n/);
  const HTML = srcAt('index.html').replace(/\r\n/g, '\n');
  /* the shelf lines of the GROUPS literal, and the comment text around each */
  const g0 = DL.findIndex((l) => /const GROUPS=\[/.test(l));
  const g1 = DL.findIndex((l, i) => i > g0 && /^\s*\];\s*$/.test(l));
  const t0 = DL.findIndex((l, i) => i < g0 && /window\.reorganizeLayerPanel=function/.test(l)) + 3;   /* after `try{` */
  const oth = DL.findIndex((l) => /const OTHERS_IDS=\[/.test(l));
  const dedent = (lines, n) => lines.map((l) => (l.trim() ? l.replace(new RegExp('^ {0,' + n + '}'), '  ') : '')).join('\n');
  const shelfCom = new Map(); let lead = [];
  for (let i = g0 + 1; i < g1; i++) {
    const m = /^\s*\['(lyrGrp\w+)',\[[^\]]*\],\d+\],?(.*)$/.exec(DL[i]);
    if (!m) { lead.push(DL[i]); continue; }
    shelfCom.set(m[1], { lead: lead.slice(), trail: m[2].trim() }); lead = [];
  }
  const tailOfGroups = lead;   /* comments after the last shelf line */
  const betaCom = DL.slice(g1 + 1, oth).concat([DL[oth].slice(DL[oth].indexOf('/*'))]);
  const preamble = DL.slice(t0, g0);
  /* index.html's own notes on its rows: the `<!-- … -->` immediately above a generated row */
  const htmlNote = (id) => {
    const at = HTML.indexOf('id="' + id + '"'); if (at < 0) return null;
    const lineStart = HTML.lastIndexOf('<label', at);
    const before = HTML.slice(0, lineStart).replace(/\s+$/, '');
    if (!before.endsWith('-->')) return null;
    const c0 = before.lastIndexOf('<!--');
    const between = before.slice(before.lastIndexOf('</label>') + 8);
    if (between.indexOf('<!--') < 0) return null;
    return before.slice(c0 + 4, before.length - 3).split('\n').map((l) => l.replace(/^\s{0,14}/, '     ')).join('\n').replace(/^\s*/, '');
  };
  const htmlIds = new Set([...HTML.matchAll(/<input type="checkbox" id="([^"]+)"/g)].map((m) => m[1]));
  const rows = facts.rows.filter((r) => r.primary && r.id && !r.section);
  const shelfOf = (r) => (r.hidden ? 'hidden' : (r.shelf || 'base'));
  const order = [];   /* shelves in panel order, as the document showed them */
  const byShelf = new Map();
  for (const r of rows) { const s = shelfOf(r); if (!byShelf.has(s)) { byShelf.set(s, []); if (s !== 'hidden') order.push(s); } byShelf.get(s).push(r); }
  /* the empty shelves keep their keys (saved sessions and links can name them) — in GROUPS order */
  const allKeys = [...shelfCom.keys()];
  const panel = ['base'].concat(allKeys.filter((k) => true), ['lyrGrpOthers', 'hidden']);
  for (const k of order) if (panel.indexOf(k) < 0) throw new Error('shelf ' + k + ' is not in GROUPS');
  /* the base rows in the order the panel shows them (IntMapBasicLayerRows, then the two .lyr-row switches) */
  const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  const ent = (r) => {
    const f = ['id: ' + q(r.id)];
    if (r.key) f.push('key: ' + q(r.key));
    if (r.i18n) f.push('label: ' + q(r.i18n));
    if (r.rest) f.push('rest: true');
    if (r.defaultOn) f.push('on: true');
    if (r.share) f.push('share: true');
    if (htmlIds.has(r.id)) f.push('html: true');
    const lz = lazyById.get(r.id); if (lz && lz.length) f.push('lazy: [' + lz.map(q).join(', ') + ']');
    return '{ ' + f.join(', ') + ' }';
  };
  let out = '';
  out += '/* The taxonomy — which shelf, in which order — as js/data-layers.js explained it inside reorganizeLayerPanel\n   until layer-manifest moved the data here. Carried over verbatim: */\n';
  out += dedent(preamble, 8) + '\n';
  out += 'export const SHELVES = [\n';
  for (const k of panel) {
    const list = (byShelf.get(k) || []).slice();
    if (k === 'base') list.sort((a, b) => (a.basic === b.basic ? a.i - b.i : (a.basic ? -1 : 1)));   /* the panel's order: IntMapBasicLayerRows, then the switches that are rows */
    const c = shelfCom.get(k);
    if (c && c.lead.length) out += dedent(c.lead, 8) + '\n';
    if (k === 'lyrGrpOthers') out += '  /* ⚠ BETA — the rows no curated shelf claims. Listed here so every reader knows them; a row this file\n     does not list still lands here through the safety sweep. The notes that stood beside the old\n     OTHERS_IDS list: */\n' + dedent(betaCom, 8) + '\n';
    if (k === 'base') out += '  /* the always-on switches at the top of the panel (#R309: IntMapBasicLayerRows + the day/night\n     shading and 3-D buildings rows). The `html` rows were markup in index.html until layer-manifest; the notes\n     that stood above them there are carried below verbatim.\n     ⚠ (layer-manifest) #R476\'s 「the tick and the id in IntMapDefaultOn are ONE edit」 is now ONE FIELD: `on`\n     ticks the generated box AND puts the id in window.IntMapDefaultOn, so the two cannot disagree. */\n';
    if (k === 'hidden') out += '  /* (#R469) rows that keep their checkbox in the registry and are never shown as a row */\n';
    out += '  { key: ' + q(k) + ', layers: [' + (c && c.trail ? '   ' + c.trail : '') + '\n';
    for (const r of list) {
      const n = htmlIds.has(r.id) ? htmlNote(r.id) : null;
      if (n) out += '    /* ' + n.replace(/\*\//g, '*\\/') + ' */\n';
      out += '    ' + ent(r) + ',\n';
    }
    out += '  ] },\n';
    if (k === 'lyrGrpOthersReal' && tailOfGroups.length) out += dedent(tailOfGroups, 8) + '\n';
  }
  out += '];\n';
  const MF = join(ROOT, 'js', 'layer-manifest.js');
  const src = readFileSync(MF, 'utf8');
  const a = src.indexOf('/* ── BEGIN SHELVES'), b = src.indexOf('/* ── END SHELVES ── */');
  const head = src.slice(0, src.indexOf('\n', a) + 1);
  writeFileSync(MF, head + out + src.slice(b));
  console.log('wrote', rows.length, 'layers on', panel.length, 'shelves →', MF);
  process.exit(0);
}

const OUT = arg('--out');
const LAZY = argv.includes('--lazy');
if (!OUT) { console.error('usage: [--rev <commit>] --out <file.json> [--lazy]   |   [--rev <commit>] --write --from <file.json> [--lazy-from <file.json>]'); process.exit(2); }

/* a private port, read back off the server's own ready line (scripts/serve.mjs `--port 0`) */
function serve() {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, [join(ROOT, 'scripts', 'serve.mjs'), '--port', '0', '--root', join(ROOT, 'dist')], { stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = '';
    p.stdout.on('data', (d) => { buf += d; const m = /127\.0\.0\.1:(\d+)/.exec(buf); if (m) res({ p, port: +m[1] }); });
    p.on('exit', (c) => rej(new Error('serve exited ' + c)));
  });
}

const { p: server, port } = await serve();
const BASE = `http://127.0.0.1:${port}`;
const browser = await chromium.launch();
/* the suite's own seed (tests/helpers/session-seed.js): the base map on, nothing else, no launch screen */
const CTX_OPTS = { viewport: { width: 1400, height: 900 }, locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block',
  storageState: { cookies: [], origins: [{ origin: BASE, localStorage: [{ name: 'intmap_session2', value: '{"v":2,"defv":190,"layers":["cb-names","cb-geolabels","cb-poi","cb-borders","cb-admin1","cb-roads","cb-rail2"],"lsrOpen":false}' }] }] } };
async function bootInto(page) {
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap && typeof window.reorganizeLayerPanel === 'function', null, { timeout: 90000 });
  /* every builder has run when the number of boxes has stopped moving for 4 s */
  await page.evaluate(() => new Promise((res) => {
    let last = -1, since = Date.now();
    const t = setInterval(() => {
      const n = document.querySelectorAll('#layer-dropdown input[type=checkbox]').length;
      if (n !== last) { last = n; since = Date.now(); }
      else if (Date.now() - since > 4000) { clearInterval(t); res(); }
    }, 250);
  }));
}
try {
  const ctx = await browser.newContext(CTX_OPTS);
  const page = await ctx.newPage();
  await bootInto(page);

  const SRC_DL = srcAt('js/data-layers.js').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const GROUPS = literalOf(SRC_DL, 'const GROUPS=');
  const OTHERS_IDS = literalOf(SRC_DL, 'const OTHERS_IDS=');
  /* …and the keys reorganizeLayerPanel resolves by name outside GROUPS (`rowFor('nightside')` …) */
  const EXTRA = [...SRC_DL.matchAll(/rowFor\('([\w-]+)'\)/g)].map((m) => m[1]);
  const facts = await page.evaluate(({ GROUPS, OTHERS_IDS, EXTRA }) => {
    window.reorganizeLayerPanel();
    const dd = document.getElementById('layer-dropdown');
    /* reorganizeLayerPanel's own resolver, verbatim — the key→row mapping it used is what is being recorded */
    const rowFor = (id) => { let el = document.getElementById('lyrrow-' + id); if (el) return el;
      el = document.getElementById('eco-dl-' + id) || document.getElementById('l9-dl-' + id) || document.getElementById('beta-dl-' + id) || document.getElementById('wp-dl-' + id) || document.getElementById('fac-dl-' + id) || document.getElementById('ox-' + id); if (el) return el.closest('.lyr-row') || el.closest('label');
      el = dd.querySelector('input[data-layer="' + id + '"]'); if (el) return el.closest('.lyr-row') || el.closest('label');
      return null; };
    const keyOfRow = new Map();
    GROUPS.forEach(([, ids]) => ids.forEach((id) => { const r = rowFor(id); if (r && !keyOfRow.has(r)) keyOfRow.set(r, id); }));
    OTHERS_IDS.concat(EXTRA).forEach((id) => { const r = rowFor(id); if (r && !keyOfRow.has(r)) keyOfRow.set(r, id); });
    const DATASEL = 'input[id^="dl-"], input[id^="gx-"], input[id^="eco-dl-"], input[id^="l9-dl-"], input[id^="beta-dl-"], input[id^="wp-dl-"], #r7-dl-disputes, #r7-dl-airdef, #r7-dl-langs';
    const topOf = (el) => { while (el && el.parentElement !== dd) el = el.parentElement; return el; };
    const section = (el) => (el.closest('#layer-active-section') && 'active') || (el.closest('#layer-fav-section') && 'fav')
      || (el.closest('#layer-search-wrap') && 'search') || (el.closest('#layer-tools') && 'tools') || null;
    const out = [];
    dd.querySelectorAll('input[type=checkbox]').forEach((cb, i) => {
      const row = cb.closest('.lyr-row') || cb.closest('label');
      const lab = cb.closest('label');
      const first = row && row.querySelector('input[type=checkbox]');
      const top = topOf(cb);
      let shelf = null;
      for (let s = top; s; s = s.previousElementSibling) {
        if (s.classList && s.classList.contains('lyr-head')) { shelf = s.getAttribute('data-i18n') || ''; break; }
      }
      const sp = lab && lab.querySelector('span:not(.lyr-sw):not(.lfc-sw):not(.lsr-thumb)');
      const i18nEl = lab && (lab.querySelector('span[data-i18n]'));
      out.push({
        i, id: cb.id || null, dl: cb.getAttribute('data-layer'), section: section(cb),
        primary: first === cb, rowId: row ? (row.id || null) : null, rowKind: row ? (row.matches('.lyr-row') ? 'lyr-row' : 'label') : null,
        rowTop: top ? (top.id || top.tagName.toLowerCase() + '.' + top.className) : null,
        key: row && first === cb ? (keyOfRow.get(row) || null) : null,
        shelf, rest: !!(row && row.getAttribute('data-lyr-rest') === '1'),
        i18n: i18nEl ? i18nEl.getAttribute('data-i18n') : null, spanId: sp ? (sp.id || null) : null,
        text: ((sp ? sp.textContent : (lab ? lab.textContent : '')) || '').replace(/\s+/g, ' ').trim(),
        checked: cb.checked, share: cb.matches(DATASEL),
        basic: (window.IntMapBasicLayerRows || []).indexOf(cb.id) >= 0,
        hidden: (window.IntMapHiddenLayerRows || []).indexOf(cb.id) >= 0,
        defaultOn: (window.IntMapDefaultOn || []).indexOf(cb.id) >= 0,
        defaultLayer: (window.IntMapDefaultLayers || []).indexOf(cb.id) >= 0,
      });
    });
    return { rows: out, order: Array.from(dd.children).map((c) => c.id || (c.tagName.toLowerCase() + (c.getAttribute('data-i18n') ? '[' + c.getAttribute('data-i18n') + ']' : ''))) };
  }, { GROUPS, OTHERS_IDS, EXTRA });

  /* the Japanese name of every row, so the manifest's i18n keys can be checked against what is drawn */
  await page.evaluate(() => document.getElementById('lang-jp') && document.getElementById('lang-jp').click());
  await page.waitForTimeout(1500);
  const jp = await page.evaluate(() => Array.from(document.querySelectorAll('#layer-dropdown input[type=checkbox]')).map((cb) => {
    const lab = cb.closest('label'); const sp = lab && lab.querySelector('span:not(.lyr-sw):not(.lfc-sw):not(.lsr-thumb)');
    return { id: cb.id, text: ((sp ? sp.textContent : (lab ? lab.textContent : '')) || '').replace(/\s+/g, ' ').trim() }; }));
  const jpById = new Map(jp.map((r) => [r.id, r.text]));
  facts.rows.forEach((r) => { r.textJp = jpById.get(r.id) || null; });
  await page.evaluate(() => document.getElementById('lang-en') && document.getElementById('lang-en').click());
  await page.waitForTimeout(800);

  if (LAZY) {
    /* ⚠ THE LAZY LINK IS MEASURED, NOT GUESSED — and each row is measured in a FRESH page. Measured the
       first way (one page, toggle each row in turn): an asynchronous `need` from the previous row landed
       in the next row's window (dl-ships → railways, dl-dem → radiationLayer), and a module that asks
       for its body only once hid the link from every later row that shares it (ww1 / korea … after
       ww2). So: boot, record every `IntMapLazy.need(name)` for 3 s with nothing touched (the control),
       switch the one row on, record for 3 s, and keep what the switch added. The union of all controls
       is subtracted too (timers that happen to fire in the second window, e.g. newsEvents). Off-origin
       requests are aborted, so a `need` that sits behind a download is not seen — the spec loads each
       named module and checks the row asks for it. Four pages at a time. */
    const ids = facts.rows.filter((r) => r.primary && r.id && !r.section).map((r) => r.id);
    const control = new Set();
    const one = async (id) => {
      const ctx = await browser.newContext(CTX_OPTS);
      try {
        const pg = await ctx.newPage();
        await pg.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
        await pg.addInitScript(() => { window.__lzLog = [];
          const hook = () => { const L = window.IntMapLazy; if (!L || L.__lzHooked) return !!L; const orig = L.need.bind(L);
            L.need = function (n) { try { window.__lzLog.push(String(n)); } catch (_) {} return orig.apply(null, arguments); }; L.__lzHooked = true; return true; };
          const t = setInterval(() => { if (hook()) clearInterval(t); }, 5); });
        await bootInto(pg);
        return await pg.evaluate(async (id) => {
          const cb = document.getElementById(id); if (!cb) return null;
          window.__lzLog.length = 0; await new Promise((r) => setTimeout(r, 3000));
          const before = Array.from(new Set(window.__lzLog)); window.__lzLog.length = 0;
          try { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
          await new Promise((r) => setTimeout(r, 3000));
          return { before, after: Array.from(new Set(window.__lzLog)) };
        }, id);
      } catch (_) { return null; } finally { await ctx.close(); }
    };
    const got = new Map(); let next = 0;
    await Promise.all([0, 1, 2, 3].map(async () => { while (next < ids.length) { const id = ids[next++]; got.set(id, await one(id)); process.stdout.write('.'); } }));
    process.stdout.write('\n');
    for (const r of got.values()) if (r) r.before.forEach((n) => control.add(n));
    for (const [id, r] of got) {
      const row = facts.rows.find((x) => x.id === id);
      row.lazy = r ? r.after.filter((n) => !control.has(n) && r.before.indexOf(n) < 0) : null;
    }
    facts.lazyControl = Array.from(control);
  }
  writeFileSync(OUT, JSON.stringify(facts, null, 1));
  console.log('rows', facts.rows.length, '→', OUT);
} finally {
  await browser.close();
  server.kill();
}

/* ============================================================================
 *  IntMap · scripts/layer-descriptor-migrate.mjs — the hand-kept manifest, split into one declaration per layer
 * ----------------------------------------------------------------------------
 *  (layer-descriptor) THE MIGRATION TOOL, KEPT AS THE RECORD OF HOW IT WAS DONE (as
 *  scripts/layer-manifest-extract.mjs is for the step before it). It ran once, at 281e584c:
 *
 *      node scripts/layer-descriptor-migrate.mjs --rev 281e584c
 *
 *  It reads the SHELVES block of js/layer-manifest.js AS IT STOOD AT <rev> (git show — after the
 *  migration that block no longer exists) and writes
 *
 *      js/layers/<id>.js      one per layer — the row's facts, its position, every comment that stood
 *                             above or beside its line, and the links to the other registries below
 *      js/layers/_shelves.js  the shelves in panel order, with every comment that stood between them
 *
 *  MECHANICALLY: a comment belongs to the next thing it stands above (a row inside a shelf, else the
 *  next shelf); a comment at the end of a shelf, or on the shelf's own line, belongs to the shelf.
 *  Nothing is reworded. `order` is the row's position in its shelf × 10, so a layer added later can
 *  stand between two without renumbering.
 *
 *  ── THE LINKS (registry · state · commands · atlas · sources) ───────────────────────────────────
 *  These did not exist anywhere as data — that was the defect: a layer's IntMapLayers id, its share
 *  state key, its kernel commands and its Atlas capabilities were three to five different spellings
 *  in different files, and nothing said which row they belonged to. They were established once, by
 *  reading the code that registers each one (the evidence is the comment on each line below), and are
 *  written into the descriptors; from then on the DESCRIPTOR is where they are stated and the gate
 *  (scripts/layer-descriptors.mjs) checks each against the registry that holds it.
 *  Only links whose registration is a LITERAL are claimed. A registration composed at run time
 *  (`R.id + '.toggle'`, `'gx-' + L.id`, `R.register(idOf(key)…)`) cannot be checked against a file,
 *  and a claim nothing can check is not written.
 *  `sources` is derived, not typed: each claimed registration's own `source:()=>'…'` sentence, split
 *  at « / », keeping the parts that name a row of js/reference-data.js DATA_SOURCES exactly.
 * ==========================================================================*/
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
const REV = arg('--rev');
const showOrRead = (p) => (REV ? execFileSync('git', ['show', REV + ':' + p], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }) : readFileSync(join(ROOT, p), 'utf8')).replace(/\r\n/g, '\n');

/* registration id → the row that owns it, with where the evidence is */
const LINKS = {
  'dl-ec-temp': { registry: ['temp'] },                     /* js/map-ui.js register('temp') on:()=>isOn('ec-temp') */
  'dl-sst': { registry: ['sst'] },                          /* register('sst') — no on(), so isOn('sst') → #dl-sst */
  'dl-wind': { registry: ['wind'], atlas: ['layers.windParticles'] },   /* isOn('wind'); the streaks inside the Wind layer (js/atlas-cap-layers.js) */
  'dl-precip': { registry: ['precip'] },                    /* isOn('precip') → #dl-precip */
  'dl-snow': { registry: ['snow'] },
  'dl-aod': { registry: ['aod'] },
  'dl-climate': { registry: ['climate'] },
  'dl-webcams': { registry: ['webcams'] },
  'beta-dl-volc2': { registry: ['volcanoes'], commands: ['volcano.open', 'volcano.mode', 'volcano.filter', 'volcano.time'], atlas: ['map.volcanoFilter'] },   /* volc2-pt; js/beta-overlays.js OS.register */
  'beta-dl-whs': { registry: ['heritage'], commands: ['heritage.open', 'heritage.filter'], atlas: ['map.heritageFilter'] },   /* whs-pt */
  'beta-dl-radobs': { registry: ['radiation'], commands: ['radiation.observed', 'radiation.near'], atlas: ['map.radiation'] },   /* imrad-obs-pt */
  'dl-planes': { registry: ['aircraft'], atlas: ['layers.planeAltitude', 'layers.aircraftTrack'] },   /* IntMapAviation.isOn() */
  'beta-dl-rail': { atlas: ['layers.railAxis'] },           /* window.IntMapRailways.setAxis */
  'dl-ships': { registry: ['ships'] },
  'dl-sats': { registry: ['satellites'], atlas: ['layers.satellites'] },   /* IntMapSatellites.isOn() */
  'bx-eq': { registry: ['earthquakes'] },                   /* eq-pt */
  'beta-dl-dc': { registry: ['datacenters'] },              /* dc-pt */
  'beta-dl-pharma': { registry: ['pharma'] },               /* ph-pt */
  'dl-thermal': { registry: ['thermal'] },
  'dl-annprecip': { registry: ['annprecip'] },              /* js/precip-annual.js */
  'wp-dl-outbreaks': { registry: ['outbreaks'], state: 'outbreaks', commands: ['outbreaks.open', 'outbreaks.close'], atlas: ['map.outbreaks'] },   /* js/outbreaks.js */
  'dl-ec-slp': { atlas: ['layers.isobars'] },               /* getElementById('dl-ec-slp') */
  'dl-nightside': { atlas: ['layers.nightSide'] },          /* IntMapNightSide + _imSyncNightSideRow */
  'cb-grid': { atlas: ['view.grid'] },
  'dl-nethlth': { commands: ['nethlth.report', 'nethlth.signals'] },   /* js/net-health.js */
};

/* the `source:()=>'…'` sentence each literal registration gives, and the DATA_SOURCES names */
function sourcesByRegistry() {
  const out = {};
  for (const f of readdirSync(join(ROOT, 'js')).filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(join(ROOT, 'js', f), 'utf8');
    /* one registration = from its `register('<id>'` to the next `register(` in the same file */
    const at = [...src.matchAll(/\bregister\(\s*'([^']+)'/g)].map((m) => [m.index, m[1]]);
    at.forEach(([from, id], k) => {
      const seg = src.slice(from, k + 1 < at.length ? at[k + 1][0] : src.length);
      const s = /source\s*:\s*\(\)\s*=>\s*'([^']+)'/.exec(seg);
      if (s && !(id in out)) out[id] = s[1];
    });
  }
  return out;
}
const SOURCE_NAMES = new Set([...readFileSync(join(ROOT, 'js', 'reference-data.js'), 'utf8').matchAll(/\bn\s*:\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]));

/* ── parse the SHELVES block ─────────────────────────────────────────────────────────────── */
const text = showOrRead('js/layer-manifest.js');
const B = text.indexOf('/* ── BEGIN SHELVES'), E = text.indexOf('/* ── END SHELVES ── */');
if (B < 0 || E < 0) throw new Error('no SHELVES block in js/layer-manifest.js' + (REV ? '@' + REV : '') + ' — pass --rev <the commit before layer-descriptor>');
const lines = text.slice(text.indexOf('\n', B) + 1, E).split('\n');

const preamble = [];     /* comments before `export const SHELVES = [` */
const shelves = [];      /* { key, lead:[], open:'', tail:[] } */
const rows = [];         /* { entry, shelf, order, lead:[], trail:'' } */
let i = 0, cur = null, pending = [], inArray = false;
const takeComment = () => {   /* a whole /* … *\/ block starting at line i (may span lines) */
  const out = [];
  for (;;) { const l = lines[i++]; out.push(l); if (l.includes('*/')) break; if (i >= lines.length) throw new Error('unterminated comment'); }
  return out;
};
while (i < lines.length) {
  const l = lines[i];
  if (!l.trim()) { i++; continue; }
  if (/^\s*\/\*/.test(l)) { const c = takeComment(); (inArray ? pending : preamble).push(...c); continue; }
  if (/^export const SHELVES = \[\s*$/.test(l)) { inArray = true; i++; continue; }
  let m;
  if ((m = /^  \{ key: '([^']+)', layers: \[(.*)$/.exec(l))) {
    cur = { key: m[1], lead: pending, open: m[2].trim(), tail: [] }; pending = []; shelves.push(cur); i++; continue;
  }
  if ((m = /^    (\{ id: .*\}),(.*)$/.exec(l))) {
    const entry = Function('return (' + m[1] + ');')();
    const n = rows.filter((r) => r.shelf === cur.key).length;
    rows.push({ entry, shelf: cur.key, order: (n + 1) * 10, lead: pending, trail: m[2].trim() }); pending = []; i++; continue;
  }
  if (/^  \] \},\s*$/.test(l)) { cur.tail = pending; pending = []; cur = null; i++; continue; }
  if (/^\];\s*$/.test(l)) { inArray = false; i++; continue; }
  throw new Error('unrecognised line ' + (i + 1) + ' of the SHELVES block: ' + l);
}
if (pending.length) throw new Error('a comment after the last shelf has nowhere to go');

/* ── write ───────────────────────────────────────────────────────────────────────────────── */
const dedent = (ls) => {
  const ind = Math.min(...ls.filter((x) => x.trim()).map((x) => /^\s*/.exec(x)[0].length));
  return ls.map((x) => x.slice(Math.min(ind, /^\s*/.exec(x)[0].length)));
};
const lit = (v) => (Array.isArray(v) ? '[' + v.map(lit).join(', ') + ']' : typeof v === 'string' ? "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'" : String(v));
const SRC = sourcesByRegistry();
const DIR = join(ROOT, 'js', 'layers');
mkdirSync(DIR, { recursive: true });
const seen = new Set();
for (const r of rows) {
  if (seen.has(r.entry.id)) throw new Error('two rows with the id ' + r.entry.id);
  seen.add(r.entry.id);
  const d = { id: r.entry.id, shelf: r.shelf, order: r.order };
  for (const [k, v] of Object.entries(r.entry)) if (k !== 'id') d[k] = v;
  const link = LINKS[r.entry.id] || {};
  for (const k of ['registry', 'state', 'commands', 'atlas']) if (link[k]) d[k] = link[k];
  const srcs = [...new Set((link.registry || []).flatMap((reg) => (SRC[reg] || '').split(/\s+\/\s+/)).filter((s) => SOURCE_NAMES.has(s)))];
  if (srcs.length) d.sources = srcs;
  let out = '/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */\n';
  if (r.lead.length) out += dedent(r.lead).join('\n') + '\n';
  if (r.trail) out += r.trail + '\n';
  out += 'export default {\n' + Object.entries(d).map(([k, v]) => '  ' + k + ': ' + lit(v) + ',').join('\n') + '\n};\n';
  writeFileSync(join(DIR, r.entry.id + '.js'), out);
}
for (const id of Object.keys(LINKS)) if (!seen.has(id)) throw new Error('a link names ' + id + ', which is not a layer');

let sh = showOrRead('js/layer-manifest.js').slice(0, 0);
sh += '/* ============================================================================\n'
  + ' *  IntMap · js/layers/_shelves.js — THE SHELVES OF THE LAYERS PANEL, in panel order\n'
  + ' * ----------------------------------------------------------------------------\n'
  + ' *  (layer-descriptor) A layer says which shelf it is on and where on it (`shelf`, `order` in\n'
  + ' *  js/layers/<id>.js). This file says which shelves exist and in what order the panel shows them —\n'
  + ' *  the one fact no single layer can state. The comments below are the taxonomy\'s history as it stood\n'
  + ' *  in js/layer-manifest.js, moved here verbatim by scripts/layer-descriptor-migrate.mjs; the notes\n'
  + ' *  about one row moved into that row\'s own file.\n'
  + ' *  ⚠ PURE DATA: no DOM, no `window` — Node imports it as it is.\n'
  + ' * ==========================================================================*/\n';
sh += preamble.join('\n') + '\n';
sh += 'export const SHELVES = [\n';
for (const s of shelves) {
  if (s.lead.length) sh += s.lead.join('\n') + '\n';
  sh += "  { key: '" + s.key + "' }," + (s.open ? '   ' + s.open : '') + '\n';
  if (s.tail.length) sh += s.tail.join('\n') + '\n';
}
sh += '];\n';
writeFileSync(join(DIR, '_shelves.js'), sh);
console.log('layer-descriptor-migrate: ' + rows.length + ' layers on ' + shelves.length + ' shelves → js/layers/'
  + ' · links on ' + Object.keys(LINKS).length + ' rows · sources ' + JSON.stringify(Object.fromEntries(Object.keys(LINKS).map((id) => [id, (LINKS[id].registry || []).map((r) => SRC[r] || null)]).filter(([, v]) => v.length))));
if (!existsSync(DIR)) process.exit(1);

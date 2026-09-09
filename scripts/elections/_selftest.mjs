#!/usr/bin/env node
/* ============================================================================
 *  IntMap · BUILD ONE ELECTION PACK, ALONE   (#R584)
 * ----------------------------------------------------------------------------
 *  scripts/build-elections.mjs merges every pack into one data/elections/index.json. That merge is
 *  a read-modify-write of a single file, so two packs built at the same time lose each other's
 *  work. While a pack is being WRITTEN it is therefore built through here instead: this runs one
 *  pack, validates its slice against scripts/lib/elections-schema.mjs exactly as the gate will, and
 *  writes only that pack's own files.
 *
 *      node scripts/elections/_selftest.mjs jp             # build + validate, write the pack's files
 *      node scripts/elections/_selftest.mjs jp --dry       # build + validate, write nothing
 * ==========================================================================*/
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { validate } from '../lib/elections-schema.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'data', 'elections');
const CACHE = join(ROOT, 'node_modules', '.cache', 'intmap-elections');
const UA = 'IntMap/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap) elections-build';

const [id, ...rest] = process.argv.slice(2);
if (!id) { console.error('usage: node scripts/elections/_selftest.mjs <pack> [--dry]'); process.exit(2); }
const DRY = rest.includes('--dry');

async function get(url, { json = false, text = false, headers = {} } = {}) {
  mkdirSync(CACHE, { recursive: true });
  /* ⚠ hashed, not truncated — see the note in scripts/build-elections.mjs. A prefix key made two
     URLs that share their first 135 bytes the same file, and the second request silently received
     the first one's body. The two files must key IDENTICALLY or a pack warms one cache and reads
     the other. */
  const key = join(CACHE, createHash('sha256').update(url).digest('hex').slice(0, 40));
  let buf;
  if (existsSync(key)) buf = readFileSync(key);
  else {
    const r = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
    buf = Buffer.from(await r.arrayBuffer());
    writeFileSync(key, buf);
  }
  if (json) return JSON.parse(buf.toString('utf8'));
  if (text) return buf.toString('utf8');
  return buf;
}

const mod = await import(pathToFileURL(join(ROOT, 'scripts', 'elections', id + '.mjs')).href);
const out = await mod.build({ get, ROOT, OUT_DIR });

const index = { _: 'selftest', parties: out.parties || {}, polities: out.polities || [], elections: out.elections || [] };
const mem = { geo: out.geo || {}, res: out.res || {} };
const errs = validate(index, (kind, key) => mem[kind][key] ?? null);
if (errs.length) {
  console.error(id + ': ' + errs.length + ' problem(s)');
  for (const e of errs.slice(0, 40)) console.error('  · ' + e);
  process.exit(1);
}

let bytes = 0;
for (const [k, v] of [...Object.entries(mem.geo), ...Object.entries(mem.res)]) {
  const s = JSON.stringify(v); bytes += s.length;
  if (!DRY) { mkdirSync(OUT_DIR, { recursive: true }); writeFileSync(join(OUT_DIR, k), s); }
}
console.log(id + ': ok — ' + index.polities.length + ' polities, ' + index.elections.length + ' elections, ' +
  Object.keys(index.parties).length + ' parties, ' + (bytes / 1048576).toFixed(2) + ' MB' + (DRY ? ' (dry run)' : ''));
for (const e of index.elections) {
  console.log('    ' + e.id.padEnd(18) + e.date + '  ' + String(e.districtSeats).padStart(4) + ' districts  ' + (e.geo || '—'));
}

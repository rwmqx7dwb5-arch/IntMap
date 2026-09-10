#!/usr/bin/env node
/* OHM Overpass downloader for scripts/build-hist-borders.mjs — see that file's header.
 *
 * ⚠ THE CACHE IS KEYED BY RELATION ID, NOT BY BATCH POSITION. #R518 wrote one file per batch of
 * eight and named it after the batch's FIRST id, so the key moved whenever the id list changed —
 * and this round changes it, from 506 relations to 2,607. Every one of the 196 batch files would
 * have become unreachable and the whole ~400 MB download would have been repeated (#R669 lost a
 * 3.4 GB cache exactly this way, keying on position). One file per relation has no batch in the
 * key at all, so widening the window re-downloads precisely the relations that are new.
 * The existing batch files are migrated in place on first use rather than thrown away.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://overpass-api.openhistoricalmap.org/api/interpreter';

async function post(q, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(API, { method: 'POST', body: new URLSearchParams({ data: q }) });
      if (r.ok) return await r.json();
      if (r.status !== 429 && r.status !== 504) throw new Error('HTTP ' + r.status);
    } catch (e) { if (i === tries - 1) throw e; }
    await new Promise(s => setTimeout(s, 4000 * (i + 1)));
  }
  throw new Error('give up');
}

const relDir = c => join(c, 'rel');
const relPath = (c, id) => join(relDir(c), id + '.json');

export async function fetchIndex(cacheDir) {
  const p = join(cacheDir, 'index.json');
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  const j = await post('[out:json][timeout:300];relation["boundary"="administrative"]["admin_level"="2"];out tags;');
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(p, JSON.stringify(j));
  return j;
}

/* ⚠ A RELATION THAT THE SOURCE DOES NOT ANSWER FOR MUST STILL BE REMEMBERED, or every run asks
   again for ever. An absent answer is cached as `null`, which `loadGeom` reports as "asked, none". */
function writeOne(cacheDir, id, el) {
  writeFileSync(relPath(cacheDir, id), el ? JSON.stringify(el) : 'null');
}

/* one-time migration of #R518's batch files into per-relation files */
export function migrateBatches(cacheDir) {
  const old = join(cacheDir, 'geom');
  if (!existsSync(old)) return 0;
  mkdirSync(relDir(cacheDir), { recursive: true });
  let n = 0;
  for (const f of readdirSync(old)) {
    let j; try { j = JSON.parse(readFileSync(join(old, f), 'utf8')); } catch { continue; }
    for (const e of j.elements || []) if (e.type === 'relation' && !existsSync(relPath(cacheDir, e.id))) { writeOne(cacheDir, e.id, e); n++; }
  }
  rmSync(old, { recursive: true, force: true });
  return n;
}

export function loadGeom(cacheDir, id) {
  const p = relPath(cacheDir, id);
  if (!existsSync(p)) return undefined;                 /* never asked */
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

export async function fetchGeom(cacheDir, ids, chunk = 8) {
  mkdirSync(relDir(cacheDir), { recursive: true });
  const todo = ids.filter(id => !existsSync(relPath(cacheDir, id)));
  for (let i = 0; i < todo.length; i += chunk) {
    const part = todo.slice(i, i + chunk);
    const j = await post(`[out:json][timeout:300];rel(id:${part.join(',')});out geom;`);
    const got = new Map();
    for (const e of j.elements || []) if (e.type === 'relation') got.set(e.id, e);
    for (const id of part) writeOne(cacheDir, id, got.get(id) || null);
    process.stderr.write(`  ${Math.min(i + chunk, todo.length)}/${todo.length}\n`);
    await new Promise(s => setTimeout(s, 700));
  }
  return todo.length;
}

#!/usr/bin/env node
/* OHM Overpass downloader for scripts/build-hist-borders.mjs — see that file's header. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
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

export async function fetchIndex(cacheDir) {
  const p = join(cacheDir, 'index.json');
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  const j = await post('[out:json][timeout:300];relation["boundary"="administrative"]["admin_level"="2"];out tags;');
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(p, JSON.stringify(j));
  return j;
}

export async function fetchGeom(cacheDir, ids, chunk = 8) {
  mkdirSync(join(cacheDir, 'geom'), { recursive: true });
  const out = [];
  for (let i = 0; i < ids.length; i += chunk) {
    const part = ids.slice(i, i + chunk);
    const p = join(cacheDir, 'geom', part[0] + '.json');
    if (!existsSync(p)) {
      const j = await post(`[out:json][timeout:300];rel(id:${part.join(',')});out geom;`);
      writeFileSync(p, JSON.stringify(j));
      process.stderr.write(`  ${i + part.length}/${ids.length}\n`);
      await new Promise(s => setTimeout(s, 700));
    }
    out.push(p);
  }
  return out;
}

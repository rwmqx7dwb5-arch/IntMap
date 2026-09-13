import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check } from '../scripts/build-border-detail.mjs';

test('persisted detail fingerprints, fragments, source ids, size bounds and manifest counts validate offline', () => {
  const stats=check();
  assert.ok(Object.values(stats).every(s=>s.refined>0&&s.bytes>0));
});

test('the offline gate rejects missing/stale assets rather than accepting an index alone', () => {
  const root=mkdtempSync(join(tmpdir(),'intmap-r711-detail-'));
  try {
    mkdirSync(join(root,'data/border-detail'),{recursive:true});
    writeFileSync(join(root,'data/border-detail/index.json'),JSON.stringify({v:1,targetTolerance:0.0005,decimals:5,inlandKm:6,
      source:'OpenHistoricalMap (CC0)',sets:{},stats:{}}));
    assert.throws(()=>check(root));
  }finally{rmSync(root,{recursive:true,force:true});}
});

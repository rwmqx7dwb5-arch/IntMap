import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ATL_FILE } from '../js/atlas-attach.js';
import { ATTACH_LOG } from '../js/atlas-attach-log.js';
import { resolveMapSource } from '../js/gis-map-source.js';
import { browse } from '../supabase/functions/_shared/web-browse.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 90"><path id="route" d="M1 2L3 4"/></svg>';

test('compressed image records keep independent and exact map originals across attachment intake and lookup', async () => {
  ATTACH_LOG.reset();
  const preview = 'data:image/jpeg;base64,AA==';
  const input = [
    new File([svg], 'original.svg', { type: 'image/svg+xml' }),
    new File([Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')], 'original.gif', { type: 'image/gif' }),
    new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAY9dt0kAAAAASUVORK5CYII=', 'base64')], 'original.png', { type: 'image/png' }),
  ];
  const records = await Promise.all(input.map(file => ATL_FILE.read(file, { encodeImage: async () => preview })));
  assert.ok(records.every(record => record.dataUrl === preview && !Object.keys(record).includes('originalFile')));
  ATTACH_LOG.remember(1, records, []);
  const pinnedIds = [];
  const settings = { attachment: name => ATTACH_LOG.find(2, name), download: () => assert.fail('attachment is local') };
  for (const [i, file] of input.entries()) {
    const record = await resolveMapSource({ attachment: file.name }, {}, settings);
    assert.equal(record.file, file);
    assert.equal(record.meta.sha256, hash(Buffer.from(await file.arrayBuffer())));
    assert.equal(record.meta.representation, 'original-bytes');
    assert.equal((await resolveMapSource({ sourceId: record.id }, {}, settings)).file, file);
    pinnedIds.push(record.id);
    assert.equal(ATTACH_LOG.find(2, 'image-' + (i+1)).dataUrl, preview);
  }
  ATTACH_LOG.rewind(1);
  for (const sourceId of pinnedIds) {
    assert.equal((await resolveMapSource({ sourceId }, {}, settings)).why, 'map-attachment-unavailable');
  }
  ATTACH_LOG.reset();
});

test('PDF attachments keep the sniffed media type and exact bytes even under a misleading name', async () => {
  const body = '%PDF-1.4\n%%EOF\n';
  const file = new File([body], 'mislabeled.png', { type: 'image/png' });
  const attachment = await ATL_FILE.read(file);
  const result = await resolveMapSource({ attachment: file.name }, {}, { attachment: () => attachment });
  assert.equal(result.file.type, 'application/pdf');
  assert.equal(await result.file.text(), body);
  assert.equal(result.meta.sha256, hash(body));
  assert.equal(result.meta.representation, 'original-bytes');
});

test('an over-budget original keeps the existing vision image route and discloses its representation', async () => {
  const attachment = { kind: 'image', name: 'image-1', dataUrl: 'data:image/jpeg;base64,AA==',
    originalFile: { name: 'large.png', type: 'image/png', size: 64*1024*1024 } };
  const result = await resolveMapSource({ attachment: attachment.name }, {}, { attachment: () => attachment });
  assert.equal(result.file.type, 'image/jpeg');
  assert.equal(result.meta.representation, 'conversation-image');
});

test('pinned revisions coexist, URL lookup follows the last validated response, and a mismatch is explicit', async () => {
  const url = 'https://origin.example.test/plate.svg';
  const resolved = 'https://cdn.example.test/safe/plate.svg';
  const editions = [svg, svg.replace('M1 2L3 4', 'M3 4L5 6')];
  let served = 0;
  const calls = [];
  const settings = { async download(request) {
    calls.push(request);
    const contents = editions[served];
    return { ok: true, file: new File([contents], 'plate.svg', { type: 'image/svg+xml' }),
      meta: { url: resolved, sha256: hash(contents) } };
  } };
  const first = await resolveMapSource({ source: url }, {}, settings);
  assert.equal(first.meta.sha256, hash(editions[0]));
  served = 1;
  const [second, parallel] = await Promise.all([
    resolveMapSource({ sourceUrl: url, revalidate: true }, {}, settings),
    resolveMapSource({ sourceUrl: url, revalidate: true }, {}, settings),
  ]);
  assert.deepEqual(calls, [{ url, revalidate: false }, { url, revalidate: true }]);
  assert.notEqual(first.id, second.id);
  assert.equal(parallel.id, second.id);
  assert.equal((await resolveMapSource({ sourceUrl: url }, {}, settings)).id, second.id);
  assert.equal((await resolveMapSource({ sourceUrl: resolved }, {}, settings)).id, second.id);
  assert.equal((await resolveMapSource({ sourceId: first.id, sourceUrl: url }, {}, settings)).id, first.id);
  assert.equal((await resolveMapSource({ sourceUrl: url, sourceSha256: first.meta.sha256 }, {}, settings)).id, first.id);
  const mismatch = await resolveMapSource({ sourceId: first.id, sourceUrl: url, revalidate: true }, {}, settings);
  assert.equal(mismatch.why, 'map-source-version-mismatch');
  assert.equal(mismatch.detail.received.sha256, second.meta.sha256);
  served = 0;
  assert.equal((await resolveMapSource({ sourceUrl: url, revalidate: true }, {}, settings)).id, first.id);
  assert.equal((await resolveMapSource({ sourceUrl: url }, {}, settings)).id, first.id);
});

test('an explicit revalidation reaches upstream without changing the downloaded bytes', async () => {
  let cacheControl;
  const result = await browse({ action: 'download', url: 'https://check.example.test/map.svg', revalidate: true }, {
    resolvesPublic: async () => true,
    sha256: hash,
    fetch: async (_url, options) => {
      cacheControl = new Headers(options.headers).get('cache-control');
      return new Response(svg, { headers: { 'content-type': 'image/svg+xml' } });
    },
  });
  assert.equal(cacheControl, 'no-cache');
  assert.equal(result.file.sha256, hash(svg));
  assert.equal(Buffer.from(result.file.b64, 'base64').toString(), svg);
});
